---
name: error-message-design
description: Writes and places error messages that state what happened, why, and how to recover, using inline validation, error summaries, preserved input, and appropriate live-region urgency. Use when rewriting vague validation errors, choosing between inline and toast errors, or when forms fail users at submission.
---

# Error Message Design

**Use when:** validation copy is vague or technical, errors are only shown after submission, or users cannot tell what to do next after something fails.
**Do not use when:** the problem is the absence of content rather than an error, which is `empty-state-design`.

## Instructions

1. Write every message with four parts: **what happened**, **why it happened**, and **what to do next**. Cut the fourth part only when there is genuinely no user action.
2. Say what the user did, not what the system did. "Invoice number is required" becomes "Add an invoice number so we can find the matching record."
3. Never show a code, stack fragment, or database name. Map internal errors to human causes: a `409` becomes "Someone else edited this invoice while you were working. Reload to see their changes."
4. Validate on blur for format-level problems and on submit for completeness and business rules. Validating every keystroke punishes people mid-word and re-announces constantly.
5. Do not clear or reset input on error. Preserve everything the user typed, mark only the invalid fields, and move focus to the first invalid field.
6. Use inline messages beside the field for field errors, an error summary at the top of long forms that links to each field, and a toast only for transient page-level failures.
7. Choose live-region urgency correctly. `role="alert"` (assertive) interrupts for errors and time-sensitive warnings; `role="status"` (polite) for success, progress, and non-urgent results. Never make a success message assertive.
8. Deduplicate announcements: after correcting a field, clear its error and announce the result politely rather than leaving a stale failure state on screen.
9. Keep the error visible until resolved or until the user takes a meaningful action. Do not auto-dismiss validation errors on a timer.
10. Write the messages before the UI and put them in a content file reviewed by support, so the same failure does not produce five different strings across surfaces.

## Patterns

Message formula applied to real cases:

```markdown
TEMPLATE  <what happened>. <why>. <what to do next, as an imperative.>

FORMAT     "Invalid email"
        -> "That email address is missing an @. Example: name@company.com"

UNIQUE     "Duplicate key value violates unique constraint"
        -> "Invoice INV-1042 already exists. Open it instead, or use a
            different number."

EXPIRED    "Session expired"
        -> "You were signed out after 30 minutes of inactivity. Your draft was
            saved. Sign in to keep going."

PERMISSION "403 Forbidden"
        -> "You need the Billing Admin role to change payment terms.
            Ask an admin, or request access below."

NETWORK    "Failed to fetch"
        -> "We couldn't reach the server. Your entries are saved here.
            Check your connection and try again."
```

Inline field error with preserved input and programmatic association:

```html
<label for="email">Work email</label>
<input
  id="email" name="email" type="email" autocomplete="email"
  aria-invalid="true"
  aria-describedby="email-error"
  value="name@comp">
<p id="email-error" class="field-error">
  <svg aria-hidden="true" viewBox="0 0 16 16"><!-- exclamation triangle --></svg>
  That email address is missing an @. Example: name@company.com
</p>
```

Error summary with links, for long forms:

```html
<form novalidate>
  <div class="error-summary" role="alert" tabindex="-1" id="error-summary">
    <h2>There are 2 problems</h2>
    <ul>
      <li><a href="#email">That email address is missing an @</a></li>
      <li><a href="#terms">Payment terms can be 0 to 90 days</a></li>
    </ul>
  </div>
  <!-- fields below, each with its own inline message -->
</form>
<script type="module">
  const summary = document.getElementById('error-summary');
  document.getElementById('checkout-form').addEventListener('submit', (e) => {
    if (e.currentTarget.checkValidity()) return;
    e.preventDefault();
    summary.querySelector('h2').textContent =
      `There are ${e.currentTarget.querySelectorAll(':invalid').length} problems`;
    summary.focus();   // move focus once; do not trap
  });
</script>
```

Error presentation by scope and the CSS a team needs for the inline case:

```markdown
SCOPE            PLACEMENT                 ANNOUNCEMENT
one field        inline, beside the field  aria-describedby on the field
form, <=5 fields inline only                none beyond aria-describedby
form, >5 fields  summary + inline          role="alert" on the summary
async page action toast with [Retry]        role="status" (polite)
blocking failure persistent alert banner   role="alert" (assertive)
destructive undo failed                    role="alert" + keep the item
```

```css
.field-error { color: var(--text-danger); font-size: var(--step--1); margin-block-start: var(--space-1); }
.field-error svg { fill: currentColor; vertical-align: -0.1em; margin-inline-end: 0.25em; }
.field input[aria-invalid="true"] { border-color: var(--border-danger); } /* never colour alone */
```

## Checklist

- [ ] Every message states what happened, why, and the next action
- [ ] Messages describe the user's action, not the system's internals
- [ ] No error codes, stack fragments, or storage names in user-facing copy
- [ ] Format validated on blur, completeness and business rules on submit
- [ ] Input preserved on error; only invalid fields marked
- [ ] Focus moves to the first invalid field, or to an error summary with links
- [ ] Live-region urgency matches: alert for errors, status for success and progress
- [ ] Errors persist until resolved, never on a timer

## Anti-patterns

**Generic failure text.** "Something went wrong." or "Invalid input." The user cannot act on it, so they either retry blindly or abandon. Fix: name the specific problem and the specific next step.

**Toast-only errors.** A message that appears for four seconds and disappears, taking the user's only copy of what went wrong with it. Fix: inline messages beside the field for anything the user must act on; toasts only for transient page-level results.

**Clearing the form on error.** Fields reset after a failed submit, so the user retypes everything. Fix: preserve all values and only re-render the validation state.

**Shouting.** All caps, red text, an icon, and a shake animation. It signals an error but does not explain one, and the redundancy adds noise for screen reader users. Fix: one icon, one sentence, one clear remedy.

**Validating on every keystroke.** An error appears while someone types their email address, at "n". Fix: validate format on blur, validate completeness on submit, and never re-announce a resolved error aggressively.
