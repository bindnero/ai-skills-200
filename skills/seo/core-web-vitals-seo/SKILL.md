---
name: core-web-vitals-seo
description: Diagnoses and fixes LCP, INP and CLS from field data at the 75th percentile, plus the TTFB, render-blocking and long-task causes behind them. Use when Search Console or PageSpeed Insights shows Core Web Vitals failures, when organic CTR is unstable across devices, or when performance work is framed as SEO.
---

# Core Web Vitals SEO

**Use when:** Search Console's Core Web Vitals report shows failing or "needs improvement" URLs, PageSpeed Insights field data is red, or a performance regression coincides with organic CTR and ranking changes.
**Do not use when:** the problem is JavaScript indexing rather than performance — a page can be fast and still unrenderable; use `indexation-control`.

## Instructions

1. Establish the baseline from field data at the 75th percentile, never lab scores. Source: Search Console → Core Web Vitals grouped by URL template and device, or CrUX. Record pass rate, median and p75 for LCP, INP and CLS separately per device.
2. Classify against Google's current thresholds: LCP good ≤2.5s, NI ≤4.0s, poor >4.0s; INP good ≤200ms, NI ≤500ms, poor >500ms; CLS good ≤0.1, NI ≤0.25, poor >0.25. Applied at p75 over 28 days; field data requires traffic volume, so low-traffic URLs produce no verdict.
3. Attribute LCP. Dominant causes in order: slow TTFB, render-blocking CSS/JS in the head, an unoptimized hero image (no `fetchpriority`, no `srcset`, oversized AVIF/WebP), client-rendered hero, and slow third-party scripts above the fold. Find the real LCP element with a `PerformanceObserver` rather than assuming it is the hero.
4. Attribute INP. The cause is almost always a long task on the interaction path: tag managers, ads, chat widgets or heavy hydration. Find long tasks in a DevTools trace, map each to a script origin via attribution, and remove or defer the offenders. Do not report FID.
5. Attribute CLS. Causes are unsized media and late-inserted elements: images/iframes without `width`/`height` or `aspect-ratio`, fonts swapping without `size-adjust`, ad slots and consent banners inserting at the top. Reserve space for every dynamic region.
6. Set TTFB as the gate, under 600ms at p75, via edge caching, server-side rendering of above-the-fold content and no blocking third-party script in `<head>`. All other LCP gains are downstream of TTFB.
7. Optimize images mechanically: AVIF/WebP with fallback, `srcset`/`sizes`, `loading="lazy"` for everything below the fold (never the LCP element), `decoding="async"`, explicit dimensions and `fetchpriority="high"` on the LCP image.
8. Optimize the critical path: inline critical CSS, defer the rest with `media="print" onload="this.media='all'"`, load JS with `type="module"` or `defer`, remove render-blocking third-party scripts. Target under 150KB critical-path CSS.
9. Validate in field, not lab. Deploy, wait 28 days for CrUX, re-check the pass rate. Use Lighthouse in CI as a regression guard, but report field data to stakeholders.
10. Report per template, not per URL. Field CWV needs sufficient sessions per URL; group small pages by template and fix the template.

## Patterns

Field data query — group by template, not by URL:

```sql
SELECT page_template, count(*) AS sessions,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp_ms)  AS p75_lcp,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY inp_ms)  AS p75_inp,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY cls)     AS p75_cls
FROM vitals
WHERE is_bot = false AND date >= current_date - INTERVAL '28 days'
GROUP BY page_template
HAVING count(*) > 1000
ORDER BY p75_lcp DESC;
```

CrUX / PageSpeed API for URL-level truth:

```javascript
const res = await fetch(
  `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile`);
const lcp = res.largestContentfulPaint, cls = res.cumulativeLayoutShift;
const inp = res.interactionToNextPaint ??
            res.experimental?.interactionToNextPaint;
const passed = lcp.numericValue <= 2500 && cls.numericValue <= 0.1
                                 && inp <= 200;
```

Server-side fix for a slow TTFB, the metric crawlers and users both feel:

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=html_cache:50m
                 max_size=2g inactive=24h use_temp_path=off;

