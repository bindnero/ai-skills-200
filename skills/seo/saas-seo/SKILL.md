---
name: saas-seo
description: Optimizes B2B SaaS sites for organic acquisition — solution and integration landing pages, comparison and alternative pages, free-tool link acquisition, docs gating decisions and non-branded pipeline tracking. Use when a SaaS needs search-sourced pipeline, when building comparison or integration pages, or when choosing between gated and ungated content.
---

# SaaS SEO

**Use when:** A B2B software product needs search-sourced pipeline, when building comparison, alternative or integration pages, or when deciding how to gate content and whether docs and free tools can earn links.
**Do not use when:** the product is a consumer app or an e-commerce SKU — use `ecommerce-seo` for product catalogs.

## Instructions

1. Map search demand to the funnel. Define page types per stage: problem-aware (blog/use-case), solution-aware (solution page), evaluation (comparison, alternatives, integrations, pricing, security), purchase (product, docs, changelog). Every target keyword maps to exactly one page type; two page types competing for one query is the primary failure mode.
2. Prioritize comparison and alternative pages as the highest-leverage B2B surface: `{competitor} vs {you}`, `{you} alternatives`, `best {category} for {use case}`, `{you} for {industry}`. These convert at the highest rate and intercept competitor traffic directly.
3. Make comparison pages specific and honest: a real feature/pricing matrix with sourced data and a "last compared" date, a clear who-it's-for, and actual product screenshots. A thin "we're better" page ranks poorly and loses trust.
4. Build one page per integration only where a real query exists ("X + Y integration"), documenting real setup steps with real screenshots and naming the actual API objects. Templated integration pages with no real content are thin content.
5. Use free tools to earn links. Calculators, graders and generators solve a real job and get cited — they must produce a genuine result, be shareable via a URL, and be instrumented as a funnel step toward signup.
6. Decide the docs gating question explicitly. Docs for developers and operators can be indexed (they earn links and support evaluation); docs revealing your complete paid strategy stay gated. Gated pages get a visible `noindex`, never a robots.txt block, which leaves indexable bare URLs. Keep an ungated overview page to capture the informational query.
7. Optimize product and pricing pages as ranking assets: comparison-relevant specs, integrations, security and compliance proof (SOC 2, GDPR, SSO), and a clear who-it's-for. These match long-tail commercial queries such as "SOC 2 compliant {category} tool".
8. Build programmatic SEO only where a real data dimension exists (industry, company size, use case) with unique data and screenshots — never `{job-title} + {tool}` token pages. See `programmatic-seo`.
9. Track branded versus non-branded organic separately. Non-branded organic should drive most pipeline; if branded searches dominate, growth is brand-led rather than SEO-led.
10. Report to pipeline, not sessions: organic signups, trials started from non-branded organic, and assisted pipeline, plus rankings for the comparison/alternative/solution set — monthly.

## Patterns

Trial and pricing page structure, with the crawl rules that go with it:

```html
<head>
  <title>Pricing | Acme Analytics</title>
  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
  <link rel="canonical" href="https://acme.example/pricing/">
</head>
<body>
  <h1>Pricing</h1>
  <section itemscope itemtype="https://schema.org/Product">
    <h2 itemprop="name">Acme Pro</h2>
    <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
      <span itemprop="priceCurrency" content="USD">$</span><span itemprop="price" content="99.00">99</span>
      <meta itemprop="priceValidUntil" content="2026-12-31">
    </div>
  </section>
  <section> <!-- FAQ: visible Q&A; FAQPage markup is restricted to gov/health sites -->
    <h2>Can I cancel anytime?</h2><p>Yes, self-serve cancel from Settings &gt; Billing.</p>
  </section>
</body>
```

Route-level access policy for account surfaces, with explicit rules:

