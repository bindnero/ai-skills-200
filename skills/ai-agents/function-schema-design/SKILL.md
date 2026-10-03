---
name: function-schema-design
description: Designs function and tool schemas with descriptive naming, flat typed parameters, enums, defaults, and token-lean definitions. Use when authoring API tool definitions for an agent, when a tool is mis-selected, or when the tool list is inflating prompt tokens.
---

# Function Schema Design

**Use when:** you are writing the schema for a function an LLM can call, as opposed to the loop that calls it.
**Do not use when:** the loop, budgets, or result handling are the problem — see `tool-calling-design`; or when the interface is exposed over MCP and transport matters — see `mcp-server-design`.

## Instructions

1. Name the function for the action and its effect: `create_refund`, not `refundHandler`. Use `snake_case`; the name is the primary disambiguation signal.
2. Write the description as a three-part sentence: what it does, what it returns, and when to prefer the sibling tool. This is the field the model reads when choosing between tools.
3. Keep parameters flat and few. Above roughly seven required parameters, accuracy drops; move optional dimensions into a single nested object.
4. Make the units explicit in the field description, not in the field name: `amount_cents` with "integer, USD cents, not dollars" beats `amount` with a note elsewhere.
5. Use enums for every closed set and prefer a single string enum over a boolean pair. `status: "cancel" | "refund" | "keep"` beats `cancel: bool, refund: bool`.
6. Distinguish required from optional honestly. Marking everything required pushes defaults into prose descriptions and produces invented values.
7. Avoid over-specified enums. A 20-value enum used two ways is worse than a short one plus a note; a 3-value enum used consistently is excellent.
8. Add a `reason` or `note` parameter to irreversible operations so the action is auditable from the trace alone.
9. Prefer one function that takes a list over N functions that take one item when the operation is naturally batched. Fan-out belongs in the schema, not in the loop.
10. Count the tokens your tool list consumes per request and review it. Fifty unused tool definitions is thousands of tokens billed on every turn.

## Patterns

Schema with discriminative description and units in field docs:

```ts
export const issueRefund = {
  name: "issue_refund",
  description:
    "Issue a full or partial refund against a settled payment. Returns the refund id and " +
    "new payment balance. Requires a settled payment id. Do not use for authorization " +
    "voids (use void_authorization) or for disputed charges (use open_dispute).",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["payment_id", "mode", "reason"],
    properties: {
      payment_id: { type: "string", description: "Payment id from the settled payment, not an order id." },
      mode: {
        type: "string",
        enum: ["full", "partial"],
        description: "full refunds the entire captured amount; partial requires amount_cents.",
      },
      amount_cents: {
        type: ["integer", "null"],
        description: "Integer USD cents for a partial refund. Null when mode is full. Must not exceed the captured amount.",
      },
      reason: {
        type: "string",
        enum: ["duplicate", "customer_request", "service_not_delivered", "fraudulent", "other"],
        description: "Refund reason recorded on the ledger entry.",
      },
      idempotency_key: { type: "string", description: "UUID v4, unique per logical refund. Reuse on retry." },
    },
  },
} as const;
```

Discriminated union by kind, kept flat, plus a batched tool instead of twenty per-item tools:

```ts
export const CloseTicketAction = z.object({
  kind: z.literal("close_ticket"),
  ticket_id: z.string(),
  resolution: z.enum(["fixed", "duplicate", "wont_fix", "user_closed"]),
  note: z.string().min(1),          // auditability on an irreversible action
}).strict();

export const TicketAction = z.discriminatedUnion("kind", [CreateTicketAction, CloseTicketAction]);

// One tool taking a list, not one tool per recipient.
export const sendBulkEmail = {
  name: "send_bulk_email",
  description: "Send one templated email to up to 500 recipients. Returns per-recipient status.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["template_id", "recipients"],
    properties: {
      template_id: { type: "string" },
      recipients: {
        type: "array", minItems: 1, maxItems: 500,
        items: {
          type: "object", additionalProperties: false, required: ["email"],
          properties: {
            email: { type: "string" },
            vars: { type: "object", description: "Template variable substitution map." },
          },
        },
      },
    },
  },
} as const;
```

Tool-list token audit, so a growing tool registry cannot quietly tax every turn:

```python
import json, tiktoken
enc = tiktoken.get_encoding("cl100k_base")
print(len(enc.encode(json.dumps(ALL_TOOLS))), "tokens against a 6000 budget")
# Over budget: merge tools that share a purpose, or load a subset by task type.
```

## Checklist

- [ ] Name is verb-first `snake_case` describing the effect
- [ ] Description states what it does, what it returns, and which sibling to prefer instead
- [ ] Required parameters at or below seven; optional dimensions nested in one object
- [ ] Units stated in the field description for money, time, and size
- [ ] Closed sets expressed as enums rather than boolean pairs; required and optional parameters reflect real semantics
- [ ] Irreversible operations take a reason or note for audit
- [ ] Naturally batched operations exposed as one tool taking a list; variants as a flat `kind` union
- [ ] Total tool-list token cost measured and within budget

## Anti-patterns

**Boolean pairs.** `{"is_refund": true, "is_cancel": false}` invites contradictory states and forces the model to reason about semantics in prose. Use a single enum.

**Cryptic names.** `exec_op`, `doAction`, or `handler2` give the model nothing to match on, so tool selection becomes a coin flip. Name the operation and its effect.

**Everything required.** Marking optional fields required with defaults described in the description paragraph produces invented values when the model lacks the data. Mark optional fields optional.

**One tool per item.** Twenty `update_user_field` variants for twenty fields bloat the prompt and dilute selection. One tool with a field and value, or a typed batch shape.

**Descriptions written for humans.** "This endpoint does X" without a boundary leaves the model unable to choose between similar tools. Every description needs the sibling-exclusion clause.
