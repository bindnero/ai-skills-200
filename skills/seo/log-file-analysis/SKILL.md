---
name: log-file-analysis
description: Analyzes server logs for Googlebot behavior — crawl demand, hit buckets, crawl traps, response-time and status impact, index-coverage correlation and discovery lag. Use when diagnosing crawl-rate or index-coverage problems, quantifying crawl waste, or when crawl-budget questions need evidence from logs.
---

# Log File Analysis

**Use when:** Diagnosing why pages are discovered slowly, quantifying crawl waste, validating crawl-budget assumptions, or correlating response times and status codes with index coverage; also for finding crawl traps and discovery lag.
**Do not use when:** there are no raw access logs with status, referrer and user agent — configure log forwarding first; CDN logs often contain fields combined logs lack.

## Instructions

1. Acquire at least 30 days of uncompressed combined-format access logs covering Googlebot, Bingbot and (as a baseline) Chrome. Include CDN logs when behind Cloudflare, CloudFront or Fastly — edge logs carry cached status, bot score and edge latency that origin logs lack.
2. Verify Googlebot authenticity before trusting the data; spoofed user agents inflate the counts. Check the reversed IP against `googlebot.com`/`google.com`, or use a CDN-provided verified-bot field. Analyze verified requests only.
3. Build a clean data model: parse timestamp, path, query, status, bytes, referrer, user agent and (if present) response time. Split path and query, strip fragments, normalize lowercase, keep the raw URL. One row per request — never aggregate prematurely.
4. Bucket every Googlebot request by intent: content, pagination, faceted/sorted, search, listing/tag, static assets, tracking-parameter, redirect, 4xx, 5xx, blocked. Compute hits *and* distinct URLs per bucket — many hits on few URLs means a trap; many URLs means sprawl.
5. Compute crawl demand: `daily_googlebot_hits`, crawl sessions (bursts separated by >30 minutes), mean URLs per session, and `recrawl cadence = (daily_hits × 30) / known_urls`. Compare against `indexed ÷ submitted` to classify the site as starved, over-crawled or healthy.
6. Analyze the 5xx and latency correlation: plot daily Googlebot hits against daily p75 response time and 5xx rate. When latency rises crawl rate falls — quantify the elasticity in your own data. Target bot TTFB under 600ms.
7. Detect traps and hot spots: URLs crawled 10+ times in 30 days and never indexed (waste plus index-bait), URLs returning soft-404s (200 status with thin/empty content), and parameter spaces where facet hits exceed content hits.
8. Measure discovery lag by content type. For URLs updated in the last 90 days compute days-to-first-Googlebot-hit and days-to-first-impression (GSC). Blog posts at 30+ days while categories show 3 means the internal link graph is the bottleneck, not crawl budget.
9. Audit bot politeness and CDN interference: confirm no WAF challenge or rate limit blocks verified Googlebot (challenges surface as 4xx/5xx in logs), that robots.txt does not deny assets, and that response headers let Googlebot cache responses.
10. Report monthly on the same metrics — hit buckets, cadence, 4xx/5xx rate, TTFB p75, days-to-first-crawl, indexed ratio — with alert thresholds (5xx >1%, content-hit share <60%). Trend, do not snapshot.

## Patterns

CDN/server log field map (common columns, order varies by vendor):

```nginx
# Combined log + extra fields, one JSON object per line
log_format seo_json escape=json '{'
  '"ts":"$time_iso8601",'
  '"method":"$request_method",'
  '"uri":"$uri",'
  '"query":"$query_string",'
  '"status":$status,'
  '"bytes":$body_bytes_sent,'
  '"ttfb":$request_time,'
  '"ua":"$http_user_agent",'
  '"referer":"$http_referer"'
'}';
access_log /var/log/nginx/seo_access.json seo_json;
```

Googlebot hit-rate by directory (DuckDB over gzipped logs):

