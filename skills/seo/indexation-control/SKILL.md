---
name: indexation-control
description: Controls which URLs Google may index using meta robots, X-Robots-Tag headers, index-coverage status diagnosis and utility-URL exclusion patterns. Use when pages are indexed that should not be, when important pages are excluded, when Search Console coverage reports errors, or when protecting staging.
---

# Indexation Control

**Use when:** Search Console's Page Indexing report shows "Excluded by noindex", "Discovered – currently not indexed", "Crawled – currently not indexed" or "Duplicate" statuses, or when deciding how to exclude search, cart, account and filtered URLs.
**Do not use when:** the question is which directive to use and why — the mechanics of robots.txt vs canonical vs meta robots belong to `robots-and-canonicals`.

## Instructions

1. Read the Page Indexing report by status, then by URL. The taxonomy is diagnostic: "Discovered – currently not indexed" means not crawled (crawl budget or architecture problem); "Crawled – currently not indexed" means crawled and rejected (quality/thin/duplicate judgment); "Duplicate, Google chose different canonical" means a canonical conflict; "Blocked by robots.txt" means a crawl block.
2. Never rely on `noindex` alone. `noindex` requires Googlebot to crawl the URL to see it. If a URL is both `noindex` and disallowed in robots.txt, Googlebot never sees the directive and the URL can persist as a bare link. Correct pattern: allow crawling, serve `noindex`, keep it out of the sitemap.
3. Prefer `X-Robots-Tag` headers over meta tags when a template's HTML is shared with indexable pages — headers are harder to accidentally drop on a template edit, and the header takes precedence over meta robots.
4. Decide per URL class and write the decision as a table with the mechanism, not a preference. Utility pages (search, cart, account, print views, tag archives) → crawlable + `noindex` + out of sitemap. Truly infinite-space URLs (internal search, endless facet sort) → `disallow` plus `noindex` as defense in depth. Staging → password, IP allowlist or `disallow` with `noindex`, never indexed.
5. Fix "Crawled – currently not indexed" by changing the page, not the directive. These URLs were seen and judged not worth indexing: thin, duplicate or unendorsed. Add unique content, consolidate with a stronger version, or merge and 301.
6. Resolve "Duplicate, Google chose different canonical" by aligning signals. A wrong chosen canonical usually means conflicting self-canonicals across www/non-www or http/https, a canonical pointing to a redirect, or a canonical in the sitemap that disagrees with the page. Make one absolute canonical and set it in page, sitemap, internal links and hreflang.
7. Use `noarchive` only for cache-news-style pages; it is not a substitute for `noindex` and does not prevent indexing.
8. Avoid `nosnippet` and `max-snippet:0` on commercial pages. They suppress rich results — reviews, price, breadcrumbs — along with snippets, costing more than they gain. Reserve them for genuine snippet-theft concerns.
9. Protect non-production environments properly: HTTP auth, VPN or IP allowlist, or `robots.txt Disallow: /` plus a staging `noindex`. Never expose staging on the production hostname relying on a canonical pointing at production — Google will discover and index the duplicate.
10. Verify each change class with URL Inspection → "Test live URL", confirm the returned or rendered robots directive, then re-check Page Indexing 2–4 weeks later for the status to update.

## Patterns

Intent-first matrix — this decides whether a URL needs `noindex` or a robots block:

```python
INTENTS = {
    "should_rank":            "index,follow",
    "rank_but_no_snippet":    "index,follow,nosnippet",
    "keep_out_of_index":      "noindex,follow",   # crawlers MUST be allowed to see the tag
    "save_crawl_budget":      "Disallow in robots.txt, accept a bare-URL result",
    "needs_redirect":         "301 to the closest real equivalent",
    "gone_forever":           "410 Gone (or 404 if 410 is not supported by the CDN)",
}
# Rule that breaks most sites: never combine robots.txt Disallow with a noindex tag
# on the same URL. Google must fetch the page to read the tag; blocking it guarantees
# the URL can stay in the index as a bare result with no snippet, forever.
```

