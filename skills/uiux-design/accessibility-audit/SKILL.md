---
name: accessibility-audit
description: Audits interfaces against WCAG 2.2 Level AA using automated tooling plus manual checks of focus order, reflow, target size, and status messages, then produces prioritized remediation tickets. Use before shipping a feature that must meet accessibility requirements, or when fixing a reported accessibility defect.
---

# Accessibility Audit

**Use when:** a feature must meet WCAG 2.2 AA before release, or a defect report describes an accessibility barrier that needs root cause and remediation.
**Do not use when:** the specific problem is a screen reader announcing things incorrectly, which is `screen-reader-compatibility`, or the issue is contrast math, which is `color-contrast`.

## Instructions

1. State the conformance target explicitly — WCAG 2.2 Level AA — and the scope: which pages, which flows, which viewports, and which AT combinations. An audit without a named scope cannot be signed off.
2. Run automated tooling first to triage (axe-core, Lighthouse, Accessibility Insights), then treat the result as roughly a third of the problem. Automation cannot judge focus order, meaningfulness of names, or whether an error is recoverable.
3. Manually verify the items automation misses: logical focus order, meaningful accessible names, reading order, error recovery, and whether the visual focus indicator is visible against every adjacent color.
4. Verify the 2.4.11 focus-not-obscured and 2.4.13 focus-appearance criteria, which are new in 2.2 and are the most common 2.2 failures in shipped products.
5. Check 2.5.8 target size (minimum) at 24x24 CSS px, accounting for spacing — targets under the minimum pass only when an equivalent control or adequate spacing exists.
6. Verify reflow at 320 CSS px width (400% zoom at 1280 px) with no two-dimensional scrolling except in genuine content like a data grid.
7. Confirm status messages are announced without moving focus: progress, toasts, validation results, and search-result counts all need live regions, not just visual styling.
8. Test with the keyboard alone, then with a screen reader, then at 200% zoom and with `prefers-reduced-motion` and `forced-colors` enabled.
9. Record each failure as: criterion number, level, exact reproduction, affected element selector, user impact, and the specific fix. "Improve accessibility" is not a ticket.
10. Fix by changing the markup before reaching for ARIA. Native elements carry semantics, keyboard behavior, and focus handling that ARIA alone does not reproduce.

## Patterns

Audit scope and method:

```markdown
SCOPE      Checkout flow: /cart, /shipping, /payment, /confirmation
TARGET     WCAG 2.2 AA
VIEWPORTS  1280x900, 375x667 (iOS VoiceOver), 320x568 (200% zoom @1280)
AT         NVDA 2025 + Firefox; VoiceOver + Safari; keyboard only
TOOLS      axe-core in CI, Lighthouse, Accessibility Insights
MANUAL      focus order, names, reading order, recovery, focus visibility, target size
OWNER      @a11y-guild triage, team owning the surface fixes
```

WCAG 2.2 criteria most often missed, with the test that catches each:

```markdown
1.4.3 Contrast (Minimum)  AA   measure token pairs, not screenshots
1.4.10 Reflow              AA   320px wide, no horizontal scroll of the page
1.4.11 Non-text Contrast   AA   focus ring and control borders >= 3:1 (1.4.11)
1.4.12 Text Spacing       AA   apply the bookmarklet overrides, no clipping
1.4.13 Content on Hover    AA   dismissible, hoverable, persistent
2.1.1 Keyboard            A    every action reachable and operable
2.4.7 Focus Visible       AA   ring visible against every adjacent color
2.4.11 Focus Not Obscured AA   sticky header must not cover the focused item  [2.2 NEW]
2.4.13 Focus Appearance   AA   >= 2px thick, >= 3:1 contrast, 2px offset    [2.2 NEW]
2.5.8 Target Size (Min)   AA   >= 24x24 CSS px or sufficient spacing       [2.2 NEW]
3.3.7 Redundant Entry    A    no re-entry of the same information         [2.2 NEW]
3.3.8 Accessible Auth    AA   no cognitive-function test for login         [2.2 NEW]
```

Focus indicator meeting 2.4.13:

```css
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--focus-ring);   /* >= 2px thick */
  outline-offset: 2px;                   /* >= 2px from the component edge */
  border-radius: 2px;
}
/* Sticky headers must not obscure the focused element (2.4.11). */
.page-header { position: sticky; top: 0; scroll-margin-block-start: 5rem; }
.sticky-header :is(a, button, input):focus-visible { outline-offset: -3px; }
@media (forced-colors: active) {
  :focus-visible { outline-color: Highlight; }
}
```

Remediation ticket format:

```markdown
CRITERION   2.4.13 Focus Appearance (AA)  [WCAG 2.2]
ELEMENT     .checkout .pay-button  (src/checkout/PayButton.tsx:48)
REPRO       Tab to "Pay now" 5 times; the ring is 1px and matches the button fill
IMPACT      Keyboard and low-vision users cannot locate the focus position
ROOT CAUSE   outline: 1px solid currentColor;  currentColor resolves to the fill
FIX         outline: 2px solid var(--focus-ring); outline-offset: 2px;
            add a forced-colors branch mapping to Highlight
VERIFIED    NVDA + Firefox, keyboard-only pass, forced-colors on
```

CI gate:

```yaml
- name: a11y automated gate
  run: |
    npx @axe-core/cli http://localhost:3000/checkout \
      --exit  # fails the build on any critical or serious violation
```

## Checklist

- [ ] Conformance target, scope, viewports, and AT combinations written down
- [ ] Automated scan run for triage, then a manual pass over focus order, names, reading order, and recovery
- [ ] 2.4.11 and 2.4.13 focus criteria explicitly verified
- [ ] 2.5.8 target size measured, with spacing accounted for
- [ ] Keyboard-only, screen reader, 200% zoom (400% reflow), reduced-motion, and forced-colors exercised
- [ ] Status messages announced without moving focus
- [ ] Each finding has criterion, selector, impact, root cause, and specific fix
- [ ] Automated check added to CI and audit scope recorded with owners and dates

## Anti-patterns

**Automated-only audit.** A green Lighthouse score shipped as an accessibility claim. Automation catches roughly a third of issues and completely misses focus order, names, and recovery. Fix: budget explicit time for the manual pass and record who performed it.

**ARIA-first fixing.** Adding `role="button"` and `tabindex="0"` to a `div` and calling it done. Now it has no keyboard activation, no focus styling, and no state semantics. Fix: use the native element first; ARIA only for what native markup cannot express.

**Red text as the only error signal.** Fails 1.4.1 for color perception, and fails blind users outright. Fix: pair color with text, an icon, and programmatic association via `aria-describedby`.

**Disabling zoom or pinch.** `user-scalable=no` or `maximum-scale=1` on the viewport meta. This is a WCAG 1.4.4 failure and breaks magnification for everyone. Fix: allow scaling; fix the layout instead.

**Shipping with an unticked checklist.** "Accessibility: TBD" in the launch doc. Fix: make the audit report a gate artifact with named owners and dates, the same way you gate any other release criterion.
