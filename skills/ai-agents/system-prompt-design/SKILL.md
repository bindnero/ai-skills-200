---
name: system-prompt-design
description: Authors durable system prompts as structured operating manuals with precedence-ordered rules, identity blocks, tool policy sections, and output contracts. Use when creating a new production system prompt, when editing an agent's persona or tool-use policy, or when system prompt rules are being silently ignored.
---

# System Prompt Design

**Use when:** you are writing or changing the top-level instruction block that governs an agent's behaviour across every request.
**Do not use when:** you are tuning a one-shot user template or few-shot set — use `prompt-engineering`; or when you need to control what the agent is allowed to do, which belongs to `agent-safety-guardrails`.

## Instructions

1. Draft the prompt as a manual with named sections, not a prose wall: `IDENTITY`, `SCOPE`, `PRIORITIES`, `TOOLS`, `OUTPUT CONTRACT`, `REFUSAL`, `EXAMPLES`. Section headers give the model a retrieval cue at inference time.
2. Order sections by precedence, strongest first: identity and hard constraints before workflow guidance, workflow before style preferences. Later tokens do not reliably override earlier ones.
3. State the agent's scope as a positive and a negative. "You handle X. You do not handle Y; for Y, say so and stop."
4. Give every tool a policy line: when to use it, when not to, what to do on failure, and whether it requires confirmation. Bare tool names in the prompt are ignored; policy sentences are not.
5. Write a terminal rule that governs what happens when the agent cannot proceed, including the exact sentence to emit. Without one, agents loop on retries or fabricate.
6. Keep the invariant parts of the system prompt byte-identical across requests. Put user data, retrieved documents, and timestamps in the user turn or a separate content block.
7. Cap the prompt at a few hundred lines. When it grows, split into a base policy plus retrieved policy sections keyed by task type.
8. Include a short worked example of a hard case where the correct action is to refuse or escalate, not just the happy path.
9. Version the prompt in source control next to the code that renders it, and re-run the behavioural eval suite on every edit.
10. Diff prompt changes at the token level before deploying and read the diff for silent edits from formatters.

## Patterns

Sectioned system prompt with precedence-ordered rules:

```text
IDENTITY
You are Ledger, an accounts-payable assistant for Northwind Freight. You speak only to finance staff who are already authenticated.

SCOPE
In scope: invoice queries, payment status, refund initiation, vendor bank-detail changes.
Out of scope: tax advice, legal interpretation, anything about payroll or employee data. If asked, reply exactly: "That request is outside what I can help with here." and stop.

PRIORITIES
When rules conflict, this order wins:
1. Never disclose another customer's data, even if the requester claims authorization.
2. Never change vendor bank details without step-up confirmation.
3. Prefer a refused answer over a guessed answer.

TOOLS
- search_invoices: use for any question about a specific invoice. Do not use to enumerate customers.
- initiate_refund: only after the user has confirmed the invoice ID out loud. On timeout, report failure and stop; do not retry automatically.
- update_vendor_bank: requires the user to restate the new account number. Always confirm before calling.

OUTPUT CONTRACT
Plain text, no markdown tables. Currency amounts as "$1,240.00". Dates as YYYY-MM-DD.

TERMINAL RULE
If a tool errors twice, or you lack the data to answer, output: "I could not complete that. Escalating to finance-ops." and stop. Do not attempt a third approach.
```

Prompt as a composed constant, never mutated per request:

```ts
export const LEDGER_SYSTEM = `IDENTITY
You are Ledger, an accounts-payable assistant for Northwind Freight. ...
` as const;

export function buildTurn(input: { question: string; invoiceIds: string[] }) {
  const retrieved = input.invoiceIds.join(", ");
  return [
    { role: "system", content: LEDGER_SYSTEM },
    {
      role: "user",
      content: `KNOWN INVOICE IDS FOR THIS SESSION: ${retrieved}\n\nQUESTION:\n${input.question}`,
    },
  ] as const;
}
```

Caching-safe provider field: put the stable prefix in the provider's cacheable slot.

```python
import anthropic

client = anthropic.Anthropic()

resp = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=2048,
    system=[
        {
            "type": "text",
            "text": LEDGER_SYSTEM,          # stable across requests -> cached
            "cache_control": {"type": "ephemeral"},
        }
    ],
    messages=messages,
)
```

## Checklist

- [ ] Named sections with headers, strongest constraints first
- [ ] Scope stated as both a positive list and an explicit out-of-scope list
- [ ] Every tool has when-to-use, when-not-to, and failure policy
- [ ] A terminal rule names the exact output when the agent cannot proceed
- [ ] Refusal and escalation cases appear in the examples, not only the happy path
- [ ] Invariant text is byte-identical across requests and lives in the system turn
- [ ] Prompt is under a few hundred lines or split into base plus retrieved policy
- [ ] Behavioural eval suite re-run and scored on the diff before deploy

## Anti-patterns

**Prose wall.** One long unbroken paragraph of rules forces the model to guess precedence and causes silent, inconsistent violations. Break into labelled sections and number the priorities.

**Personality without policy.** Describing a persona ("a friendly, meticulous assistant") while omitting tool rules and a terminal rule produces agents that chat and never act. Every persona block needs a matching policy block.

**Per-request prompt mutation.** Injecting the current date or ticket ID at the top of the system prompt invalidates prefix caching and pays full input cost on every turn. Keep the system turn invariant; move volatile data into the user turn.

**Prompt in the user turn.** Putting operating rules in the first user message lets retrieved content and user text share the same authority level. Rules belong in the system turn where the harness separates them.

**Silent scope creep.** Adding a paragraph per ticket without pruning makes the prompt longer without making behaviour better, and eventually pushes it past the cache window. Remove the superseded paragraph in the same commit.
