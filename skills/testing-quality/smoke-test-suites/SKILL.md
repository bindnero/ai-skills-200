---
name: smoke-test-suites
description: Builds and runs fast smoke suites that gate deploys and rollouts, using tagged Playwright specs, health probes, and a real environment. Use when a release needs a go/no-go check, or when wiring a smoke stage into a deployment pipeline.
---

# Smoke Test Suites

**Use when:** you need one fast, high-signal check between deploy stages or before enabling traffic for users, and the answer must be a hard go/no-go signal.
**Do not use when:** verifying deep business logic — use `api-testing` or `e2e-test-authoring`; or before the build has even deployed, when no environment exists to probe.

## Instructions

1. Define smoke as "the service is reachable and the primary journey completes" — five to twenty checks that finish inside five minutes, not a miniature regression suite.
2. Tag the subset rather than duplicating specs. Use `@smoke` on the journey tests that must pass and exclude everything else with `--grep-invert`.
3. Run smoke against the environment that will receive traffic, using the deploy's own `baseURL` and credentials — a smoke run against localhost proves nothing about the release.
4. Add infrastructure probes first: health/readiness endpoint, version or build SHA endpoint, database reachability, and queue depth, so an infra failure is distinguishable from an app failure.
5. Fail fast on the first fatal probe with a short timeout (10s for health, 60s for journeys) so a broken deploy is caught in a minute, not ten.
6. Wire smoke as a gate between deployment and traffic shift: `kubectl rollout status` → smoke → `promote`, with an automatic rollback on failure rather than a human staring at a dashboard.
7. Record the build SHA in smoke results so a failure can be traced to an exact artifact.
8. Retry only environment-transition issues (a just-started pod that has not bound its port), using a bounded poll loop rather than `retries` on assertions.
9. Page a human only for smoke failures after one re-run; page nothing for style-level failures such as a warning in the console.
10. Keep smoke specs resilient to data: unique email addresses per run, cleanup in `afterAll`, and no shared mutable fixtures.

## Patterns

Smoke spec that separates infrastructure failure from application failure:

```ts
// e2e/smoke/deploy-smoke.spec.ts
import { test, expect } from '@playwright/test';
import { smokeEmail } from '../utils/fixtures';

test.describe('@smoke release gate', () => {
  test('readiness_and_build_identity', async ({ request }) => {
    const health = await request.get('/health/ready', { timeout: 10_000 });
    expect(health.ok(), 'readiness probe failed — infra or startup problem').toBe(true);

    const build = await request.get('/version');
    expect(build.ok()).toBe(true);
    expect((await build.json()).sha).toBe(process.env.EXPECTED_SHA);
  });

  test('anonymous_homepage_renders_key_content', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('signup_to_first_rendered_dashboard', async ({ page }) => {
    const email = smokeEmail();

    await page.goto('/signup');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('Str0ng!passw0rd');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Your dashboard' })).toBeVisible({
      timeout: 60_000,
    });
  });
});
```

```ts
// e2e/utils/fixtures.ts
import { randomUUID } from 'node:crypto';

/** Unique per run so a failed smoke attempt never breaks the next one. */
export function smokeEmail() {
  return `smoke-${randomUUID().slice(0, 8)}@example.test`;
}
```

Deploy pipeline where smoke gates the traffic shift:

```yaml
# .github/workflows/deploy.yml
jobs:
  smoke:
    needs: deploy-staging
    runs-on: ubuntu-latest
    timeout-minutes: 8
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Wait for readiness
        run: |
          npx wait-on "https://${{ vars.STAGING_HOST }}/health/ready" --timeout 120000
      - name: Run smoke gate
        env:
          BASE_URL: https://${{ vars.STAGING_HOST }}
          EXPECTED_SHA: ${{ github.sha }}
          SMOKE_EMAIL_PASSWORD: ${{ secrets.SMOKE_PASSWORD }}
        run: npx playwright test --grep @smoke --retries=0 --reporter=line
      - if: failure()
        run: curl -sf -X POST "https://${{ vars.DEPLOY_HOOK }}/rollback" || true
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: smoke-report, path: playwright-report }
```

```bash
# One command for humans: everything tagged @smoke, no retries.
BASE_URL=https://staging.example.com EXPECTED_SHA=$(git rev-parse HEAD) \
  npx playwright test --grep @smoke --retries=0
```

## Checklist

- [ ] Smoke subset is selected by tag, not maintained as a duplicate suite
- [ ] Total runtime under five minutes with a hard job `timeout-minutes`
- [ ] Runs against the environment that receives traffic, with that environment's credentials
- [ ] Readiness, version/SHA, and dependency probes precede user-journey checks
- [ ] Smoke failure triggers automatic rollback, not a notification-only path
- [ ] Build SHA is asserted and echoed in failure output
- [ ] Retries disabled; environment transition handled by a bounded wait loop
- [ ] Fixtures are unique per run and cleaned up so repeated runs are idempotent

## Anti-patterns

**Smoke as a miniature regression suite.** Fifty assertions in a suite named "smoke" means a 25-minute gate that nobody waits for, so it gets skipped. Fix: cap smoke at the primary journey plus infra probes.

**Smoke against a staging URL that is not being deployed to.** The gate passes while the production deploy breaks. Fix: assert the build SHA matches the artifact just deployed, and point `BASE_URL` at that artifact's environment.

**No infrastructure probes.** Every failure is investigated as "the app is broken" when the real cause is an unbound port or a migration still running. Fix: readiness and version probes first, with distinct failure messages.

**Alerting on the first failure.** A single pod restart makes smoke page an engineer at 3am and erodes trust in the gate. Fix: one bounded re-run, then page — and reserve paging for user-visible journey failures.