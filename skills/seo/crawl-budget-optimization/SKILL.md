---
name: crawl-budget-optimization
description: Diagnoses and reduces Googlebot crawl waste using log-file hit ratios, crawl demand and recrawl cadence, response times and facet traps — prioritizing index coverage over request volume. Use when large sites index slowly, new pages take weeks to appear, or when asked how to increase crawl rate or stop Googlebot hitting useless URLs.
---

# Crawl Budget Optimization

**Use when:** Sites over roughly 10,000 URLs have slow index coverage, new or updated pages take days-weeks to surface, logs show Googlebot crawling thousands of non-indexable URLs, or a crawl-rate question comes up.
**Do not use when:** the site is small (under ~1,000 URLs) — every URL is crawled within days and crawl budget is not the constraint; diagnose content relevance instead via `keyword-research`.

## Instructions

1. Establish the premise with data. Compute mean Googlebot requests per day from 30+ days of server logs and compare with Search Console coverage (`indexed ÷ submitted`). A hit-to-submitted ratio under ~0.5 with high submissions means a discovery problem; a ratio near 1.0 with low coverage means an indexation problem, not a crawl problem.
2. Classify every Googlebot request into buckets: content, pagination, faceted/sorted, session and tracking URLs, redirects, 4xx, 5xx, blocked and static assets. Report each as a share of total hits. Anything over 10% on non-content URLs is the primary waste source.
3. Calculate crawl demand honestly. Google publishes no crawl budget figure, so derive it: `daily_googlebot_hits × 30 ÷ known_urls` gives recrawl cadence. A site recrawled every 90+ days cannot absorb change; one recrawled every 3 days has headroom.
4. Eliminate facet traps at the source. For faceted navigation pick a strategy: render facets client-side with no crawlable href, serve `noindex` and keep them out of the sitemap, or implement `robots.txt` disallow plus `noindex` — noting that `disallow` alone leaves URL-only index entries, so both are needed for full removal.
5. Fix server response times. Crawl rate is sensitive to latency; sustained 5xx and slow (2s+) responses reduce effective crawl frequency. Target TTFB under 600ms for bot requests and emit cacheable response headers Googlebot can store.
6. Confirm robots.txt does not block CSS, JS or images on critical templates. Googlebot needs those to render; blocked resources mean it crawls an empty document.
7. Treat internal linking as the discovery mechanism. Every orphan or weakly-linked page is invisible to crawl demand; ensure each indexable URL has at least one contextual inlink (see `internal-linking`).
8. Keep the XML sitemap current, well-formed and under 50,000 URLs / 50MB uncompressed per file. Sitemaps speed discovery; they do not override crawl limits.
9. Validate with a two-week A/B: change one lever (fix facet links, improve server time) and observe indexed-page growth and hit distribution. Expect coverage gains first, rankings later.
10. Track crawl efficiency as an ongoing KPI — `indexed ÷ crawled` and `useful_hits ÷ total_hits`, weekly. Report these to stakeholders, not raw crawl counts.

## Patterns

Server log query — how many pages Googlebot fetches per crawl session:

```sql
-- crawl sessions = gaps > 6h in Googlebot activity
WITH g AS (
  SELECT *, lag(ts) OVER (ORDER BY ts) AS prev_ts
  FROM bot_hits WHERE user_agent = 'Googlebot'
), sessions AS (
  SELECT *, sum(CASE WHEN ts - prev_ts > interval '6 hours' THEN 1 ELSE 0 END)
              OVER (ORDER BY ts) AS session_id FROM g
)
SELECT session_id, date_trunc('hour', min(ts)) AS session_start,
       count(*) AS requests, count(DISTINCT url) AS unique_urls,
       round(count(*)::numeric / count(DISTINCT url), 2) AS requests_per_url
FROM sessions GROUP BY session_id ORDER BY session_id DESC LIMIT 14;
```

Classify every Googlebot request (replaces intuition with a verdict per URL):

