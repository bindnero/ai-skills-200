---
name: multi-agent-orchestration
description: Coordinates teams of specialized agents with supervisor routing, blackboard shared state, handoff protocols, and per-agent concurrency limits. Use when one agent cannot hold every tool and policy, when splitting work across domain specialists, or when sub-agents conflict or duplicate effort.
---

# Multi-Agent Orchestration

**Use when:** the work needs several different tool sets, policies, or context windows that cannot credibly live in one agent.
**Do not use when:** a single agent with a few tools and a tighter system prompt solves it — see `agent-architecture`; or when the steps are sequential and stateless, in which case a plain pipeline beats both.

## Instructions

1. Split on capability boundaries, not on task phrasing. A separate agent earns its cost only when it owns a distinct toolset, a distinct policy, or a context that would otherwise evict the orchestrator.
2. Choose a topology deliberately: supervisor-routes (one router, many specialists), blackboard (agents share a typed store, no direct calls), or peer-handoff (agents transfer a conversation). Do not build a free-for-all mesh.
3. Define the handoff contract before writing any agent body: what fields travel, which fields are redacted, and what the receiving agent is expected to produce. Unstated contracts become duplicated work.
4. Use a typed shared state object as the blackboard. Never let agents exchange free text and hope; that is where context drift and contradictions start.
5. Keep the router cheap. A small model with a compact description per specialist, called with just the intent, is sufficient and dramatically faster than routing with the frontier model on full history.
6. Redact at the boundary. Each specialist receives the minimum context for its job; broad history sharing leaks irrelevant data into every prompt and inflates cost.
7. Enforce per-agent budgets separately from the global budget, and cap fan-out. A router that can dispatch 12 specialists per turn is a cost incident.
8. Require structured returns from specialists, including a confidence field and an explicit "insufficient context" outcome so a specialist can hand back rather than guess.
9. Detect and break cycles: track `(from, to)` transitions and refuse a handoff that revisits the same specialist with no new state.
10. Log the full delegation graph per run — edges, tokens per node, and outcome — so you can see which specialist is a dead end before users do.

## Patterns

Specialist registry with capability metadata for the router:

```ts
type Specialist = {
  id: string;
  description: string;      // used verbatim in the router prompt
  tools: string[];
  maxContextTokens: number;
  cost: "cheap" | "frontier";
};

const specialists: Specialist[] = [
  { id: "billing", description: "Invoices, refunds, plan changes, payment methods.", tools: ["get_invoice", "issue_refund", "update_plan"], maxContextTokens: 120_000, cost: "cheap" },
  { id: "account", description: "Profile, authentication, API keys, team seats.", tools: ["get_user", "rotate_key", "invite_member"], maxContextTokens: 120_000, cost: "cheap" },
  { id: "research", description: "External documentation, vendor status pages, public incidents.", tools: ["web_search", "fetch_doc"], maxContextTokens: 200_000, cost: "frontier" },
];
```

Typed blackboard every agent reads from and writes to:

```ts
type Blackboard = {
  intent: string;
  facts: Record<string, { value: unknown; source: string; confidence: number }>;
  openQuestions: string[];
  handoffs: { from: string; to: string; at: string; note: string }[];
};

async function specialistRun(id: Specialist["id"], bb: Blackboard): Promise<Blackboard> {
  const spec = specialists.find((s) => s.id === id)!;
  const out = await runAgent({
    tools: spec.tools,
    system: `${spec.description}\nWrite confirmed facts into the blackboard. ` +
            `If the blackboard lacks what you need, return {"status":"insufficient_context","missing":"..."}.`,
    input: selectFactsFor(bb, spec.id),   // redaction happens here
    maxTokens: 8_000,
  });
  return applyFacts(bb, out);
}
```

Cycle guard on handoffs:

```ts
function nextRoute(bb: Blackboard, wanted: string): string | null {
  const visited = new Set(bb.handoffs.map((h) => h.to));
  if (visited.has(wanted) && bb.facts[`${wanted}:done`]) {
    return null; // already consulted and produced findings; stop the loop
  }
  bb.handoffs.push({ from: bb.lastAgent ?? "root", to: wanted, at: new Date().toISOString(), note: "" });
  bb.lastAgent = wanted;
  return wanted;
}
```

Routing prompt, kept minimal and stable for cache reuse:

```text
Route the request to exactly one specialist, or answer it directly if it is general chat.

SPECIALISTS
- billing: invoices, refunds, plan changes, payment methods
- account: profile, authentication, API keys, team seats
- research: external docs, vendor status pages, public incidents

REQUEST: {{intent_summary}}

Reply as JSON: {"route":"billing|account|research|direct","rationale":"<10 words"}
```

## Checklist

- [ ] Each specialist owns a distinct toolset, policy, or context requirement
- [ ] Topology chosen explicitly: supervisor, blackboard, or peer-handoff
- [ ] Handoff contract specifies transmitted fields, redactions, and expected output; shared state is typed, not prose
- [ ] Router uses a small model with compact per-specialist descriptions
- [ ] Redaction applied per specialist; full history never forwarded wholesale
- [ ] Per-agent budgets and a global fan-out cap enforced in code
- [ ] Specialists can return `insufficient_context`; cycle detection blocks re-delegation with no new state
- [ ] Delegation graph logged with per-node tokens and outcomes

## Anti-patterns

**Persona splitting.** Creating "a cheerful agent" and "a rigorous agent" over the same tools adds latency with zero capability gain. Split on tool access and policy only.

**Full-history forwarding.** Passing the entire transcript to every specialist so it has "full context" multiplies tokens by fan-out and buries the relevant facts. Send a projected, field-filtered slice per specialist.

**Peer free-for-all.** Letting any agent message any other agent causes duplicated work, contradictory conclusions, and unbounded loops. Route through one orchestrator or a typed blackboard.

**Frontier-model router.** Using the most expensive model on full history just to pick a specialist wastes the majority of the budget on a classification. Use a small model with a stable, cacheable routing prompt.

**Unbounded fan-out.** A router allowed to dispatch to every specialist on every step turns one user question into twenty model calls. Cap fan-out, short-circuit on a confident first answer, and skip the router entirely for single-intent turns.
