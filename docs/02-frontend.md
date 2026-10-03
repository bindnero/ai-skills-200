# 02 · Frontend & Web Development

Everything that runs in the browser: how CSS is organised, how layouts hold up across breakpoints, how components are structured, how each major framework's idioms work, and how to stop the bundle and the page weight from getting out of hand.

29 skills. Each row links to the bundle — read it before doing the work it describes.

## Foundations

How the browser is actually organised into layers, and why the cascade stops being your friend at scale.

| Skill | Use it when |
| --- | --- |
| [`css-architecture`](../skills/frontend-web/css-architecture/SKILL.md) | Restructures tangled stylesheets into predictable cascade layers, scoped component styles, and zero-specificity extension points. Use when CSS specificity wars, `:deep`/global selector bleed, duplicate override blocks, or "why is this heading the wrong size" problems appear, or when migrating a monolithic CSS file to CSS Modules, BEM, or `@layer`. |
| [`responsive-layouts`](../skills/frontend-web/responsive-layouts/SKILL.md) | Builds fluid, largely breakpoint-free layouts using container queries, `clamp()`, intrinsic sizing, and subgrid. Use when fixing horizontal overflow, squished or non-shrinking flex children, unscalable text, or components that must respond to their container instead of the viewport width. |
| [`css-container-queries`](../skills/frontend-web/css-container-queries/SKILL.md) | Makes components respond to their own size instead of the viewport using CSS container queries, container-type, container-name, and style queries. Use when a card, sidebar, or widget renders correctly in one slot and breaks in another, when a reusable component hardcodes breakpoint logic, or when viewport media queries cannot express a component-level layout switch. |
| [`design-tokens`](../skills/frontend-web/design-tokens/SKILL.md) | Defines and pipelines design tokens in the W3C DTCG format into CSS custom properties, Tailwind theme variables, and Figma variables. Use when replacing hardcoded hex values and magic numbers, setting up multi-brand or multi-theme token sets, or syncing tokens between design files and code. |
| [`dark-mode-theming`](../skills/frontend-web/dark-mode-theming/SKILL.md) | Implements dark mode and multi-theme rendering with `color-scheme`, the CSS `light-dark()` function, semantic tokens, and a flash-free ThemeProvider. Use when adding a dark theme, honouring `prefers-color-scheme`, fixing a white flash on load, or tuning theme colours across native UI. |
| [`html-semantics`](../skills/frontend-web/html-semantics/SKILL.md) | Replaces ARIA-laden div soup with native HTML — landmarks, heading order, real buttons and lists, label association, and ARIA only where the platform lacks an element. Use when markup is a wall of divs, screen reader output is unusable, or a keyboard user cannot operate a control. |

## Components & state

Component boundaries, ownership of state, and the framework-specific idioms worth knowing.

| Skill | Use it when |
| --- | --- |
| [`component-library-authoring`](../skills/frontend-web/component-library-authoring/SKILL.md) | Authors reusable UI library components with typed props, controlled/uncontrolled parity, compound-part APIs, and Storybook plus accessibility coverage. Use when building or refactoring a design-system component, designing a Button/Dialog/Tabs public API, or shipping a component for multiple consuming apps. |
| [`state-management`](../skills/frontend-web/state-management/SKILL.md) | Decides where each piece of state belongs — component, URL, server cache, form, or global store — and implements it with narrow Zustand selectors, split contexts, or XState machines. Use when choosing between useState/context/store, fixing whole-tree re-renders from a wide context, or modelling multi-step and async workflows. |
| [`forms-validation`](../skills/frontend-web/forms-validation/SKILL.md) | Validates forms with shared Zod schemas, native constraint validation, and accessible error messaging wired through `aria-invalid` and `aria-describedby`. Use when building signup/checkout/settings forms, mirroring validation between client and server, fixing inaccessible or jarring error UX, or hardening input handling. |
| [`react-performance`](../skills/frontend-web/react-performance/SKILL.md) | Profiles and eliminates wasted React renders with narrow subscriptions, split contexts, memo boundaries, `useDeferredValue`, and Server Components. Use when pages feel sluggish, React DevTools Profiler shows high commit counts, a `memo` fix did not work, or you need to break a render/update waterfall. |
| [`vue-patterns`](../skills/frontend-web/vue-patterns/SKILL.md) | Applies Vue 3 Composition API conventions — `script setup`, `defineModel`, typed composables, `provide`/`inject` with injection keys, and Pinia setup stores — while avoiding reactivity-destroying destructuring. Use when writing or refactoring `.vue` SFCs, extracting logic into composables, or fixing stale values and re-render churn in Vue apps. |