location / {
  proxy_cache html_cache;
  proxy_cache_key "$scheme$request_method$host$request_uri";
  proxy_cache_valid 200 301 302 10m;      # HTML TTL, not micro-cache
  proxy_cache_use_stale error timeout updating http_500 http_502 http_503;
  proxy_cache_lock on;                    # collapse the crawl stampede
  proxy_pass http://app;                  # render time dominates TTFB
  add_header X-Cache-Status $upstream_cache_status;
}
```

Layout-shift fix without content jumps:

```css
img, video { aspect-ratio: attr(width) / attr(height); height: auto; }
.hero { min-height: 420px; }                     /* reserve space before hydration */
.ad-slot { width: 300px; height: 250px; }        /* reserve ad space explicitly */
@font-face { font-display: swap; size-adjust: 104%; }   /* metric-matched fallback */
```

Measure in the field after the change, not just in Lighthouse:

```python
import requests, pandas as pd

def crux_trend(url, months=6):
    key = "API_KEY"
    r = requests.get("https://chromeuxreport.googleapis.com/v1/records:queryRecord",
                     headers={"X-goog-api-key": key},
                     params={"formFactor": "PHONE", "metric": "LARGEST_CONTENTFUL_PAINT_MS",
                             "collectionKey": f"https://{url}"}, timeout=30).json()
    rows = [(p["key"], d["metrics"]["LARGEST_CONTENTFUL_PAINT_MS"]["percentiles"]["p75"])
            for p in r["record"]["metrics"] for d in p["dataPoints"]]
    return pd.DataFrame(rows, columns=["month", "p75_lcp"]).sort_values("month")

trend = crux_trend("https://example.com/")
assert trend.iloc[-1].p75_lcp < trend.iloc[0].p75_lcp, "field LCP did not improve"
```

Blocking-request audit that drives both INP and crawl cost:

```javascript
const longTasks = await PerformanceObserver.getEntriesByType("longtask");
const thirdParty = longTasks.filter(t => !t.name.includes(location.host));
console.table(thirdParty.map(t => ({ task: t.name.slice(0, 60),
                                     ms: Math.round(t.duration) })));
// any third-party task >50ms is a candidate for defer, facade or removal
```

## Checklist

- [ ] Baseline from field data (CrUX/Search Console) at p75, per device and per template.
- [ ] LCP, INP and CLS verdicts computed against current thresholds; FID not reported.
- [ ] LCP element identified in the field, not assumed to be the hero.
- [ ] Every long task >50ms attributed to a script origin; third-party offenders removed or deferred.
- [ ] Every image/embed/ad slot has explicit dimensions or `aspect-ratio`.
- [ ] TTFB p75 under 600ms with edge caching and server-rendered above-the-fold content.
- [ ] LCP image has `fetchpriority="high"`, `srcset` and explicit dimensions; all others `loading="lazy"`.
- [ ] Critical CSS inlined and deferred; no render-blocking third-party script in `<head>`.

## Anti-patterns

- **Reporting Lighthouse lab scores as Core Web Vitals** — Lighthouse runs a simulated throttled device; only real p75 field data is used. A lab 95 does not mean the field passes.
- **Assuming INP is a bundle-size problem** — the cause is long tasks on the interaction path, usually third-party scripts that no amount of your own code splitting removes.
- **Lazy-loading the LCP image** — `loading="lazy"` on the hero delays LCP unpredictably. The LCP element stays eager with `fetchpriority="high"`.
- **Fixing CLS with `visibility:hidden` containers** — hiding reserved space trades CLS for a blank region and hurts perceived quality. Reserve real space with `aspect-ratio` or `min-height`.
- **Optimizing per-URL on low-traffic pages** — field CWV needs enough sessions per URL; low-traffic pages never yield a verdict. Fix the template and let it propagate.

## References

- web.dev/vitals defines the thresholds and the 75th-percentile, 28-day window used by CrUX and Search Console.
- Google's use of Core Web Vitals as a ranking signal is confirmed; the exact weight is undisclosed and not worth estimating.