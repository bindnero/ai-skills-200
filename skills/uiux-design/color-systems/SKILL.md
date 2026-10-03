---
name: color-systems
description: Builds color systems from perceptually uniform OKLCH ramps, semantic token layers, and verified light, dark, and high-contrast themes. Use when creating or refactoring a palette, adding dark mode, or when hardcoded colors need to become tokens.
---

# Color Systems

**Use when:** you are creating a palette, adding or repairing dark mode, or converting scattered hardcoded colors into a maintainable token system.
**Do not use when:** a specific pair is failing the contrast requirement — use `color-contrast` for the computation and remediation.

## Instructions

1. Author every ramp in OKLCH. Equal lightness steps in OKLCH produce equal perceived lightness steps, which sRGB and HSL cannot do. Reserve hex for legacy fallbacks only.
2. Fix the ramp geometry before picking hues: for a 100-900 scale, use lightness steps that are denser at the light end, and keep chroma roughly constant except at the extremes where gamut limits bite.
3. Define semantic tokens once and let themes remap them. Components reference `text-default`, never `gray-900`. A theme swap must touch only the token layer.
4. Build the theme contract explicitly: what color is the page background, what is the surface, what sits on it, what is a border, what is text, what is a link, what is disabled, and what does focus look like. Write this down before picking any hex value.
5. Verify dark mode as its own palette, not as an inversion. In dark mode, reduce chroma on large fills, lighten pure whites to off-white for text, and raise border contrast because dark surfaces need it.
6. Never encode meaning in hue alone. Pair every status color with an icon, a label, or a shape. Roughly 1 in 12 men has a red-green deficiency; hue-only status fails for them and in grayscale.
7. Keep one accent for action and one for attention. Two competing primaries make the primary action ambiguous on every screen.
8. Use alpha compositing only for states over known backgrounds (hover, scrims), and always test the composited result — 50% black over a light surface lands very differently from over a dark one.
9. Test all token pairs for contrast whenever you change the palette; add an automated contrast assertion to the token build so a failing pair fails CI.
10. Publish the ramp values as tokens with descriptive names and no raw-hex fallbacks scattered through product code.

## Patterns

OKLCH ramp with hue and chroma anchors:

```css
:root {
  /* blue: hue 256, chroma peaks mid-ramp, falls at the light and dark ends */
  --blue-100: oklch(0.93 0.045 256);
  --blue-300: oklch(0.82 0.105 256);
  --blue-500: oklch(0.65 0.175 256);
  --blue-600: oklch(0.55 0.190 256);  /* action fill */
  --blue-800: oklch(0.38 0.135 256);
  --blue-950: oklch(0.24 0.075 256);
  /* neutral ramp: chroma 0.008 keeps it from reading as blue-gray */
  --neutral-0:   oklch(1 0 0);
  --neutral-100: oklch(0.97 0.004 256);
  --neutral-300: oklch(0.87 0.006 256);
  --neutral-600: oklch(0.55 0.010 256);
  --neutral-900: oklch(0.24 0.010 256);
  /* status: distinct hue AND distinct chroma; never rely on hue alone */
  --green-600:  oklch(0.62 0.150 152);
  --amber-500:  oklch(0.78 0.150 75);
  --red-600:    oklch(0.58 0.190 25);
}
```

Theme contract and semantic layer:

```json
{
  "semantic": {
    "bg-canvas":        { "light": "{neutral.0}",     "dark": "{neutral.950}" },
    "bg-surface":       { "light": "{neutral.0}",     "dark": "{neutral.900}" },
    "bg-surface-sunken":{" "light": "{neutral.100}",   "dark": "{neutral.950}" },
    "border-subtle":    { "light": "{neutral.300}",   "dark": "{neutral.700}" },
    "text-default":     { "light": "{neutral.900}",   "dark": "{neutral.50}" },
    "text-muted":       { "light": "{neutral.600}",   "dark": "{neutral.400}" },
    "action-primary":   { "light": "{blue-600}",      "dark": "{blue-400}" },
    "text-on-action":   { "light": "{neutral.0}",     "dark": "{neutral.950}" },
    "focus-ring":       { "light": "{blue-700}",      "dark": "{blue-300}" }
  }
}
```

Dark mode as its own palette, applied via tokens only:

```css
:root            { color-scheme: light; --bg-canvas: var(--neutral-0); --text-default: var(--neutral-900); }
:root[data-theme="dark"] { color-scheme: dark; --bg-canvas: var(--neutral-950); --text-default: var(--neutral-50); }

body { background: var(--bg-canvas); color: var(--text-default); }

.card { background: var(--bg-surface); border: 1px solid var(--border-subtle); }
```

Status that survives color-blindness and grayscale:

```html
<span class="status status--danger">
  <svg aria-hidden="true" viewBox="0 0 16 16"><!-- triangle + exclamation --></svg>
  Payment failed
</span>
<style>
  .status--danger { color: var(--red-600); }
  .status--danger svg { fill: currentColor; }
  @media (forced-colors: active) { .status--danger { color: CanvasText; forced-color-adjust: none; } }
</style>
```

## Checklist

- [ ] All ramps authored in OKLCH with lightness and chroma ramps defined
- [ ] Theme contract (canvas, surface, sunken, border, text, link, focus, disabled) written first
- [ ] Components reference only semantic tokens, never primitives
- [ ] Dark mode authored as its own palette, not an inversion
- [ ] `color-scheme` set so form controls and scrollbars follow the theme
- [ ] Status colors paired with icon or label, never hue alone
- [ ] Alpha composited states tested on their actual backgrounds
- [ ] Contrast assertions run in CI on every token change, including the focus ring

## Anti-patterns

**HSL ramps.** Equal steps in HSL produce wildly unequal perceived lightness, so a "100 to 900" scale visually collapses at the ends and buttons look mismatched across products. Fix: author in OKLCH, where lightness is perceptually uniform.

**Inverted dark mode.** `filter: invert(1)` or hue-flipping to build dark theme. Pure white on pure black causes halation for astigmatic users and neon borders on images. Fix: author a separate dark palette and remap semantic tokens.

**Semantic bypass.** A product component referencing `--gray-700` "just this once". The theme swap then misses it and dark mode breaks at that element only. Fix: lint for primitive references in component CSS.

**Hue as the only signal.** A red dot for errors, green for success, nothing else. Fails for deuteranopia and in forced-colors mode. Fix: pair every status color with an icon or text label and verify under a grayscale filter.

**Scrim without a compositing check.** `rgba(0,0,0,.5)` over dark mode is nearly invisible. Fix: define theme-aware scrim tokens and test the composited pixel against the underlying surface.
