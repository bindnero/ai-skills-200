---
name: lazy-loading-strategies
description: Splits and defers JavaScript and media with `import()`, `React.lazy`/Suspense, route-level chunking, `IntersectionObserver`, and `content-visibility`. Use when the initial bundle is too large, below-the-fold widgets hydrate needlessly, or embeds and third-party scripts slow first interaction.
---

# Lazy Loading Strategies

**Use when:** the initial bundle is too large, below-the-fold widgets hydrate needlessly, third-party embeds block interaction, or route transitions feel like full page loads.
**Do not use when:** the fix is simply removing an unused dependency — use `bundle-size-triage` first; for image payload weight use `image-optimization`.

## Instructions

1. Measure before splitting: record the route's initial JS from a production build (`vite build` stats or `next build`), then set a budget and a baseline. Splitting without a number produces churn.
2. Route-split first. It gives the largest win with the least risk — every non-initial route becomes its own chunk loaded on navigation.
3. Defer heavy libraries with dynamic `import()` at the point of use: editors, charting, PDF viewers, maps, and date pickers. Never import them at module scope "for convenience".
4. Wrap component-level lazy loading in `<Suspense>` with a stable fallback and an error boundary, so a chunk failure shows a retry instead of a blank page.
5. Prefetch on intent: on hover or focus of a link/button, call the loader (`import()` or the router's prefetch) so the chunk is warm before the click.
6. Lazy-render below-the-fold UI with `IntersectionObserver` on a wrapper with a reserved box, rather than with scroll listeners or `loading="lazy"` on scripts.
7. Use `content-visibility: auto` with `contain-intrinsic-size` for long lists and article bodies — it skips rendering off-screen content with no JavaScript.
8. Remember hydration cost: a lazily imported component still ships its code when it becomes visible. Pair code splitting with `content-visibility` and viewport-based asset deferral.
9. Ensure every dynamic chunk is reachable in the production build. Watch for packages that resolve differently under `export` conditions and break only after code splitting.
10. Verify the split actually happened — check the build output for separate chunk files and confirm the initial payload dropped; run a Playwright test that fails if initial JS exceeds the budget.

## Patterns

Component-level lazy loading with prefetch on intent:
```tsx
import { lazy, Suspense, startTransition, useCallback } from "react";

const loadReport = () => import("./ReportEditor"); // separate chunk
const ReportEditor = lazy(loadReport);

export function ReportPanel({ reportId }: { reportId: string }) {
  const prefetch = useCallback(() => startTransition(() => void loadReport()), []);

  return (
    <div onPointerEnter={prefetch} onFocus={prefetch}>
      <Suspense fallback={<div className="skeleton h-64" aria-busy="true" aria-label="Loading report" />}>
        <ReportBoundary>
          <ReportEditor reportId={reportId} />
        </ReportBoundary>
      </Suspense>
    </div>
  );
}
```

Deferred rendering and heavy-library loading via IntersectionObserver:
```tsx
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Deferred({ children, minHeight = 240, rootMargin = "200px" }: {
  children: ReactNode; minHeight?: number; rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || shown) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, rootMargin]);

  // The reserved box keeps layout stable before the real content arrives
  return (
    <div ref={ref} style={shown ? undefined : { minHeight }}>
      {shown ? children : null}
    </div>
  );
}

export function RichTextViewer({ doc }: { doc: Doc }) {
  const [Viewer, setViewer] = useState<null | typeof import("./Viewer")>(null);
  useEffect(() => { void import("./Viewer").then((m) => setViewer(() => m.default)); }, []);
  return Viewer ? <Viewer doc={doc} /> : <p className="skeleton h-64" aria-busy="true" />;
}
```

CSS-only deferral plus explicit chunk hints in the document head:
```css
/* Long article or virtualised list: no JS, no layout thrash */
.feed-item {
  content-visibility: auto;
  contain-intrinsic-size: auto 320px; /* reserve a realistic placeholder */
}
```

```html
<!-- Hints for the chunks the landing page will definitely need -->
<link rel="preconnect" href="https://cdn.example.com" crossorigin />
<link rel="modulepreload" href="/assets/ReportEditor-Cq3x1a.js" />
<link rel="dns-prefetch" href="https://analytics.example.com" />
```

## Checklist

- [ ] Initial JS per route is measured from a production build and a budget is enforced in CI.
- [ ] Route-level splitting is in place for every non-initial route.
- [ ] Heavy libraries are loaded with dynamic `import()` at point of use, never at module scope.
- [ ] Every `React.lazy` component sits inside `Suspense` and an error boundary with a retry.
- [ ] Prefetch fires on hover/focus so navigation is warm before the click.
- [ ] Below-the-fold embeds and widgets render through `IntersectionObserver` with a reserved box.
- [ ] Long lists use `content-visibility: auto` with `contain-intrinsic-size`.
- [ ] Build output is checked to confirm chunks were actually emitted, not silently inlined.

## Anti-patterns

**Lazy-loading the hero or primary CTA.** The thing the user came for is now behind a spinner, so perceived performance gets worse while the bundle shrinks. Fix: keep the primary content in the initial chunk and lazy-load only secondary surfaces.

**One giant `Suspense` around the whole page.** Every lazy component then shares one fallback, so opening a modal blanks the entire page. Fix: wrap each deferred region individually and reserve space for each.

**Splitting without verifying the build.** A dependency resolved only under the bundler's dev condition can break silently once chunked, showing up as a production-only error. Fix: smoke-test every route after a production build in CI.