---
name: css-animations
description: Animates interfaces with compositor-friendly properties, `prefers-reduced-motion` fallbacks, View Transitions, and scroll-driven animations. Use when adding motion to dialogs, lists, page navigations, or progress indicators, or when fixing janky animations and users reporting motion sickness.
---

# CSS Animations

**Use when:** adding motion to dialogs, menus, list reordering, page transitions, or scroll effects, or when existing animation stutters on mid-range hardware.
**Do not use when:** the animation needs to respond to runtime state that CSS cannot express — use the Web Animations API or a library; for view-size responsiveness use `responsive-layouts`.

## Instructions

1. Animate only `transform`, `opacity`, and `filter`. Animating `width`, `height`, `top`, `margin`, or `box-shadow` forces layout or paint on every frame and drops frames.
2. Use `transition` for state changes triggered by user action (hover, focus, open/closed) and `@keyframes` for autonomous or multi-step sequences. Do not animate everything with keyframes.
3. Set explicit durations and a single easing token per intent: `--dur-fast: 120ms` for feedback, `--dur-slow: 280ms` for entrances, `--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)`.
4. Honour `prefers-reduced-motion: reduce` in one global block that collapses duration and disables non-essential motion — never per component.
5. Never animate an element on page load unless it is above the fold; entrance animations delay LCP and hurt perceived performance.
6. Use `will-change` only immediately before the animation and remove it afterwards; a permanent `will-change` creates extra compositor layers that consume memory.
7. For route changes, use the View Transitions API with a `view-transition-name` per participating element, and keep the transition under 400ms.
8. Use scroll-driven animations (`animation-timeline: view()` / `scroll()`) for progress and reveal effects — they run on the compositor with no scroll listeners and no JavaScript.
9. Prevent layout thrash: never read layout properties (`offsetHeight`, `getBoundingClientRect`) inside a `requestAnimationFrame` loop that also writes styles.
10. Verify on a throttled CPU (DevTools Performance with 4x slowdown) and confirm no long tasks appear during the animation.

## Patterns

Motion tokens plus one global reduced-motion override:
```css
:root {
  --dur-fast: 120ms;
  --dur-slow: 280ms;
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --shadow-lift: 0 8px 24px rgb(0 0 0 / 0.12);
}

/* Transitions for state changes */
.card { transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out); }
.card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lift); }

/* Keyframes for autonomous sequences */
@keyframes fade-rise {
  from { opacity: 0; transform: translateY(0.5rem); }
  to { opacity: 1; transform: none; }
}
.drawer { animation: fade-rise var(--dur-slow) var(--ease-out) both; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
  /* Keep meaning: show the final state instead of hiding the change */
  .drawer { opacity: 1; transform: none; }
}
```

View transition for a route change, with per-element names:
```css
@view-transition { navigation: auto; } /* same-document and cross-document */

.card { view-transition-name: card; }          /* must be unique per rendered element */
.drawer { view-transition-name: drawer; }

::view-transition-old(root) { animation: fade-out 150ms var(--ease-out) both; }
::view-transition-new(root) { animation: fade-in 200ms var(--ease-out) 50ms both; }

@keyframes fade-out { to { opacity: 0; } }
@keyframes fade-in { from { opacity: 0; } }
```
```js
// Fallback and reduced-motion handling
if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='/']");
    if (!link || event.metaKey || link.target === "_blank") return;
    event.preventDefault();
    document.startViewTransition(async () => {
      const html = await (await fetch(link.href)).text();
      document.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML;
      history.pushState({}, "", link.href);
    });
  });
}
```

Scroll-driven progress bar with no JavaScript listeners:
```css
.progress {
  position: sticky;
  top: 0;
  block-size: 3px;
  transform-origin: left;
  scale: 0 1; /* animating `scale` keeps it off layout */
}

@supports (animation-timeline: scroll()) {
  .progress {
    animation: grow linear both;
    animation-timeline: scroll(root block);
  }
  @keyframes grow { from { scale: 0 1; } to { scale: 1 1; } }

  /* Reveal-on-enter driven by the element's own visibility */
  .reveal { animation: fade-rise linear both; animation-timeline: view(); animation-range: entry 0% cover 30%; }
}
```

## Checklist

- [ ] Only `transform`, `opacity`, `filter`, and `clip-path` are animated.
- [ ] Durations and easings come from shared tokens; no ad-hoc `0.3s ease` values.
- [ ] A single global `prefers-reduced-motion` block collapses all motion.
- [ ] Entrance animations never gate above-the-fold content.
- [ ] `will-change` is applied before and removed after each animation.
- [ ] View transitions declare unique `view-transition-name` values per element.
- [ ] Scroll effects use `animation-timeline` rather than scroll listeners.
- [ ] Animation verified with CPU throttling and no long tasks in the Performance trace.

## Anti-patterns

**Animating `height`, `top`, or `margin`.** Each frame triggers layout for the whole subtree, so a 300ms menu animation blocks the main thread and shows visible jank on mid-range phones. Fix: animate `transform: scaleY()` or `translateY()` on a fixed-height wrapper, or use `grid-template-rows: 0fr` only as a last resort.

**Permanent `will-change: transform`.** Every promoted element consumes GPU memory for the page's lifetime; on a long list this crashes low-end mobile browsers. Fix: add `will-change` immediately before the animation and remove it on `animationend`.

**Ignoring `prefers-reduced-motion`.** Vestibular disorders make large motion genuinely painful, and it is an accessibility requirement, not a preference. Fix: the global reduced-motion block plus a JS guard before calling `startViewTransition`.