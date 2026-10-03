---
name: interaction-design
description: Specifies interactive component behavior across the full state surface — hover, focus-visible, active, loading, disabled, error, and optimistic transitions — plus the edge-case logic of a flow. Use when writing a component spec, defining transitions between states, or when a flow breaks anywhere outside the happy path.
---

# Interaction Design

**Use when:** you are specifying what a component or flow does in response to input, and need the complete state matrix rather than a static mock.
**Do not use when:** you are fixing a contrast value, spacing token, or focus ring measurement — use `color-contrast`, `spacing-and-grid`, or `keyboard-navigation`.

## Instructions

1. Enumerate states before drawing: default, hover, focus-visible, active, selected, disabled, read-only, loading, error, and success — plus every state combination the component can actually reach. Anything reachable must be designed.
2. Define transitions as state changes with preconditions, not as decoration. Write `from -> to, when, duration, easing, what is interruptible`.
3. Specify input handling for pointer, keyboard, touch, and assistive tech as a first-class requirement. A behavior that works only with a mouse is not a behavior.
4. Set the response-time budget per interaction type: under 100 ms feels instant, 100-300 ms acknowledges and connects the cause, over 1 s needs a progress indicator. Never leave a gap unaccounted for.
5. Make slow operations interruptible and honest. Disable the trigger to prevent double submission, then show progress; never let a user fire the same action twice.
6. Define the cancel and undo path for every destructive or long-running action. If neither exists, one must be designed — an irreversible action with no recovery is an interaction defect.
7. Decide the precedence when states collide. Focus-visible over hover, disabled over active, loading over enabled. Write the precedence order explicitly rather than letting CSS specificity decide it.
8. Specify what moves and what stays still. Layout shift after an action destroys the user's spatial memory; reserve space for content that arrives late.
9. Set the gesture conflict policy: scroll versus swipe, drag versus scroll, double-click versus text selection. Declare which wins and how it is detected.
10. Specify every edge case in the flow: session expiry mid-edit, concurrent edit, offline, double submit, deep link into a completed step, and browser back after commit.

## Patterns

State matrix with transitions:

```markdown
COMPONENT  invoice-row
STATE      default | hover | focus-visible | selected | disabled | loading | error
TRIGGER    click / Enter / Space (buttons only)  — Space must not scroll: preventDefault
PRECONDITION loading blocks re-entry; disabled is set by permissions, not by emptiness
PRECEDENCE focus-visible > hover > active > default   (hover suppressed under pointer: coarse)
TIMING     hover 100ms ease-out / focus-visible instant (ring must be immediate)
            selected 150ms   / loading replaces content, keeps row height
INTERRUPT  hover while loading -> ignored; cancel during loading -> AbortController
SPACE      fixed 64px row height reserved so loading never reflows the list
```

Async action with honest progress and recovery:

```markdown
FLOW  export-report
  1 idle        -> [Export report]           enabled, aria not busy
  2 submitting  -> button disabled + aria-disabled, label "Exporting…", spinner inline
                  submit handler guards re-entry: if (pending) return
  3 success     -> role=status "Report ready. Download started." auto-dismiss 6s
                  [Undo unavailable] -> not destructive, so no undo needed
  4 failure     -> role=alert, "Export failed — you can retry, nothing was charged."
                  button returns to enabled; previous selections preserved
  5 network     -> timeout at 8s -> same as 4 with "Connection timed out."
RULE  never swap width on label change: min-inline-size reserves the longer string
```

State collision precedence in CSS:

```css
.action { background: var(--surface); }
@media (hover: hover) and (pointer: fine) {
  .action:hover:not(:disabled) { background: var(--surface-hover); }
}
.action:active:not(:disabled) { transform: translateY(1px); }
.action:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.action:disabled { background: var(--surface-disabled); cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) {
  .action { transition: none; }
  .action:active { transform: none; }
}
```

Edge-case checklist per flow:

```markdown
- session expires mid-form  -> save draft locally, re-auth inline, do not lose input
- concurrent edit            -> optimistic update + conflict banner with [Reload]
- double submit              -> idempotency key per intent, guard in handler
- back button after commit   -> history entry replaced, not pushed
- deep link to completed step-> route to next incomplete step with a toast
- offline                    -> queue or fail loudly; never pretend success
```

## Checklist

- [ ] Every reachable state listed, including combinations
- [ ] Each transition has a trigger, duration, easing, and interrupt rule
- [ ] Pointer, keyboard, touch, and assistive-tech paths all specified
- [ ] Response-time budget applied: under 100 ms, 100-300 ms, over 1 s
- [ ] State precedence written down explicitly, not left to CSS specificity
- [ ] Slow actions are guarded against re-entry and show progress
- [ ] Destructive and long-running actions have cancel or undo
- [ ] Async result layout space reserved so nothing shifts on completion

## Anti-patterns

**Hover-only affordance.** Content or actions reachable only on hover. Touch users and keyboard users never see it. Fix: reveal on hover for fine pointers only, and always expose the same affordance in the focus and touch states.

**Optimistic update without rollback.** The UI shows success instantly and never reconciles when the server rejects. Users act on state that is not real. Fix: define the optimistic path, the conflict path, and the revert path before shipping.

**Blocking modal for everything.** A modal for confirmations, for information, and for decisions of wildly different consequence. Modal fatigue means users click through the destructive one too. Fix: reserve modals for irreversible, context-switching decisions; use inline feedback for everything else.

**Layout shift on state change.** A spinner taller than the content, a label swap that widens the button, a card that grows when data arrives. Fix: reserve the max state size and animate only transform and opacity.

**Decoration without timing rules.** "Add a nice transition." Without a duration and easing it lands either instantly (reads as a glitch) or slowly (reads as lag). Fix: specify ms and a named curve for every transition.
