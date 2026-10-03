---
name: html-semantics
description: Replaces ARIA-laden div soup with native HTML — landmarks, heading order, real buttons and lists, label association, and ARIA only where the platform lacks an element. Use when markup is a wall of divs, screen reader output is unusable, or a keyboard user cannot operate a control.
---

# HTML Semantics

**Use when:** markup is a wall of `div`s, screen reader output is unusable, a keyboard user cannot operate a control, or you are auditing ARIA usage.
**Do not use when:** the problem is visual styling or layout — use `css-architecture` and `responsive-layouts`; for ARIA roles in complex widgets such as comboboxes, see `component-library-authoring`.

## Instructions

1. Start from native elements. `<button>`, `<a href>`, `<details>`, `<dialog>`, `<table>`, `<ol>` ship keyboard behaviour, focusability, and roles that you would otherwise rebuild in ARIA.
2. Get landmarks right: exactly one `<h1>`, plus `<header>`, `<nav>`, `<main>`, `<aside>`, and `<footer>`. Screen reader users navigate by landmark, not by visual layout.
3. Keep heading levels sequential. A jump from `h2` to `h4` breaks heading navigation; level reflects nesting, not font size.
4. Use `<button>` for actions and `<a href>` for navigation. A `<div>` with a click handler is not focusable, has no role, and fires on Space inconsistently.
5. Associate every form control with a `<label for>`. Placeholder text is not a label — it disappears on input and often has poor contrast.
6. Add ARIA last, and only for what HTML cannot express: `aria-expanded`, `aria-controls`, `aria-live`, `aria-current`, `aria-describedby`. Never add a redundant role to a native element.
7. Manage focus deliberately: after opening a dialog move focus inside, on close return it to the trigger, and never leave focus on a removed element.
8. Implement keyboard patterns properly — roving tabindex for tabs and menus, arrow keys for grids, Escape to dismiss overlays.
9. Add a skip link as the first focusable element, and make focus indicators visible with `:focus-visible`.
10. Verify with a real audit, not by reading the source: axe DevTools, keyboard-only walkthrough, and a screen reader spot-check on the primary flows.

## Patterns

Landmarks, headings, and real controls:
```html
<a class="skip-link" href="#main">Skip to content</a>

<header>
  <a href="/" aria-current="page"><img src="/logo.svg" alt="Acme home" width="120" height="32" /></a>
</header>

<nav aria-label="Primary">
  <ul>
    <li><a href="/products" aria-current="page">Products</a></li>
    <li><a href="/pricing">Pricing</a></li>
  </ul>
</nav>

<main id="main" tabindex="-1">
  <h1>Checkout</h1>
  <section aria-labelledby="payment-heading">
    <h2 id="payment-heading">Payment</h2>
    <!-- heading level matches nesting, not font size -->
  </section>
</main>

<aside aria-label="Order summary">
  <h2>Order summary</h2>
</aside>

<footer><p>© Acme</p></footer>
```

Native interaction instead of ARIA reimplementation:
```html
<!-- Actions are buttons; navigation is anchors -->
<button type="button" aria-expanded="false" aria-controls="filters-panel">Filters</button>
<a href="/products/new">New product</a>

<!-- Progressive disclosure needs no ARIA at all -->
<details>
  <summary>Shipping details</summary>
  <p>Ships in 2–3 business days.</p>
</details>

<!-- Native dialog: focus trapping, Escape, and inertness are built in -->
<dialog id="confirm">
  <form method="dialog">
    <h2>Delete project?</h2>
    <button value="cancel">Cancel</button>
    <button value="confirm">Delete</button>
  </form>
</dialog>

<label for="email">Work email</label>
<input id="email" name="email" type="email" autocomplete="email" aria-describedby="email-hint" required />
<p id="email-hint">We only use this for sign-in.</p>
```

Live regions and roving tabindex:
```html
<!-- Announce results without moving focus -->
<p role="status" aria-live="polite">12 results</p>
<!-- Assertive only for errors that must interrupt -->
<div role="alert">Payment failed. Try another card.</div>

<!-- Tabs: one tab stop, arrow keys move between tabs -->
<div role="tablist" aria-label="Account settings">
  <button role="tab" id="tab-profile" aria-selected="true" aria-controls="panel-profile" tabindex="0">Profile</button>
  <button role="tab" id="tab-billing" aria-selected="false" aria-controls="panel-billing" tabindex="-1">Billing</button>
</div>
```
```js
// Roving tabindex: the group is a single tab stop
tablist.addEventListener("keydown", (event) => {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const index = tabs.indexOf(document.activeElement);
  const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  tabs[(next + tabs.length) % tabs.length].focus();
});
```

## Checklist

- [ ] Exactly one `<h1>` per page and heading levels increase by one.
- [ ] `<header>`, `<nav>`, `<main>`, `<footer>` present, and `main` is the skip-link target.
- [ ] Every action uses `<button type="button">`; every navigation uses `<a href>`.
- [ ] Every form control has a `<label for>`; placeholders are not used as labels.
- [ ] ARIA attributes appear only for behaviour HTML cannot express; no redundant roles.
- [ ] Focus moves into dialogs on open and returns to the trigger on close.
- [ ] `tablist`, `menu`, and `grid` widgets implement roving tabindex and arrow keys.
- [ ] axe passes and the primary flow is walkable with the keyboard only.

## Anti-patterns

**`<div role="button" tabindex="0" onclick={...}>` without key handling.** It is focusable but does not activate on Space, has no disabled or pressed semantics, and screen readers announce a bare "button" with no state. Fix: `<button type="button">`, which ships all of it.

**Redundant ARIA on native elements** (`<nav role="navigation">`, `<button role="button">`). This is noise at best; conflicting or duplicated roles override the native semantics and break assistive technology in unpredictable ways. Fix: delete the role and rely on the element.

**Placeholder-only form fields.** The hint vanishes on first keystroke, contrast is typically below the minimum, and there is no programmatic label. Fix: a persistent `<label for>` plus `aria-describedby` for supporting detail.