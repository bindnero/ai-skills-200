---
name: flaky-test-triage
description: Detects, reproduces, and root-causes intermittent test failures with quarantine, per-test seeds, and shared failure triage. Use when a test fails intermittently in CI, when retry counts are masking regressions, or when the suite has gone red without code changes.
---

# Flaky Test Triage

**Use when:** a test passes locally and fails in CI, red builds appear with no code change, or `retries` have quietly grown and now hide regressions.
**Do not use when:** a test fails deterministically every run — that is a real failure; fix the code or the assertion.

## Instructions

1. Quantify first. Track failures per test over rolling runs, then rank by `flakiness = failures / runs`; triage only above a threshold such as 1%, and fix the worst offenders first.
2. Capture the evidence CI throws away: retain traces (`trace: 'retain-on-failure'`), the resolved seed, worker id, shard, and full console output on every run.
3. Reproduce locally with the recorded seed and, where possible, the recorded worker/shard assignment — order-dependent flake is invisible when you run a single file.
4. Name the four usual causes and look for the actual evidence: shared mutable state, real timing dependence, leaked ordering/network dependency, or an under-specified assertion.
5. Fix determinism before adding retries. Timeouts, fake clocks, and injected randomness remove the flake; `retries: 2` converts it into an expensive lie.
6. Quarantine only as a temporary, owned state: move the spec behind `@quarantine`, create a tracked ticket with a named owner and a two-week deadline, and fail the build if quarantine grows.
7. Ban blanket retry masking. `retries` may be non-zero in CI for diagnostics, but add an assertion-count report per test so a test that only passes on attempt three is visible.
8. Set a flake budget per suite (for example ≤ 0.5% of runs) and make CI fail when it is exceeded, so the fix loop has a finish line.
9. Reorder-inspect: run the suspect file with `--sequence.shuffle` and `--sequence.seed` to expose order dependence, and fix shared fixtures rather than the shuffle.
10. Review the quarantine list every sprint; each entry either gets fixed, deleted, or promoted to a tracked known-issue with an expiry date.

## Patterns

Shuffle-detection and replay loop for order-dependent flake:

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // diagnostic only — scripts/flake-gate.ts fails the build
  workers: process.env.CI ? 4 : undefined,
  use: { baseURL: process.env.BASE_URL, trace: 'retain-on-failure', video: 'retain-on-failure' },
  reporter: [['list'], ['json', { outputFile: 'results/e2e-report.json' }], ['github']],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

```bash
# Does this spec depend on order?
npx playwright test e2e/cart.spec.ts --repeat-each=5 --workers=4
npx playwright test --sequence.shuffle --sequence.seed=99 --repeat-each=3
npx playwright test e2e/cart.spec.ts --repeat-each=20
```

Flake gate that fails when a test only passes on retry:

```ts
// scripts/flake-gate.ts
import { readFileSync } from 'node:fs';

type Report = {
  suites: {
    title: string;
    specs: { title: string; tests: { results: { status: string }[] }[] }[];
  }[];
};

const report = JSON.parse(readFileSync('results/e2e-report.json', 'utf8')) as Report;
const suspicious: string[] = [];
let total = 0;

const walk = (suite: Report['suites'][number]) => {
  for (const spec of suite.specs) {
    for (const test of spec.tests) {
      total++;
      if (test.results.length > 1 && test.results.at(-1)?.status === 'passed') {
        suspicious.push(`${suite.title} > ${spec.title}`);
      }
    }
  }
  suite.suites.forEach(walk);
};

report.suites.forEach(walk);

const rate = suspicious.length / Math.max(total, 1);
console.log(`flake rate ${(rate * 100).toFixed(2)}% (${suspicious.length}/${total})`);
if (suspicious.length) {
  console.error('tests that only passed after retry:\n' + suspicious.join('\n'));
  process.exit(1);
}
```

Deterministic quarantine tag that keeps the spec running but visible:

```ts
// e2e/quarantine/legacy-checkout.spec.ts
import { test, expect } from '@playwright/test';

/**
 * @quarantine flake-ordering
 * Owner: @payments-team · Expires: 2026-04-01 · Ticket: PLAT-4821 (cart state leaks between specs)
 */
test('checkout applies an expired promo', async ({ page }) => {
  await page.goto('/cart');
  await expect(page.getByTestId('cart-empty')).toBeVisible();
});
```

```bash
# CI: quarantined specs never run in the gate, and the flake rate is enforced
npx playwright test --grep-invert @quarantine --retries=0
node scripts/flake-gate.ts
```

## Checklist

- [ ] Per-test failure rate tracked with a rolling window and a documented threshold
- [ ] Traces, videos, resolved seeds, and shard/worker ids retained for failures
- [ ] Each flaky test has a root cause recorded: state, timing, ordering, or assertion
- [ ] `retries` is diagnostic only; a flake gate fails the build when a test needs one
- [ ] Quarantined specs carry an owner, ticket, and expiry date
- [ ] Quarantine count cannot grow without a tracked ticket
- [ ] Order dependence proven with `--sequence.shuffle` before being ruled out
- [ ] Suite-wide flake budget enforced in CI with a review cadence

## Anti-patterns

**Retries as a fix.** Setting `retries: 3` makes the board green while shipping an intermittent bug to users, and multiplies runtime. Fix: retries for diagnostics only, with a gate that fails when a test passes on retry.

**Quarantine without expiry.** `test.fixme()` on twenty specs is a silent deletion of coverage. Fix: require an owner, a ticket, and an expiry; block growth of the list.

**Re-running the single file.** A test that leaks state into its neighbour passes in isolation every time. Fix: reproduce with the full shard, and prove order dependence with `--sequence.shuffle --sequence.seed`.

**Deleting the flaky assertion.** Removing the assertion that flakes makes the suite green and the risk unknown. Fix: keep the outcome asserted and make the precondition deterministic.