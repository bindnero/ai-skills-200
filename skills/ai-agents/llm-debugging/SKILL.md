---
name: llm-debugging
description: Diagnoses LLM failures by capturing full traces, classifying failure modes, bisecting prompt and model changes, and inspecting token and tool-call state. Use when output quality drops unexpectedly, when agents loop or stall, or when a regression appears after a model or prompt change.
---

# LLM Debugging

**Use when:** behaviour changed without a code change you intended, when an agent misbehaves in ways that look nondeterministic, or when you need to explain a specific bad response.
**Do not use when:** the failure is reproducible in a unit test with no model involved — that is ordinary application debugging.

## Instructions

1. Capture a full trace before changing anything: request body, resolved system prompt, messages, tool definitions, model and every sampling parameter, response content blocks, stop reason, and token usage.
2. Classify the failure before fixing it: schema violation, wrong tool selection, bad arguments, ignored instruction, truncation, refusal, hallucination, injection, or infinite loop. Each class has a different owner.
3. Replay deterministically first. Fix temperature to 0, seed where available, and the same snapshot before concluding anything is nondeterministic.
4. Read the stop reason before the content. `max_tokens` truncation produces mid-sentence output that looks like a reasoning failure; that is a budget bug, not a model bug.
5. Bisect the change. Revert the model version, then the prompt, then the schema, one at a time, against a fixed failing case.
6. Check whether the failure is upstream of the model: truncated retrieval, a tool returning an error the model treats as data, or an observation cut off mid-JSON.
7. Inspect tool-call state per turn. Sequence, arguments, and result classification reveal loops and ignored errors faster than reading the final prose.
8. Compare against a known-good trace from the same case. Diff the resolved prompt, not the source file; formatters and assembly order hide real differences.
9. Separate systematic from sampling failures. Ten identical runs with one failure is a sampling tail; ten runs with nine failures is a prompt or schema bug.
10. Fix, then add the failing case to the eval suite with an assertion, so the regression is caught by CI next time.

## Patterns

Trace record capturing everything needed to replay:

```ts
type Trace = {
  traceId: string;
  at: string;
  model: string;
  params: { temperature: number; top_p?: number; max_tokens: number; seed?: number; effort?: string };
  system: string;                        // fully resolved, post-template
  tools: unknown[];                      // exact serialized definitions sent
  messages: unknown[];                   // as sent, including cached blocks
  response: { content: unknown[]; stop_reason: string; usage: Record<string, number> };
  turns: { tool: string; args: unknown; result: unknown; ok: boolean }[];
};

const TRACE = process.env.LLM_TRACE === "1";
function trace(rec: Trace) { if (TRACE) appendJsonl("traces.jsonl", rec); }
```

Deterministic replay harness:

```ts
export async function replay(trace: Trace) {
  const res = await client.messages.create({
    model: trace.model,
    max_tokens: trace.params.max_tokens,
    temperature: 0,
    system: trace.system,
    tools: trace.tools as never,
    messages: trace.messages as never,
  });
  return { stop: res.stop_reason, text: textOf(res), usage: res.usage };
}
```

Failure classifier over a trace:

```ts
function classify(t: Trace): string {
  if (t.turns.length > 8 && new Set(t.turns.map((x) => x.tool)).size === 1) return "tool_loop";
  if (t.turns.some((x) => !x.ok)) return "tool_error_ignored";
  if (t.response.stop_reason === "max_tokens") return "truncated";
  if (!t.response.usage.input_tokens) return "empty_response";
  const parsed = SafeJson.parse(textOf(t));
  if (!parsed.success) return "schema_violation";
  if (/I could not find|as an AI|I'm sorry/.test(textOf(t))) return "unexpected_refusal";
  return "unclassified";
}
```

Model and prompt bisect over a fixed failing case:

```text
1. Pin temperature 0. Replay 5x on the failing case. Record failure rate.
2. Swap model to last known good version, same prompt.  Failure rate?
   - fixed  -> model regression; pin the version and file an issue.
   - persists -> continue.
3. Swap prompt to last known good revision, same model. Failure rate?
   - fixed  -> prompt regression; inspect the diff for unintended changes.
   - persists -> continue.
4. Swap tool schemas to last known good. Failure rate?
   - fixed  -> schema regression, usually a removed description or a loosened enum.
   - persists -> look upstream at retrieval and tool results.
```

Resolved-prompt diff, not source diff:

```bash
jq -r '.system' traces/good.json > /tmp/good.txt
jq -r '.system' traces/bad.json  > /tmp/bad.txt
diff -u /tmp/good.txt /tmp/bad.txt
```

## Checklist

- [ ] Full trace captured before any change: system, tools, messages, params, response, usage
- [ ] Failure classified into a named mode; stop reason inspected before interpreting content
- [ ] Deterministic replay attempted (temperature 0, fixed seed) before declaring randomness
- [ ] Model version, prompt, and schema bisected one variable at a time on a fixed case
- [ ] Tool-call sequence, arguments, and ok/error inspected turn by turn; resolved prompt diffed against a known-good trace
- [ ] Upstream inputs checked: retrieval truncation, tool errors, cut-off observations
- [ ] Failure rate measured over repeated runs to separate systematic from sampling issues
- [ ] Failing case added to the eval suite with an assertion so CI catches it next time

## Anti-patterns

**Changing things while debugging.** Adjusting the prompt, the temperature, and the schema together produces a change that fixes the symptom and hides the cause. Capture the trace, then change one variable.

**Blaming nondeterminism.** A single odd sample on temperature 0.7 is not a bug. Run the case ten times and look at the rate before rewriting anything.

**Reading only the final text.** The answer looks wrong, but the loop had three identical failing tool calls two turns earlier. Read the turn-by-turn tool state, not the conclusion.

**Diffing the source prompt.** The template changed a whitespace-sensitive interpolation or an assembly-order swap that the source diff hides. Diff the fully resolved prompt actually sent.

**Fixing without a regression test.** A one-off fix that is never encoded is gone within two releases. Add the failing case to the suite with an assertion before closing the investigation.
