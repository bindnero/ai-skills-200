---
name: model-selection-strategy
description: Selects and routes between frontier, mid-tier, small, and specialized models using capability tiers, eval-driven benchmarks, latency budgets, and fallback chains. Use when choosing a model for a workload, when a model upgrade is proposed, or when building a multi-model routing strategy.
---

# Model Selection Strategy

**Use when:** picking which model serves a workload, or designing the routing and fallback logic across models.
**Do not use when:** the model is fine and the defect is in the prompt or the retrieval; see `prompt-engineering` and `rag-pipeline-design`.

## Instructions

1. Classify the workload by tier before reading any benchmark: extraction and classification are tier 1; short multi-step reasoning and summarization are tier 2; open-ended planning, code generation, and ambiguous judgement are tier 3.
2. Choose the cheapest model that clears your own eval bar for the tier. Public leaderboards are a starting point for a candidate list, not a decision.
3. Route per call, not per deployment. A single request often mixes tiers: a small model classifies and routes, a mid-tier model drafts, a frontier model handles the hard remainder.
4. Set explicit escalation rules based on signals you can observe: low grader confidence, schema validation failure, tool-call error rate, or a difficulty classifier output — not on vibes.
5. Build a fallback chain for availability and rate limits, with the fallback demoted one tier and the same schema. Never fall back across a schema change without a mapper.
6. Set latency budgets per tier and let the router respect them: p95 targets differ by an order of magnitude between a small classifier and a frontier reasoning call.
7. Re-benchmark on every model version bump with the same suite. New releases change capability, latency, and price simultaneously, and your routing table goes stale.
8. Account for reasoning effort explicitly where a model exposes it. Low effort for extraction and high effort for planning is a larger lever than the model tier itself.
9. Track cost and quality per tier per workload so routing decisions have evidence behind them.
10. Avoid single-vendor dependency for critical paths; keep a second provider behind the same interface with an equivalence-tested adapter.

## Patterns

Tier map with candidate models and intended use:

```text
Tier 0 router/scorer  : claude-haiku-4-5, gpt-5-mini          classification, routing, extraction
Tier 1 utility        : claude-haiku-4-5, gpt-5-mini          short answers, tool arg prep, formatting
Tier 2 workhorse      : claude-sonnet-4-5, gpt-5              multi-step reasoning, drafting, code edits
Tier 3 frontier       : claude-opus-4-1, gpt-5 (high effort)   open-ended planning, hard judgement, agent loops
Tier 4 long-context  : claude-sonnet-4-5 (1M), gpt-5           whole-repo or whole-corpus reasoning
Embedding             : voyage-3-large, text-embedding-3-large  retrieval vectors
```

Escalating router with observable signals:

```ts
async function serve(request: Request) {
  const signals = await presignals(request);            // cheap tier-0 pass
  const tier: Tier = signals.needsLongContext ? 4
                 : signals.difficulty === "hard" ? 3
                 : signals.difficulty === "medium" ? 2
                 : 1;

  const primary = MODEL_BY_TIER[tier];
  try {
    return await withSchema(() => callModel(primary, request, signals));
  } catch (err) {
    if (!isAvailabilityError(err)) throw err;
    return callModel(demote(primary, 1), request, signals);   // one tier down, same schema
  }
}
```

Reasoning effort as a first-class lever:

```python
def effort_for(task: str) -> str:
    if task in ("classify", "extract", "format"):
        return "low"
    if task in ("summarize", "rewrite", "tool_args"):
        return "medium"
    return "high"

resp = client.responses.create(model="gpt-5", reasoning={"effort": effort_for(task)}, input=prompt)
```

Version-pinned benchmark table (regenerate every release):

```text
Suite: agent-tasks (200 cases) | Model | tier | pass | p95 ms | $/1k tasks
                              | haiku-4-5 |  1  | 0.71 |  420   | 0.09
                              | sonnet-4-5 |  2 | 0.88 | 1150   | 0.90
                              | opus-4-1    |  3 | 0.91 | 2400   | 4.10
Gate: ship the lowest tier whose pass rate is within 2 points of the best.
```

Provider-portable interface for failover:

```ts
interface LLM { complete(req: Req): Promise<Res> }

const providers: Record<string, LLM> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
};

export async function completeWithFailover(req: Req): Promise<Res> {
  for (const name of ["anthropic", "openai"]) {
    try {
      return await providers[name].complete(req);
    } catch (err) {
      if (!isAvailabilityError(err)) throw err;   // do not mask schema or auth errors
    }
  }
  throw new Error("all providers unavailable");
}
```

## Checklist

- [ ] Workload classified by tier before any model is chosen
- [ ] Cheapest model clearing the eval bar selected, from a same-provider comparison
- [ ] Routing decided per call, allowing mixed tiers within one request
- [ ] Escalation rules keyed on observable signals, not subjective judgement
- [ ] Fallback chain defined, demoted one tier, schema-identical
- [ ] Latency budget set per tier and respected by the router
- [ ] Same suite re-run on every model version bump; reasoning effort set per task type
- [ ] Cost and quality tracked per tier per workload, against a second equivalence-tested provider adapter

## Anti-patterns

**Picking the flagship for everything.** Running extraction and formatting on a frontier model costs several times more for no quality gain on structured output. Route by tier and reserve frontier calls for open-ended reasoning.

**Leaderboard-driven choice.** The top model on a public benchmark is often wrong for your domain vocabulary and latency budget. Benchmark on your own labelled suite.

**Cascade without signals.** "Try the big model, fall back if the answer looks bad" requires reading every output and destroys latency. Escalate on measurable signals like confidence or validation failure.

**Same effort everywhere.** Leaving reasoning effort at its maximum for classification wastes tokens and latency with identical output. Set effort per task type as a config value.

**Unversioned model strings.** Depending on a floating alias means behaviour changes under you at the provider's release cadence. Pin exact versions and re-run the suite on each bump.
