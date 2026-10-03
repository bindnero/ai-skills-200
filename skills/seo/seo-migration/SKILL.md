---
name: seo-migration
description: Plans and executes SEO-preserving site migrations — URL maps, 301 chains, staging validation, pre/post traffic parity, sitemap and hreflang updates, and post-launch monitoring. Use when changing domains, platforms or URL structures, moving to HTTPS, consolidating subdomains, or when traffic drops after a launch.
---

# SEO Migration

**Use when:** Changing domain, CMS, platform or URL structure, moving to HTTPS, consolidating subdomains or paths, or when organic traffic drops sharply after a launch.
**Do not use when:** only a few pages are rewritten in place with unchanged URLs — use `on-page-seo` and `content-refresh`.

## Instructions

1. Freeze and baseline before touching anything. Export the full URL list with 12–16 months of GSC clicks, impressions and average position per URL, all ranking keywords, top landing pages, referring domains to key URLs, and the existing redirect configuration. This baseline is the only way to prove or disprove preservation.
2. Choose the migration type and its URL strategy: platform swap (preserve URLs 1:1 wherever possible), restructuring (full old→new map), domain migration (map plus host change), consolidation (many→one with 301s). Preserved URLs carry links, history and GSC signals for free.
3. Build the redirect map as a versioned CSV with one row per old URL: `old_url, new_url, redirect_type, rationale, priority`. Every indexable old URL gets exactly one destination. Validate mechanically before deploy: no chains, no loops, no 302 for permanent, no mapping to 404 or to the homepage.
4. Implement the redirects at the server/edge layer with true 301s and correct status codes. Preserve meaningful query parameters and drop tracking ones. Ensure the destination returns 200 with a self-referencing canonical matching the new URL.
5. Update every first-party signal: canonical tags, XML sitemaps (new URLs only), `hreflang` clusters, internal links, `og:url`, structured data URLs, and any hardcoded absolute URLs in CSS, JS or templates.
6. Validate on staging that is fully blocked from crawlers (auth or robots) yet fully crawlable by you: crawl it with credentials and verify rendering, sitemaps, canonicals, schema and redirect behavior before going live.
7. Launch in a low-traffic window with the whole redirect map deployed atomically. Immediately after: spot-check 50–100 highest-traffic old URLs for single-hop 301 → 200, verify robots.txt and sitemaps, and submit the new sitemaps in Search Console.
8. Request re-indexing via URL Inspection for the top 20–50 pages only; bulk requests are deprioritized. Never request site-wide re-indexing.
9. Monitor daily for two weeks, then weekly for eight: indexed count, GSC clicks and impressions per migrated URL mapped back to its old counterpart, redirect error rate, crawl stats and crawl-budget spikes. Compare against the frozen baseline, not last week.
10. On significant regression, roll forward rather than reverting (a revert is a second migration). Diagnose whether the loss is redirect quality, index coverage, canonical/robots errors or an unfulfilled map row, fix it and continue monitoring.

## Patterns

The redirect map, as a reviewable artifact:

```csv
from,to,type,rationale,owner
http://old.example.com/blog.html,https://new.example.com/blog,301,single 301 per hop,platform
https://old.example.com/products/*,https://new.example.com/catalog/*,301,platform -> catalog rename,platform
https://old.example.com/p/12345,https://new.example.com/catalog/widget-pro,301,SKU -> slug mapping,content
https://old.example.com/news/2024-launch,https://new.example.com/blog/launch,301,archive merged,content
https://old.example.com/team,https://new.example.com/about,301,thin page consolidated,content
```

Rollback triggers on cutover day, checked in this order:

```text
1. Server errors: 5xx rate on old host > 1% within 5 min of DNS switch -> rollback
2. Redirect chains: any 2-hop chain found in the log -> fix the map, do not wait
3. 404 rate: >2x pre-migration baseline in 30 min -> pause and route-test top URLs
4. Index signal: Coverage/"Crawled - currently not indexed" up 25% week over week -> re-audit
5. Traffic: organic sessions down >15% on a 7-day rolling basis -> re-check map parity
```

Post-launch verification, staged:

```bash
# 0h: redirect integrity on a sample of the highest-traffic URLs
for u in $(cat top_urls.txt); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$u")
  hops=$(curl -sIL "$u" | grep -c '^HTTP/.* 30[12]')
  [ "$code" = 200 ] && [ "$hops" -le 1 ] || echo "FAIL $u code=$code hops=$hops"
done

# 24h: parity of indexed URLs, new vs legacy index export
comm -23 <(sort new_indexed.txt) <(sort old_indexed.txt) | head   # lost URLs

# 7d: redirect log has no 404 destination
grep -E ' "GET [^ ]+ HTTP" 404' access.log | awk '{print $7}' | sort -u | head
```

Staging parity check before DNS moves:

```python
import requests

def parity(old, new, paths):
    report = []
    for p in paths:
        a, b = requests.get(old + p, allow_redirects=True, timeout=20), \
               requests.get(new + p, allow_redirects=True, timeout=20)
        report.append({"path": p, "old": a.status_code, "new": b.status_code,
                       "same_title": title_of(a.text) == title_of(b.text),
                       "same_body_words": abs(words(a.text) - words(b.text)) < 5})
    assert all(r["old"] == 200 and r["new"] == 200 and r["same_title"] for r in report), report
    return report
```

302 versus 301, stated in one place:

```text
Temporary (302) only for: staged launch, A/B or geo-split tests that must be reversible,
                         short-lived campaigns, and multi-host rollout while the old host
                         still serves traffic.
Permanent (301) for:        every URL change that is final — renames, moved content,
                         http->https, www/non-www, changed paths, consolidated pages.
Never:                     302 as a placeholder to "decide later"; that ships the redirect
                         chain the migration was supposed to remove.
```

## Checklist

- [ ] Baseline frozen: 12–16 months GSC per-URL metrics, keywords, top pages, key referring domains, current redirects.
- [ ] Migration type chosen; preserved URLs maximized (1:1 wherever possible).
- [ ] Redirect map version-controlled with one destination per old URL, validated for chains, loops and non-301s.
- [ ] Server-level 301s deployed; top 50–100 old URLs confirmed single-hop 301 → 200 post-launch.
- [ ] Canonicals self-referencing to new URLs; sitemap contains only new URLs.
- [ ] Internal links, hreflang, `og:url`, structured data and hardcoded asset URLs updated.
- [ ] Staging auth- and robots-blocked yet fully crawled before launch.
- [ ] New sitemaps submitted; re-indexing requested only for the top 20–50 URLs.

## Anti-patterns

- **Launching without a redirect map for every indexable old URL** — a handful of high-traffic URLs without redirects lose their equity permanently once removed. Generate the map from the GSC export, not from intuition.
- **Using 302 redirects "temporarily" for a permanent move** — Google treats a 302 as a soft signal, keeps indexing the old URL and consolidates nothing. Permanent means 301 from day one.
- **Changing platform, URLs, design, content and internal linking simultaneously** — when traffic drops you cannot isolate the cause. Migrate infrastructure with URLs preserved, then change content separately.
- **Requesting site-wide re-indexing** — bulk requests are deprioritized and can delay the URLs that matter. Request only the top pages.
- **Trusting the CMS's default redirect behavior** — platform migrations rarely preserve redirect behavior, and defaults are 302 or absent. Inject the map at the server/edge layer.

## References

- Google's site-move documentation specifies 301 redirects, updated internal links and sitemaps, and post-launch monitoring; it discourages blanket re-indexing requests.
- URL Inspection and the "Check your redirects" tooling are the standard validation path post-migration.