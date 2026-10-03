---
name: tailwind-architecture
description: Structures Tailwind CSS v4 projects using CSS-first configuration with `@theme`, `@layer`, `@custom-variant`, and `@utility` instead of a sprawling `tailwind.config.js`. Use when setting up Tailwind v4, wiring design tokens into utilities, adding container-query or dark-mode variants, or stopping utility sprawl in component markup.
---

# Tailwind Architecture

**Use when:** setting up or upgrading Tailwind CSS v4, connecting design tokens to utility names, adding custom variants such as dark mode or container queries, or controlling how utilities are generated.
**Do not use when:** the project is still on Tailwind v3 and needs config migration advice only — migrate to v4 first; for the token source format use `design-tokens`.

## Instructions

1. In v4 there is no JS config by default. Load `@import "tailwindcss"` in CSS and define design tokens in `@theme`; keep the Vite plugin (`@tailwindcss/vite`) instead of PostCSS.
2. Publish tokens as theme variables (`--color-*`, `--spacing-*`, `--radius-*`, `--font-*`, `--text-*`) so Tailwind generates matching utilities automatically — `bg-surface-page` follows from `--color-surface-page`.
3. Use `@theme inline` when the token references another custom property (`var(--color-action-bg)`); plain `@theme` resolves the value and breaks runtime theming.
4. Keep source order explicit with `@layer theme, base, components, utilities;` so unlayered CSS and third-party resets behave predictably.
5. Add variants with `@custom-variant`, not a plugin: `@custom-variant dark (&:where(.dark, .dark *));`
6. Add reusable single-purpose rules with `@utility`, which composes with variants and hover states — do not use `@layer components` for this.
7. Prefer variant stacking over `[&>svg]:…` arbitrary selectors; if you must nest, define the variant once so the markup stays readable.
8. Restrict arbitrary values and `!` important flags with lint rules; they are escape hatches, not vocabulary. Enforce a spacing and radius scale instead.
9. Use `@container` plus `@sm:`/`@lg:` container queries for component-internal layout, keeping viewport breakpoints for page-level structure.
10. Set content detection up front: v4 auto-detects sources, but monorepos and unusual file names need `@source "../packages/ui/src"` or explicit ignores.

## Patterns

CSS-first configuration with tokens wired to utilities:
```css
/* app/globals.css */
@import "tailwindcss";
@source "../../packages/ui/src";

/* Order matters: this line must come before any unlayered rule */
@layer theme, base, components, utilities;
@custom-variant dark (&:where(.dark, .dark *));

/* Generated from tokens.css — do not hand-edit */
@theme {
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --text-body: 1rem;
  --text-body--line-height: 1.55;
  --radius-card: 0.75rem;
  --spacing-gutter: clamp(1rem, 0.5rem + 2.5vw, 3rem);
}

/* Values that reference another custom property must use `inline` */
@theme inline {
  --color-action-bg: var(--color-action-bg);
  --color-action-fg: var(--color-action-fg);
  --color-surface-page: var(--color-surface-page);
}
```

Reusable rules as utilities, not component classes:
```css
@layer base {
  html { color-scheme: light dark; }
  body { background: var(--color-surface-page); color: var(--color-fg); }
}

/* @utility composes with variants: hover:, dark:, md:, data-[state=open]: */
@utility scrollbar-none {
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

@utility focus-ring {
  &:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }
}

/* Composed primitives belong in components, layered under utilities */
@layer components {
  .prose-body { max-inline-size: 65ch; font-size: var(--text-body); line-height: var(--text-body--line-height); }
}
```

Container-query variants plus markup that stays readable:
```tsx
export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="@container/card group grid gap-4 rounded-card border border-border p-4">
      <img
        src={product.image}
        alt=""
        loading="lazy"
        decoding="async"
        className="aspect-video w-full rounded-md object-cover @lg/card:col-start-2 @lg/card:row-start-1"
      />
      <div className="min-w-0 @lg/card:col-start-1 @lg/card:row-start-1">
        <h3 className="truncate text-lg font-semibold group-hover:underline">{product.title}</h3>
        <p className="text-muted @md/card:text-sm">{product.summary}</p>
      </div>
      <button className="focus-ring rounded-md bg-action-bg px-4 py-2 text-action-fg">Add to cart</button>
    </article>
  );
}
```

Vite wiring plus a lint guard against arbitrary-value sprawl:
```ts
// vite.config.ts
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({ plugins: [react(), tailwindcss()] });
```

## Checklist

- [ ] Tailwind v4 with `@import "tailwindcss"` and the Vite plugin; no legacy JS config.
- [ ] Every token is a theme variable so its utility is generated automatically.
- [ ] `@theme inline` used wherever a token references another custom property.
- [ ] `@layer theme, base, components, utilities;` declared before any unlayered CSS.
- [ ] Dark mode and container-query variants declared with `@custom-variant`.
- [ ] `@utility` used for single-purpose reusable rules; `@layer components` only for composed primitives.
- [ ] Component layout uses `@container` + `@sm:`/`@lg:`, not viewport breakpoints.
- [ ] `@source` declared for every workspace package scanned for class names.

## Anti-patterns

**Hand-written `tailwind.config.js` in a v4 project.** It is ignored unless explicitly loaded, so tokens silently stop generating utilities and the team debugs phantom missing classes. Fix: move configuration into `@theme` in CSS; if a JS file must remain, load it with `@config`.

**`@theme` for tokens that reference runtime variables.** Without `inline`, Tailwind resolves the value at build time and the emitted utility hardcodes one theme's colour, so dark mode silently stops working. Fix: `@theme inline` for indirection, plain `@theme` for literal values.

**`[&>*]:…` arbitrary nesting in every component.** The nesting survives in the DOM class string, is unreviewable, and breaks when a child element changes. Fix: `@custom-variant` or `@utility` for anything reused, so the variant name documents intent.

**`!` important and one-off arbitrary colours.** `bg-[#3b5bdb]` bypasses the design system entirely and no theme or contrast audit can reach it. Fix: add the colour as a semantic token and use `dark:` or a variant instead of `!`.