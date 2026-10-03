---
name: responsive-layouts
description: Builds fluid, largely breakpoint-free layouts using container queries, `clamp()`, intrinsic sizing, and subgrid. Use when fixing horizontal overflow, squished or non-shrinking flex children, unscalable text, or components that must respond to their container instead of the viewport width.
---

# Responsive Layouts

**Use when:** a component breaks at certain widths, text or media overflows its column, or the same card must lay out differently in a narrow sidebar versus a full-width main region.
**Do not use when:** the problem is only which color a token resolves to — use `dark-mode-theming`; for class-based breakpoint utilities see `tailwind-architecture`.

## Instructions

1. Reproduce the overflow before changing anything: set the device toolbar to 320px wide, then find offenders in the console with the width-scan snippet in Patterns below. Fix the widest element, not the symptom.
2. Convert reusable components from viewport breakpoints to `@container` queries plus `container-type: inline-size`, so a component reacts to the space it was actually given.
3. Let content size itself with `min-content`, `max-content`, `fit-content()`, `auto-fit`/`auto-fill`, and `minmax()` instead of hand-tuned pixel widths.
4. Fluidize type and spacing with `clamp(min, preferred, max)`; delete per-breakpoint font-size and padding overrides.
5. Fix non-shrinking flex/grid children at the source: the initial `min-width: auto` refuses to shrink below content, so set `min-inline-size: 0` on the item itself.
6. Reserve media space with `aspect-ratio` plus `inline-size: 100%; block-size: auto`, so the box exists before bytes arrive and layout does not shift.
7. Use logical properties (`margin-inline`, `padding-block`, `inset-inline-start`, `border-start-start-radius`) so one stylesheet serves both LTR and RTL.
8. Use `subgrid` when a child component must align to tracks defined by a distant ancestor (card title aligned to the page grid).
9. Cap prose measure with `max-inline-size: 65ch` rather than a viewport breakpoint.
10. Verify at 320, 375, 768, 1024, 1440, and 1920 CSS pixels, at 200% browser zoom, and in real device emulation — not only in the responsive viewport slider.

## Patterns

Container queries: reflow driven by the slot the component occupies, not the window:

```css
.card-slot { container-type: inline-size; container-name: card; }

@container card (inline-size < 24rem) {
  .card { grid-template-columns: 1fr; }
}

@container card (24rem <= inline-size < 48rem) {
  .card { grid-template-columns: 8rem 1fr; align-items: start; }
}
```

The flex overflow fix plus intrinsic track sizing:

```css
.toolbar { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }

/* Without this, one long token or <pre> forces page-level horizontal scroll */
.toolbar > * { min-inline-size: 0; }
.toolbar__title { flex: 1 1 12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.gallery {
  display: grid;
  gap: 1rem;
  /* min() keeps it valid below 16rem instead of overflowing */
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
}
```

Fluid scale plus shift-proof media:

```css
:root {
  --step-0: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
  --step-3: clamp(1.5rem, 1.3rem + 1vw, 2.25rem);
  --gutter: clamp(1rem, 0.5rem + 2.5vw, 3rem);
}

.prose { max-inline-size: 65ch; font-size: var(--step-0); }

.hero__media {
  inline-size: 100%;
  block-size: auto;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: var(--surface-2);
}
```

Subgrid for cross-component alignment:

```css
.page { display: grid; grid-template-columns: repeat(12, 1fr); gap: var(--gutter); }

.card {
  display: grid;
  grid-column: span 4;
  grid-template-columns: subgrid; /* inherits page tracks, keeps rhythm */
  gap: var(--gutter);
}
```

Find the overflow culprit (paste into DevTools console):

```js
const limit = document.documentElement.clientWidth + 1;
for (const el of document.querySelectorAll("*")) {
  const r = el.getBoundingClientRect();
  if (r.right > limit || r.left < -1) {
    console.warn("overflow", el.tagName, el.className, el.scrollWidth, el.clientWidth);
  }
}
```

## Checklist

- [ ] No horizontal page scroll at 320px CSS width and at 200% browser zoom.
- [ ] Reusable components use `@container` for internal reflow, not viewport breakpoints.
- [ ] Every flex/grid child holding text declares `min-inline-size: 0`.
- [ ] All media has `aspect-ratio` or explicit `width`/`height`, so nothing shifts after load.
- [ ] Font sizes and gutters are `clamp()`-based with zero per-breakpoint overrides.
- [ ] Layout uses logical properties so RTL needs no second stylesheet.
- [ ] Repeated column grids use `auto-fit` + `minmax()` instead of breakpoint rules.
- [ ] Checked in real device emulation, not just the viewport slider, at all six widths.

## Anti-patterns

**The flex child that refuses to shrink.** `min-width: auto` is the initial value on flex and grid items, so a long word, URL, or `<pre>` expands the row and forces document-level horizontal scroll. Fix: `min-inline-size: 0` on the child plus `overflow-wrap: anywhere` on the text node.

**Height breakpoints for hero sections.** `@media (min-height: 700px)` couples layout to browser chrome and collapses when the mobile URL bar hides. Fix: size from available space with `100svh`/`dvh`, or let content decide.

**`vw`-only font sizes.** `font-size: 4vw` ignores the user's font-size preference and becomes unreadable at 320px. Fix: `clamp()` with a `rem` floor and ceiling.

**Fixed `height` on text containers.** One extra line of copy — or a 40% longer German translation — clips or spills. Fix: `min-block-size` with `block-size: auto` and let the parent grid handle rhythm.

**Validating layout only in the DevTools slider.** Simulated widths with DPR 1 hide image-resolution problems and 1px hairline seams. Fix: run the width checklist on a real device and add a 320px Playwright viewport to CI so regressions fail the build.