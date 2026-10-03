---
name: design-tokens
description: Defines and pipelines design tokens in the W3C DTCG format into CSS custom properties, Tailwind theme variables, and Figma variables. Use when replacing hardcoded hex values and magic numbers, setting up multi-brand or multi-theme token sets, or syncing tokens between design files and code.
---

# Design Tokens

**Use when:** hex codes, pixel sizes, and shadow values are hardcoded across components, or you need one source of truth shared by web, iOS, and Figma.
**Do not use when:** the problem is only light/dark resolution of an existing palette — use `dark-mode-theming`; for the CSS layer discipline around tokens see `css-architecture`.

## Instructions

1. Split tokens into three tiers and never mix them: **primitive** (`blue-600`, the raw ramp), **semantic** (`color-action-bg`, role-based aliases), and **component** (`button-primary-bg`, only when a semantic token cannot express it).
2. Author tokens in DTCG JSON with `$value`/`$type` so tooling (Style Dictionary, Tokens Studio, Supernova) can consume them without a custom parser.
3. Generate CSS from tokens at build time; never hand-maintain a parallel `:root` block. Add the generator as a prebuild/predev script and commit the output.
4. Register the generated custom properties at `@layer tokens` so they sit below component rules in the cascade.
5. Point Tailwind at the same generated variables via `@theme` so `bg-action-bg` and `var(--color-action-bg)` are the same value with no drift.
6. Name by role, not by appearance: `color-danger-fg`, never `color-red-text`. A rename to coral then touches one file.
7. Reference tokens only through `var()`, always with a fallback for third-party or CMS-injected content: `var(--color-action-bg, #2563eb)`.
8. Document every token: add `$description` in the JSON and surface it in Storybook (`parameters.tokenDocs`) so consumers know when to use it.
9. Add a deprecation path — mark old tokens `$deprecated`, keep them emitting for one release, then delete — so a rename does not break content teams' custom CSS.
10. Lint and diff tokens in CI: fail on duplicate semantic values where uniqueness is intended, and post the generated CSS as a build artifact for review.

## Patterns

DTCG source of truth:

```json
{
  "color": {
    "primitive": {
      "blue": {
        "600": { "$type": "color", "$value": "#1d4ed8", "$description": "Raw ramp value, do not consume directly." }
      }
    },
    "semantic": {
      "action": {
        "bg":   { "$type": "color", "$value": "{color.primitive.blue.600}" },
        "fg":   { "$type": "color", "$value": "#ffffff" },
        "hover":{ "$type": "color", "$value": "{color.primitive.blue.700}" }
      },
      "danger": {
        "bg": { "$type": "color", "$value": "#b91c1c" },
        "fg": { "$type": "color", "$value": "#ffffff" }
      },
      "surface": {
        "page": { "$type": "color", "$value": "#ffffff" },
        "sunken": { "$type": "color", "$value": "#f5f6f8" }
      }
    }
  },
  "space": {
    "$type": "dimension",
    "3": { "$value": { "value": 12, "unit": "px" } },
    "6": { "$value": { "value": 24, "unit": "px" } }
  },
  "radius": {
    "$type": "dimension",
    "md": { "$value": { "value": 8, "unit": "px" } }
  }
}
```

Generator config emitting CSS variables (`style-dictionary.config.mjs`):

```js
// style-dictionary.config.mjs
export default {
  source: ["tokens/**/*.json"],
  platforms: {
    css: {
      transformGroup: "tokens-studio",
      buildPath: "src/styles/",
      files: [
        {
          destination: "tokens.css",
          format: "css/variables",
          // outputReferences keeps var() indirection so themes override the primitive
          options: { outputReferences: true }
        }
      ]
    }
  }
};
```

Generated output consumed as Tailwind v4 theme values:

```css
@layer tokens {
  :root {
    --color-action-bg: var(--color-blue-600);
    --color-action-fg: #fff;
    --color-surface-page: #fff;
    --radius-md: 8px;
  }
}

@import "tailwindcss";

@theme inline {
  --color-action-bg: var(--color-action-bg);
  --color-surface-page: var(--color-surface-page);
  --radius-md: var(--radius-md);
}

/* Usage is identical in both worlds */
.action { background: var(--color-action-bg); color: var(--color-action-fg); border-radius: var(--radius-md); }
```

## Checklist

- [ ] Three tiers exist (primitive / semantic / component) and nothing references a primitive from a component.
- [ ] Token source is DTCG JSON with `$type` and `$description`; CSS is generated, never hand-edited.
- [ ] Generator runs in `prebuild` and `predev`, and the generated file is committed or CI-artifacted.
- [ ] Custom properties are declared inside `@layer tokens` and imported first.
- [ ] Zero raw hex values or magic pixel numbers remain in component styles (grep-verified).
- [ ] Every token is reachable from the Tailwind theme, so utilities and `var()` never disagree.
- [ ] Deprecated tokens are flagged, documented, and scheduled for removal.
- [ ] A diff of regenerated tokens is reviewed in PRs, so unintended value changes fail review.

## Anti-patterns

**Semantic names that encode color** (`--text-red`, `--blue-bg`). Renaming the palette from blue to violet then means auditing every component, and the name actively misleads. Fix: name by role (`--color-action-bg`); keep hex values in the primitive tier only.

**Hand-maintained `:root` block alongside a token file.** Two sources of truth drift within a sprint and the drift is only visible in production. Fix: generate the CSS, commit it, and add a CI check that regeneration produces no diff.

**No fallback on `var()`.** One missing token in a CMS snippet or third-party embed kills the whole subtree, not just that declaration. Fix: `var(--color-action-bg, #1d4ed8)` at every consumption site.

**Using primitive tokens in components.** A component wired to `--blue-600` cannot join a high-contrast or brand theme. Fix: components consume semantic tokens only; lint to flag `--color-primitive` usage outside `tokens/`.