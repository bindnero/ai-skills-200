---
name: spacing-and-grid
description: Applies spacing scales, layout grids, stack primitives, and container queries so layout stays consistent across breakpoints and themes. Use when fixing inconsistent padding and gutters, building responsive layouts, or replacing hardcoded pixel values with tokens.
---

# Spacing and Grid

**Use when:** you are fixing inconsistent gaps and padding, building a responsive page layout, or replacing hardcoded pixel values with a token scale.
**Do not use when:** the problem is type size or leading, which is `typography-systems`.

## Instructions

1. Choose one base unit (4px or 8px) and build the entire scale from it. A scale with values like 7px, 13px, and 22px has no unit and cannot be reasoned about.
2. Name spacing semantically by relationship, not by size, for layout decisions: `--gap-tight`, `--gap-component`, `--gap-section`, `--space-inline`. Keep raw unit tokens available for component-internal use.
3. Resolve spacing conflicts with a single owner rule: **inside a component, the component owns its padding; the layout owns the gap between components.** This is the rule that ends the padding-plus-margin fights.
4. Use logical properties everywhere (`padding-inline`, `margin-block`, `inset-inline-start`) so RTL and vertical writing modes work without a separate stylesheet.
5. Use container queries, not viewport breakpoints, for components. A card's layout should respond to the width of its container, so the same card works in a sidebar and a main column.
6. Use flex or grid `gap` instead of margin-based spacing between siblings. Margins collapse unpredictably and leave orphan margins after filtering.
7. Prefer `auto` grid tracks with `minmax(0, 1fr)` for content columns, or `repeat(auto-fill, minmax(min(100%, 18rem), 1fr))` for self-responsive card grids with no breakpoints at all.
8. Never fix a height to fit text. Use `min-height`, `min-block-size`, or intrinsic sizing, so content growth at larger zoom and longer translations does not clip.
9. Set a max content measure and center it. Unconstrained line length is the single most common readability defect outside the type system itself.
10. Verify with real data at 320px, 768px, 1280px, and at 200% zoom, then confirm nothing relies on a magic number left over in the diff.

## Patterns

Base scale with semantic layout layer:

```css
:root {
  --unit: 4px;
  --space-0: 0;
  --space-1: calc(var(--unit) * 1);   /*  4 */
  --space-2: calc(var(--unit) * 2);   /*  8 */
  --space-3: calc(var(--unit) * 3);   /* 12 */
  --space-4: calc(var(--unit) * 4);   /* 16 */
  --space-6: calc(var(--unit) * 6);   /* 24 */
  --space-8: calc(var(--unit) * 8);   /* 32 */
  --space-12: calc(var(--unit) * 12); /* 48 */
  --space-16: calc(var(--unit) * 16); /* 64 */
  --space-24: calc(var(--unit) * 24); /* 96 */

  /* layout relationships, not sizes */
  --gap-tight:     var(--space-2);
  --gap-component: var(--space-6);
  --gap-section:   var(--space-16);
  --pad-control:   var(--space-3);
}
```

Responsive page grid with container queries and intrinsic track sizing:

```css
.shell {
  display: grid;
  grid-template-columns:
    [full-start] minmax(var(--pad-inline), 1fr)
    [content-start] minmax(0, 68ch) [content-end]
    minmax(var(--pad-inline), 1fr) [full-end];
  gap: var(--gap-section);
  --pad-inline: var(--space-4);
}
@media (min-width: 48rem) { .shell { --pad-inline: var(--space-8); } }
.shell > *        { grid-column: content; }
.shell > .bleed   { grid-column: full; }

.cards { display: grid; gap: var(--gap-component);
         grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); }

.card-wrap { container-type: inline-size; }
@container (min-width: 30rem) {
  .card { grid-template-columns: 8rem 1fr auto; align-items: center; }
}
```

Stack primitive, so nobody reaches for a margin:

```css
.stack { display: flex; flex-direction: column; }
.stack[data-space="tight"]      { gap: var(--gap-tight); }
.stack[data-space="component"]  { gap: var(--gap-component); }
.stack[data-space="section"]    { gap: var(--gap-section); }
.stack[data-space="inline"]     { flex-direction: row; flex-wrap: wrap; align-items: center; }

.cluster { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
```

Ownership rule that prevents double spacing:

```markdown
COMPONENT owns: padding-inline, padding-block, internal stack gap
LAYOUT    owns: grid gap, stack gap, section gap
NEVER: margin on a child of a gap-based container
RESULT:  removing a component removes its spacing exactly, with no orphan margin
```

## Checklist

- [ ] Single base unit; every spacing value a multiple of it, no stray pixel literals
- [ ] Semantic relationship tokens used for layout decisions
- [ ] Inside-padding owned by components; between-gap owned by layout
- [ ] Logical properties used throughout, RTL verified
- [ ] Container queries used for components, viewport breakpoints only for page shell
- [ ] `minmax(0, 1fr)` or intrinsic `auto-fill` tracks prevent overflow
- [ ] No fixed heights sized to fit text; `min-block-size` used instead
- [ ] Checked at 320px, 768px, 1280px, and 200% zoom with production data

## Anti-patterns

**Margin soup.** Every element carries a `margin-bottom`, and vertical rhythm breaks wherever a conditional renders. Fix: replace sibling margins with `gap` on the flex or grid parent.

**Container plus margin.** A component has internal padding and the layout adds a margin around it. Removing the component leaves a hole. Fix: write the ownership rule down — padding inside, gap outside — and enforce it in review.

**Breakpoint-per-component.** A card switches to two columns at `min-width: 900px`, which is a viewport width, so the card is cramped in a 900px sidebar. Fix: `container-type: inline-size` and query the container.

**Percentage padding.** `padding: 5%` on a card resolves against the container width, so vertical padding changes with viewport width. Fix: fixed token values or `clamp()` with rem.

**Grid overflow from `1fr`.** `grid-template-columns: 1fr 1fr` lets a long unbreakable token blow out the track. Fix: `minmax(0, 1fr)` plus `overflow-wrap: anywhere` on the content.
