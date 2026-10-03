---
name: prompt-engineering
description: Crafts and iterates production prompts with few-shot examples, CoT/ToT reasoning scaffolds, XML or delimiter-based structure, and token-level diffing. Use when a prompt underperforms, when output format or instruction-following drifts, or when you need to A/B test prompt variants against an eval set.
---

# Prompt Engineering

**Use when:** a prompt produces inconsistent, verbose, or format-noncompliant output and you need to fix the prompt itself rather than the model or schema.
**Do not use when:** the model cannot emit the required shape at all and you need hard validation — use `structured-output-enforcement`; or when the missing information is retrieval, not instruction-following — use `rag-pipeline-design`.

## Instructions

1. Write the task as an observable contract: name the input, the output artifact, and the pass/fail condition an evaluator could check. "Summarize the ticket" is not a contract; "Return a 1-sentence summary plus 3 bullet risks, each under 15 words" is.
2. Put role and output contract in the system message, and only volatile facts in the user message. Anything that must be identical across every request belongs in the system prompt — see `system-prompt-design`.
3. Isolate untrusted or long data in explicit delimiters (`<documents>`, triple backticks) and state inside the prompt that content inside those delimiters is data, never instruction.
4. Add reasoning scaffolding only when the task needs it: a short "think step by step before answering" clause for multi-hop reasoning, and a scratchpad line for classification or extraction tasks. Skip it for single-step lookups.
5. Select few-shot examples to cover the decision boundary, not the average case. Two contrasting examples (one accepted, one rejected with a stated reason) outperform six homogeneous ones.
6. Delete politeness and filler, and pin negative constraints as concrete rules with a boundary: "Do not use the words 'delve' or 'leverage'" beats "be concise".
7. Tokenize and measure. Count prompt tokens with the exact tokenizer for the target model and confirm the request fits the context window with room for the completion.
8. Build a 20-50 case eval set with known-good outputs before you tune anything. Change one variable per iteration and record the score.
9. Sweep determinism knobs last: temperature, `top_p`, and reasoning budget. Most prompt regressions are instruction bugs, not sampling bugs.

## Patterns

Delimited, role-separated prompt with explicit contract:

```text
<system>
You are a release-notes editor. Convert raw commit messages into customer-facing notes.

Rules:
- One sentence per entry, present tense, no ticket IDs.
- Never mention internal module or file names.
- If a commit is purely internal, return the single word SKIP for that entry.
</system>

<commits>
- feat(auth): add argon2id hashing to credential store
- chore: bump eslint 9.14 -> 9.15
- fix(billing): retry failed webhooks 3x with jitter
</commits>

Output exactly one line per commit, in the original order:
<entry>text</entry>
```

Few-shot examples that teach the boundary, not just the format:

```text
Task: label the support ticket's intent.

FEW-SHOT
Ticket: "My card was charged twice for the June invoice."
Label: BILLING_DUPLICATE

Ticket: "How do I rotate my API key without downtime?"
Label: ACCOUNT_MANAGEMENT

Ticket: "Refund for invoice 88213 or I'll dispute with my bank."
Label: BILLING_DUPLICATE
Rationale: an explicit chargeback threat makes this a billing dispute whatever it asks for.

Now label:
Ticket: "{{ticket_text}}"
Label:
```

Reasoning scaffold that does not leak into the answer:

```text
<internal_reasoning>
List the facts the answer depends on, then check the ticket against each rule in order
and note the first rule that matches. Keep this under 80 words.
</internal_reasoning>
<answer>
{{final_response}}
</answer>
```

Token budget and variant harness in TypeScript:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { render } from "./prompts/variant-b";

const client = new Anthropic();
type Case = { input: string; expect: (out: string) => boolean };

export async function score(variant: (c: Case) => Promise<string>, cases: Case[]) {
  const failures: string[] = [];
  let pass = 0;
  for (const c of cases) {
    const out = await variant(c);
    if (c.expect(out)) pass++;
    else failures.push(JSON.stringify({ input: c.input, out }));
  }
  return { passRate: pass / cases.length, failures };
}

const report = await score(async (c) => {
  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: render({ variant: "b" }),
    messages: [{ role: "user", content: c.input }],
  });
  return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
}, evalCases);
```

## Checklist

- [ ] The output contract is checkable by a program, not just a human reader
- [ ] Role and format rules live in the system message; volatile facts live in the user message
- [ ] Untrusted data is wrapped in delimiters and labelled as data, not instruction
- [ ] Few-shot examples span the decision boundary, including a rejected case, written in the target output language
- [ ] Prompt tokens measured with the target model's tokenizer and within budget
- [ ] A held-out eval set exists and scored better than the prior prompt
- [ ] Only one variable changed between the two scored prompt versions

## Anti-patterns

**Politeness padding.** "Please kindly respond in JSON" adds tokens and softens the constraint. Declare the format as an invariant and validate it downstream — reword to "Respond only with a JSON object matching the schema."

**Instruction dilution.** Stacking fifteen rules of mixed priority into one paragraph makes the model trade them off unpredictably. Order rules by precedence and label the decisive one ("If X and Y conflict, X wins").

**Few-shot bloat.** Twenty examples that all look the same burn context and teach nothing about the edge. Replace with two contrasting examples plus a one-line rationale on each rejection.

**Eval-free iteration.** Rewriting prompts by intuition until one sample looks good produces prompts that overfit a single demo. Score against a fixed case set on every change.
