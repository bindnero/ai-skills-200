---
name: motion-principles
description: Defines motion as duration, easing, and choreography rules with reduced-motion fallbacks and interruptible transitions. Use when adding transitions or animations, standardizing easing curves and timing tokens, or when UI motion triggers vestibular discomfort.
---

# Motion Principles

**Use when:** you are adding or standardizing transitions and animations, defining timing tokens, or fixing UI motion that makes users uncomfortable or slow.
**Do not use when:** you are designing the feedback behavior of a single control, which is `microinteraction-design`.

## Instructions

1. Motion must communicate state change, hierarchy, or spatial relationship. If it decorates only, remove it — gratuitous animation taxes attention on every run.
2. Set duration by distance and size. Small elements move in 100-200 ms, medium in 200-300 ms, full-screen surfaces in 300-500 ms. Anything above 500 ms feels broken unless it is a deliberate loading sequence.
3. Define a small set of easing curves as tokens and use them consistently: standard for on-screen transitions, entrance for appearing elements, exit for leaving elements, and a spring or emphasized curve for user-initiated responses.
4. Asymmetric timing reads better than symmetric. Elements that are entering can be slightly quicker than elements leaving, because the entering element is what the user is waiting on.
5. Animate only `transform` and `opacity` where possible. Animating `width`, `height`, `top`, or `box-shadow` forces layout or paint on every frame and drops frames on low-end devices.
6. Make every transition interruptible. Retargeting mid-flight should blend from the current computed value, and a new user input must never be queued behind a running animation.
7. Honor `prefers-reduced-motion: reduce` at the global level by default. Replace movement with a cross-fade or an instant state change, and never remove the state change itself — only the travel.
8. Keep motion within the component's own bounds where possible. Animations that move unrelated layout regions cause reflow of everything around them.
9. Never auto-play looping or attention-seeking motion for more than 5 seconds, and always provide a pause control for anything that does.
10. Verify with a CPU throttle in devtools and with the OS "reduce motion" setting on; a transition that only performs at 60 fps on a workstation will stutter on a mid-range phone.

## Patterns

Timing and easing tokens:

```css
:root {
  --dur-instant:  100ms;   /* color, opacity, focus ring   */
  --dur-fast:     180ms;   /* small: icon, checkbox, chip  */
  --dur-base:     240ms;   /* medium: dropdown, card lift  */
  --dur-slow:     360ms;   /* large: sheet, drawer, dialog */

  --ease-standard:  cubic-bezier(0.2, 0, 0, 1);      /* on-screen, default   */
  --ease-entrance:  cubic-bezier(0, 0, 0, 1);        /* appearing: fast out */
  --ease-exit:      cubic-bezier(0.3, 0, 1, 1);      /* leaving: fast in    */
  --ease-emphasis:  cubic-bezier(0.2, 0, 0, 1.05);   /* user-initiated pop  */
}
```

Motion that respects reduced-motion globally:

```css
@media (prefers-reduced-motion: no-preference) {
  .sheet {
    transition: transform var(--dur-base) var(--ease-entrance),
                opacity   var(--dur-fast) var(--ease-standard);
  }
  .toast { animation: toast-in var(--dur-base) var(--ease-entrance); }
  @keyframes toast-in {
    from { opacity: 0; transform: translateY(0.5rem); }
    to   { opacity: 1; transform: none; }
  }
}

/* Reduced motion: state change preserved, travel removed. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .sheet { transform: none; opacity: 1; }
}
```

Choreography spec, written before code:

```markdown
TRANSITION  open-detail-sheet
  from     row (grid position)  to  sheet (overlay)
  duration 360ms sheet, 180ms scrim fade
  easing   sheet ease-entrance, scrim ease-standard
  stagger  none - sequential attention costs more than it clarifies
  origin   transform-origin: top center (anchored to the trigger row)
  exit     240ms ease-exit, transform to 8px + opacity 0
  interrupt pressing Escape mid-open -> retarget to closed from current value
  reduced-motion -> opacity 0->1 over 100ms, no translate
```

List reordering without layout thrash:

```css
.list-item {
  transition: transform var(--dur-base) var(--ease-standard);
}
.list-item[data-moving="up"]   { --dy: -1; }
.list-item[data-moving="down"] { --dy: 1; }
.list-item[data-moving] { transform: translateY(calc(var(--dy) * var(--row-gap, 2.5rem))); }
@media (prefers-reduced-motion: reduce) { .list-item { transform: none; } }
```

## Checklist

- [ ] Every animation communicates state change, hierarchy, or spatial relation
- [ ] Durations fall in the 100-500 ms band and match element size
- [ ] Four easing curves defined as tokens and used consistently
- [ ] Only `transform` and `opacity` animated on hot paths
- [ ] Transitions interruptible; new input never queues behind running motion
- [ ] `prefers-reduced-motion: reduce` removes travel while keeping the state change
- [ ] No looping or attention-seeking motion without a pause control
- [ ] Verified with CPU throttling and with the OS reduce-motion setting enabled

## Anti-patterns

**Decorative motion.** Fade-ins on every card on page load. Users pay the cost on every visit and learn to ignore all animation. Fix: keep motion for state changes and spatial continuity; delete everything else.

**Animating layout properties.** Transitioning `height` or `top` on a dropdown forces layout each frame and janks on scroll. Fix: animate `transform` and `opacity`, or use the modern `calc-size()` and `interpolate-size` techniques where a true size transition is required.

**Ignoring reduced motion.** Vestibular triggers include parallax, large translations, and zoom. Fix: implement the reduced-motion branch at the same time as the animation, never as a later patch.

**Blocking input during animation.** A modal that scales in over 400 ms with a backdrop already intercepting clicks; a double-submit happens. Fix: either delay the backdrop's pointer-events until the end, or accept input immediately and let the animation catch up.

**Inconsistent timing.** 150 ms here, 800 ms there, with no tokens. Motion reads as unprofessional even when each animation is individually fine. Fix: three or four duration tokens and four easing tokens, enforced in review.