```python
import pandas as pd

def classify(df):
    df = df.copy()
    df["is_js"]        = df.url.str.contains(r"\.js(\?|$)", regex=True)
    df["is_asset"]     = df.url.str.contains(r"\.(css|png|jpe?g|webp|svg|woff2?|ico|mp4)(\?|$)", regex=True)
    df["is_param"]     = df.url.str.contains(r"[?&](utm_|gclid|fbclid|sessionid|sort|filter|page=)", regex=True)
    df["is_redirect"]  = df.status.between(300, 399)
    df["is_5xx"]       = df.status.between(500, 599)
    df["priority"]     = df.status.eq(200) & ~df.is_js & ~df.is_asset
                         & ~df.is_param & ~df.is_redirect & ~df.is_5xx
    return df

report = classify(pd.read_parquet("googlebot.parquet"))
print(report[report.priority].url.value_counts().head(50))
print("wasted hits:", report[~report.priority].shape[0], "of", len(report))
```

Change one thing, then measure before/after from logs:

```python
def crawl_efficiency(df):
    g = df[df.priority]
    return {"requests": len(df), "priority_requests": len(g),
            "waste_ratio": round(1 - len(g) / len(df), 3),
            "unique_urls_fetched": df.url.nunique(),
            "p95_response_ms": round(df.response_time_ms.quantile(0.95))}

before = crawl_efficiency(pd.read_parquet("before.parquet"))
after  = crawl_efficiency(pd.read_parquet("after.parquet"))
assert after["requests"] < before["requests"] and after["waste_ratio"] <= before["waste_ratio"]
```

Server response budget — the page a crawler must render in under ~500ms TTFB:

```nginx
location / {
  try_files $uri $uri/ /index.php?$query_string;   # one hop, no chained redirects
  add_header X-Robots-Tag "index,follow" always;
}
fastcgi_keep_conn on;
gzip on; gzip_types text/html application/json image/svg+xml;
# render-blocking third-party scripts are the main TTFB/speed tax on crawled pages
```

```python
# Facet explosion guard: cap combinable parameters and noindex anything else
ALLOWED_PARAMS = {"page", "sort", "brand", "color"}
if set(request.GET) - ALLOWED_PARAMS:
    return render(request, "404.html", status=404)          # not a real page
if len(product_ids) > 5000:                                   # never render a 50k-cell grid
    return render(request, "facet-too-large.html", status=200)
```

## Checklist

- [ ] 30+ days of logs analyzed, Googlebot hits bucketed by intent with counts and URLs.
- [ ] Recrawl cadence computed from actual daily hits and URL count; assumption stated explicitly.
- [ ] Facet/sort/filter URLs identified with hit counts, and a control strategy chosen.
- [ ] `robots.txt` disallow paired with `noindex` for URL-only index entry removal.
- [ ] robots.txt verified to allow the CSS/JS/images required to render key templates.
- [ ] Server TTFB under 600ms for bot requests with cacheable response headers.
- [ ] Every indexable URL has at least one internal inlink; orphans reported.
- [ ] XML sitemap valid, current, under 50k URLs and free of faceted/parameter URLs.

## Anti-patterns

- **Adding `Disallow: /` and waiting for faster crawling** — blocking Googlebot entirely stops recrawls and deindexes over time. Block only true traps; never block the site.
- **Using `Disallow` alone to remove faceted URLs** — Google has stated a disallowed URL can still appear in the index as a bare link. `disallow` stops crawling; `noindex` stops indexing. Both are needed.
- **Waiting for a sitemap to force crawls of deep pages** — sitemaps aid discovery but do not override crawl limits on a starved site. Fix the internal link graph and server response times.
- **Treating crawl rate as the goal rather than index coverage** — 10M Googlebot hits a day and 100 indexed pages is failure. Optimize `indexed/crawled`, not request volume.
- **Assuming small sites have crawl-budget issues** — under 1,000 URLs, crawl budget is never binding, so diagnosing "low crawl rate" on a 300-page site wastes the engagement.

## References

- Google Search Central documents `Disallow` (crawl control) versus `noindex` (index control), and states a disallowed page can still appear in results as a URL-only entry.
- Googlebot identifies itself as `Googlebot/2.1 (+http://www.google.com/bot.html)`; verify by reverse DNS on the source IP to filter spoofed user agents.