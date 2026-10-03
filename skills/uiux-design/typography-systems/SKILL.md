---
name: typography-systems
description: Defines a typographic scale using a ratio with paired line-heights, measure limits, weight and optical-size axes, and fluid sizing with clamp(). Use when setting type styles, fixing dense or unreadable body text, or making typography responsive without hardcoded breakpoints.
---

# Typography Systems

**Use when:** you are establishing type styles, fixing text that is too tight or too wide to read, or making type scale fluid across viewports.
**Do not use when:** the question is line length in a specific layout container, which is `spacing-and-grid`.

## Instructions

1. Start from real content, not a scale. Inventory actual longest strings, longest words, and the longest single-line label in the product; the type scale must survive them.
2. Pick one base size and one ratio, then define line-height **paired with each step**. Body copy at 1.5-1.6, headings at 1.1-1.25 — line-height is part of the style, not a global override.
3. Constrain measure to 60-80 characters per line for continuous prose. Enforce it in CSS with `max-width: 68ch`, not with a container width picked by eye.
4. Use `ch` or `rem`-based widths so measure survives font-size changes. A `max-width` in pixels silently breaks the ratio the moment type scales.
5. Use variable-font axes deliberately: `wght` for hierarchy, `opsz` for optical sizing so large text gets tighter spacing and fine details, `GRAD` sparingly. Do not fake weight with faux bold.
6. Make the scale fluid with `clamp()` between two sizes and a zero-to-one curve, so there are no breakpoints in type. Set the preferred value at the mid viewport and derive the ends.
7. Use a true numeric scale step and never skip steps arbitrarily. If you need a size that is not on the scale, add it deliberately to the scale rather than hardcoding it.
8. Reserve semantic names for roles, not appearances: `text-body`, `text-heading-2`, `text-label`, `text-code`. Then theme or rebrand typography without touching components.
9. Handle edge cases deliberately: long words and URLs get `overflow-wrap: anywhere`; tabular figures get `font-variant-numeric: tabular-nums`; CJK and RTL need a line-height bump and logical properties.
10. Test at 200% browser zoom and at 320px width with real content, and check that no fixed-height container clips a line.

## Patterns

Type scale with paired line-heights, semantic names only:

```css
:root {
  /* base 16px @ 1280px viewport, fluid to 320-1600; ratio ~1.2 major third */
  --step--1: clamp(0.83rem, 0.80rem + 0.14vw, 0.91rem);
  --step-0:  clamp(1.00rem, 0.96rem + 0.19vw, 1.13rem);
  --step-1:  clamp(1.20rem, 1.12rem + 0.38vw, 1.42rem);
  --step-2:  clamp(1.44rem, 1.32rem + 0.58vw, 1.78rem);
  --step-3:  clamp(1.73rem, 1.54rem + 0.91vw, 2.23rem);
  --step-4:  clamp(2.07rem, 1.79rem + 1.39vw, 2.79rem);

  --lh-tight: 1.15;   /* display and headings: leading compresses as size grows */
  --lh-snug:  1.30;   /* subheads, card titles */
  --lh-normal: 1.55;  /* body: WCAG-recommended for sustained reading */
}

.text-body     { font-size: var(--step-0);  line-height: var(--lh-normal); max-inline-size: 68ch; }
.text-heading-1{ font-size: var(--step-4);  line-height: var(--lh-tight); text-wrap: balance; letter-spacing: -0.02em; }
.text-heading-2{ font-size: var(--step-2);  line-height: var(--lh-snug);  text-wrap: balance; }
.text-label    { font-size: var(--step--1); line-height: var(--lh-snug);  font-weight: 500; }
```

Variable font with optical size and numeric alignment:

```css
@font-face {
  font-family: "Inter var";
  src: url("/fonts/inter-var.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
}

body {
  font-family: "Inter var", system-ui, sans-serif;
  font-optical-sizing: auto;          /* opsz axis adjusts spacing per size */
  font-variation-settings: "wght" 400;
}

.display        { font-variation-settings: "wght" 700, "GRAD" -20; }
.tabular        { font-variant-numeric: tabular-nums; }   /* columns of money must align */
.prose a        { text-underline-offset: 0.15em; }
.long-token     { overflow-wrap: anywhere; hyphens: auto; }
```

Modular scale table used to generate the CSS variables:

```markdown
step  size@320  size@1600  line-height  role                usage cap
-1    13.3px    14.6px     1.30          label, meta          no more than 40 chars
 0    16.0px    18.1px     1.55          body, default        68ch measure
 1    19.2px    22.7px     1.30          card title           2 lines max
 2    23.0px    28.5px     1.30          section heading      1 line preferred
 3    27.7px    35.7px     1.15          page heading         balance
 4    33.2px    44.7px     1.15          display              one per view
```

## Checklist

- [ ] Base size and single ratio chosen, with line-height paired to every step
- [ ] Body copy constrained to 60-80 characters using `ch`
- [ ] Variable-font axes used deliberately, no faux bold
- [ ] Scale is fluid with `clamp()`, with no type breakpoints
- [ ] Names are semantic roles, never appearance or size
- [ ] Tabular numerals applied wherever numbers stack in columns
- [ ] Long words and URLs wrap rather than overflow
- [ ] Verified at 320px and 200% zoom, with no fixed-height container clipping a line

## Anti-patterns

**One global line-height.** Setting `line-height: 1.5` everywhere, then headings look loose and labels look cramped. Fix: pair line-height to each scale step; leading must compress as size increases.

**Scale chosen before content.** A 14-step scale applied to placeholder copy, then real strings overflow every card. Fix: inventory longest real strings first and size the scale to fit them.

**Pixel line-heights.** `height: 20px` on text rows. Any font or zoom change clips descenders. Fix: size containers from line-height, or let them size to content, and test at 200% zoom.

**Fixed type per breakpoint.** `font-size: 14px` on mobile, `16px` on desktop, hardcoded. Fix: `clamp()` between two values; the layout should not need breakpoints to set type.

**Appearance-based names.** `.big-blue-text`. Re-theming forces a search-and-replace across every component. Fix: name by role (`text-heading-2`) and let tokens carry the appearance.
