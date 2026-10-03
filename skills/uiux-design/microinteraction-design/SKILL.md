---
name: microinteraction-design
description: Designs microinteractions — press, hover, toggle, load, success, and undo feedback — as explicit state machines with timing budgets and truthful progress reporting. Use when refining button and toggle behavior, communicating async results, or making destructive actions reversible.
---

# Microinteraction Design

**Use when:** you are specifying the feedback a control gives in under a second, communicating the result of an async action, or making a destructive action recoverable.
**Do not use when:** you are defining motion curves and durations for larger transitions, which is `motion-principles`.

## Instructions

1. Write every microinteraction as a state machine with named states and explicit triggers. A microinteraction without a named end state cannot be tested and cannot be described to an engineer.
2. Close the loop within 100 ms for any direct manipulation. Press, release, and the resulting state change must feel like one event; any delay reads as lag or as an unacknowledged click.
3. Design the press state as distinct from hover. Hover is exploratory and soft; press is committed and immediate. Users need to feel that the surface accepted the input.
4. Use truthful progress. Under 100 ms show nothing, 100-300 ms show an inline indicator only if the action has a visible outcome, and over 1 s show determinate progress when available or an honest indeterminate indicator when not. Never fake a percentage.
5. Guard every async trigger against re-entry. Disable the control on submit, set `aria-disabled`, and check a pending flag in the handler — a double-click must not create two records.
6. Make destructive actions reversible by default. Prefer a snackbar with a 6-8 second undo over a confirmation dialog; reserve confirmation for irreversible or high-cost operations.
7. Announce results to assistive technology at the right urgency: `role="status"` for success and progress, `role="alert"` for errors and time-sensitive warnings. An unannounced change is invisible to screen reader users.
8. Do not remove the triggering element mid-animation. If content must collapse, measure first and animate to the new height, or swap instantly after reserving space.
9. Keep the feedback near the action. Toasts for a field-level error are invisible; inline messages beside the field are the right altitude.
10. Test with a throttled connection (Slow 3G) and with a keyboard only. Microinteractions are where pointer-only assumptions surface.

## Patterns

State machine spec for a toggle with async persistence:

```markdown
COMPONENT  notification-toggle
STATES     off | on | saving | on-error | disabled
TRIGGERS   click / Enter / Space     (button role, not checkbox, when async)
  off      -> saving      on input,    0ms    optimistic visual switch
  saving   -> on          on 200 OK,   0ms    aria-busy=true during
  saving   -> on-error    on failure, 0ms    reverts visual, announces reason
  any      -> disabled    when !canEdit (permissions)
TIMING     switch thumb 120ms ease-standard; color 100ms linear
ARIA       aria-pressed="true|false", aria-busy during save, name "Email notifications"
RE-ENTRY   if (pending) return;   // in the handler, not just the UI
BLOCKING   nothing is disabled while saving, because the action is reversible
```

Feedback altitude table — match the feedback to the scope of the change:

```markdown
SCOPE              FEEDBACK                     ALTITUDE     ANNOUNCEMENT
Field value        inline message next to field  inline      aria-describedby
Row action         row updates, icon tick       row         role=status once
Screen action      toast with optional undo     page        role=status
Destructive        snackbar + Undo 6s           page        role=status, assertive on undo fail
App-wide failure   persistent alert banner      page        role=alert
```

Optimistic toggle with real rollback:

```tsx
export function NotificationToggle({ enabled, onChange }: Props) {
  const [pending, setPending] = useState(false);
  async function toggle() {
    if (pending) return;
    setPending(true);
    try {
      await onChange(!enabled);
    } catch { /* revert visual state to `enabled` and announce the reason */ }
    finally { setPending(false); }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-busy={pending}
      className="toggle"
      data-state={pending ? "saving" : enabled ? "on" : "off"}
    >
      <span className="toggle__thumb" aria-hidden="true" />
      Email notifications
    </button>
  );
}
```

Snackbar with undo and correct live-region wiring:

```html
<div class="snackbar" role="status" aria-live="polite" aria-atomic="true">
  <span>Invoice #1042 archived.</span>
  <button type="button" id="undo-archive">Undo</button>
  <button type="button" aria-label="Dismiss notification">×</button>
</div>
<style>
  /* keyboard users must be able to reach Undo without hunting for a live region */
  .snackbar:has(button:focus-visible) { outline: 2px solid var(--focus); }
</style>
```

Truthful progress thresholds:

```markdown
< 100ms   render nothing; the action already completed
100-300ms inline spinner inside the control, label unchanged or "Saving..."
> 1s      determinate bar when the server can report progress
          otherwise indeterminate bar + elapsed seconds, never a fabricated %
failure   always announce cause + next action: "Couldn't save. Retry" / "Check your connection."
```

## Checklist

- [ ] Every microinteraction written as a state machine with named end states
- [ ] Direct manipulation feedback closes inside 100 ms
- [ ] Press state visually distinct from hover
- [ ] Progress is truthful and thresholds of 100 ms / 300 ms / 1 s respected
- [ ] Async triggers guarded against re-entry in the handler, not only in the UI
- [ ] Destructive actions offer undo unless genuinely irreversible
- [ ] Results announced with `role="status"` or `role="alert"`, at the action's altitude
- [ ] Verified on throttled connection and with keyboard only

## Anti-patterns

**Confirm-everything.** A modal for every delete, even for removing a filter chip. Users stop reading confirmations, which is how a real destructive action gets waved through. Fix: snackbar with undo for reversible actions; confirmation only for irreversible or expensive ones.

**Fake progress.** An indeterminate spinner that resolves in 40 ms, or a progress bar that jumps to 90% and stalls. Users interpret both as broken. Fix: match the indicator to the actual duration band, and never fabricate determinate percentages.

**Silent success.** A mutation resolves and nothing changes on screen. Users click again, creating duplicates. Fix: always give a visible confirmation, even if it is a 120 ms icon state, plus a live-region announcement.

**Removed trigger mid-animation.** The row vanishes at once and the list jumps, so the user loses their place. Fix: animate the collapse from measured height, or defer removal until the exit transition ends.

**Pointer-only feedback.** Press states that only exist under `:hover`. Keyboard and touch users get no acknowledgement at all. Fix: specify press, focus-visible, and active states separately and implement all three.
