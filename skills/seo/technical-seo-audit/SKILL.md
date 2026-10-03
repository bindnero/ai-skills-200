---
name: technical-seo-audit
description: Runs a full technical SEO audit of a site from crawl exports, XML sitemaps, log files and analytics, covering indexability, crawl waste, duplicate/thin URL clusters, redirect chains, status-code errors and Core Web Vitals. Use when organic traffic or rankings drop, before or after a migration, or when asked for a technical SEO audit or site health report.
---

# Technical SEO Audit

**Use when:** Organic sessions, index coverage or rankings degrade, a migration just shipped, or a stakeholder asks for a full site-health report.
**Do not use when:** The task is ranking a single query or picking keywords — use `serp-analysis` or `keyword-research`.

## Instructions

1. Establish scope and a date-stamped baseline. Pull Google Search Console (last 16 months, to capture seasonality), GA4 landing-page report, the full XML sitemap, and a fresh crawl export (Screaming Frog, Sitebulb, or `wget --spider`). Never audit a subfolder of a site and generalize to the whole domain.
2. Crawl with JavaScript rendering ON, and crawl the sitemaps separately from the domain. Comparing the two reveals URLs Google knows about that the internal link graph does not.
3. Build the URL inventory. Normalize to lowercase, strip tracking parameters, resolve `index.html` vs directory forms, and collapse `www`/non-`www`. Report the true unique-URL count, not the raw row count.
4. Segment every URL into a status bucket: 200 indexable, 200 noindex, 3xx, 4xx, 5xx, soft-404, blocked-by-robots.txt, canonical-conflict. Compute each bucket as a percentage of total and rank by *lost traffic*, using GSC clicks as the weighting function.
5. Identify crawl traps. Any directory of paginated or faceted URLs that is internally linked from a template is a trap. Confirm reachability with a depth-limited crawl from `/` and flag any URL more than 4 clicks deep.
6. Detect duplicate content clusters. Group by near-identical title, by shared body text hash, and by one-hop canonical equivalence. Report the canonical target of each cluster and whether that target is itself indexable.
7. Audit the internal link graph: orphans (in sitemap, zero inlink), pages with more than 100 unique on-page internal links, and pages whose only inbound links come from the footer.
8. Audit Core Web Vitals at the 75th percentile using CrUX field data joined to GSC. Never substitute Lighthouse lab scores; they are diagnostic, not ranking input.
9. Audit structured data validity (Schema Markup Validator + Rich Results Test) and mobile parity (rendered DOM vs served HTML).
10. Write findings as a prioritized backlog: P0 blocks indexation or causes loss of existing rankings, P1 wastes crawl budget or suppresses rich results, P2 is efficiency. Every P0/P1 row must carry the URL pattern, a count, and an estimated click delta so it can be validated after the fix.

## Patterns

Segment a crawl export to find the expensive buckets:

```python
import pandas as pd, re, urllib.parse as up

crawl = pd.read_csv("crawl_export.csv")
crawl["path_norm"] = (
    crawl["url"].str.replace(r"^https?://(www\.)?", "", regex=True)
                .str.replace(r"/index\.html$", "/", regex=True)
                .str.rstrip("/").str.lower())
parts = crawl.path_norm.str.split("?", regex=False).str[0]
crawl["path_norm"] = parts          # drop tracking/session params before counting

segments = {
    "indexable_200": crawl[(crawl.status_code == 200) & crawl.indexable],
    "noindex":       crawl[(crawl.status_code == 200) & ~crawl.indexable],
    "redirects":     crawl[crawl.status_code.between(300, 399)],
    "errors_4xx":    crawl[crawl.status_code.between(400, 499)],
    "errors_5xx":    crawl[crawl.status_code.between(500, 599)],
    "blocked":       crawl[crawl.status_code == 0],
}
for name, df in segments.items():
    print(f"{name:>14}: {len(df):>7}  ({len(df)/len(crawl):.2%})")
```

Quantify crawl waste and demand from logs:

```sql
SELECT CASE
         WHEN request LIKE '%facet/%' OR request LIKE '%?sort=%' THEN 'facet_or_sort'
         WHEN request LIKE '%?page=%' THEN 'pagination'
         WHEN referer = '-' THEN 'direct_bot_hit'
         ELSE 'content' END AS bucket,
       COUNT(*) AS hits, COUNT(DISTINCT url) AS urls,
       ROUND(AVG(response_time_ms)) AS avg_ms
FROM bot_hits
WHERE user_agent LIKE '%Googlebot%' OR user_agent LIKE '%bingbot%'
GROUP BY bucket ORDER BY hits DESC;
```

Prioritise findings by lost clicks, not by URL count:

```python
priority = (gsc_clicks.at[idx] * (0.6 if idx in noindex_set else 0.2)
            + url_count_in_pattern * 1.0
            * (2.0 if crawl_depth >= 4 else 1.0))
```

## Checklist

- [ ] JavaScript-rendered crawl and sitemap-only crawl compared; sitemap-only URLs listed separately.
- [ ] Status/indexability buckets reported with counts and percentages.
- [ ] Full redirect chains (not just hop 1) walked to the terminal 200 or verified loop.
- [ ] Duplicate clusters mapped to a canonical target that is itself indexable and 200.
- [ ] Orphans and 4+ click depth URLs enumerated from the internal link graph.
- [ ] CWV reported at p75 from CrUX/field data with the affected URL templates named.
- [ ] Every P0/P1 finding has a count and an estimated click delta.
- [ ] No findings rely on Lighthouse lab scores as the stated field value.

## Anti-patterns

- **Auditing the domain root with `/` off the crawl scope** — misses everything under `/blog`, `/shop` and locale prefixes. Crawl the sitemap entries, not just the homepage.
- **Treating `total crawl budget` as a fixed quota you can inspect** — Google publishes no crawl-budget dashboard. Estimate waste ratio from log data instead; inventing a "budget of 10,000 URLs/day" leads to wrong priorities.
- **Deferring `noindex` removal to "phase 2"** — `noindex` on a page already earning clicks deletes that ranking immediately. Rank `noindex` fixes above everything else.
- **Recommending `meta robots` to block faceted URLs** — meta robots stops crawling but the facets stay in the index as URL-only results. Facet control needs `noindex` + crawl restriction, not `disallow`.
- **Fixing thin templates by adding more words** — a faceted page with 12 near-identical products will not become unique with copy. Remove the URLs from the graph or give the template a genuinely distinct data source.

## References

- Google Search Console Crawl Stats index (host status, crawl requests, indexed count) is the only first-party crawl data available.
- CrUX field data via the PageSpeed Insights API returns `loadingExperience.metrics.LARGEST_CONTENTFUL_PAINT_PERCENTILE` at p75 per origin+URL.