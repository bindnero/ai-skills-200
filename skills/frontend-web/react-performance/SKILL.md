---
name: react-performance
description: Profiles and eliminates wasted React renders with narrow subscriptions, split contexts, memo boundaries, `useDeferredValue`, and Server Components. Use when pages feel sluggish, React DevTools Profiler shows high commit counts, a `memo` fix did not work, or you need to break a render/update waterfall.
---

# React Performance

**Use when:** interactions feel slow, the React DevTools Profiler shows long or frequent commits, a `memo()` fix failed to help, or a Suspense waterfall stalls the first paint.
**Do not use when:** the slowness is network payload or image weight — use `bundle-size-triage` and `image-optimization`; for state placement decisions use `state-management`.

## Instructions

1. Measure before editing. Open React DevTools Profiler, enable "Record why each component rendered", and capture the interaction that hurts. Fix the component with the highest own-time and the widest subtree, not the first one you find.
2. Classify the cost: re-render (JS time), waterfall (network/await), or layout/paint. `memo` fixes only the first category.
3. Stop rendering work early. Wrap genuinely pure and expensive subtrees in `memo`/`useMemo` — but only after confirming they re-render with identical props in the profile.
4. Split context by update frequency. A context whose value object changes every render re-renders all consumers regardless of `memo`, so keep volatile state and stable dispatchers in separate providers.
5. Subscribe with selectors. Use `useSyncExternalStore` directly or a selector-based context hook (`use-context-selector`) instead of a whole-store context read.
6. Do not blanket-wrap. `useMemo`/`useCallback` have real allocation and dependency-array costs; measure that a wrapped tree renders fewer times and commits less total time.
7. Defer non-urgent updates: `useDeferredValue` for filters and search, `useTransition` for route/navigation state, so typing stays responsive.
8. Break waterfalls with Suspense and streaming. Start slow-but-unrelated data in parallel rather than awaiting it before rendering the shell; on the server, render Suspense boundaries so the shell flushes first.
9. Push work to the server with Server Components so it never enters the client bundle, and keep `"use client"` boundaries as low in the tree as possible.
10. Re-verify with the Profiler after each change and keep a Playwright trace of the interaction in CI so a regression is caught by numbers, not by feel.

## Patterns

Harness that turns "it feels slow" into a measurement:
```tsx
import { Profiler, type ProfilerOnRenderCallback } from "react";

const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration, interactions) => {
  if (actualDuration > 100 || interactions.length > 0) {
    console.info({ id, phase, actualDuration, baseDuration, interactions: interactions.map((i) => i.name) });
  }
};

// <Profiler id="Dashboard" onRender={onRender}>…</Profiler>
// baseDuration >> actualDuration => memoisation is working
// actualDuration high + wide subtree => the parent re-renders too much
```

Split context and select from it:
```tsx
import { createContext, useContext, useMemo, useState } from "react";
import { useContextSelector } from "use-context-selector";

type Store = { user: User | null; filters: Filters; setFilters: (f: Filters) => void };
const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ initial, children }: { initial: Store; children: React.ReactNode }) {
  const [filters, setFilters] = useState(initial.filters);
  const value = useMemo<Store>(() => ({ ...initial, filters, setFilters }), [initial, filters]);
  return <StoreContext value={value}>{children}</StoreContext>;
}

// Only re-renders when user changes, not when filters do
export function useUser() {
  return useContextSelector(StoreContext, (s) => s.user);
}
```

Defer the expensive derived list instead of blocking keystrokes:

```tsx
import { useDeferredValue, useMemo, useState } from "react";

export function ProductFilter({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query); // lags behind, never blocks input

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, deferredQuery]);

  return (
    <>
      <label htmlFor="q">Search</label>
      <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} />
      <p aria-live="polite">{visible.length} results</p>
      <ul>{visible.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
    </>
  );
}
```

Server Component boundary plus a streaming Suspense boundary that starts in parallel:
```tsx
// app/dashboard/page.tsx — a Server Component by default
import { Suspense } from "react";

export default function DashboardPage() {
  // Both promises start together; neither is awaited before the shell renders.
  const revenue = getRevenue();
  const orders = getRecentOrders();
  return (
    <main>
      <RevenueChart promise={revenue} />
      <Suspense fallback={<OrdersSkeleton />}>
        <RecentOrders promise={orders} />
      </Suspense>
    </main>
  );
}

async function RecentOrders({ promise }: { promise: Promise<Order[]> }) {
  const orders = await promise; // no "use client": zero client JS for this subtree
  return <ul>{orders.map((o) => <li key={o.id}>{o.reference}</li>)}</ul>;
}
```

## Checklist

- [ ] A Profiler recording exists for the slow interaction, with "why did this render" enabled.
- [ ] Every `memo`/`useMemo` maps to a measured reduction in commit time, not a guess.
- [ ] No context value object is rebuilt each render for consumers that read unrelated slices.
- [ ] Store/context reads use selectors; components subscribe to the narrowest slice.
- [ ] `useDeferredValue`/`useTransition` used for typing, filtering, and navigation state.
- [ ] Slow, independent requests start in parallel and render behind separate Suspense boundaries.
- [ ] `"use client"` appears only on the lowest interactive components.
- [ ] Profiler numbers or a Playwright trace for the key interaction are recorded in CI.

## Anti-patterns

**Blanket `useMemo`/`useCallback` everywhere.** Each hook allocates a dependency array and a closure, and `memo` on a component whose props include a new object or arrow function never hits, so the code gets slower with no benefit. Fix: memoise only measured hot paths, and check the props list in the Profiler "why did this render" reason.

**Passing an inline object or arrow function through `memo`.** `React.memo` does shallow comparison, so `<Row onSelect={() => go(id)} />` re-renders every time. Fix: pass a stable handler (module-level or `useCallback` with primitive deps) or pass the id and let the row call the store action itself.

**Awaiting everything before the first render.** Sequential `await a(); await b();` in a loader serialises independent round trips and dominates TTFB. Fix: start all promises first, then `await` them inside Suspense boundaries so the shell and the fast regions flush early.