## TypeScript

Compiler discipline, API design with generics and unions, and failure modelled as a value.

| Skill | Use it when |
| --- | --- |
| [`typescript-strict-mode`](../skills/frontend-web/typescript-strict-mode/SKILL.md) | Turns on TypeScript strict-family compiler flags and clears the errors they surface, using tsconfig strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, and satisfies. Use when migrating a project to strict mode, when implicit any or unchecked index access is hiding bugs, when a large batch of type errors blocks a build, or when deciding which strict flag to adopt next. |
| [`typescript-generic-patterns`](../skills/frontend-web/typescript-generic-patterns/SKILL.md) | Designs TypeScript APIs with generics, discriminated unions, key remapping, and template literal types so callers keep inference instead of annotating every call. Use when a function or hook is drowning in type parameters, when state needs a discriminated union instead of optional booleans, when writing type-safe config or event maps, or when a prop type grows a fifth boolean flag. |

## Frameworks

Current routing, rendering and data-loading conventions for the mainstream meta-frameworks.

| Skill | Use it when |
| --- | --- |
| [`svelte-kit-patterns`](../skills/frontend-web/svelte-kit-patterns/SKILL.md) | Applies SvelteKit 2 and Svelte 5 conventions — universal versus server `load` functions, streamed promises, form actions with `use:enhance`, `hooks.server.ts`, and runes. Use when building SvelteKit routes, mutating data from the client, or fixing double-fetching and layout data loss between navigations. |
| [`nextjs-app-router`](../skills/frontend-web/nextjs-app-router/SKILL.md) | Implements Next.js App Router correctly — Server Components, async request APIs, Server Actions with revalidation, streaming Suspense, route handlers, and metadata. Use when building routes under `app/`, fixing stale cached pages after mutations, or eliminating server/client waterfalls and `"use client"` overuse. |
| [`astro-static-sites`](../skills/frontend-web/astro-static-sites/SKILL.md) | Builds content-driven sites with Astro using islands with the right client directive, typed content collections, `getStaticPaths`, prerendering, and `astro:assets`. Use when marketing sites, docs, or blogs feel slow, when shipping too much JS, or when adding Markdown/MDX content with schemas. |
| [`i18n-implementation`](../skills/frontend-web/i18n-implementation/SKILL.md) | Localises interfaces with ICU MessageFormat plurals, `Intl` APIs for dates/numbers/relative time, typed message keys, locale routing with `hreflang`, and RTL support. Use when extracting hardcoded strings, adding a language switcher, or fixing broken plurals, date formats, and RTL layouts. |

## Styling systems

Utility-first architecture and animation that survives real content.

| Skill | Use it when |
| --- | --- |
| [`tailwind-architecture`](../skills/frontend-web/tailwind-architecture/SKILL.md) | Structures Tailwind CSS v4 projects using CSS-first configuration with `@theme`, `@layer`, `@custom-variant`, and `@utility` instead of a sprawling `tailwind.config.js`. Use when setting up Tailwind v4, wiring design tokens into utilities, adding container-query or dark-mode variants, or stopping utility sprawl in component markup. |
| [`css-animations`](../skills/frontend-web/css-animations/SKILL.md) | Animates interfaces with compositor-friendly properties, `prefers-reduced-motion` fallbacks, View Transitions, and scroll-driven animations. Use when adding motion to dialogs, lists, page navigations, or progress indicators, or when fixing janky animations and users reporting motion sickness. |
| [`web-components`](../skills/frontend-web/web-components/SKILL.md) | Builds platform custom elements with Shadow DOM, constructable stylesheets, slots, form participation via `ElementInternals`, and Lit. Use when shipping framework-agnostic widgets, embedding a design-system component in a non-React host, or migrating a legacy web component. |