X-Robots-Tag for PDFs and assets, where meta robots cannot be read:

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
X-Robots-Tag: noindex, noarchive, nosnippet, unavailable_after: 20 Oct 2026 08:00:00 GMT
Cache-Control: private, max-age=0
```

nginx conditions so a `noindex` tag and a robots block never meet on one URL:

```nginx
# thin paginated combinations: noindex in the HTML, crawlable by design
location ~* ^/(products|blog)/(.*)/page-([2-9]|[1-9][0-9]+)/?$ {
  add_header X-Robots-Tag "noindex,follow" always;
  try_files $uri $uri/ @app;
}

# genuinely infinite crawl space (search, faceted): block crawling instead,
# and if a bare URL must disappear from results, temporarily flip to noindex first
location /search/          { add_header X-Robots-Tag "noindex,follow" always; try_files $uri @app; }
location /products/*sort=* { return 301 $is_args$args; }
```

`noindex` in HTML — `content` attribute values are case-insensitive and space-separated:

```html
<meta name="robots" content="noindex, follow">
<meta name="googlebot" content="noindex">
<meta name="googlebot" content="noarchive">
```

Account and staging surfaces:

```text
https://staging.example.com/          -> robots.txt Disallow: / + HTTP auth
https://app.example.com/               -> robots.txt Disallow: / + noindex header + auth
https://example.com/?preview_token=    -> noindex,follow until token expires
```

Verification, in order — never assume the tag was honoured:

```python
def audit_indexation(urls):
    rows = []
    for u in urls:
        gsc_noindex   = int(gsc_queries[sitemaps.detected_noindex(u)]) if sitemaps.detected_noindex(u) else 0
        gsc_crawled   = int(gsc_queries[sitemaps.detected_crawled(u)]) if sitemaps.detected_crawled(u) else 0
        tag_noindex   = noindex_tag(u)
        robots_block  = robots_disallows(u)
        rows.append({"url": u, "tag_noindex": tag_noindex, "robots_block": robots_block,
                     "gsc_crawled": gsc_crawled, "gsc_not_indexed": gsc_noindex,
                     "verdict": "verify" if (tag_noindex and robots_block) or (tag_noindex and gsc_crawled == 0)
                               else "ok"})
    return pd.DataFrame(rows)
```

## Checklist

- [ ] Page Indexing report read by status, each mapped to a distinct cause before acting.
- [ ] No URL relies on `noindex` plus `disallow` together (the bare-link trap).
- [ ] Utility URLs are crawlable + `noindex` + out of sitemap, verified in URL Inspection.
- [ ] `X-Robots-Tag` used wherever a shared template risks a lost meta tag.
- [ ] "Crawled – currently not indexed" addressed by content change or consolidation, not new directives.
- [ ] "Duplicate, Google chose different canonical" resolved to one canonical across page, sitemap, links and hreflang.
- [ ] No `nosnippet` or `max-snippet:0` on commercial pages carrying rich-result types.
- [ ] Staging/preview protected by auth or IP allowlist, not only by canonical.

## Anti-patterns

- **Adding `noindex` to a URL already blocked in robots.txt** — Google never fetches it, never reads the directive, and the URL can stay in the index as a bare link indefinitely. This is the most common indexation mistake.
- **Using `noindex` to deprioritize a page that should rank** — `noindex` is not a lower-priority signal; it removes the page from the index and drops its ranking. Use canonical consolidation or internal-linking downgrades for prioritization.
- **Keeping faceted and search URLs out of the sitemap while fully linking them in HTML** — out of the sitemap is necessary but insufficient. Without `noindex` they get crawled and indexed as thin pages.
- **Treating "Crawled – currently not indexed" with a directive** — these were crawled and judged low value. `noindex` deletes them (correct) but hides the real issue: tens of thousands of low-value pages. Fix the architecture, not the directive.
- **Blocking `/css/`, `/js/` and `/img/` to save crawl budget** — Googlebot cannot render without them, so the rendered page looks empty and is judged low quality or non-mobile-friendly. This damages the pages it was meant to protect.

## References

- Google's robots meta tag documentation warns that `noindex` will not be seen if the resource is also blocked by robots.txt, and recommends `noindex` for deindexing.
- Search Console's Page Indexing report status definitions are the authoritative diagnostic taxonomy for coverage states.