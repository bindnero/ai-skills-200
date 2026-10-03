---
name: tool-calling-design
description: Builds tool definitions and execution loops with strict JSON Schema parameters, parallel-call batching, typed results, and tool-result truncation. Use when wiring an agent to external APIs, when tools are called wrongly or not at all, or when you need to reduce round trips per task.
---

# Tool Calling Design

**Use when:** you are defining which tools an agent can call, how their arguments are validated, and how results are returned to the model.
**Do not use when:** schemas and results are already correct but the model still picks the wrong tool — that is a policy and priority problem, see `system-prompt-design`.

## Instructions

1. Write the tool as a contract, not a capability: `name` in `snake_case`, `description` stating when to call it *and* what it returns, plus one sentence naming the closest sibling tool it must not be confused with.
2. Keep the parameter count low. Three to seven required parameters is the ceiling; collapse the rest into a single typed object such as `filters` or `range`.
3. Use strict JSON Schema. Every object sets `additionalProperties: false`, every field has a `type` and a `description`, and enums are preferred over free-form strings for closed sets.
4. Put discriminative detail in the description, not in the name. The name disambiguates from siblings; the description carries preconditions, units, and the "do not use X when Y" clause.
5. Return results as compact structured data: objects, arrays, and short strings. Never return HTML pages, whole file bodies, or unbounded JSON dumps.
6. Truncate every tool result at the boundary with an explicit sentinel (`truncated: true`, `next_cursor`) so the model knows more exists rather than inferring completeness.
7. Classify results into `ok`, `partial`, and `error` shapes that the model can branch on. An `error` result must say whether a retry could help.
8. Batch independent tool calls into one assistant turn. Use `tool_uses` blocks with matching `tool_result` blocks so N independent lookups cost one round trip.
9. Make writes idempotent. Accept a caller-supplied `idempotency_key` on every mutating tool and document the retry contract in the description.
10. Log every call with arguments, duration, and result size. Tool-selection regressions are only visible in call-level traces.

## Patterns

Strict schema with a discriminative description:

```ts
const searchOrders = {
  name: "search_orders",
  description:
    "Search orders by customer, status, or date range. Returns a page of order summaries " +
    "(id, status, total_cents, created_at) — never full line items. Use get_order for details. " +
    "Do not use for refunding or modifying orders; those are separate tools.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["status"],
    properties: {
      status: {
        type: "string",
        enum: ["pending", "paid", "shipped", "refunded", "cancelled"],
        description: "Exact lifecycle status. Omit only when searching by customer_id alone.",
      },
      customer_id: { type: "string", description: "Customer UUID, not email." },
      range: {
        type: "object",
        additionalProperties: false,
        required: ["from"],
        properties: {
          from: { type: "string", description: "ISO date, inclusive." },
          to: { type: "string", description: "ISO date, inclusive." },
        },
      },
    },
  },
};
```

Typed result envelope with truncation sentinel:

```ts
type ToolOk<T> = { status: "ok"; data: T; truncated?: false; next_cursor?: string };
type ToolPartial<T> = { status: "partial"; data: T; truncated: true; next_cursor: string };
type ToolErr = {
  status: "error";
  code: "not_found" | "invalid_arg" | "rate_limited" | "unavailable";
  message: string;
  retryable: boolean;
};

export async function callSearchOrders(args: unknown): Promise<ToolOk<Order[]> | ToolPartial<Order[]> | ToolErr> {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return { status: "error", code: "invalid_arg", message: zodMessage(parsed.error), retryable: false };
  }
  const page = await orders.search({ ...parsed.data, limit: 25 });
  return page.nextCursor
    ? { status: "partial", data: page.items, truncated: true, next_cursor: page.nextCursor }
    : { status: "ok", data: page.items };
}
```

Parallel dispatch with one assistant turn (Anthropic):

```ts
const turn = await client.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1024,
  tools: [searchOrders, getOrder, listInvoices],
  messages: [{ role: "user", content: "Where is order 8812 and did its invoice get paid?" }],
});

const blocks = turn.content.filter((b) => b.type === "tool_use");
const results = await Promise.all(
  blocks.map(async (b) => ({
    type: "tool_result" as const,
    tool_use_id: (b as { id: string }).id,
    content: JSON.stringify(await dispatch((b as { name: string }).name, (b as { input: unknown }).input)),
    is_error: false,
  })),
);

// Append the tool_result blocks as a user turn and call the model again to continue.
```

## Checklist

- [ ] Every description says when to call, when not to, and what is returned; each names its closest sibling
- [ ] Schemas are strict: `additionalProperties: false`, typed and described fields, enums for closed sets
- [ ] Results are compact structured data, never raw HTML or full file bodies
- [ ] Truncation explicit with a sentinel and a cursor, not silent
- [ ] Result envelope distinguishes `ok`, `partial`, and `error`, and marks retryability
- [ ] Independent calls issued in one assistant turn, not sequentially
- [ ] Mutating tools accept an `idempotency_key` and document the retry contract
- [ ] Every call logged with arguments, latency, and result size

## Anti-patterns

**Sibling-ambiguous tools.** `get_users` and `search_users` with near-identical descriptions produce coin-flip selection. Make each description state what it does *not* do and point to the sibling by name.

**Unbounded results.** Returning a full 4 MB JSON export from a single tool call evicts the history and often forces a truncated turn. Page every tool and return the sentinel, not silence.

**Free-form strings for closed sets.** `{"status": "string"}` for a fixed lifecycle pushes validation into prose and produces silent garbage matches. Use an enum so the provider constrains generation.

**Sequential fan-out.** Awaiting each tool before deciding the next multiplies latency by call count. Collect all independent calls from the turn and dispatch with `Promise.all` / `asyncio.gather` in one batch.

**HTML as observation.** Handing back raw HTML makes the model re-parse markup on every call, burning thousands of tokens for one fact. Extract and return the fields the agent actually reasons about.
