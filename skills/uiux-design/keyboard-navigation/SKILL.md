---
name: keyboard-navigation
description: Implements full keyboard operability — logical focus order, visible focus indicators, roving tabindex in composites, focus trapping only where justified, skip links, and scoped shortcuts. Use when fixing tab order or focus traps, adding shortcuts, or making a component operable without a pointer.
---

# Keyboard Navigation

**Use when:** a component must be operable without a mouse, tab order is illogical, a focus trap is wrong, or keyboard shortcuts need defining and conflict handling.
**Do not use when:** the defect is how a screen reader announces the element, which is `screen-reader-compatibility`.

## Instructions

1. Make everything reachable by `Tab` and operable with `Enter`, `Space`, arrow keys, and `Escape` as appropriate. If it requires a pointer, it is not finished.
2. Make focus order follow visual order. Never reorder with a positive `tabindex` — it desynchronizes DOM order from focus order and breaks screen reader navigation permanently. Fix the DOM instead.
3. Render a visible focus indicator with a minimum 2px thickness, at least 3:1 contrast against adjacent colors, and a 2px offset (WCAG 2.2 focus appearance). Use `:focus-visible` so it appears for keyboard without flashing on mouse click.
4. Apply the roving tabindex pattern to composite widgets — tablists, menus, toolbars, radio groups, and grids: one tab stop, arrow keys move within. The whole component must not consume twenty tab stops.
5. Trap focus only in modal dialogs and non-modal overlays where escape or dismissal is available, and always provide a visible close control plus `Escape`. Any trap without an escape is a WCAG 2.1.2 failure.
6. Restore focus to the element that opened the overlay, not to `document.body`. Focus lost to the body restarts traversal at the top of the page.
7. Use real controls for shortcuts where possible: `accesskey` is a poor substitute, but a documented single-key shortcut on a focused button is free.
8. Scope shortcuts carefully: single-letter shortcuts must be disabled while a text field has focus, and must require a modifier when they would conflict with browser or AT bindings.
9. Add a skip link as the first focusable element, targeting the main landmark, which must have `tabindex="-1"` to receive focus programmatically.
10. Never hide focus with `outline: none` unless a replacement indicator of at least equal prominence exists on every state, including inside overflow-hidden containers where the ring gets clipped.

## Patterns

Focus indicator that satisfies 2.4.13 and survives overflow clipping:

```css
:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
  outline: 2px solid var(--focus-ring);   /* >= 2px thick */
  outline-offset: 2px;                   /* >= 2px from the component edge */
}
.scroll-region :where(button, a):focus-visible { outline-offset: -3px; }
@media (forced-colors: active) { :focus-visible { outline-color: Highlight; } }
```

Roving tabindex in a toolbar:

```js
const keys = ['Home', 'End', 'ArrowLeft', 'ArrowRight'];
container.addEventListener('keydown', (e) => {
  const items = [...container.querySelectorAll('[role="tab"]')];
  const i = items.indexOf(document.activeElement);
  if (!keys.includes(e.key) || i < 0) return;
  e.preventDefault();
  const next = e.key === 'Home' ? 0
    : e.key === 'End' ? items.length - 1
    : (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
  items.forEach((el, n) => el.tabIndex = n === next ? 0 : -1);
  items[next].focus();
});
```

Focus trap that always escapes:

```js
function trap(container) {
  const focusable = () => container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = () => focusable()[0];
  const last = () => focusable()[focusable().length - 1];

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); return close(); }
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first()) { e.preventDefault(); last().focus(); }
    else if (!e.shiftKey && document.activeElement === last()) { e.preventDefault(); first().focus(); }
  }
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}
```

Open and restore:

```js
const opener = document.activeElement;
const release = trap(dialog);
dialog.querySelector('[autofocus]')?.focus() ?? dialog.focus();
// ... on close
release();
opener.focus();   // never document.body
```

Scoped single-key shortcut:

```js
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  ({ '/': () => search.focus(), '?': () => shortcutsDialog.showModal() })[e.key]?.();
});
```

```css
.skip-link { position: absolute; inset-block-start: -100%; inset-inline-start: var(--space-4); z-index: 100; }
.skip-link:focus-visible { inset-block-start: var(--space-2); }
```

## Checklist

- [ ] All functionality reachable by keyboard with no pointer-only paths
- [ ] Focus order matches visual order; no positive `tabindex` anywhere
- [ ] `:focus-visible` indicator at least 2px, 3:1 contrast, 2px offset, not clipped
- [ ] Composite widgets use roving tabindex with arrow-key movement
- [ ] Focus trapped only in dismissible overlays, with `Escape` always available
- [ ] Focus restored to the opener on close, and single-key shortcuts scoped off inputs
- [ ] Skip link is the first focusable element and targets a focusable main
- [ ] Full pass completed with keyboard only before release

## Anti-patterns

**Positive `tabindex`.** `tabindex="1"` on a late-page element to "fix" order. Focus order now disagrees with DOM order, so screen reader reading and keyboard order diverge permanently. Fix: move the element in the DOM.

**Focus trap without escape.** A modal that can be tabbed into and never out of. This is the most severe keyboard defect there is: the user is stuck. Fix: every trap needs `Escape`, a visible close button, and focus restoration on exit.

**Removing the outline.** `outline: none` with nothing replacing it. Fix: provide an indicator with at least equal prominence, and test it inside `overflow: hidden` where rings get clipped.

**Twenty tab stops per widget.** Every cell of a data grid is tabbable, so reaching the next control means forty presses. Fix: roving tabindex plus arrow-key navigation, or a real `<table>` with documented grid-key behavior.

**Global single-letter shortcuts.** Pressing `s` while typing a search term saves the form, because the shortcut never checked the focus context. Fix: bail out of any editable context, and require a modifier for bindings that collide with browser or AT defaults.
