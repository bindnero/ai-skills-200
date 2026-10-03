---
name: responsive-navigation
description: Designs navigation that adapts across breakpoints using persistent sidebars, disclosure menus, off-canvas drawers, and bottom tab bars with correct ARIA and focus management. Use when converting a desktop nav to mobile or when a menu breaks at tablet width.
---

# Responsive Navigation

**Use when:** navigation needs to work from 320px to 2560px, when converting a desktop nav to mobile, or when a hamburger, drawer, or tab bar behaves incorrectly for keyboard or screen reader users.
**Do not use when:** the problem is the page layout grid rather than the navigation, which is `spacing-and-grid`.

## Instructions

1. Decide the navigation pattern per breakpoint by frequency of use, not by what fits. The three to five destinations used most often stay persistent; the long tail collapses behind a menu.
2. Keep primary navigation reachable with the fewest actions: persistent on desktop, a bottom tab bar on mobile for up to five top-level destinations, and an overflow menu beyond that.
3. Preserve meaning across breakpoints. The label "Projects" must not become "P." on mobile; if the icon needs a tooltip, the `aria-label` still carries the full name.
4. Use the correct ARIA pattern per component: `nav` with `aria-label` for landmark structure, `button[aria-expanded][aria-controls]` for a disclosure menu, `role="tablist"` only for real tab switching.
5. Manage focus for any overlay: move focus into the drawer, trap it while open, close on `Escape`, close on scrim click, and restore focus to the trigger.
6. Do not hide navigation on scroll or behind hover. On mobile, a nav that disappears on scroll is unreachable for keyboard users and for anyone who has scrolled past it.
7. Handle the tablet gap deliberately, not accidentally — at 768-1024px many desktop sidebars no longer fit, and a bare hamburger hides far more than intended. Prefer a collapsed icon rail with persistent labels where volume allows.
8. Keep the current location always visible: `aria-current="page"` on the active item, plus a visible highlight that is not color-only.
9. Keep the skip link as the first focusable element at every breakpoint, and verify the sticky header does not obscure the focused item (WCAG 2.4.11).
10. Test at 320px, 768px, 1024px, and 2560px, with keyboard only, with a screen reader, and at 200% zoom — a nav is pure focus order, so it fails loudly if any of those are wrong.

## Patterns

Disclosure menu with correct ARIA and keyboard:

```html
<nav aria-label="Primary">
  <button type="button" class="nav-toggle" aria-expanded="false"
          aria-controls="primary-menu" id="nav-toggle">
    <svg aria-hidden="true" viewBox="0 0 20 20"><!-- menu glyph --></svg>
    Menu
  </button>
  <ul id="primary-menu" hidden>
    <li><a href="/projects" aria-current="page">Projects</a></li>
    <li><a href="/deploys">Deploys</a></li>
    <li><a href="/settings">Settings</a></li>
  </ul>
</nav>
```

```js
const btn = document.getElementById('nav-toggle');
const menu = document.getElementById('primary-menu');
btn.addEventListener('click', () => {
  const open = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!open));
  menu.hidden = open;
});
menu.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  btn.setAttribute('aria-expanded', 'false');
  menu.hidden = true;
  btn.focus();                     // restore focus to the trigger
});
// Escape must also work when focus is on the trigger itself.
btn.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
    btn.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
  }
});
```

Off-canvas drawer with focus trap and scroll lock:

```js
function openDrawer(drawer, trigger) {
  const release = trap(drawer);            // see keyboard-navigation
  document.body.style.overflow = 'hidden';
  drawer.hidden = false;
  drawer.querySelector('[autofocus], a, button')?.focus();
  const onScrim = () => closeDrawer(drawer, trigger);
  scrim.addEventListener('click', onScrim);
  return () => { release(); document.body.style.overflow = ''; scrim.removeEventListener('click', onScrim); };
}
// closeDrawer(drawer, trigger): hide, then trigger.focus() -- never document.body
```

Mobile bottom tab bar, safe-area aware:

```css
.tabbar {
  position: fixed; inset-inline: 0; inset-block-end: 0;
  display: grid; grid-auto-flow: column; grid-auto-columns: 1fr;
  padding-block-end: max(var(--space-2), env(safe-area-inset-bottom));
  background: var(--bg-surface); border-block-start: 1px solid var(--border-subtle);
}
.tabbar a { display: grid; justify-items: center; gap: 2px;
            padding-block: var(--space-2); min-block-size: 44px; }  /* 2.5.8 */
.tabbar a[aria-current="page"] { color: var(--action-primary); font-weight: 600; }
.tabbar a[aria-current="page"]::after {          /* not color-only */
  content: ""; inline-size: 1.25rem; block-size: 2px; background: currentColor;
}
main { padding-block-end: calc(4rem + env(safe-area-inset-bottom)); }
```

Current-item styling that survives grayscale:

```markdown
[aria-current="page"] must show:  color change AND weight change AND an indicator
                             OR text weight + underline
never: color change alone (1.4.1 Use of Color)
```

## Checklist

- [ ] Pattern per breakpoint chosen by usage frequency, with the tablet range designed explicitly
- [ ] Primary destinations persistent or in the first four tab positions
- [ ] `nav[aria-label]`, `aria-expanded`, and `aria-controls` correct on every collapsible
- [ ] Drawer traps focus, closes on `Escape` and scrim click, restores focus to trigger
- [ ] Navigation never hidden on scroll or reachable only by hover
- [ ] `aria-current="page"` plus a non-color visual indicator
- [ ] Skip link first in tab order at every breakpoint
- [ ] Target sizes meet 2.5.8, and verified at 320/768/1024/2560px with keyboard and a screen reader

## Anti-patterns

**Hamburger with no expansion of intent.** Desktop nav with eight items collapses entirely behind an icon on mobile, so the entire product is one tap away from being missed. Fix: keep the top four destinations visible, and put only the tail in "More".

**Icon-only with no accessible name.** Tab bars of unlabeled glyphs that read as "link, link, link" in a screen reader. Fix: visible short label plus `aria-label` with the full destination name.

**Drawer without Escape or focus restore.** Focus escapes to the page behind an invisible overlay, or lands on `document.body` so tabbing restarts from the top. Fix: trap while open, `Escape` to close, restore focus to the trigger.

**Fixed header hiding focused items.** Clicking an anchor in a long menu scrolls the target under the sticky header, so keyboard users lose the item entirely. Fix: `scroll-margin-block-start` on all targets and verify against 2.4.11.

**Color-only active state.** The current page is indicated only by a red tint. Invisible in grayscale and to color-blind users. Fix: add weight or an underline indicator alongside the color.