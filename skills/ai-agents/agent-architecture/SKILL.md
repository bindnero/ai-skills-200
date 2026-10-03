---
name: agent-architecture
description: Structures LLM agents as a loop of perceive-decide-act-observe with bounded tool budgets, typed state, and explicit termination conditions. Use when deciding whether to build an agent at all, when picking single-agent versus pipeline versus supervisor topologies, or when an agent loops, stalls, or never terminates.
---

# Agent Architecture

**Use when:** you are designing the control loop and state model for a system that must call tools, make multi-step decisions, and stop reliably.
**Do not use when:** the flow is a fixed sequence with no branching on model output — build a pipeline instead and use `llm-evaluation` on the steps; or when the task decomposes cleanly across specialists — use `multi-agent-orchestration`.

## Instructions

1. Classify the shape before building. Fixed sequence, single-step reasoning with tools, dynamic branching, or long-running goal pursuit. Only the last two justify a free-form agent loop.
2. Compare against the deterministic baseline: a plain chain of calls with no loop is cheaper, faster, and more debuggable. Justify every place the model gets to choose the next step.
3. Model state explicitly as a typed object, not a growing message transcript. Transcript is a view over state; state is what you log, checkpoint, and assert on.
4. Give the loop a hard budget: max steps, max tool calls, max wall-clock, max tokens. Every one of these is a termination condition the harness enforces, not the model.
5. Make termination explicit in three ways: a terminal tool, a `done` signal in the structured output, and the budget checks above. Any single mechanism alone fails in practice.
6. Put the observation back as structured data in the user turn, never as raw tool output dumped into the system prompt.
7. Truncate and summarize observations at the loop boundary. Long tool outputs are the main cause of context exhaustion mid-run.
8. Classify tool outcomes into three responses: success (continue), recoverable failure (retry with a modified argument, capped), terminal failure (stop and report). Agents that retry indiscriminately burn budget and loop.
9. Separate planning from execution. Produce the plan once as data, execute it step by step, and re-plan only on a classified failure.
10. Instrument every run with step count, tokens per step, tool latency, and the reason the loop exited. Without an exit-reason histogram you cannot tell stalls from successes.

## Patterns

Typed agent state and termination contract:

```ts
type Step =
  | { kind: "tool_call"; tool: string; args: Record<string, unknown> }
  | { kind: "final"; answer: string };

type State = {
  goal: string;
  steps: Step[];
  observations: Record<string, unknown>;
  budget: { stepsLeft: number; toolCallsLeft: number; deadlineMs: number };
  exit: "running" | "done" | "budget_exhausted" | "terminal_failure";
};
```

Loop with enforced budgets and classified failure handling:

```ts
const MAX_STEPS = 24;

async function run(state: State): Promise<State> {
  while (state.exit === "running" && state.steps.length < MAX_STEPS) {
    const decision = await decide(state);
    if (decision.kind === "final") {
      state.exit = "done";
      state.steps.push(decision);
      return state;
    }
    if (state.budget.toolCallsLeft-- <= 0) {
      state.exit = "budget_exhausted";
      return state;
    }
    let result;
    try {
      result = await tools[decision.tool](decision.args);
      state.observations[decision.tool] = truncate(result, 2000);
    } catch (err) {
      const retryable = err instanceof TransientToolError;
      if (!retryable) {
        state.exit = "terminal_failure";
        state.observations[decision.tool] = { error: String(err) };
        return state;
      }
      state.observations[decision.tool] = { error: "transient; retry once with backoff" };
    }
    state.steps.push(decision);
  }
  if (state.exit === "running") state.exit = "budget_exhausted";
  return state;
}
```

When to use an agent at all — the decision table:

```text
Task type                      | Topology            | Why
Single extraction from docs    | One call            | No loop needed; add a schema
Fixed 4-step ETL over an API   | Pipeline            | Branching is not data-dependent
Research across N unknown APIs | Agent loop          | Next source is chosen from results
Known sources, variable depth  | Planner + executors | Plan once, branch by data
Cross-department handoff       | Supervisor          | Different toolsets and policies
```

Supervisor skeleton, typed so the router is the only place policy lives:

```ts
type Route = { agent: "research" | "billing" | "account"; rationale: string };

async function route(question: string, state: State): Promise<Route> {
  const out = await llmJson<Route>({
    system: "Route to exactly one agent. research = public/external sources. " +
            "billing = invoices, refunds, plans. account = profile, auth, keys. " +
            "Unknown intent: research.",
    prompt: question,
  });
  return out;
}
```

## Checklist

- [ ] Task topology classified; loop used only where branching is genuinely data-dependent
- [ ] Comparison against a deterministic chain documented, with the justification for each dynamic step
- [ ] State is a typed structure; transcript is derived, not authoritative
- [ ] Hard budgets on steps, tool calls, wall-clock, and tokens enforced in harness code
- [ ] Three independent termination mechanisms: terminal signal, `done` output, budget exhaustion
- [ ] Tool errors classified as success, capped-retryable, or terminal
- [ ] Observations truncated at the loop boundary before entering context
- [ ] Exit-reason histogram and step-count distribution instrumented in production

## Anti-patterns

**Unbounded loop.** A `while true` agent with no step cap is a production incident waiting for a retry storm. Cap steps, tool calls, and wall-clock in code, and treat `budget_exhausted` as a distinct, alertable exit reason.

**Transcript as state.** Appending every tool result to the message list and re-sending it inflates cost quadratically and hides the real state. Keep a typed state object and render a bounded view each turn.

**Catch-all retry.** Retrying on any exception, including validation errors that will never succeed, wastes the budget and hides real bugs. Classify errors and only retry the transient class, with a cap.

**Model-chosen termination only.** Trusting the model to emit "done" when it is stuck produces infinite work at full price. Pair the model's signal with a harness-side budget check that fires regardless.

**Agent for a linear task.** Wrapping four fixed API calls in an agent loop adds nondeterminism, cost, and latency for zero benefit. Use a pipeline and reserve the loop for the genuinely branching segment.
