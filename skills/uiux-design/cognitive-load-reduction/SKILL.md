---
name: cognitive-load-reduction
description: Reduces cognitive load by chunking work, applying progressive disclosure, matching controls to user mental models, and removing unnecessary decisions. Use when a flow has too many steps or simultaneous choices, when settings and forms overwhelm users, or when users abandon mid-task.
---

# Cognitive Load Reduction

**Use when:** a flow asks for too many decisions at once, users abandon partway through, or a settings or form screen is dense enough that people cannot find the control they need.
**Do not use when:** the interface is simple but the wording is unclear, which is `voice-and-tone`, or when the problem is a missing state, which is `empty-state-design`.

## Instructions

1. Identify the load type before redesigning. **Intrinsic** load is inherent to the task and cannot be removed; **extraneous** load comes from your interface; **germane** load is effort invested in learning the domain. Only extraneous load is design's job.
2. Count the decisions on the screen, not the fields. A form with 20 inputs and 4 choices is 24 decisions; users remember the choices, not the boxes.
3. Chunk long flows into steps of roughly 5-7 items, each with a visible progress indicator and a review step before commit. The chunk boundary should follow a natural task boundary, not an arbitrary count.
4. Apply progressive disclosure: show the common path, reveal advanced options behind an explicit, labeled control that states what is inside ("Advanced tax options"). Never hide required information behind a disclosure.
5. Apply progressive completion: make saving automatic and show a quiet confirmation, so nobody has to decide whether to press Save. Keep an explicit Save only where the user may want to review before committing.
6. Match controls to user mental models — the system's words and object model must be the user's words and object model. When the domain uses "invoice", do not label the field "billing document reference".
7. Set sensible defaults for every choice, chosen so the most common case needs no input at all. Defaults are decisions, so review them for fairness and document them.
8. Remove, do not hide. Every removed decision is a permanent load reduction; every hidden one is a permanent surprise. Delete features that serve fewer than a few percent of sessions.
9. Use recognition over recall: show recent values, previous entries, and the current selection rather than making users remember or retype.
10. Measure with funnel drop-off per step, per-field abandonment, and time-on-task. A load reduction is not demonstrated until a metric moves.

## Patterns

Decision inventory for a real form:

```markdown
STEP  Invoice details
  inputs       6   (invoice #, date, supplier, currency, terms, PO ref)
  choices      3   (currency dropdown, terms dropdown, "auto-post" toggle)
  DECISIONS     9   -> chunked as 3 steps of <=4 decisions below
  drop-off     31% after "terms"
  CAUSE        terms is a domain concept; the UI asked before it was needed
  FIX          move terms after the invoice is matched; default to the supplier's
                remembered terms and let the user override

CHUNKED FLOW
  1 Identify the invoice   [invoice #] -> [Find]        2 decisions
  2 Confirm the match      read-only summary, [Correct it]   1 decision
  3 Set terms and dates    terms (defaulted), due date   2 decisions
  4 Review and post        summary, [Post] with undo    1 decision
```

Progressive disclosure and completion:

```html
<form>
  <label for="supplier">Supplier</label>
  <input id="supplier" name="supplier" autocomplete="organization" required>

  <label for="terms">Payment terms</label>
  <select id="terms" name="terms">
    <option value="net30" selected>Net 30 (supplier default)</option>
    <option value="net60">Net 60</option>
  </select>

  <details>
    <summary>Advanced tax options</summary>
    <label for="tax-code">Tax code</label>
    <input id="tax-code" name="taxCode" value="STANDARD" autocomplete="off">
    <label><input type="checkbox" name="reverseCharge"> Reverse charge applies</label>
  </details>
</form>
```

Auto-save with a quiet, announced confirmation:

```html
<p role="status" aria-live="polite" class="autosave-status">All changes saved</p>
<script type="module">
  // Auto-save removes the decision "should I press Save?". 1000ms debounce,
  // never saved while a field is invalid.
  let timer;
  form.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!form.checkValidity()) return;
      await fetch('/draft', { method: 'PUT', body: new FormData(form) });
      status.textContent = `All changes saved at ${new Date().toLocaleTimeString()}`;
    }, 1000);
  });
</script>
```

Measurement that proves the reduction:

```markdown
METRIC                              BEFORE    AFTER     TARGET
steps in primary flow                  9        4      <=5
decisions per step (max)               9        4      <=5
fields with a working default          2/9     7/9     >=70%
completion rate, Step 1 -> post       62%      81%     +10pt
median time-on-task                  6m20     3m45     -30%
undo used after post                  3%       9%      monitor, not a goal
```

## Checklist

- [ ] Load classified as intrinsic, extraneous, or germane before redesign
- [ ] Decision count on each screen measured, not field count
- [ ] Flows chunked to at most 5-7 items with progress and a review step
- [ ] Advanced options behind labeled disclosure; required information never hidden inside one
- [ ] Saving automatic with a quiet live-region confirmation
- [ ] Defaults set for every choice, documented and reviewed for fairness
- [ ] Labels use the user's domain vocabulary, and recent values shown instead of re-entry
- [ ] Drop-off and time-on-task measured before and after

## Anti-patterns

**Hiding complexity instead of removing it.** Collapsing a hard decision behind "Advanced" pushes the cost onto exactly the users least equipped to pay it. Fix: remove what few users need, and split what many users need into sequential steps.

**Wizard with no progress indicator.** Four steps, no "step 2 of 4", no back link. Users cannot estimate the cost or go back. Fix: visible progress, a back control that preserves input, and a review step before commit.

**Save-button decision.** Requiring users to decide whether their work is safe, on every screen. Fix: auto-save with an announced status; keep explicit Save only for review-before-commit.

**Low-value defaults.** Defaulting a field to whatever is fastest for the company rather than what is most common for the user. Fix: choose defaults from frequency data, and surface an override.

**Progressive densification.** A settings page that adds options every quarter until it needs a search box. Fix: track option usage, retire what is unused, and move the long tail out of the primary view entirely.
