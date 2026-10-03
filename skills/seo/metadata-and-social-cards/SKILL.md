---
name: metadata-and-social-cards
description: Constructs and templates title tags, meta descriptions, Open Graph and Twitter card markup, favicons and icons so URLs render correctly in SERP and social previews. Use when CTR is low despite good rankings, when sharing to LinkedIn/Slack/X renders wrong, or when templating metadata across a framework.
---

# Metadata and Social Cards

**Use when:** Pages rank but underperform on CTR, when a shared link renders without an image or with the wrong text, or when metadata must be templated consistently across a codebase or framework.
**Do not use when:** the question is whether a page should be indexed at all — indexation intent belongs in `robots-and-canonicals`.

## Instructions

1. Build one source of truth for metadata: a single resolver function or template partial generating title, description, canonical, OG and Twitter tags. Never let an individual page hand-write its title — that is how hundreds of near-identical titles appear.
2. Compose titles as `Primary Keyword — Differentiator | Brand`, capped at ~60 characters / ~580px. The differentiator must be a real value claim ("2026 Benchmarks", "Free Tool", "9-Minute Setup"), not filler.
3. Compose descriptions at 140–160 characters, leading with the query's intent verb and including one concrete number or date. Descriptions are not a ranking factor but are the largest single CTR lever for positions 4–10.
4. Compute canonical and OG URLs absolutely, with protocol and host taken from a site config constant, never from the request host. Request-derived canonicals fragment the index behind load balancers, preview environments and mobile subdomains.
5. Emit the complete OG set: `og:type`, `og:title`, `og:description`, `og:url`, `og:image` (1200×630, under 5MB, absolute), `og:site_name`, `og:locale`. Twitter/X needs explicit `twitter:card=summary_large_image` plus `twitter:title`/`description`/`image` — without the card value it inherits at best a `summary` card.
6. Ensure `og:image` is a static, publicly crawlable file. Dynamically generated social images behind auth or bot-blocking WAF rules render blank on every platform.
7. Add `og:image:width`, `og:image:height` and `og:image:alt` — Facebook and LinkedIn use the dimensions to avoid re-encoding and the alt as the accessible fallback.
8. Layer per-platform overrides for genuinely different content (a technical article deserves a different X post than LinkedIn) using `twitter:*` tags, keeping `og:*` as the neutral baseline.
9. Validate with Facebook Sharing Debugger, LinkedIn Post Inspector and X Card Validator against a production URL after every template change, cache-busting the scrape.
10. Add `theme-color`, `apple-touch-icon` and the icon set. SERP favicon selection picks the `rel="icon"` closest to the device pixel ratio; a single 16px ICO renders blurry on desktop.

## Patterns

Framework-neutral resolver (TypeScript):

```ts
export type PageMeta = {
  title: string; description: string; path: string;
  image?: string; type?: "website" | "article" | "product";
  publishedTime?: string; noIndex?: boolean;
};

const SITE = { name: "Acme Analytics", origin: "https://acme.example",
               defaultImage: "/og/default-1200x630.png" };

const clamp = (s: string, n: number) =>
  s.length <= n ? s : s.slice(0, n - 1).replace(/[\s,.:;-]+\S*$/, "") + "…";

export function buildMeta(p: PageMeta) {
  const url = new URL(p.path, SITE.origin).href;     // never from the request host
  const title = clamp(p.title, 60), description = clamp(p.description, 160);
  const image = new URL(p.image ?? SITE.defaultImage, SITE.origin).href;
  return {
    title, description, canonical: url,
    robots: p.noIndex ? "noindex,follow"
                       : "index,follow,max-image-preview:large,max-snippet:-1",
    openGraph: {
      "og:type": p.type ?? "website", "og:site_name": SITE.name, "og:locale": "en_US",
      "og:title": title, "og:description": description, "og:url": url,
      "og:image": image, "og:image:width": "1200", "og:image:height": "630",
      "og:image:alt": `${title} — ${SITE.name}`,
      ...(p.publishedTime ? { "article:published_time": p.publishedTime } : {}) },
    twitter: {
      "twitter:card": "summary_large_image", "twitter:title": clamp(title, 70),
      "twitter:description": clamp(description, 200), "twitter:image": image,
      "twitter:image:alt": `${title} — ${SITE.name}` } }; }
```