## Performance

The loading pipeline end to end: what to defer, what to preload, what to measure.

| Skill | Use it when |
| --- | --- |
| [`lazy-loading-strategies`](../skills/frontend-web/lazy-loading-strategies/SKILL.md) | Splits and defers JavaScript and media with `import()`, `React.lazy`/Suspense, route-level chunking, `IntersectionObserver`, and `content-visibility`. Use when the initial bundle is too large, below-the-fold widgets hydrate needlessly, or embeds and third-party scripts slow first interaction. |
| [`input-event-throttling`](../skills/frontend-web/input-event-throttling/SKILL.md) | Rate-limits high-frequency UI events with debounce, throttle, requestAnimationFrame batching, AbortController cancellation, and passive listeners. Use when typing or scrolling triggers network calls or heavy renders, when input feels laggy, or when keystroke handlers cause jank on low-end devices. |
| [`image-optimization`](../skills/frontend-web/image-optimization/SKILL.md) | Delivers correctly sized, correctly prioritised images using `srcset`/`sizes`, `<picture>` art direction, AVIF/WebP, explicit dimensions to prevent CLS, and LCP-aware `fetchpriority`. Use when images dominate page weight, LCP is an image, or layouts shift when pictures load. |
| [`font-loading`](../skills/frontend-web/font-loading/SKILL.md) | Loads web fonts without invisible text or layout shift using `font-display`, metric-compatible fallbacks (`size-adjust`, `ascent-override`), `preload`, and subsetting. Use when text flashes invisible (FOIT), reflows when fonts arrive (FOUT), or a font request delays LCP. |
| [`critical-css`](../skills/frontend-web/critical-css/SKILL.md) | Inlines above-the-fold CSS and defers the rest so first paint stops waiting on render-blocking stylesheets. Use when FCP/LCP are delayed by CSS, when `@import` chains appear in the Network panel, or when a large global stylesheet blocks rendering. |
| [`bundle-size-triage`](../skills/frontend-web/bundle-size-triage/SKILL.md) | Finds and removes JavaScript weight by analysing production build stats, tracing duplicated dependencies, and eliminating barrel-file imports. Use when the bundle grows unexpectedly, when CI fails a size budget, or when a dependency upgrade adds hundreds of kilobytes. |
| [`web-vitals-remediation`](../skills/frontend-web/web-vitals-remediation/SKILL.md) | Diagnoses and fixes LCP, INP, and CLS regressions using the `web-vitals` attribution build, real-user monitoring, and field-versus-lab comparison. Use when Core Web Vitals scores drop, Lighthouse flags LCP/CLS/TBT, or users report a page that "feels slow" to interact with. |

## Platform APIs

Offline, storage, and the progressive-app surface.

| Skill | Use it when |
| --- | --- |
| [`browser-storage-apis`](../skills/frontend-web/browser-storage-apis/SKILL.md) | Persists client state safely with `localStorage`, `sessionStorage`, IndexedDB, and the Origin Private File System, including quota handling, eviction behaviour, and cross-tab sync. Use when caching data offline, saving drafts, or debugging `QuotaExceededError` and storage eviction. |
| [`service-worker-pwa`](../skills/frontend-web/service-worker-pwa/SKILL.md) | Ships an installable, offline-capable PWA with a Workbox service worker — precaching, per-route caching strategies, update prompts, and background sync. Use when adding offline support, an install prompt, push notifications, or when a service worker is serving stale content. |

---

[Full index](../CATALOG.md) · [Install targets](10-install-targets.md) · [Authoring](11-authoring.md)