```typescript
export const routeAccess: Record<string, { index: "index" | "noindex" | "blocked" }> = {
  "/":                    { index: "index" },
  "/pricing/":            { index: "index" },
  "/docs/":               { index: "index" },
  "/changelog/":          { index: "index" },
  "/login":               { index: "noindex" },
  "/signup":              { index: "noindex" },
  "/app/**":              { index: "blocked" },  // robots.txt Disallow; no UI link ever points here
  "/api/**":              { index: "blocked" },
  "/settings/**":         { index: "noindex" },
  "/invite/**":           { index: "noindex" },  // token URLs: never shareable
};
// Note: "blocked" means robots.txt Disallow with NO noindex tag — the reverse
// combination (block + noindex) leaves the URL indexable as a bare result.
```

The free-tool page pattern that earns links and ranks:

```text
/acme-crawl-monitor/free
  - genuinely useful in-browser check, no signup wall
  - renders server-side: results table in the initial HTML
  - canonical self-reference, index,follow
  - captures an email only after the report is shown
  - internal links from /docs/ and every relevant comparison page
/acme-crawl-monitor/signup        -> 302 to /signup?plan=free (not indexable)
```

Docs and changelog as indexable demand capture:

```python
import re

ROUTES = ["/docs/getting-started", "/docs/log-file-analysis", "/docs/api-reference",
          "/changelog/2026-09-release-notes"]

def meta_for(path):
    slug = re.sub(r"^/|/$", "", path).replace("/", "-")
    return {"title": f"{slug.replace('-', ' ').title()} | Acme Docs",
            "description": f"Technical reference for {slug.replace('-', ' ')}.",
            "robots": "index,follow",           # never noindex an /app/ URL by pattern
            "canonical": f"https://acme.example{path}"}
```

Free-trial abuse surface that also leaks into search results:

```text
/app/signup?plan=pro&ref=seo-blog     -> noindex,follow + rel=nofollow on internal links
/auth/magic-link/<token>              -> noindex,noarchive + robots.txt Disallow
/embed/widget/<account_id>            -> X-Robots-Tag: noindex
/app/**                               -> robots.txt Disallow + HTTP auth
/oauth/authorize?client_id=...        -> robots.txt Disallow + noindex
```

## Checklist

- [ ] Every target keyword mapped to exactly one page type; no two page types share a query.
- [ ] Comparison/alternative pages built for top competitors and "best X for Y", with sourced data and a "last compared" date.
- [ ] Comparison content specific (feature/pricing matrix, screenshots, who-it's-for), not self-promotional.
- [ ] Integration pages exist only where a real query and real setup content exist.
- [ ] Free tools produce genuine, shareable, indexable results and are instrumented as a funnel step.
- [ ] Docs gating decided explicitly: indexed overview retained, gated detail `noindex` (not robots-blocked).
- [ ] Product/pricing pages carry comparison specs, integrations and compliance proof.
- [ ] No programmatic `{job-title}+{tool}` token pages; only data-backed dimensions used.

## Anti-patterns

- **Writing comparison pages that only claim superiority** — featureless competitor slander neither ranks nor builds trust. A sourced, dated, honest matrix earns links; a one-sided page earns nothing.
- **Gating all content behind signup** — fully gated blogs and docs generate no links, rank for nothing and feed no top-of-funnel. Keep the informational layer indexed; gate only the genuinely paid detail.
- **Blocking gated docs in robots.txt** — a robots-blocked page stays discoverable by URL and can appear indexed with no content. Use `noindex` plus authentication.
- **Building programmatic "{job_title} + tool" pages** — token pages with no unique value are the doorway-page pattern. Build them only with real vertical data and screenshots.
- **Optimizing for organic traffic without a conversion path** — B2B content with no demo/trial/pricing CTA earns sessions and zero pipeline. Every content type needs a next step tied to its funnel stage.

## References

- Google's `SoftwareApplication` and `SoftwareSourceCode` structured data support ratings and pricing for B2B product pages.
- Google's people-first content guidance rewards original, expert, genuinely useful content — the requirement for B2B content to outrank vendor SEO content.