Rendered head for an article:

```html
<title>Crawl Budget Optimization: How to Stop Google Wasting Crawls | Acme Analytics</title>
<meta name="description" content="Crawl budget determines how often Google revisits your site. See 2026 benchmarks, log-file formulas and five fixes that raise crawl frequency.">
<link rel="canonical" href="https://acme.example/seo/crawl-budget/">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">

<meta property="og:type" content="article">
<meta property="og:site_name" content="Acme Analytics">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="Crawl Budget Optimization | Acme Analytics">
<meta property="og:description" content="Log-file formulas, 2026 benchmarks and five fixes.">
<meta property="og:url" content="https://acme.example/seo/crawl-budget/">
<meta property="og:image" content="https://acme.example/og/crawl-budget-1200x630.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Crawl budget optimization chart, 2026 benchmarks">
<meta property="article:published_time" content="2026-08-14T09:00:00Z">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Crawl Budget Optimization">
<meta name="twitter:description" content="Log-file formulas, 2026 benchmarks and five fixes.">
<meta name="twitter:image" content="https://acme.example/og/crawl-budget-1200x630.png">

<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/icons/android-chrome-192.png">
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0b5fff">
```

Template partial every page consumes, so no page hand-writes its own tags:

```ejs
<% const m = buildMeta({ title, description, path, image, type, publishedTime, noIndex }); %>
<title><%= m.title %></title>
<meta name="description" content="<%= m.description %>">
<link rel="canonical" href="<%= m.canonical %>">
<meta name="robots" content="<%= m.robots %>">
<% for (const [k, v] of Object.entries(m.openGraph)) { %>
<meta property="<%= k %>" content="<%= v %>">
<% } %>
<% for (const [k, v] of Object.entries(m.twitter)) { %>
<meta name="<%= k %>" content="<%= v %>">
<% } %>
```

## Checklist

- [ ] All metadata generated by one resolver/partial; zero hand-written per-page titles.
- [ ] Titles under ~60 chars / ~580px, primary keyword in the first half, brand suffixed.
- [ ] Descriptions 140–160 chars, intent verb first, one concrete number or date.
- [ ] Canonical and `og:url` derived from a site config constant, not the request host.
- [ ] Full OG set present: type, site_name, locale, title, description, url, image, width, height, alt.
- [ ] `twitter:card` explicitly `summary_large_image`, not relying on OG inheritance.
- [ ] `og:image` verified as a static public 1200×630 image under 5MB, no auth or bot blocking.
- [ ] Facebook Sharing Debugger, LinkedIn Post Inspector and X Card Validator re-scraped after changes.

## Anti-patterns

- **Meta keywords tag** — abandoned by Google in 2009 and ignored by all major engines. It adds duplicate-key risk and signals an unmaintained template.
- **Canonical built from `req.headers.host`** — every preview deployment and mobile subdomain emits itself as canonical, fragmenting the index. Canonical must come from a constant.
- **Social images generated by a JS route** — Facebook and LinkedIn do not execute JavaScript, so the image returns an empty shell and every share renders text-only. Pre-render at build time.
- **Template defaulting to the homepage title** — every unresolved template falls back to "Acme — Home" and 200 pages ship with it. Unresolved templates must throw in dev rather than fall back.
- **Descriptions stuffed with the keyword twice at 300 characters** — Google rewrites anything over ~155 chars and ignores yours. Write 140–160 characters that read like an ad, not a keyword container.

## References

- Facebook Sharing Debugger, LinkedIn Post Inspector and X Card Validator force a re-scrape of cached previews after template changes; X requires an explicit `twitter:card` value since OG tags alone yield at best a `summary` card.