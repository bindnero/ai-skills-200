---
name: input-event-throttling
description: Rate-limits high-frequency UI events with debounce, throttle, requestAnimationFrame batching, AbortController cancellation, and passive listeners. Use when typing or scrolling triggers network calls or heavy renders, when input feels laggy, or when keystroke handlers cause jank on low-end devices.
---

# Input Event Throttling

**Use when:** typing, scrolling, resizing, or dragging fires handlers that call a network endpoint or trigger heavy recomputation.
**Do not use when:** the cost is inside a single render pass rather than in event frequency - use `react-performance`; the layout is reflowing because of missing containment - use `responsive-layouts`.

## Instructions

1. Classify the event before choosing a mechanism. `input` and `keydown` are continuous, so debounce them; `scroll`, `resize`, and `mousemove` fire per frame, so throttle or sample them with `requestAnimationFrame`; discrete `click` and `submit` events need neither.
2. Debounce continuous input by the human typing cadence, 200-300 ms. Anything longer makes search feel unresponsive; anything shorter fires most keystrokes anyway.
3. Throttle frame-bound events to one call per frame rather than one per millisecond, and drop trailing calls unless the last value matters - a scroll position always does, a mousemove coordinate usually does not.
4. Always keep the newest value and discard the rest. A throttle that fires with a captured value renders stale positions and drags visibly behind the cursor.
5. Cancel the previous request, not just its response handler. `AbortController` is the mechanism; ignoring the abort error in the catch block stops an aborted request from turning into an unhandled rejection.
6. Handle IME composition. Debouncing during Japanese, Chinese, or Korean composition sends half-finished words; skip the handler while `isComposing` is true.
7. Attach scroll and touch listeners as passive unless the handler genuinely calls `preventDefault`, so the browser can keep scrolling on the compositor thread.
8. Separate the cheap path from the expensive one. The input value must update immediately for the field to feel responsive; only the derived work - search, validation against a server, chart recomputation - waits.
9. Guard against out-of-order responses. Even with cancellation, a slow response that was already in flight can land after a newer one; compare a request sequence number before applying the result.
10. Measure with the performance profile, not by feel. The goal is one network request per pause in typing and one style recalculation per frame, both verifiable in a trace.

## Patterns

Debounced search with cancellation and IME safety:

```ts
import { useEffect, useRef, useState } from "react";

export function SearchBox({ endpoint }: { endpoint: string }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const controller = useRef<AbortController | null>(null);
  const composing = useRef(false);
  const sequence = useRef(0);

  useEffect(() => {
    // A pause in typing, not a keystroke. Nothing runs while the user types on.
    const timer = setTimeout(async () => {
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      const seq = ++sequence.current;

      try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
        const data: Hit[] = await res.json();
        // Guard against a slow response landing after a newer one.
        if (seq === sequence.current) setResults(data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") throw err;
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [term, endpoint]);

  return (
    <>
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={(e) => {
          composing.current = false;
          setTerm((e.target as HTMLInputElement).value); // fire once, with the final text
        }}
      />
      <Results hits={results} />
    </>
  );
}
```

Frame-sampled scroll and resize, always reading the latest position:

```ts
// One callback per frame, and it reads position at call time rather than capturing it.
function onFrame(callback: () => void): () => void {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      callback();
    });
  };
}

const readPosition = onFrame(() => {
  const y = window.scrollY;                 // read now, not at bind time
  header.classList.toggle("is-stuck", y > 24);
  parallax.style.transform = `translate3d(0, ${y * 0.3}px, 0)`;
  if (y + window.innerHeight > document.body.offsetHeight - 600) loadNextPage();
});

window.addEventListener("scroll", readPosition, { passive: true });
window.addEventListener("resize", onFrame(() => reflowChart()), { passive: true });
```

Debounce versus throttle, chosen per event:

```ts
import { debounce, throttle } from "lodash-es";

const search = debounce((q: string) => fetchResults(q), 250);
const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Enter") search.flush();     // Enter skips the remaining wait
};

const reportScrollDepth = throttle((percent: number) => {
  analytics.send("scroll_depth", { percent });  // trailing call included
}, 1000, { trailing: true });

const trackCursor = throttle((x: number, y: number) => {
  cursorLayer.style.transform = `translate(${x}px, ${y}px)`;
}, 16, { trailing: false });                   // drop intermediate positions
```

## Checklist

- [ ] Mechanism matches the event: debounce for typing, throttle or rAF for frame-bound events
- [ ] Debounce interval between 200-300 ms, with a flush on Enter or submit
- [ ] Frame-bound handlers read the current value instead of capturing a stale one
- [ ] Previous request aborted with `AbortController`, abort errors handled
- [ ] IME composition state respected so half-finished words are never sent
- [ ] Scroll and touch listeners declared `passive: true` unless `preventDefault` is required
- [ ] Input value updates immediately; only derived work is delayed
- [ ] Response ordering guarded with a request sequence number
- [ ] Verified in a performance trace: one request per typing pause, one recalculation per frame

## Anti-patterns

**Debouncing with no cancellation.** Sending a request per keystroke and ignoring the ones still in flight produces out-of-order responses, so a slow early query overwrites a fast later one and the results flicker. Abort the previous request.

**Throttling with a captured value.** `throttle(() => update(window.scrollY), 100)` samples the position at bind time, so the UI updates to where the page used to be. Read the value inside the callback.

**Debouncing during IME composition.** Every composition keystroke schedules a new search, sending partial romanisation or partial kanji as the query. Skip the handler while composing.

**Debouncing the input itself.** Delaying `setState` on the field makes typing feel broken, because the value the user sees lags their hands. Update the field immediately and debounce only the expensive follow-up work.

**A timer with no teardown.** A debounce created during render and never cleared fires after unmount and keeps the closure alive. Return the cleanup from the effect, and flush on explicit user intent such as Enter.
