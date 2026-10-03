---
name: color-contrast
description: Computes and enforces WCAG 2.2 color contrast for text and non-text elements, including large-text and disabled-state rules, using relative luminance and OKLCH chroma reduction. Use when a palette fails contrast, a token change breaks readability, or auditing gray text on colored surfaces.
---

# Color Contrast

**Use when:** a foreground and background pair fails or is borderline, a token change risks breaking readability, or you need the exact arithmetic to justify a palette adjustment.
**Do not use when:** the palette itself needs restructuring across themes, which is `color-systems`.

## Instructions

1. Compute contrast from relative luminance using the WCAG formula, and state the ratio to two decimals with the criterion it is checked against. Ratios quoted without the criterion are meaningless.
2. Apply the correct threshold by element class: 4.5:1 for normal text, 3:1 for large text (at least 24px, or 18.66px bold), and 3:1 for non-text UI components and focus indicators under 1.4.11.
3. Never exempt disabled controls from the check silently. Disabled elements are exempt from 1.4.3, but they must still be perceivable — and if a disabled control's purpose is unclear, users must be able to find out why it is disabled.
4. Fix failures by changing the color, not by lightening opacity on text. Opacity reduction lowers contrast against whatever shows through, and that whatever may change.
5. When adjusting an OKLCH ramp, change lightness to fix contrast and reduce chroma to fix hue-shift glare — keeping chroma constant while changing lightness is what makes OKLCH ramps perceptually even.
6. Test every token pair you care about, in every theme, as a matrix. Spot-checking one combination is how dark mode ends up with unreadable muted text.
7. Add contrast assertions to the build so a token change fails CI. A contrast budget checked only by hand regresses within a sprint.
8. Check text over images, gradients, and video with a scrim or a solid backing. Contrast over a variable backdrop cannot be guaranteed by the text color alone.
9. Verify in forced-colors mode. System color overrides discard your palette entirely, so the layout must survive with `Highlight`, `CanvasText`, and `ButtonBorder` alone.
10. Record the measured ratios in the token file as comments so the next person does not re-derive them.

## Patterns

Relative luminance and ratio computation:

```js
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
```

Decision table for a pair:

```markdown
text on bg          4.50 : 1   1.4.3 Contrast (Minimum)  AA
>=24px or 18.66px bold  3.00 : 1   1.4.3
borders, icons, focus ring  3.00 : 1   1.4.11 Non-text Contrast  AA
graphical objects required to understand content  3.00 : 1   1.4.11
hover / pressed fill vs resting fill  3.00 : 1   1.4.11 (state must be visible)
disabled text        exempt from 1.4.3  -> still show a 3px underline hint
                    plus "why disabled" text nearby
logos, purely decorative  exempt  -> never exempt an informative icon
```

Token pair matrix that gets asserted, not eyeballed:

```markdown
PAIR                                   LIGHT   DARK    CRITERION
text-default / bg-canvas               15.80   14.20   1.4.3  PASS
text-muted   / bg-canvas                5.10    4.85   1.4.3  PASS
text-default / bg-surface-sunken        14.30   13.10   1.4.3  PASS
link         / bg-canvas                 5.02    6.40   1.4.3  PASS
focus-ring   / bg-canvas                 4.90    5.60   1.4.11 PASS
focus-ring   / bg-surface                4.65    5.10   1.4.11 PASS
border-subtle/ bg-canvas                 2.90    2.60   1.4.11 FAIL  -> raise to 3.1
```

CI assertion over the token set:

```js
import { contrast } from './contrast.js';
const THEMES = {
  light: { bg: '#ffffff', text: '#111827', muted: '#4b5563', ring: '#1d4ed8' },
  dark:  { bg: '#0b1220', text: '#f3f4f6', muted: '#a3aec2', ring: '#93c5fd' },
};
for (const [name, t] of Object.entries(THEMES)) {
  const pairs = [
    ['text', t.text, 4.5], ['muted', t.muted, 4.5], ['ring', t.ring, 3],
  ];
  for (const [label, fg, min] of pairs) {
    const ratio = contrast(fg, t.bg);
    if (ratio < min) throw new Error(`${name}/${label} ${ratio.toFixed(2)} < ${min}`);
  }
}
```

OKLCH fix for a failing pair:

```css
/* 4.2:1 -> fail. Move lightness down 0.06 in OKLCH; reduce chroma 0.19 -> 0.15
   so the hue does not glare at the new lightness. */
--blue-600: oklch(0.55 0.19 256);   /* 4.20:1 on white  FAIL */
--blue-700: oklch(0.49 0.15 256);   /* 6.05:1 on white  PASS, neutral navy cast */

/* Text over imagery needs a backing, not a lighter text color. */
.hero__title {
  background: linear-gradient(to bottom, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.75));
  display: inline;
  box-decoration-break: clone;
  padding-inline: 0.25rem;
}
```

## Checklist

- [ ] Ratios computed with the WCAG relative-luminance formula, quoted to two decimals
- [ ] Correct threshold applied per class: 4.5:1, 3:1 large text, 3:1 non-text
- [ ] Disabled controls handled explicitly rather than silently exempted
- [ ] Fixes adjust lightness and chroma in OKLCH, not opacity
- [ ] Every relevant token pair measured in every theme
- [ ] Contrast assertions run in CI and fail the build
- [ ] Text over imagery has a scrim or solid backing
- [ ] Forced-colors mode verified with `Highlight` and `CanvasText`

## Anti-patterns

**Opacity as a contrast fix.** `opacity: 0.6` on gray text. The ratio now depends on whatever is behind it, which changes per component and per theme. Fix: define a lighter or darker solid token that measures 4.5:1 against each known background.

**Checking one theme.** Light mode passes and dark mode ships with 3.2:1 muted text. Fix: run the pair matrix for every theme in CI and fail on any threshold miss.

**Eyeballing it.** A gray that "looks dark enough" on a specific monitor. Display calibration, sunlight, and aging vision all differ. Fix: compute the ratio; there is no reliable visual shortcut.

**Relying on a red/green pair for text.** Roughly 1 in 12 men has a red-green deficiency. Fix: use hue-independent signals — labels, weight, icons — and ensure both states clear 4.5:1 against the background.

**Fixing contrast on disabled text.** Lightening disabled labels until the ratio is met destroys the disabled affordance; the control now looks enabled. Fix: leave the exemption in place, keep the disabled styling, and add adjacent explanatory text stating what is required to enable it.
