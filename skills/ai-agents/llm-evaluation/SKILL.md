---
name: llm-evaluation
description: Builds and runs LLM eval suites with graded rubrics, pairwise model-graded comparison, deterministic graders, and statistical significance checks. Use when changing a model, prompt, or retrieval setup and needing evidence it helped, or when quality has regressed in production.
---

# LLM Evaluation

**Use when:** you need evidence that a model, prompt, or pipeline change improved quality rather than assuming it did.
**Do not use when:** you are still deciding whether to build the feature at all — ship a thin version and instrument it first; or when the output is a verifiable fact against a known source, where a plain unit assertion is cheaper than a grader.

## Instructions

1. Define the eval as pass/fail on observable behaviour before building it. Write what a correct answer contains and what a wrong answer contains.
2. Assemble 30-100 cases from real traffic first, then add adversarial cases: ambiguous requests, missing context, adversarial user input, and cases where the correct behaviour is refusal.
3. Split into dev and held-out sets. Tune on dev only; touch the held-out set once per release or it becomes a second dev set.
4. Use deterministic graders wherever the check can be exact: string match, JSON schema validity, tool-call sequence, retrieved-ID membership, regex, numeric tolerance.
5. Use model-graded rubrics only for qualities no code can check: tone, helpfulness, faithfulness, writing quality. Give the grader the rubric, the response, and the reference, and ask for a score plus a reason.
6. Prefer pairwise comparison when you only need to choose between two variants. Pairwise judging is markedly more stable than absolute scoring.
7. Calibrate your model grader against human labels on 50-100 samples. If agreement is below roughly 80%, fix the rubric before trusting the score.
8. Report the metric with uncertainty. With 50 cases, a 5-point difference is noise; run the comparison multiple times when sampling is non-deterministic.
9. Track the full eval panel, not one number: task success, tool-call accuracy, refusal correctness, cost, and p95 latency. A single composite score hides regressions.
10. Run the suite in CI on every prompt, model, and schema change, and run a sampled version in production with regression alerts.

## Patterns

Deterministic graders:

```ts
import { z } from "zod";

const Grading = {
  schemaValid: (out: string) => {
    const parsed = ToolOutput.safeParse(JSON.parse(out));
    return parsed.success;
  },
  citedChunksRetrieved: (out: string, ctx: { retrieved: string[] }) => {
    const ids = [...out.matchAll(/\[(\w+)\]/g)].map((m) => m[1]);
    return ids.length > 0 && ids.every((id) => ctx.retrieved.includes(id));
  },
  refusedWhenUnanswerable: (out: string) => out.trim() === NO_ANSWER_SENTINEL,
  toolSequenceExact: (out: string, expected: string[]) => JSON.parse(out).calls === expected.join(","),
};
```

Graded rubric for what code cannot check:

```text
You are grading an assistant answer against a rubric.

Rubric (score 1-5 each):
- Correctness: are the stated facts right and complete?
- Faithfulness: is every claim supported by the provided evidence?
- Relevance: does it answer the question asked, without padding?

Answer:
{response}

Reference (may be incomplete; do not penalise for omissions unless the rubric says so):
{reference}

Return JSON: {"correctness": 1-5, "faithfulness": 1-5, "relevance": 1-5, "reason": "<one sentence>"}
```

Pairwise judge for variant selection:

```text
Question: {question}
Answer A: {output_a}
Answer B: {output_b}

Which answer is better for the user? Judge correctness first, then completeness,
then clarity. Ignore length and stylistic differences.

Return JSON: {"winner": "A" | "B" | "tie", "reason": "<one sentence>"}
```

Eval harness with held-out split and paired testing:

```ts
type Case = { id: string; input: string; expect: (out: string, ctx: any) => boolean; holdout?: boolean };

export async function run(cases: Case[], impl: (c: Case) => Promise<string>) {
  const dev = cases.filter((c) => !c.holdout);
  const holdout = cases.filter((c) => c.holdout);
  const score = async (set: Case[]) => {
    const results = await Promise.all(set.map(async (c) => ({ id: c.id, pass: c.expect(await impl(c), c) })));
    return { rate: results.filter((r) => r.pass).length / set.length, failures: results.filter((r) => !r.pass) };
  };
  return { dev: await score(dev), holdout: await score(holdout) };
}
```

CI gate:

```yaml
- run: npm run eval -- --suite=agents --fail-under=0.90
- run: npm run eval -- --suite=rag --fail-under=0.85 --fail-on=regression
```

## Checklist

- [ ] Eval defined as pass/fail on observable behaviour before implementation
- [ ] Cases drawn from real traffic, plus ambiguous, missing-context, adversarial, and refusal cases
- [ ] Dev and held-out splits separated; held-out read only at release time
- [ ] Deterministic graders used wherever exact checking is possible; model-graded rubrics carry a score plus a required reason
- [ ] Pairwise comparison used for variant selection rather than absolute scores
- [ ] Grader calibrated against human labels with measured agreement; results reported with sample size and uncertainty
- [ ] Panel of metrics tracked: success, tool accuracy, refusal correctness, cost, latency
- [ ] Suite runs in CI on prompt/model/schema change and sampled in production

## Anti-patterns

**Tuning and reporting on one set.** Re-running the same 40 cases until the number rises produces a prompt that overfits those cases. Keep a held-out set you only read at release time.

**Grader with no rubric.** Asking a model "is this good?" returns noise. Give explicit dimensions, an anchored scale, and require a justification you can audit.

**Absolute scores for A/B decisions.** A 4.1 versus 4.3 on an uncalibrated 1-5 scale means nothing. Compare two outputs head to head and count wins.

**Composite score only.** One blended metric rises while tool-call accuracy collapses. Track the panel separately so regressions are visible instead of averaged away.

**Human review at 3% with no labels.** Spot-checking a few outputs proves nothing statistically. Either label a proper sample or run the suite automatically on every change.
