---
name: css-container-queries
description: Makes components respond to their own size instead of the viewport using CSS container queries, container-type, container-name, and style queries. Use when a card, sidebar, or widget renders correctly in one slot and breaks in another, when a reusable component hardcodes breakpoint logic, or when viewport media queries cannot express a component-level layout switch.
---

# CSS Container Queries

**Use when:** the same component must render in two or more places of different width — a card in a three-up grid and a card in a wide main column — and viewport breakpoints cannot tell the two apart.
**Do not use when:** the page itself reflows as the viewport changes and media queries are already the right unit — that is `responsive-layouts`; the problem is which rule wins, not which breakpoint applies — `css-architecture`.

## Instructions

1. Name every query container. Anonymous containers are addressed by source order, so the first match wins and inserting a wrapper later silently re-targets the wrong subtree. `container-name: card` plus `@container card (min-width: 30rem)` is stable across refactors.
2. Put `container-type: inline-size` on the wrapper that owns the width. Use `inline-size`, not `size` — `size` also contains the block axis, so the container stops growing with its content and can collapse.
3. Query on the element's available space, not on its content. `min-width: 30rem` inside the container means "the space I was given is at least 30rem", which is the question a component can actually answer.
4. Use `rem` or `ch` in the query thresholds, never `px`. Container width is often font-relative, so a rem threshold keeps the switch consistent when a user changes root font size.
5. Do not put `container-type` on the element you are also sizing intrinsically (width, padding, content). The containment removes the content's contribution to sizing, so a `width: fit-content` container measures itself from nothing and collapses.
6. Keep the fallback branch first and unconditioned. Browsers without container query support should get the compact layout, not the widest one — write the narrow rules, then layer the wide ones inside `@container`.
7. Use `cqi` / `cqw` units for fluid internals *after* a threshold switch. Typing and padding in container-relative units without a breakpoint gives a component that is unreadably small at 200px and absurd at 1200px.
8. Style queries for theming, not size: `@container style(--variant: raised)` and `@container style(--density: compact)` let a host set custom properties without adding classes to the component.
9. Keep container queries in the component's own stylesheet, inside the component's layer. A container declaration is part of the component's contract, so it belongs with `Card.module.css`, not in a global layout file.
10. Verify with the responsive panel and by resizing the *container*, not the window. Most "it works on mobile" claims only ever tested the viewport, which is exactly the case container queries exist to cover.
11. Decide where the boundary sits deliberately. An extra wrapper introduced later inherits the nearest container and changes which subtree a query addresses — grep `container-name` when adding wrappers.
12. Split the two axes explicitly: the page grid keeps using media queries (`.layout { grid-template-columns: 1fr }` then `@media (min-width: 64rem) { grid-template-columns: 18rem minmax(0, 1fr) }`), while `.sidebar` and `.main` each declare their own `container-name` for their children to query.

## Patterns

A card that adapts to its slot, with a named container and a browser fallback:

```css
/* Card.module.css — the slot owns the container, so the card can be reused anywhere */
.slot {
  container-type: inline-size;
  container-name: card-slot;
}

.card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-2);
  background: var(--surface);
  grid-template-columns: 1fr;            /* fallback first: narrow and safe everywhere */
}

@container card-slot (min-width: 26rem) {
  .card {
    grid-template-columns: 12rem 1fr;
    align-items: start;
    padding: var(--space-4);
  }

  .card__media { aspect-ratio: 16 / 9; }
}

@container card-slot (min-width: 44rem) {
  .card { grid-template-columns: 12rem 1fr 14rem; }

  .card__meta {
    border-inline-start: 1px solid var(--border);
    padding-inline-start: var(--space-3);
  }
}
```

Size queries for a stat tile that must not overflow its column, using container-relative units after the switch:

```css
.tile-slot { container-type: inline-size; container-name: tile-slot; }

.tile { display: grid; gap: var(--space-1); }
.tile__value { font-variant-numeric: tabular-nums; line-height: 1.1; font-size: 1rem; }

@container tile-slot (min-width: 12rem) {
  .tile { grid-template-columns: 1fr auto; align-items: baseline; }

  /* cqi is safe here: the component is past its threshold, so it has room to scale */
  .tile__value { font-size: clamp(1rem, 4cqi, 1.75rem); }
}
```

Style queries so a host themes the component without touching its internals:

```css
.stat {
  container-name: stat;
  background: var(--surface);
  padding: var(--space-3);
}

/* the host sets --variant and --density on .stat itself; no child classes needed */
@container style(--variant: raised) {
  .stat { box-shadow: var(--shadow-2); }
}

@container style(--density: compact) {
  .stat { padding-block: var(--space-1); }
  .stat__value { font-size: 1rem; }
}
```

## Checklist

- [ ] Every container has a `container-name`; no anonymous containers are addressed by source order.
- [ ] `container-type: inline-size` is used, never bare `size`, unless block-axis containment is intentional.
- [ ] Containers sit on wrappers whose width comes from the parent, not on intrinsically sized elements.
- [ ] Query thresholds use `rem` or `ch`, and each one is justified by a real measured slot width.
- [ ] The narrow layout is the unconditioned default, so no-query browsers get the compact version.
- [ ] Container-relative units (`cqi`, `cqw`) appear only after a size threshold, never as the only size rule.
- [ ] Style queries (`@container style(...)`) own theming variants instead of extra class names on children.
- [ ] Both the container declaration and its `@container` rules live in the component's own scoped stylesheet and layer.
- [ ] Responsive testing resizes the container slot in DevTools, not just the viewport.
- [ ] `container-name` values are unique per page, and no wrapper re-targets an existing query.

## Anti-patterns

**Containers on the component itself.** `.card { container-type: inline-size }` makes the card a query container for its own descendants, so `@container (min-width: 30rem)` measures the card's own content box — which cannot influence the rule that sizes it. The query either never matches or matches trivially. Fix: put `container-type` on the parent slot and query from the child.

**Anonymous containers everywhere.** `@container (min-width: 40rem)` binds to the nearest ancestor container with no name, so adding a wrapper with `container-type` for an unrelated component silently redirects every unnamed query beneath it. Fix: name every container, and grep for duplicates when adding one.

**Replacing media queries wholesale.** Container queries do not know about the viewport, so page-level concerns — collapsing a two-column page, changing the global gutter — have no container to ask. Fix: media queries for page layout, container queries for components. They are complements, not replacements.

**Fluid `cqi` sizing with no threshold switch.** `font-size: 7cqi` inside a 900px sidebar yields 63px text. Fix: clamp between a floor and a ceiling *and* switch layout at a container threshold, so the component never renders its narrow form scaled up. Where the container is effectively the page, use `%` or `clamp()` with `rem` instead of `cqw`.

**Using container queries to paper over a real layout bug.** A component that only "works" in one slot because the parent happens to be viewport-sized is being propped up, not made robust. Fix: give the component an explicit width contract at its slot, then decide whether the parent was wrong.