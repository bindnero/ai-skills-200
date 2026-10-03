---
name: mobile-first-indexing
description: Audits and fixes mobile-first indexing — identical content across devices, dynamic serving parity, viewport and responsive image markup, and mobile render failures. Use when Search Console flags mobile content issues, when desktop and mobile versions differ, or when rankings differ between mobile and desktop.
---

# Mobile-First Indexing

**Use when:** Search Console reports "Page with redirect" or "Different desktop and mobile versions", when the mobile rendering is broken or blank, or when rankings differ between mobile and desktop.
**Do not use when:** the issue is a responsive-design bug with no indexing consequence — this skill is specifically about Googlebot using only the mobile version for indexing.

## Instructions

1. Confirm the premise: Google indexes the mobile version only. The mobile-first index is the sole index; the desktop version is not independently stored. Ranking differences by device usually come from data, speed or intent mismatch, not separate index entries.
2. Run URL Inspection → "Test live URL" (mobile) for every affected URL. Read the "Mobile-friendly test" and "Google-selected canonical" fields. "Page with redirect" means the mobile version redirects — find where.
3. Confirm mobile and desktop serve identical content. Fetch both with a mobile and a desktop UA, strip boilerplate (nav, header, footer, cookie banner) and diff the remaining main content. Any paragraph, price or spec only on desktop is content Google cannot index.
4. Check dynamic serving parity. If one URL serves both devices, verify mobile and desktop HTML carry the same canonical, meta robots and structured data. Mismatched canonicals across variants split signals.
5. Check responsive image markup. Images must be reachable via `<img srcset>`/`sizes` or `<picture>` in the served HTML; `background-image` applied via JS-only CSS is invisible to the mobile crawler. Every product and article image belongs in the initial HTML.
6. Validate the viewport tag in the served `<head>`: `width=device-width, initial-scale=1`. Without it Googlebot renders at desktop width and may skip rendering resources.
7. Avoid intrusive interstitials. Cookie walls covering main content, full-screen install prompts and splash screens trigger flags. Render content above the consent UI.
8. Fix the primary rendering dependency. If the mobile render depends on JavaScript that fails, times out or is blocked, Googlebot sees an empty page. Server-render above-the-fold content and keep critical JS out of interaction-gated paths.
9. Ensure usability: tap targets ≥48px, base font ≥16px, no content requiring pinch-zoom, no horizontal scroll at 320px. These gate the enhanced mobile rendering.
10. Re-test with URL Inspection, then monitor Search Console's Mobile-friendly report weekly; expect 1–3 weeks propagation after fixes.

## Patterns

Responsive head — one URL, one canonical, content parity:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="canonical" href="https://example.com/seo/crawl-budget/">
<link rel="alternate" media="only screen and (max-width: 640px)"
      href="https://m.example.com/seo/crawl-budget/">
<link rel="alternate" media="only screen and (min-width: 641px)"
      href="https://example.com/seo/crawl-budget/">

<meta property="og:image" content="https://example.com/og/crawl-budget-1200x630.png">
<meta name="twitter:card" content="summary_large_image">
```

Mobile-first responsive CSS, tested with real viewports:

```css
/* base = smallest screen; never wrap mobile rules in a min-width query */
.grid { display: grid; gap: 1rem; grid-template-columns: 1fr; }
@media (min-width: 48rem) { .grid { grid-template-columns: repeat(3, 1fr); } }

/* tap targets: 48x48 CSS px minimum, with real spacing between them */
.tap { min-height: 48px; min-width: 48px; display: inline-flex;
       align-items: center; justify-content: center; }

/* font scaling must not trigger horizontal scroll at 320px */
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; overflow-x: hidden; }
img, svg, video, table { max-width: 100%; height: auto; }
```

Parity test between mobile and desktop HTML:

```javascript
import { test, expect } from "@playwright/test";

for (const path of ["/", "/products/widget/", "/blog/crawl-budget/"]) {
  test(`${path} serves identical content on mobile and desktop`, async ({ browser }) => {
    const grab = async (viewport, ua) => {
      const ctx = await browser.newContext({ viewport, userAgent: ua });
      const p = await ctx.newPage(); await p.goto("https://example.com" + path, { waitUntil: "load" });
      const html = await p.content();
      const state = await p.evaluate(() => ({
        h1: document.querySelectorAll("h1").length,
        canonical: document.querySelector('link[rel=canonical]')?.href,
        jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')]
                  .map(s => s.textContent).join("").length,
        links: document.querySelectorAll("a[href]").length,
      }));
      await ctx.close(); return { html, state };
    };
    const m = await grab({ width: 390, height: 844 },
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1");
    const d = await grab({ width: 1440, height: 900 },
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36");
    expect(m.state.h1).toBe(1);
    expect(m.state.canonical).toBe(d.state.canonical);
    expect(m.state.jsonld).toBe(d.state.jsonld);
    expect(m.state.links).toBeGreaterThan(10);
    await expect(m.state.h1).toBeGreaterThan(0);
    console.log(path, "mobile words:", (m.html.match(/\w+/g) || []).length,
                     "desktop words:", (d.html.match(/\w+/g) || []).length);
  });
}
```

Separate m. subdomain crawl audit:

```bash
curl -s https://www.example.com/robots.txt | grep -i '^disallow: /m/'   # must be empty
curl -sI https://m.example.com/seo/crawl-budget/ | grep -i '^location'    # must be 301 to www
# then: both URLs return 200 with identical canonical; the m. host 301s to www
```

## Checklist

- [ ] URL Inspection mobile live test run for every flagged URL; reported issue named.
- [ ] Mobile and desktop main-content similarity >0.95; desktop-only content eliminated.
- [ ] Dynamic serving (if used) has `Vary: User-Agent` with identical canonical/robots/JSON-LD.
- [ ] `viewport` meta present in the served `<head>` on every indexable template.
- [ ] All above-the-fold images in initial HTML with `srcset`/`sizes` and explicit dimensions.
- [ ] No intrusive interstitial covering main content; consent UI does not block render.
- [ ] Above-the-fold content server-rendered; critical JS not gated behind an interaction.
- [ ] Tap targets ≥48px, base font ≥16px, no horizontal scroll at 320px and 768px.

## Anti-patterns

- **Hiding desktop-only content with `display:none` at mobile breakpoints** — if the only unique value (pricing, specs) is hidden at the width Googlebot renders, it cannot be indexed. Reflow the content so it exists at both breakpoints.
- **Detecting Googlebot by UA and serving an SEO-only page** — serving a stripped, keyword-dense page to `Googlebot` on mobile is cloaking and risks a manual action. Serve the true mobile experience to all mobile UAs.
- **Lazy-loading the whole page including the hero** — the hero must stay eager; lazy-loading it fails LCP and can trip the mobile-friendly test.
- **Using `background-image` for content images** — images in CSS backgrounds are not indexed as images and vanish when CSS fails to load on the mobile render.
- **Ignoring tablet widths** — templates tested only at 375px and 1440px break at 768px, producing horizontal scroll and poor CWV for a large share of real traffic.

## References

- Google Search Central's mobile-first indexing documentation states the mobile version is the only version indexed and that content should be identical across devices.
- URL Inspection's "Test live URL" (mobile) is the only direct confirmation that Googlebot's renderer can see the page content.