```sql
WITH hits AS (
  SELECT * FROM read_json_auto('logs/*.json.gz')
  WHERE ua LIKE '%Googlebot%' AND ua NOT LIKE '%Googlebot-Image%'
)
SELECT regexp_extract(uri, '^/[^/]+')                       AS section,
       count(*)                                             AS hits,
       count(DISTINCT uri)                                  AS unique_urls,
       round(count(*) / count(DISTINCT uri), 1)             AS hits_per_url,
       round(avg(ttfb), 3)                                  AS avg_ttfb_s,
       count(*) FILTER (WHERE status >= 400)                AS errors
FROM hits GROUP BY section ORDER BY hits DESC;
```

Priority crawl — the URLs Googlebot fetches most often:

```sql
SELECT uri, count(*) AS fetches,
       count(*) FILTER (WHERE status = 200) AS ok,
       max(ts)                              AS last_seen
FROM hits
WHERE status = 200
  AND uri NOT LIKE '%/api/%' AND uri NOT LIKE '%.js'
GROUP BY uri ORDER BY fetches DESC LIMIT 50;
```

Crawl waste from parameter space:

```sql
SELECT regexp_extract(query, '^[^&]*') AS param, count(*) AS hits,
       count(DISTINCT uri || '?' || query) AS unique_urls
FROM hits WHERE query <> ''
GROUP BY param ORDER BY hits DESC;
```

Server error clustering, to find the 5xx URLs that suppress crawling:

```sql
SELECT uri, status, count(*) AS hits, max(ts) AS last_seen
FROM hits WHERE status >= 500 GROUP BY uri, status ORDER BY hits DESC;
```

Gzip rotation so the crawler log is retained long enough to be useful:

```bash
/var/log/nginx/rotate-seo-logs.sh:
  daily rotate /var/log/nginx/seo_access.json -> seo_access-$(date -d yesterday +\%Y-\%m-\%d).json.gz
  keep 180 days (Googlebot recrawl latency on large sites runs to weeks)
```

## Checklist

- [ ] 30+ days of uncompressed logs acquired, CDN logs included if behind an edge.
- [ ] Googlebot verified by reverse DNS or CDN verified-bot flag; spoofed UAs excluded.
- [ ] Data model built with status, referrer, UA and response time; path/query split and normalized.
- [ ] Every Googlebot request bucketed by intent; hits and distinct URLs computed per bucket.
- [ ] Crawl demand, sessions, URLs/session and recrawl cadence calculated; site classified.
- [ ] Index coverage ratio correlated with hit buckets to name the actual constraint.
- [ ] 4xx/5xx rate and TTFB p75 computed daily and correlated with daily hit count.
- [ ] Crawl traps identified (10+ crawls, never indexed) with wasted hit totals.

## Anti-patterns

- **Treating crawl budget as one site-wide number** — no such figure exists and crawl rate adapts per site. Measure per URL group and content type, not per domain.
- **Trusting every `Googlebot` user agent** — scrapers mimicking the UA can dominate the "Googlebot" count and send you optimizing for a fiction. Verify by reverse DNS or CDN bot field.
- **Counting static asset hits as crawl waste** — a healthy crawl includes the CSS/JS/images needed to render; blocking them hurts more than the hits save. Classify assets separately and leave them allowed.
- **Analyzing 7 days of logs after an incident** — crawl sessions, 5xx spikes and weekly bursts need 30+ days to separate signal from noise; short windows produce confidently wrong conclusions.
- **Increasing crawl rate as the goal** — more hits with flat coverage means Googlebot is re-crawling the same wrong URLs. Optimize indexed-per-crawled, not request volume.

## References

- Google Search Central's crawler documentation defines Googlebot, its fetch behavior and the role of robots.txt, and states crawl rate is not user-configurable.
- Log fields vary by CDN (Cloudflare `cf-bot-score`, Fastly `CDN-Status`); a CDN's verified-bot field is more reliable than reverse DNS.