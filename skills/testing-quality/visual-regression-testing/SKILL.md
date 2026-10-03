---
name: visual-regression-testing
description: Catches pixel regressions with Playwright toHaveScreenshot, per-component snapshots, pinned fonts, and a reviewed-baseline workflow. Use when styling changes can break layout invisibly, when adding a new UI component gallery, or when a bug report says the UI looks wrong.
---

# Visual Regression Testing

**Use when:** the defect class is visual — broken layout, missing icon, wrong colour, clipped text — and a DOM assertion cannot detect it.
**Do not use when:** the risk is behaviour, data, or accessibility semantics — use `component-test-harness` or `accessibility-testing`; textual output snapshots belong to `snapshot-testing`.

## Instructions

1. Fix rendering nondeterminism before capturing anything: pin the font stack to a bundled font, disable animations and transitions, freeze the clock, hide scrollbars, and set `scale: 'css'` so device pixel ratio cannot skew the diff.
2. Capture elements, not whole pages, wherever possible. `locator.screenshot()` on the component container makes the failure diff local instead of a full-page image where 99% is unchanged.
3. Set `maxDiffPixelRatio` deliberately: 0 for exact-match iconography and form controls, ~0.002 for text-heavy panels. A blanket tolerance of 5% hides real colour bugs.
4. Mask deliberately unstable regions with `mask: [page.getByTestId('relative-time')]` rather than letting flaky dates burn a day of engineering time.
5. Use `animations: 'disabled'` in `toHaveScreenshot` so mid-transition captures become deterministic instead of producing a permanent baseline mismatch.
6. Assert viewport and colour scheme explicitly in `test.use`, since baselines are viewport-specific and browsers cache fonts differently at different sizes.
7. Review every baseline in the pull request like code. Reading a 400KB PNG diff blindly is how teams end up with hundreds of accepted-but-wrong changes.
8. Regenerate baselines with a documented command (`npm run test:visual:update`) and never as a side effect of a normal test run.
9. Keep the component gallery as its own small spec file that iterates a manifest of components, so adding a component is a one-line manifest change rather than a new bespoke spec.
10. Gate merges on zero new baselines being added in the same PR as the change that produced them — otherwise tests can be "fixed" by re-baselining a broken design.

## Patterns

Playwright visual config that removes every known source of pixel noise:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser/providers';

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: 'chromium' }],
    },
    expect: {
      toHaveScreenshot: {
        maxDiffPixelRatio: 0.002,
        animations: 'disabled',
        scale: 'css',
      },
    },
  },
});
```

Component-level capture with an explicit viewport and masked dynamic text:

```ts
// e2e/visual/components.visual.spec.ts
import { test, expect } from '@playwright/test';
import { components } from './component-manifest';

test.use({ viewport: { width: 800, height: 600 }, colorScheme: 'light' });

for (const component of components) {
  test(`${component.name}_renders_expected_pixels`, async ({ page }) => {
    await page.goto(`/gallery/${component.name}`);
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByTestId(`component-${component.name}`)).toHaveScreenshot(
      `${component.name}.png`,
      {
        animations: 'disabled',
        scale: 'css',
        maxDiffPixelRatio: component.exact ? 0 : 0.002,
        mask: component.dynamic ? [page.getByTestId(component.dynamic)] : [],
      },
    );
  });
}

test.describe('dark theme', () => {
  test.use({ colorScheme: 'dark' });

  test('sidebar_reads_correctly_on_dark', async ({ page }) => {
    await page.goto('/gallery/sidebar');
    await expect(page.getByTestId('component-sidebar')).toHaveScreenshot('sidebar-dark.png');
  });
});
```

Diff triage on the machine, deterministic fonts in the pipeline:

```yaml
# .github/workflows/visual.yml
jobs:
  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --grep-invert @update-baselines e2e/visual
      - if: failure()
        run: npx playwright test --update-snapshots e2e/visual  # local repro only
      - uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

## Checklist

- [ ] Fonts are bundled and pinned; `document.fonts.ready` is awaited before capture
- [ ] Animations, transitions, and the clock are disabled during capture
- [ ] `scale: 'css'` and an explicit viewport are set so baselines are reproducible
- [ ] `maxDiffPixelRatio` is 0 for exact-match elements and tight for text panels
- [ ] Dynamic regions (times, avatars, random IDs) are masked, not tolerated
- [ ] Baselines are reviewed in the PR and regenerated only via a dedicated command
- [ ] Component gallery is driven by a manifest, not bespoke specs per component
- [ ] Light and dark schemes are captured if both ship

## Anti-patterns

**Blanket 5% tolerance.** A global `maxDiffPixelRatio: 0.05` means a button changing from blue to orange still passes on a 200x40 control. Fix: scope the tolerance per element type and use 0 for icons and form controls.

**Baselining the bug in the same PR.** Regenerating snapshots alongside the CSS change defeats the entire gate — the test then certifies whatever is currently on screen. Fix: capture baselines on `main`, and review the diff image before approving.

**Unmasked timestamps and random content.** A relative-time element guarantees daily failures, so the team learns to ignore red builds. Fix: mask the element, or freeze time with `vi.setSystemTime` before capture.

**Full-page screenshots for a card.** A 1440x5000 baseline diff is unreviewable and diffs the entire page for a one-component change. Fix: capture the component container with `locator().toHaveScreenshot()`.
