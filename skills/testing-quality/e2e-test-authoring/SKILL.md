---
name: e2e-test-authoring
description: Authors Playwright end-to-end specs with role-based selectors, test.step, isolated storageState, and CI-safe sharding. Use when adding a user-journey test, rewriting brittle CSS or nth-child selectors, or driving the Playwright suite in a pipeline.
---

# E2E Test Authoring

**Use when:** you need to prove a full user journey works through the real UI — signup, checkout, permission-gated navigation, multi-page flows — in a browser.
**Do not use when:** the risk is in one component's rendering or the HTTP contract of a single endpoint — use `component-test-harness` or `api-testing` so you keep feedback under a minute.

## Instructions

1. Map the journey to a critical path worth its runtime cost, then cut it into `test.step` blocks named for user intent. Steps double as trace labels and as the place to attach `page.screenshot` on failure.
2. Select elements by role and accessible name first (`getByRole('button', { name: 'Place order' })`), then `getByLabel`, then `getByTestId`. Never use CSS classes, DOM structure, or `nth-child` — those break on every restyle.
3. Replace all `waitForTimeout` with a web-first assertion (`expect(locator).toBeVisible()`, `toHaveText`) or an explicit `page.waitForResponse`. Fixed sleeps are the single largest source of CI flake.
4. Seed state through the API, not the UI. Create the user and the cart with `request.post` in a `test.beforeEach`, then drive only the flow under test.
5. Give each spec file its own authenticated session via `storageState` and `test.use`, so parallel workers never share cookies. Never sign in through the login form in more than the one test that covers login.
6. Make the spec independent of execution order. Assert the postcondition you created, and never rely on a spec that ran before it.
7. Put all non-essential resources out of the test's way: block analytics/fonts/beacons with `page.route`, and freeze animations with `animations: 'disabled'` for screenshots.
8. Capture diagnostics for CI only: `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`. These settings cost nothing locally and are decisive when a shard fails at 3am.
9. Tag and shard. Assign `@smoke` to the five-minute gating subset and `@regression` to the rest, then run `npx playwright test --shard=${{ matrix.shard }}/4 --grep @regression`.
10. Treat a first-attempt green run as unproven: run the new spec three times locally with `--repeat-each=3` before pushing.

## Patterns

Playwright config with sharding-friendly projects, isolation, and CI retries:

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['blob']]
    : [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
    },
    {
      name: 'smoke',
      grep: /@smoke/,
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
    },
  ],
});
```

A journey spec that seeds via API, blocks third parties, and never sleeps:

```ts
// e2e/checkout.spec.ts
import { test, expect } from '@playwright/test';

test.describe('checkout', () => {
  test.beforeEach(async ({ request, page }) => {
    await page.route(/(google-analytics|sentry|doubleclick)/, (route) => route.abort());
    await request.post('/api/test/reset', { data: { email: 'buyer@example.com' } });
  });

  test('@smoke card_paid_order_reaches_confirmation', async ({ page, request }) => {
    const { body: order } = await request.post('/api/test/orders', {
      data: { email: 'buyer@example.com', totalCents: 4500 },
    });

    await test.step('open confirmation page', async () => {
      await page.goto(`/orders/${order.id}`);
    });

    await test.step('see paid status', async () => {
      await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible();
      await expect(page.getByTestId('order-total')).toHaveText('$45.00');
    });

    await test.step('line item matches the seeded order', async () => {
      await expect(page.getByRole('link', { name: 'View receipt' })).toBeVisible();
    });
  });

  test('@regression blocks_checkout_when_card_is_declined', async ({ page, request }) => {
    await request.post('/api/test/orders', {
      data: { email: 'buyer@example.com', totalCents: 4500, cardOutcome: 'declined' },
    });

    await page.goto('/checkout');
    await page.getByRole('button', { name: 'Place order' }).click();

    await expect(page.getByRole('alert')).toHaveText(/declined/i);
  });
});
```

## Checklist

- [ ] Every selector is `getByRole`/`getByLabel`/`getByTestId`; zero CSS or positional selectors
- [ ] No `waitForTimeout` anywhere in the suite; waits are assertions or `waitForResponse`
- [ ] State is seeded via the API, and the login flow appears in exactly one spec
- [ ] Authenticated state is per-file via `storageState` so parallel workers cannot interfere
- [ ] Specs pass when run in isolation and in reverse order
- [ ] Each new spec survives `--repeat-each=3` locally
- [ ] CI uploads traces, screenshots, and videos on failure
- [ ] A `@smoke` subset exists and completes in under five minutes

## Anti-patterns

**Positional selectors.** `page.locator('div.card > div:nth-child(2)')` couples the test to markup nobody remembers. Fix: add a `data-testid` or, better, fix the missing accessible name and select by role.

**Fixed sleeps.** `await page.waitForTimeout(3000)` is simultaneously too slow when the page is fast and too short when CI is loaded. Fix: assert on the element or await the specific response.

**Reusing one authenticated session across specs.** Tests log each other out mid-run, producing failures that depend on the shard layout. Fix: per-project `storageState` files generated by a setup project.

**One 40-step mega journey.** When it fails, nobody knows which step broke and nothing can be retried independently. Fix: split into several specs that each reach a meaningful state via API seeding, and keep one long journey only as a nightly `@regression` test.
