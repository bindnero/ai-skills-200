---
name: structured-output-enforcement
description: Forces machine-parseable LLM output via strict JSON Schema, constrained decoding, grammar constraints, and repair loops. Use when output must be parsed by code without failure, when building agent actions as structured objects, or when JSON parsing breaks intermittently.
---

# Structured Output Enforcement

**Use when:** downstream code parses model output and a malformed response is not an acceptable outcome.
**Do not use when:** the output is prose for a human — constraining prose degrades it; or when a deterministic template or ordinary code produces the structure more cheaply.

## Instructions

1. Choose the strongest enforcement available: grammar or constrained decoding beats schema-constrained generation, which beats prompt-and-parse with retries.
2. Use the provider's structured output mode rather than instructing "reply with JSON only". Prompt-level JSON requests fail silently at maybe one in a hundred calls, which is ten thousand failures a day at scale.
3. Write strict schemas: `additionalProperties: false`, every property required, no `anyOf` at the top level, and enums rather than open strings.
4. Keep the schema shallow. Deeply nested optional objects are where structured generation degrades and where validation cost rises.
5. Attach `description` to every field describing what belongs there — the generator conditions on those descriptions as much as on names.
6. Decide explicitly what happens when the value cannot be represented: a nullable field with a stated default beats forcing a plausible-looking lie.
7. Validate after generation regardless of enforcement mode. Run the response through your own validator so a provider regression cannot corrupt your pipeline.
8. Cap repair attempts at one. If the first parse fails, send the validation errors back for a single corrected attempt, then fall back to a deterministic default or a clarifying question.
9. Keep the tool-action shape uniform across every tool: `name`, `arguments`, and an optional `confidence`. Uniform action shapes let one loop drive every tool.
10. Log every parse failure with the raw response. A silent fallback turns a schema bug into a mysterious quality drop weeks later.

## Patterns

Strict schema with nullable uncertainty instead of forced values:

```ts
import { z } from "zod";

export const TicketTriage = z.object({
  category: z.enum(["billing", "account", "bug", "other"]),
  severity: z.enum(["p0", "p1", "p2", "p3"]),
  summary: z.string().max(120),
  needs_human: z.boolean(),
  assignee_hint: z.string().nullable(),   // null means "no confident assignee", not a guess
  evidence: z.array(z.string()).min(1),
}).strict();
```

Provider structured output, OpenAI:

```ts
const res = await openai.responses.create({
  model: "gpt-5",
  text: {
    format: {
      type: "json_schema",
      name: "ticket_triage",
      strict: true,
      schema: zodToJsonSchema(TicketTriage),
    },
  },
  input: transcript,
});
const triage = TicketTriage.parse(JSON.parse(res.output_text));
```

Provider structured output, Anthropic:

```ts
const res = await client.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1024,
  tools: [{
    name: "record_triage",
    description: "Record the structured triage decision for this ticket.",
    input_schema: zodToJsonSchema(TicketTriage),
  }],
  tool_choice: { type: "tool", name: "record_triage" },   // forces the shape
  messages: [{ role: "user", content: transcript }],
});
```

Constrained decoding against a grammar (Outlines-style):

```python
from outlines import generate, models
from typing import Literal

generator = generate.json(
    models.transformers("mistralai/Mistral-7B-Instruct-v0.3"),
    schema={
        "sentiment": Literal["positive", "negative", "neutral"],
        "confidence": float,
        "reason": str,
    },
)
out = generator(prompt_list=[review_text])   # tokens outside the grammar are impossible
```

Validate, repair once, then fall back:

```ts
export async function structured<T>(raw: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const first = schema.safeParse(safeJson(raw));
  if (first.success) return first.data;

  const retry = await llmText({
    system: "Return only JSON matching the schema. No prose, no code fences.",
    prompt: `Fix this invalid output.\nERRORS:\n${formatIssues(first.error)}\nOUTPUT:\n${raw}`,
    maxTokens: 1024,
  });
  const second = schema.safeParse(safeJson(retry));
  return second.success ? second.data : fallback;   // one repair attempt, then deterministic fallback
}
```

## Checklist

- [ ] Strongest available enforcement used: grammar, then structured mode, then prompt-and-parse
- [ ] Schema is strict: no additional properties, all properties required, top level has no unions
- [ ] Nesting kept shallow and optional fields minimized
- [ ] Unrepresentable cases have an explicit nullable field with a documented default
- [ ] Output re-validated by your own validator after generation
- [ ] Repair loop capped at one attempt with a deterministic fallback
- [ ] All tool actions share one uniform shape so one loop can drive any tool
- [ ] Parse failures logged with the raw response, and the rate monitored in production

## Anti-patterns

**"Reply with valid JSON only."** Prompt-level format requests fail rarely but unpredictably, and rarely is a catastrophic failure rate. Use the provider's structured output mode or constrained decoding.

**Forced value instead of null.** Making a field required when the honest answer is "unknown" makes the model invent a value to satisfy the schema. Make it nullable and say what null means.

**Infinite repair loop.** Retrying until the parse succeeds turns a schema bug into an unbounded cost and latency event. One repair, then a deterministic fallback or a clarifying question.

**Union-heavy schemas.** Deep `anyOf` shapes for "several shapes are possible" defeat strict providers and complicate every consumer. Model the variants as an explicit discriminated `kind` field with flat per-kind fields.

**Unlogged fallback.** Swallowing parse errors with a default makes a schema regression look like a quality regression. Log the raw response with every failure and alert on the rate.
