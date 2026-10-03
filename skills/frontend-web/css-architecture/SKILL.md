---
name: css-architecture
description: Restructures tangled stylesheets into predictable cascade layers, scoped component styles, and zero-specificity extension points. Use when CSS specificity wars, `:deep`/global selector bleed, duplicate override blocks, or "why is this heading the wrong size" problems appear, or when migrating a monolithic CSS file to CSS Modules, BEM, or `@layer`.
---

# CSS Architecture

**Use when:** rules override each other unpredictably, component styles leak into neighbours, or you are splitting one monolithic stylesheet into scoped, maintainable units.
**Do not use when:** the problem is purely how one component reflows at different widths — use `responsive-layouts`; for token naming and multi-theme values use `design-tokens`.

## Instructions

1. Inventory collisions: `rg -n '^\s*[.#\[]' --glob '*.css'` and count how many files define each class name. Names defined in more than one component file are collisions, not intentional sharing.
2. Declare the layer order once, as high in the document as possible, before any unlayered rule: `@layer reset, tokens, base, layout, components, utilities;`
3. Move every stylesheet into a layer. Unlayered CSS beats all layered CSS, so one leftover global file silently defeats the entire system.
4. Scope component rules with CSS Modules (`*.module.css`) or the framework's own scoping (`scoped` in Vue/Svelte, no styles in Svelte by default). Never reach outward with a bare element selector from a component file.
5. Adopt BEM-style local naming (`block__element--modifier`) only inside the component that owns the block. BEM avoids collisions; it is not a global namespace strategy.
6. Hold specificity flat at one class per selector. When you need a state or variant to escalate, wrap it in `:where()` so it contributes zero: `.card:where(.card--raised)`.
7. Reserve `!important` for two cases only: third-party CSS you cannot edit, and `transition: none !important` inside `@media (prefers-reduced-motion: reduce)`.
8. Expose deliberate extension points as custom properties with fallbacks (`var(--card-pad, 1rem)`) instead of extra class names — the consumer overrides a value, not a selector.
9. Delete dead rules before splitting files: run DevTools Coverage or `npx knip`. Splitting a file of dead rules just distributes the rot across more files.
10. Lock the architecture in CI with `stylelint` (`selector-max-specificity`, `declaration-no-important`, `selector-max-id`), so the next contributor cannot reintroduce the war.

## Patterns

Layer order is authoritative and removes specificity guesswork:

```css
/* app/global.css — imported once, first */
@layer reset, tokens, base, layout, components, utilities;

@import "./styles/reset.css" layer(reset);
@import "./styles/tokens.css" layer(tokens);
@import "./styles/base.css" layer(base);
```

Zero-specificity variants and value-level extension points:

```css
@layer components {
  .card {
    color: var(--card-fg, var(--fg));
    padding: var(--card-pad, 1rem);
    border: 1px solid var(--card-border, currentColor);
  }

  /* :where() adds 0 specificity, so this never outranks .card */
  .card:where(.card--raised) {
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.08), 0 8px 24px rgb(0 0 0 / 0.06);
  }

  .card__title {
    font: var(--card-title-font, 600 1.125rem/1.3 var(--font-sans));
    margin-block: 0 var(--card-gap);
  }
}
```

Component state that stays scoped, plus composition without selector chains:

```css
/* DataTable.module.css */
.root { display: grid; gap: 0.5rem; }
.row { padding-block: 0.75rem; border-block-end: 1px solid var(--border); }

.root:where([data-density="compact"]) .row { padding-block: 0.25rem; }
.row:where([aria-selected="true"]) { background: var(--accent-soft); }

/* Composition is a sibling class, never .page .page .wrapper */
.composition {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-3);
}
```

The lint gate that keeps it from rotting:

```json
{
  "rules": {
    "selector-max-specificity": "0,1,0",
    "selector-max-id": 0,
    "declaration-no-important": [
      true,
      { "message": "Use @layer ordering or a token override instead of !important." }
    ],
    "no-descending-specificity": true,
    "selector-not-notation": "simple",
    "at-rule-no-unknown": [true, { "ignoreAtRules": ["tailwind", "custom-variant", "utility"] }]
  },
  "ignoreFiles": ["**/vendor/**", "**/styles/reset.css"]
}
```

## Checklist

- [ ] Every stylesheet is imported inside a declared `@layer`; zero unlayered rules remain.
- [ ] Measured max specificity is `0,1,0` across component files (lint-verified, not assumed).
- [ ] No component stylesheet contains a bare `element` selector outside the `base`/`reset` layer.
- [ ] `!important` appears only inside `prefers-reduced-motion` blocks or third-party overrides.
- [ ] All consumer overrides go through custom properties with fallbacks, never a second class name.
- [ ] A coverage pass confirms no dead rules were carried into the new file layout.
- [ ] `stylelint` runs in CI and fails the build on `declaration-no-important`.
- [ ] Unused design-token custom properties are pruned from `tokens.css`.

## Anti-patterns

**`!important` escalation.** Two developers need the same property on the same element, both reach for `!important`, and the winner becomes source order — invisible to anyone reading a single file. Fix: fix the layer order, keep one class per selector, and wrap variants in `:where()`.

**Bare element selectors inside component CSS** (`.card h2 { ... }`). You now own every descendant heading on the page, and the next component silently inherits your margins. Fix: target your own classes (`.card__title`) or explicitly named slots (`.card > :where(h1, h2)`).

**Class names used as a global namespace** (`.site-header`, `.site-card`). Greps return unrelated matches and the name collides the moment a component is reused inside a template or modal. Fix: local names inside the owning component; prefix only genuinely global styles.

**`@apply` sprawl inside scoped CSS.** Copy-pasted utility blocks rot faster than class names, and `@apply` in scoped styles bypasses the utility pipeline you are trying to keep intact. Fix: compose utilities at the call site; keep `@apply` for a handful of repeated primitives inside a real layer.

**Renaming a class with no compatibility window.** Renames ripple into templates, tests, CMS-authored JSON, and email templates, leaving invisible unstyled nodes. Fix: grep the whole repo including JSON and i18n bundles, then keep the old selector as an alias for one release.