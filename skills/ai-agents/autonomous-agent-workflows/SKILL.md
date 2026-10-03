---
name: autonomous-agent-workflows
description: Runs long-horizon agents with durable queues, resumable checkpoints, retry and backoff policy, budget ceilings, and idempotent side effects. Use when building agents that work for hours across many steps, or when long-running jobs must survive restarts without duplicating work.
---

# Autonomous Agent Workflows

**Use when:** a task runs for many steps over minutes to hours and must survive process restarts, provider failures, and partial completion.
**Do not use when:** the job finishes inside a single request — an in-process loop with budgets is simpler and easier to reason about; see `agent-architecture`.

## Instructions

1. Model the run as a durable state machine persisted outside the process. Every step transition is committed before the next step begins.
2. Make each step's side effect idempotent. Carry a stable step id into the external call so a retry after a crash never double-charges, double-sends, or double-writes.
3. Checkpoint after every externally visible effect, recording the step id, inputs hash, output reference, and timestamp. Checkpoints are what make resume safe.
4. On resume, replay from the last checkpoint and re-derive volatile values rather than trusting in-memory state that died with the process.
5. Classify failures and retry only the transient class with exponential backoff and jitter. Terminal failures advance the machine to a failed state immediately.
6. Enforce three ceilings independently: wall-clock deadline, step count, and spend. Exceeding any one moves the run to a terminal state with a recorded reason.
7. Checkpoint frequently enough that wasted work is bounded — after each tool call that costs real time or money, not only at phase boundaries.
8. Separate planning from execution with an explicit plan artifact. Re-planning is a state transition, not an implicit side effect of an error.
9. Emit a heartbeat and progress record so stalled runs are detectable without waiting for the deadline to expire.
10. Design graceful degradation: when a resource is unavailable, narrow scope and record the narrowing rather than looping on the same unavailable dependency.

## Patterns

Durable state machine with idempotent steps:

```ts
type Run = {
  runId: string;
  goal: string;
  step: number;
  state: "planning" | "executing" | "waiting" | "done" | "failed" | "cancelled";
  budget: { deadlineMs: number; stepsLeft: number; usdLeft: number };
  checkpoints: { stepId: string; tool: string; argsHash: string; resultRef: string; at: string }[];
};

export async function executeStep(run: Run, step: PlannedStep) {
  if (run.checkpoints.some((c) => c.stepId === step.id)) return loadResult(step.id);   // already done
  const result = await executeIdempotently({
    stepId: step.id,                                          // forwarded as the external idempotency key
    tool: step.tool,
    args: step.args,
    idempotencyKey: `${run.runId}:${step.id}`,
  });
  await checkpoints.insert({ runId: run.runId, stepId: step.id, tool: step.tool,
    argsHash: hash(step.args), resultRef: result.ref, at: new Date().toISOString() });
  return result;
}
```

Failure classification and retry:

```ts
type FailureClass = "transient" | "terminal" | "budget";

function classify(err: unknown): FailureClass {
  if (err instanceof RateLimitError || err instanceof TimeoutError) return "transient";
  if (err instanceof ValidationError || err instanceof NotFoundError) return "terminal";
  return "terminal";
}

export async function withRetry(fn: () => Promise<unknown>, attempts = 5) {
  let delay = 500;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (classify(err) !== "transient") throw err;
      await sleep(delay * (0.5 + Math.random()));   // exponential backoff with jitter
      delay *= 2;
    }
  }
  throw new Error("retries exhausted");
}
```

Budget enforcement independent of the model's behaviour:

```ts
export async function runJob(plan: Plan, budget: Budget) {
  const deadline = Date.now() + budget.maxMinutes * 60_000;
  for (const step of plan.steps) {
    if (Date.now() > deadline)            return terminal(run, "deadline_exceeded");
    if (budget.spentUsd() > budget.maxUsd) return terminal(run, "budget_exhausted");
    if (step.number > budget.maxSteps)     return terminal(run, "step_limit");
    await heartbeat(run.runId, { step: step.number, at: Date.now() });
    await executeStep(run, step);
  }
  return { state: "done" };
}
```

Graceful degradation when a dependency is unavailable:

```ts
if (!await health(dependencies.primary)) {
  await state.patch(runId, {
    plan: plan.without(dependencies.primary),
    scope: { narrowedFrom: plan.scope, narrowedTo: plan.steps.map((s) => s.scope) },
    note: "primary source unavailable; proceeding with secondary sources only",
  });
  // record the narrowing rather than retrying the same dead dependency
}
```

## Checklist

- [ ] Run state persisted outside the process with committed step transitions
- [ ] Every externally visible effect idempotent via a stable step id as the idempotency key
- [ ] Checkpoint written immediately after each costly or externally visible step, so a failure wastes bounded work
- [ ] Resume replays from the last checkpoint and re-derives volatile values
- [ ] Failures classified as transient or terminal; only transient retried with jittered backoff
- [ ] Wall-clock, step-count, and spend ceilings enforced independently in code
- [ ] Plan persisted as an artifact with re-planning as an explicit transition; heartbeat and progress records emitted so stalls are detectable
- [ ] Degradation narrows scope and records the narrowing instead of looping

## Anti-patterns

**In-process long jobs.** Holding a job open for hours loses all state on deploy or crash and burns retries from zero. Persist state and make every step resumable.

**Retrying terminal errors.** Retrying a validation failure or a 404 five times wastes the budget and hides the actual defect. Classify first, retry only transient failures.

**Non-idempotent steps.** Sending an email or charging a card without a stable idempotency key duplicates the effect on every crash-resume cycle. Key every side effect on `runId:stepId`.

**Single ceiling.** Relying only on a step cap lets a run run for a week at high cost; relying only on a deadline lets it burn the budget in minutes. Enforce deadline, steps, and spend independently.

**Looping on a dead dependency.** Retrying an unavailable service until the deadline produces a run that never progresses and never reports why. Detect unavailability, narrow scope, and record it.
