---
name: test-strategy-planning
description: Plans test investment with a risk matrix, pyramid placement rules, layer budgets, and a change-type-to-test-set mapping. Use at the start of a feature or a quarter, when coverage feels arbitrary, or when deciding which layers a change needs.
---

# Test Strategy Planning

**Use when:** you must decide which test layers a change deserves before writing code, when a service has no agreed testing standard, or when review time is being spent arguing about test volume.
**Do not use when:** a specific test is needed right now for a specific bug — use the layer skill directly; planning produces the plan, not the tests.

## Instructions

1. Build a change inventory first: list the changes in the release, and for each write the failure that would hurt most and how quickly it would be detected in production.
2. Score risk per change on four axes — impact, likelihood, detectability, and reversibility — and put high-risk/high-impact items at the top of the plan regardless of engineering convenience.
3. Map each change to the minimum layer set with an explicit rule: pure logic → unit; SQL/transactions → integration; cross-service schema → contract; user journey → E2E; visual regression → only when pixels are the contract; latency SLO → load test.
4. Hold the pyramid shape as a budget, not a dogma. Set explicit maximum runtimes per layer (unit ≤ 10s, integration ≤ 3min, E2E shard ≤ 15min) and reject any proposal that breaks a budget.
5. Plan for the failure modes, not the features. Derive test cases from the falsification table: what evidence would prove this feature broken?
6. Put a floor on quality for everything shipped: no change merges with zero tests on new business logic, regardless of layer.
7. Budget for the invisible work: fixture maintenance, container warm-up, flake triage, and snapshot review should be planned and owned, not absorbed silently.
8. Define the definition of done for testing — layer added, coverage delta, mutation score for critical modules, a11y scan, and a manual verification note where automation cannot reach.
9. Reserve maintenance capacity every sprint. Without it, the plan degrades into "add more E2E" and the suite slows to a halt.
10. Re-plan on evidence each quarter: pull defect escape data and flaky-test counts, and cut the layers that never catch anything.

## Patterns

Risk matrix that turns a release scope into a test plan:

```ts
// scripts/plan-tests.ts
type Risk = 1 | 2 | 3 | 4 | 5;
const BUDGET_MINUTES: Record<string, number> = { unit: 0.2, property: 0.2, integration: 3, contract: 1, e2e: 15, visual: 5 };

type Change = { id: string; title: string; impact: Risk; likelihood: Risk; detectability: Risk; reversibility: Risk; layers: string[] };

const CHANGES: Change[] = [
  { id: 'CHG-1', title: 'Discount stacking', impact: 5, likelihood: 4, detectability: 5, reversibility: 2,
    layers: ['unit', 'property', 'integration'] },
  { id: 'CHG-2', title: 'Confirmation email template', impact: 2, likelihood: 3, detectability: 4, reversibility: 5,
    layers: ['unit', 'visual'] },
];

const score = (c: Change) => c.impact * 2 + c.likelihood + c.detectability + (6 - c.reversibility) * 0.5;

for (const change of [...CHANGES].sort((a, b) => score(b) - score(a))) {
  const budget = change.layers.reduce((sum, l) => sum + BUDGET_MINUTES[l], 0);
  console.log(`${score(change).toFixed(1).padStart(5)}  ${change.id}  ${change.title}  ` +
    `layers=${change.layers.join('+')}  budget=${budget.toFixed(1)}min`);
}
```

The planning document that gets filled in, not admired:

```markdown
# Test plan — pricing v2 (CHG-1)

## Risk
Impact 5 · Likelihood 4 · Detectability 5 · Reversibility 2 — wrong totals reach customers
directly from the checkout page. Score 13.5, top of this release.

## Layers and why
| Layer | Why this layer | Budget |
| --- | --- | --- |
| Unit | Discount precedence and rounding are pure functions with many edge cases | 0.2 min |
| Property | Order of application should not change the total; round trip through money encoding | 0.2 min |
| Integration | Discount read from the `promotions` table inside a transaction with snapshot isolation | 3 min |

Explicitly rejected: E2E (checkout already covered by CHG-9's journey; this adds no new user-visible
state), load (total latency unaffected, verified by reading the hot path).

## Falsification table
| Claim | Evidence that would disprove it | Test |
| --- | --- | --- |
| Stacked discounts compose multiplicatively | Order of application changes the total | property test |
| Discounts round half-up at the line level | Sum of lines differs from the order total | unit test |
| Expired promotions never apply | A promotion with `ends_at < now` reduces the total | integration test |

## Done when
- Unit coverage on `src/pricing/**` at ≥ 90% branches, mutation score ≥ 80% on the module
- Falsification table rows all green in CI
- Property seed recorded in the PR for replay
- No change to `CHG-9`'s E2E expectations
```

Cadence that keeps the plan funded:

```bash
# Plan maintenance in CI: enforce the layer budget.
npx vitest run --reporter=json --outputFile=unit.json
node -e '
  const r = require("./unit.json");
  const slow = r.testResults.flatMap(f => f.assertionResults).filter(t => (t.duration ?? 0) > 200);
  if (slow.length) { console.error(`${slow.length} unit tests over 200ms`); process.exit(1); }
'
# Monthly: regenerate the catalog, then review escaped defects against it.
```

## Checklist

- [ ] Every change in scope has an impact/likelihood/detectability/reversibility score
- [ ] High-risk changes are planned first, regardless of engineering convenience
- [ ] Each change has a minimum layer set with the reason stated and rejections recorded
- [ ] Per-layer runtime budgets exist and any proposal exceeding them is rejected
- [ ] Falsification table written before tests: evidence that would disprove each claim
- [ ] Done criteria include coverage delta, mutation score for critical modules, and a11y scan
- [ ] Fixture, flake triage, and snapshot review are budgeted and owned
- [ ] Plan is re-reviewed quarterly using escaped-defect and flake data

## Anti-patterns

**"Write more E2E" as a strategy.** E2E is the most expensive layer and the worst at localising failures, so adding it does not reduce risk proportionally. Fix: risk-score changes and place each in the cheapest layer that can catch the failure.

**Coverage percentage as the plan.** Teams optimise the number instead of the risk and end up with exhaustive unit tests on trivial getters. Fix: plan from falsification tables and impact, then let coverage confirm.

**No budget.** Every new feature adds 40 minutes to the suite until CI is skipped under deadline. Fix: hard per-layer runtime budgets that reject additions.

**Planning once at kickoff.** The system, the team, and the defect data all change, and the plan becomes fiction. Fix: re-plan quarterly against escaped defects and flake counts, and delete layers that never catch anything.