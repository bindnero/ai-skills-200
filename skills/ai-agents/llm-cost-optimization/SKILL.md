---
name: llm-cost-optimization
description: Reduces LLM spend with prompt caching, model routing by difficulty, batch APIs, quantization, and per-workload budget accounting. Use when inference cost or latency breaches budget, or when planning spend for a production agent workload.
---

# LLM Cost Optimization

**Use when:** token spend, latency, or vendor bill has become a production concern, or you are forecasting cost for a new agent workload.
**Do not use when:** output quality is already failing — cutting cost before quality is measured hides the real defect; establish the eval baseline first with `llm-evaluation`.

## Instructions

1. Measure cost per outcome, not cost per call. Divide total spend by successful tasks; a cheaper model that causes retries is more expensive.
2. Log tokens by category — system prompt, cached prefix, dynamic context, tool results, completion, reasoning — so you know where the tokens actually are.
3. Enable prompt caching on every stable prefix and place cache breakpoints so that the volatile part of the prompt comes last. Verify cache hit rate in the response metadata.
4. Route by difficulty, not by policy convenience. A small model handles classification, extraction, routing, and short-form summarization; reserve frontier models for multi-step reasoning and ambiguous judgement.
5. Default to the cheapest model that clears the eval bar, then re-run the eval whenever you change the tier.
6. Cut completion length deliberately with output token caps and explicit brevity rules; output tokens are billed at the same or higher rate as input.
7. Batch non-interactive work through the provider batch API for its discount, and cache deterministic derivations (embeddings, classifications of stable strings) in your own store.
8. Quantize and self-host only when volume justifies the operational cost; at low volume a managed frontier API beats an underutilized GPU.
9. Enforce budgets in code: per-request token ceilings, per-tenant spend caps, and hard ceilings on fan-out and reasoning effort.
10. Review the mix monthly. Model upgrades, new features, and caching regressions each shift the distribution, and stale routing rules are the most common source of surprise cost growth.

## Patterns

Cacheable stable prefix with an explicit breakpoint (Anthropic):

```ts
const res = await client.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 2048,
  system: [
    { type: "text", text: LEDGER_SYSTEM },                      // large, invariant
    { type: "text", text: companyPolicyDoc },                   // large, semi-static
    { type: "text", text: SHORT_RUNTIME_HEADER, cache_control: { type: "ephemeral" } },
  ],
  messages: [{ role: "user", content: `${retrieved}\n\n${question}` }],
});

console.log(res.usage.cache_read_input_tokens, "/", res.usage.input_tokens);
```

Difficulty router before the expensive call:

```ts
async function answer(question: string) {
  const { difficulty } = await smallModel.json<{ difficulty: "easy" | "hard" }>({
    model: "claude-haiku-4-5",
    system: 'Label "easy" for lookups, extraction, classification, and single-step ' +
            'questions. Label "hard" for multi-step reasoning, judgement calls, or code. ' +
            'Reply as JSON.',
    prompt: question,
    max_tokens: 64,
  });

  return difficulty === "easy"
    ? cheapModel.complete({ model: "claude-haiku-4-5", max_tokens: 1024, prompt: question })
    : frontierModel.complete({ model: "claude-sonnet-4-5", max_tokens: 4096, prompt: question });
}
```

Per-outcome accounting:

```python
def cost_per_outcome(total_usd: float, tasks_attempted: int, tasks_succeeded: int) -> float:
    return {
        "usd_per_attempt": round(total_usd / tasks_attempted, 4),
        "usd_per_success": round(total_usd / max(tasks_succeeded, 1), 4),
        "success_rate": round(tasks_succeeded / tasks_attempted, 4),
    }
```

Offline batch discount path:

```python
job = client.messages.batches.create(requests=[
    {"custom_id": f"classify-{i}", "params": {"model": "claude-haiku-4-5",
     "max_tokens": 64, "messages": [{"role": "user", "content": text}]}}
    for i, text in enumerate(bulk_items)
])
# poll until ended, then consume results_streaming()
```

Hard ceilings in the request path:

```ts
const LIMITS = { maxInputTokens: 120_000, maxOutputTokens: 8_000, maxToolCalls: 12 };

function enforce(usage: { input: number; output: number }, toolCalls: number) {
  if (usage.input > LIMITS.maxInputTokens) throw new BudgetError("input over limit");
  if (toolCalls > LIMITS.maxToolCalls) throw new BudgetError("tool fan-out over limit");
}
```

## Checklist

- [ ] Cost reported per successful outcome, not per request
- [ ] Token spend categorised by system, cached prefix, context, tool results, completion, reasoning
- [ ] Prompt caching enabled on stable prefixes with cache-hit rate read from response metadata
- [ ] Routing rule sends extraction, classification, routing, and short summaries to a small model; cheapest eval-passing tier is the default
- [ ] Output token caps plus brevity rules in the prompt; completion tokens tracked separately
- [ ] Non-interactive work moved to the batch API; deterministic results cached locally
- [ ] Per-request, per-tenant, and fan-out ceilings enforced in code
- [ ] Spend mix reviewed monthly against routing rules; self-hosting justified by volume and utilization

## Anti-patterns

**Cheapest-model-first.** Switching everything to the smallest model to save money raises retry rates and error handling costs, and the bill often goes up while quality falls. Set the eval bar first, then pick the cheapest tier that clears it.

**Cache breakpoints on the wrong side.** Putting the cache marker after the volatile content caches a prefix that changes every request, so you pay full price and see a 0% hit rate. Order stable content first and mark the boundary at the last stable block.

**Unbounded fan-out.** No cap on tool calls or sub-agents means one bad query can issue hundreds of billable requests. Enforce ceilings in the harness, not in prompt text.

**Ignoring completion tokens.** Caching input while leaving `max_tokens` unbounded means a rambling model is billed at full output rate every turn. Cap output and state brevity requirements explicitly.

**Self-hosting at low volume.** Running a quantized model on a single GPU for a few hundred daily requests costs more than the API and adds on-call burden. Compare utilization against managed pricing before provisioning.
