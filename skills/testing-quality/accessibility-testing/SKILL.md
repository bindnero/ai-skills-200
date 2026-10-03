---
name: accessibility-testing
description: Automates WCAG checks with axe-core in Vitest and Playwright, then covers keyboard, focus order, and screen-reader semantics by hand. Use when adding interactive UI, fixing an a11y audit finding, or gating a release on WCAG 2.2 AA.
---

# Accessibility Testing

**Use when:** you are shipping interactive UI, need to prove WCAG 2.2 AA conformance in CI, or you have an audit finding to reproduce and verify as a regression test.
**Do not use when:** the concern is purely visual appearance — use `visual-regression-testing`; automated tooling cannot prove contrast in context, focus order, or meaningful alt text anyway.

## Instructions

1. Automate the mechanical rules and hand-test the rest. axe-core finds roughly a third of issues; keyboard operability, focus order, and alt-text quality need a person.
2. Pin the rule set per project: `withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])` so a new axe release cannot silently change your gate.
3. Scan in both Vitest component tests (`vitest-axe` in jsdom) and Playwright E2E (real browser, real CSS). Layout and contrast rules only work in the browser run, so the E2E scan is not optional.
4. Fail on violations and print the full violation list — `expect(results).toHaveNoViolations()` with `disable: false`; never silence axe to make a suite green.
5. Make the assertion message actionable by serialising `violations.map(v => v.id)` so CI logs name the rule.
6. Cover keyboard paths explicitly: assert `tab` reaches every interactive control, `Enter`/`Space` activates it, `Escape` closes overlays, and focus returns to the trigger on close.
7. Assert focus management in code (`document.activeElement`, `toHaveFocus()`) — a modal that steals focus or traps it in nothing is a violation no scanner reports.
8. Write name/role/value assertions with Testing Library queries: `getByRole('button', { name: 'Save order' })` failing to find an element is itself an accessibility failure.
9. Test the states scanners miss: loading skeletons with no accessible text, error summaries that are not announced, and disabled controls that are focusable-but-unactionable.
10. Gate merges on zero new serious/critical axe violations rather than zero violations, so teams fix real barriers first instead of skipping the check.

## Patterns

Component-level axe assertion with named, disable-free violations:

```ts
// test/vitest.setup.ts
import '@testing-library/jest-dom/vitest';
import { expect } from 'vitest';
import { toHaveNoViolations } from 'vitest-axe';

expect.extend(toHaveNoViolations);
```

```tsx
// src/components/CheckoutButton.test.tsx
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { CheckoutButton } from './CheckoutButton';

it('is_keyboard_operable_and_names_its_action', async () => {
  const user = userEvent.setup();
  const onPay = vi.fn();
  render(<CheckoutButton totalCents={4500} onPay={onPay} />);

  await user.tab();
  expect(screen.getByRole('button', { name: 'Pay $45.00' })).toHaveFocus();
  await user.keyboard('{Enter}');

  expect(onPay).toHaveBeenCalledOnce();
  const results = await axe(document.body);
  expect(
    results.violations.map((v) => v.id),
  ).toEqual([]);
  expect(results).toHaveNoViolations();
});
```

E2E scan on a real page plus the manual keyboard checks axe cannot do:

```ts
// e2e/a11y/checkout.a11y.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

test('@a11y checkout_page_has_no_violations', async ({ page }) => {
  await page.goto('/checkout');

  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test('@a11y modal_traps_and_restores_focus', async ({ page }) => {
  await page.goto('/orders/1');
  await page.getByRole('button', { name: 'Cancel order' }).click();

  const dialog = page.getByRole('dialog', { name: 'Cancel order' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirm cancellation' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cancel order' })).toBeFocused();
});

test('@a11y every_interactive_control_is_reachable_by_keyboard', async ({ page }) => {
  await page.goto('/checkout');

  const reachable: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      return el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? el.tagName;
    });
    if (label) reachable.push(label);
  }

  expect(reachable).toContain('Pay now');
});
```

## Checklist

- [ ] axe runs in both jsdom component tests and a real browser
- [ ] Tags are pinned to the WCAG level the project claims; new rules reviewed before adoption
- [ ] Failures print violation ids and node counts, not just a boolean
- [ ] No blanket `configureAxe({ rules: { ...disable } })` without a documented reason
- [ ] Tab order, Enter/Space activation, and Escape handling asserted per interactive component
- [ ] Focus is asserted on dialog open and returned to the trigger on close
- [ ] Interactive elements are queried by role and accessible name
- [ ] CI gates on serious and critical violations, with a ratcheting count of the rest

## Anti-patterns

**Treating axe as conformance.** A zero-violation report with unlabelled buttons and broken focus order is still an inaccessible product. Fix: pair the automated scan with keyboard and focus-order tests for every interactive flow.

**Disabling rules to clear the pipeline.** `rules: { 'color-contrast': { enabled: false } }` for a legacy page removes the signal without fixing anything. Fix: fix the contrast, or gate on serious/critical only and file a tracked issue for the rest.

**Testing accessibility in jsdom only.** jsdom has no layout or CSS, so contrast, overlap, target size, and reflow rules silently pass. Fix: keep the Playwright axe scan as the authoritative gate.

**Asserting only the initial state.** Modal focus traps, error announcement, and loading-text exposure only fail after interaction. Fix: drive the component with `user-event` and scan after transitions, not only on mount.