---
name: web-vitals-remediation
description: Diagnoses and fixes LCP, INP, and CLS regressions using the `web-vitals` attribution build, real-user monitoring, and field-versus-lab comparison. Use when Core Web Vitals scores drop, Lighthouse flags LCP/CLS/TBT, or users report a page that "feels slow" to interact with.
---

# Web Vitals Remediation

**Use when:** Core Web Vitals scores regress, Lighthouse flags LCP, CLS, or TBT, or users describe a page as sluggish to interact with.
**Do not use when:** the bottleneck is a single known asset — use `image-optimization`, `font-loading`, or `critical-css` directly; for render-blocking analysis in depth use `bundle-size-triage`.

## Instructions

1. Start from field data, not Lighthouse. Lighthouse is a lab diagnostic; the score users see is the 75th percentile of real sessions (CrUX or your own RUM).
2. Install `web-vitals` v5 with the attribution build (`web-vitals/attribution`) so every metric reports the element and breakdown that caused it, then send it to your RUM endpoint.
3. Establish the threshold contract: LCP 2.5s, INP 200ms, CLS 0.1 at p75, evaluated over 28-day windows. A single bad session is noise.
4. Diagnose LCP from the attribution payload. It breaks into TTFB, resource load delay, resource load duration, and element render delay; fix the largest contributor first.
5. Diagnose CLS from `largestShiftTarget` plus the `layoutShift` entries. Treat the value as a p75 problem: only shifts affecting many sessions matter, not the worst single trace.
6. Diagnose INP from `longAnimationFrameTiming` / interaction attribution. Break the work into small tasks, move computation off the main thread, and yield during long handlers.
7. Reproduce in the lab under throttling (4x CPU, Slow 4G) so fixes can be verified quickly, then confirm the improvement in field data before shipping.
8. Never "fix" a metric by hiding it: do not add `content-visibility` that hides the hero, or defer the LCP element behind a spinner. That moves the number, not the experience.
9. Segment RUM by device class, route, and connection type. Averages hide that one route on mid-tier Android owns most of the INP problem.
10. Add regression gates in CI: Lighthouse budgets in a Playwright job plus an RUM alert keyed to p75, so a regression fails fast instead of at the next quarterly review.

## Patterns

Attribution-based collection sent to a RUM endpoint:
```ts
// lib/vitals.ts
import { onCLS, onINP, onLCP, onFCP, onTTFB } from "web-vitals/attribution";

type Payload = Record<string, unknown>;

function send(metric: { name: string; value: number; id: string }) {
  const body: Payload = {
    name: metric.name,
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    id: metric.id,
    path: location.pathname,
    device: navigator.hardwareConcurrency <= 4 ? "low" : "high",
    connection: (navigator as { connection?: { effectiveType: string } }).connection?.effectiveType,
  };
  // sendBeacon survives unload; keepalive is the fetch fallback
  if (navigator.sendBeacon) navigator.sendBeacon("/api/vitals", new Blob([JSON.stringify(body)], { type: "application/json" }));
}

const report = { reportAllChanges: true };
onLCP(send, report);
onCLS(send, report);
onINP(send, report);
onFCP(send, report);
onTTFB(send, report);
```

Interpreting the attribution payloads and the matching fix:
```ts
// LCP: fix the biggest contributor first
// resourceLoadDelay dominant   -> preload/priority the element's image or font
// resourceLoadDuration        -> shrink and re-encode the asset
// elementRenderDelay          -> the resource finished but rendering was blocked:
//                                 long tasks, client-only data, or late CSS
// ttfb                        -> server/CDN work, not a front-end fix

// CLS: layoutShift.sources[].node is the element that moved.
// Shift immediately after data arrives -> reserve space with aspect-ratio/min-height.
// Shift on scroll trigger           -> anchor the sticky/fixed element instead.

// INP: the interaction's longest task dominates. Break it up.
document.querySelector("#checkout")?.addEventListener("click", async (event) => {
  const button = (event.target as HTMLElement).closest("button");
  if (button) button.setAttribute("aria-busy", "true");
  await scheduler.yield();          // let the browser paint the pressed state
  const total = computeTotalsSync(); // small, synchronous, chunked work
  await scheduler.postTask(() => renderTotals(total), { priority: "user-visible" });
});
```

Verifying the fix in the lab, with the shift sources printed:
```js
// Run after load to list what actually shifted and why
for (const entry of performance.getEntriesByType("layout-shift")) {
  if (entry.hadRecentInput) continue;
  for (const source of entry.sources ?? []) {
    console.warn("shifted", source.node?.tagName, source.node?.className, source.previousRect, source.currentRect);
  }
}

// Long tasks blocking input
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) console.warn("long task", entry.duration, entry.attribution?.[0]?.name);
}).observe({ type: "longtask", buffered: true });
```

## Checklist

- [ ] Field data (CrUX or RUM) p75 is the source of truth; Lighthouse used only for diagnosis.
- [ ] `web-vitals/attribution` is installed so LCP/CLS/INP carry element-level attribution.
- [ ] Metrics are segmented by route, device class, and effective connection type.
- [ ] The LCP breakdown (TTFB, load delay, load duration, render delay) is recorded per route.
- [ ] CLS sources identified by element; space reserved for every dynamic region.
- [ ] INP attributed to specific interaction tasks, which are now chunked or off-thread.
- [ ] Fixes verified under CPU/network throttling before shipping.
- [ ] CI has a Lighthouse budget job and a p75 alert configured for regressions.

## Anti-patterns

**Optimising against a single Lighthouse run.** Lab runs are noisy and use one device class; a passing local score says nothing about the p75 of real traffic. Fix: treat Lighthouse as a reproduction harness and gate on field p75.

**Hiding the LCP element behind a skeleton.** The metric improves because the element is never observed as an LCP candidate, while the user sees a placeholder instead of content. Fix: shorten the render delay so the real element paints sooner.