---
name: font-loading
description: Loads web fonts without invisible text or layout shift using `font-display`, metric-compatible fallbacks (`size-adjust`, `ascent-override`), `preload`, and subsetting. Use when text flashes invisible (FOIT), reflows when fonts arrive (FOUT), or a font request delays LCP.
---

# Font Loading

**Use when:** text is briefly invisible (FOIT), the page reflows when a font arrives (FOUT), a font request is delaying LCP, or a self-hosted font is larger than it should be.
**Do not use when:** the problem is hero images or JavaScript weight — use `image-optimization` and `bundle-size-triage`; for brand colour theming use `design-tokens`.

## Instructions

1. Choose `font-display` deliberately: `swap` for body text (availability over flash), `optional` for text where a flash is unacceptable (fast connections keep the webfont, slow ones never swap), `block` only for short labels with a short block period.
2. Keep the block period short — `font-display: swap` implies a ~3s block period, after which fallback text shows. Use `size-adjust` fallbacks so the fallback occupies nearly the same space.
3. Preload at most the one or two font files needed for the first paint, with `crossorigin` even on same-origin URLs, because font fetches are always CORS-mode.
4. Self-host fonts. Third-party font hosts add a DNS + TLS + connection cost to your LCP and hand you an extra origin to fail.
5. Subset aggressively: `unicode-range` for Latin, Latin-Extended, Cyrillic, Greek, and Vietnamese ranges, shipping a separate `@font-face` per range so unneeded glyphs never download.
6. Prefer variable fonts for multi-weight families — one file covers all weights and avoids four parallel requests.
7. Measure real fallback metrics with `fontaine` or the CSS Font Loading API and write `size-adjust`, `ascent-override`, `descent-override`, and `line-gap-override` onto the fallback face.
8. Never use a CSS animation to hide FOIT for more than a moment; it delays LCP and leaves text invisible for screen readers on slow connections.
9. Keep font loading out of the critical path where possible: `preconnect` to your own font origin, serve from the same CDN, and set long-lived immutable cache headers.
10. Verify with a throttled network that the first paint uses the intended font, and check that `document.fonts` reports the expected faces.

## Patterns

Self-hosted, subsetted, variable font with metric-matched fallbacks:
```css
@font-face {
  font-family: "Inter Variable";
  src: url("/fonts/inter-var.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap; /* show fallback immediately, swap when ready */
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+2000-206F, U+2192, U+2212;
}

/* Cyrillic only loads when actually needed */
@font-face {
  font-family: "Inter Variable";
  src: url("/fonts/inter-var-cyrillic.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
  unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}

/* Metric-compatible fallback: nearly identical metrics, so the swap is invisible */
@font-face {
  font-family: "Inter Fallback";
  src: local("Arial");
  size-adjust: 107%;
  ascent-override: 90%;
  descent-override: 22%;
  line-gap-override: 0%;
}
:root { --font-sans: "Inter Variable", "Inter Fallback", ui-sans-serif, system-ui, sans-serif; }
body { font-family: var(--font-sans); }
```

Preload exactly the critical file and verify the faces loaded:
```html
<!-- crossorigin is required: font requests are always CORS-mode -->
<link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preconnect" href="https://cdn.example.com" crossorigin />
```

```js
// Report what actually rendered, and whether the swap already happened
document.fonts.ready.then(() => {
  console.info(
    [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`),
    getComputedStyle(document.body).fontFamily,
  );
});

// Measure the fallback/webfont metric delta that size-adjust should correct
import { Fontaine } from "fontaine";
```

```nginx
# Long-lived immutable caching for fingerprinted font files
location /fonts/ {
  add_header Cache-Control "public, max-age=31536000, immutable";
}
```

## Checklist

- [ ] Fonts are self-hosted on the same CDN as the app, with a `preconnect`.
- [ ] `font-display` chosen per text role (`swap` for body, `optional` for critical UI).
- [ ] At most one or two font files preloaded, each with `crossorigin`.
- [ ] `unicode-range` subsets defined so unused scripts never download.
- [ ] Variable fonts used for multi-weight families instead of four static files.
- [ ] A metric-compatible fallback face exists with `size-adjust` and ascent/descent overrides.
- [ ] Fonts served with `Cache-Control: immutable` and fingerprinted filenames.
- [ ] Throttled-network check confirms the first paint uses the intended font with no FOIT.

## Anti-patterns

**`font-display: block` on body text.** Text stays invisible until the font loads or the block period expires — up to three seconds of nothing on a slow connection, which is an accessibility failure as well as an LCP failure. Fix: `swap`, or `optional` for non-essential chrome.

**Preloading every font file.** Four preloads compete with CSS and hero images for bandwidth, so each one starts later and nothing improves. Fix: preload only the file used above the fold at the initial weight, and let the rest load normally.

**Inlining fonts as base64 in CSS.** A 300KB variable font becomes a render-blocking CSS file that is downloaded again on every uncached visit, and it cannot be cached independently. Fix: keep the font as a fingerprinted binary asset with immutable caching.