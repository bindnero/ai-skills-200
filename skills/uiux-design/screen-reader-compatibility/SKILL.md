---
name: screen-reader-compatibility
description: Verifies screen reader behavior across VoiceOver, NVDA, and TalkBack by tracing focus order, accessible names, roles, states, and live-region announcements. Use when a page is unusable with a screen reader, when building custom widgets, or before claiming accessibility conformance.
---

# Screen Reader Compatibility

**Use when:** a screen reader user cannot complete a flow, a custom widget announces incorrectly, or you need to verify behavior across VoiceOver, NVDA, and TalkBack before release.
**Do not use when:** the defect is visual or non-semantic — contrast, focus-ring visibility, or target size belong to `accessibility-audit`.

## Instructions

1. Test on all three engines before declaring success: VoiceOver with Safari on macOS and iOS, NVDA with Firefox and Chrome on Windows, and TalkBack with Chrome on Android. They differ in virtual-cursor behavior and verbosity, so passing on one proves little.
2. Every interactive element must have an accessible name from a visible label, `aria-label`, or `aria-labelledby`. Placeholder text is not a name — it disappears on input and fails 4.1.2.
3. Build custom widgets from the correct ARIA pattern with all required keyboard support, and verify the states are exposed: `aria-expanded`, `aria-selected`, `aria-checked`, `aria-current`, `aria-disabled`, `aria-invalid`.
4. Keep DOM order equal to visual and reading order. CSS `order`, absolute positioning, and grid placement all create a mismatch that screen readers cannot see.
5. Use native elements wherever they exist. A native `<select>`, `<dialog>`, and `<details>` come with tested screen reader behavior that ARIA reimplementations rarely match.
6. Announce asynchronous change with live regions placed in the DOM before the content changes, and choose the right politeness. `role="alert"` for errors, `role="status"` for progress and success.
7. Handle focus correctly across dynamic UI: move focus deliberately after opening a dialog or completing a step, and restore it to the trigger on close.
8. Group content with landmark elements and heading hierarchy so users can navigate by heading and by region rather than reading linearly.
9. Write the accessible description test out loud. If it sounds wrong ("button button" or "checkbox not checked, checkbox not checked"), the semantics are wrong.
10. Record a matrix of AT plus browser plus outcome for the release artifact, and re-test after any dependency upgrade that changes DOM or ARIA behavior.

## Patterns

Custom disclosure nav with correct roles and state:

```html
<nav aria-label="Primary">
  <ul>
    <li>
      <button type="button" aria-expanded="false" aria-controls="menu-reports" id="btn-reports">
        Reports
      </button>
      <ul id="menu-reports" aria-labelledby="btn-reports" hidden>
        <li><a href="/reports/invoices">Invoices</a></li>
        <li><a href="/reports/payments" aria-current="page">Payments</a></li>
      </ul>
    </li>
  </ul>
</nav>
```

Landmark structure with a skip link and heading order:

```html
<a href="#main" class="skip-link">Skip to main content</a>
<header><nav aria-label="Primary">...</nav></header>
<main id="main" tabindex="-1">
  <h1>Invoices</h1>
  <section aria-labelledby="overdue-h"><h2 id="overdue-h">Overdue</h2>...</section>
</main>
<aside aria-label="Related">...</aside>
<footer>...</footer>
```

Live regions declared before the content mutates:

```html
<!-- present in the DOM at load; never inserted at the same time as the message -->
<div role="status" aria-live="polite" class="sr-only" id="results-status"></div>
<div role="alert" class="sr-only" id="form-errors"></div>

<script type="module">
  const status = document.getElementById('results-status');
  function announce(count) {
    status.textContent = count === 0
      ? 'No results. Try removing the owner filter.'
      : `${count} invoices found.`;
  }
  function showErrors(errors) {
    const box = document.getElementById('form-errors');
    box.textContent = `There are ${errors.length} problems.`;
    // focus the first invalid field and associate the message
    const [first] = errors;
    first.input.setAttribute('aria-invalid', 'true');
    first.input.setAttribute('aria-describedby', first.messageId);
    first.input.focus();
  }
</script>
```

Accessible name sources, in resolution order:

```markdown
1 aria-labelledby -> ids of visible text        (preferred when label is elsewhere)
2 aria-label       -> string on the element      (not a substitute for a visible label)
3 native text content   <button>Reports</button>
4 <label for="id">   visible, clickable, matches the control
5 title / alt        last resort; not reliably announced on touch
NEVER  placeholder as the only name; placeholder is a hint, not a label
```

Verification matrix to attach to the release:

```markdown
                    VO + Safari   NVDA + FF   NVDA + Chrome   TalkBack + Chrome
landing hero         pass          pass        pass             pass
invoices table       pass*         pass        pass             pass*  (*row/column nav)
date picker widget   pass          pass        pending          pending
export toast         pass          pass        pass             pass
checkout validation  pass          fail->fix  pass             pass
```

## Checklist

- [ ] Tested on VoiceOver, NVDA, and TalkBack, each on its primary browser
- [ ] Every interactive element has an accessible name; no placeholder-only labels
- [ ] ARIA states exposed: expanded, selected, checked, current, disabled, invalid
- [ ] DOM order matches visual and reading order
- [ ] Native elements preferred over ARIA reimplementations
- [ ] Live regions present at load, with alert for errors and status for progress
- [ ] Focus moved deliberately on open and restored on close
- [ ] Landmarks and heading hierarchy verified against the AT matrix

## Anti-patterns

**Testing with one screen reader.** Passing on VoiceOver and failing on NVDA is the normal case, not the exception — engines differ in virtual cursor, table navigation, and how live regions are read. Fix: test the matrix, and never generalize from one engine.

**Live region inserted with the message.** A `div role="alert"` added to the DOM at the same instant as its text is often not announced at all, because there is no prior state to detect a change from. Fix: render the live region container at page load and only change its text.

**Div buttons with ARIA.** `role="button"` plus `tabindex="0"` and no key handling. It is focusable and announced as a button, but Space does nothing and there is no disabled state. Fix: use `<button>`, or implement the full pattern including Enter, Space, and state attributes.

**Announcing with focus moves.** Moving focus to a status message makes screen readers read it, but it also drops the user out of their place on the page. Fix: announce politely in place, and move focus only when the user genuinely needs to act on the result.

**aria-label on a visible-label element.** Adding `aria-label="Reports"` where a visible "Reports" text already exists creates a mismatch for speech-input users, who say what they see. Fix: let the visible text be the accessible name, or use `aria-labelledby` pointing at that text.
