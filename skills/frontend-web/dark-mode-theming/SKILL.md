---
name: dark-mode-theming
description: Implements dark mode and multi-theme rendering with `color-scheme`, the CSS `light-dark()` function, semantic tokens, and a flash-free ThemeProvider. Use when adding a dark theme, honouring `prefers-color-scheme`, fixing a white flash on load, or tuning theme colours across native UI.
---

# Dark Mode Theming

**Use when:** adding a dark theme, honouring `prefers-color-scheme`, fixing a white flash before hydration, or making theme colours work with native controls and scrollbars.
**Do not use when:** the theme work is brand-token design rather than dark rendering — use `design-tokens`; for RTL mirroring in a theme see `responsive-layouts`.

## Instructions

1. Set `color-scheme: light dark` (or a single value) on `:root`. This fixes native UI: scrollbars, form controls, and default text colours stop rendering light-on-dark artefacts.
2. Express every themeable colour as a semantic token that resolves to a pair, never as a raw hex in a component. Use `light-dark()` so a single declaration serves both themes.
3. Pick theme colours from elevation, not from inverted light values. Dark surfaces get lighter as they rise, using a small set of steps rather than a flat inversion.
4. Keep contrast at 4.5:1 for body text and 3:1 for large text and UI boundaries in both themes; check with a contrast checker in CI, not by eye.
5. Desaturate accents in dark mode. Fully saturated hues on near-black vibrate and look brighter than intended, so reduce chroma and slightly raise lightness.
6. Support three states: `light`, `dark`, and `system`. Resolve `system` through `matchMedia("(prefers-color-scheme: dark)")` and keep listening for changes.
7. Apply the theme before first paint with a tiny inline script in `<head>` reading `localStorage`. Without it the page paints light and then flips, which is very visible.
8. For class-based themes (`html.dark`), declare a `@custom-variant` or use `:where()` selectors so the theme class does not increase specificity.
9. Theme images, logos, charts, and illustrations explicitly — a photograph with a white background needs a variant or a container treatment, not a CSS filter.
10. Handle `prefers-contrast` and `forced-colors`: provide a high-contrast override and never rely on colour alone to convey state.

## Patterns

Token pairs with `light-dark()` plus native UI:
```css
:root {
  color-scheme: light dark; /* scrollbars, form controls, default canvas */
}

:root {
  /* Elevation steps, not inverted hexes */
  --surface-base: light-dark(#ffffff, #0b0f19);
  --surface-raised: light-dark(#f6f7f9, #151a26);
  --surface-overlay: light-dark(#ffffff, #1c2333);
  --border-subtle: light-dark(#e4e7ec, #262e40);

  --text-primary: light-dark(#101828, #e6e9f0);
  --text-secondary: light-dark(#475467, #98a2b3);

  /* Saturated accents are desaturated for the dark surface */
  --accent: light-dark(#1d4ed8, #7d9bff);
  --accent-contrast: light-dark(#ffffff, #0b0f19);
}

body { background: var(--surface-base); color: var(--text-primary); }
.card { background: var(--surface-raised); border: 1px solid var(--border-subtle); color: var(--text-primary); }
```

A flash-free ThemeProvider for a class-based theme:
```html
<script>
  // Runs before first paint: no light flash, no hydration mismatch
  const stored = localStorage.getItem("theme") ?? "system";
  const dark = stored === "dark" || (stored === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
</script>
```

```css
/* The theme class adds no specificity: components keep working */
.dark .card { /* unnecessary — tokens already resolve */ }
.card { background: var(--surface-raised); }
```

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark" | "system";
const ThemeContext = createContext<{ theme: Theme; resolved: "light" | "dark"; setTheme: (t: Theme) => void }>(null!);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) ?? "system",
  );
  const [systemDark, setSystemDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem("theme", next);
  }, []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export const useTheme = () => useContext(ThemeContext);
```

## Checklist

- [ ] `color-scheme` set on `:root` and kept in sync with the resolved theme.
- [ ] Every colour is a semantic token using `light-dark()` or a theme-scoped variable.
- [ ] No raw hex values remain in component styles outside the token file.
- [ ] Contrast verified at 4.5:1 (text) and 3:1 (UI) in both themes, checked in CI.
- [ ] Dark accents desaturated and elevation steps defined for raised surfaces.
- [ ] Theme applied by an inline head script, so there is no flash and no hydration mismatch.
- [ ] `system` mode tracks OS changes live via `matchMedia`.
- [ ] Images, logos, and charts have explicit dark variants rather than CSS filters.

## Anti-patterns

**Inverting colours with CSS filters.** `filter: invert(1)` on a dark theme inverts images and brand colours too, producing photographic negatives and broken logos. Fix: define explicit dark values for surfaces, text, and accents as tokens.

**Setting the theme in an effect after mount.** The page paints with the light theme, then flips to dark once React runs, which is a jarring flash and a hydration mismatch. Fix: apply the stored theme in a small inline script in `<head>` before first paint.

**Only handling `prefers-color-scheme` with no override.** Users who set their OS to dark are forced into a theme your product cannot support (brand-heavy sites), and support cannot be demonstrated. Fix: implement `light`, `dark`, and `system`, with `system` as the default.