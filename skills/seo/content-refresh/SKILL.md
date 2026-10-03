---
name: content-refresh
description: Audits and updates existing ranking content — decay diagnosis, intent and SERP re-alignment, consolidation and pruning, internal-link and schema repairs, and freshness signals. Use when organic traffic declines on pages that once ranked, when a top-20 page sits on page two, or when planning a quarterly content update cycle.
---

# Content Refresh

**Use when:** Pages that historically ranked have lost traffic or position, when a top-20 page sits on page 2 without a competitor change, or when running a scheduled update pass over an existing library.
**Do not use when:** the page has never performed and needs to be created — refreshing it wastes the effort; use `keyword-research`.

## Instructions

1. Select candidates by data, not intuition. Export 16 months of GSC query/page/position data and prioritize: pages at position 5–20 with falling impressions (cheapest wins); pages at position 4–15 with CTR below the position-implied curve; pages with high impressions and low CTR; pages decaying versus the same period last year.
2. Diagnose the decay cause before editing. Classify each candidate: content became stale (outdated data, tools, pricing); intent mismatch (the SERP archetype changed); a competitor published something materially better; the page lost internal or external links; it fell after a core update; or the SERP gained a feature (AI Overview, PAA) that changed the required format. The cause determines the fix.
3. Re-check the live SERP for the primary query. If the top 10 now shows a different archetype (video carousel, tools widget, different page type), reformat the page rather than re-word it. Record the current top-10 median word count, structure and required features.
4. Update the substance, not the date. Replace outdated statistics, screenshots, tool names and regulatory references; add the sections competitors added and your users now ask about; fix factual errors. A `lastmod` bump with no content change is a wasted signal.
5. Fix intent match explicitly. If the query moved toward comparison or transactional, add the comparison table, pricing, CTA and FAQ the new archetype requires. If the page targets the wrong query, re-map it or consolidate.
6. Repair the technical layer: internal links (ensure 3+ relevant inlinks), canonical correctness, structured data validity, image alt text and broken external links. A page with broken links or invalid schema cannot benefit from new content.
7. Consolidate and prune decisively. Merge the stronger page's unique content where several pages share one query, 301 the rest and update internal links. Pages with no impressions in 12 months and no links get `noindex` (then 410 once deindexed). Do not keep dead content "just in case".
8. Add freshness and E-E-A-T signals that matter: accurate `datePublished` and `dateModified`, a visible last-reviewed date, an author byline with credentials plus an author page, and real outbound references to primary sources.
9. Validate: re-run URL Inspection, confirm structured data passes, and request re-crawling in Search Console. Request re-indexing at most once per URL per change.
10. Log every refresh with before/after metrics and re-measure at 30 and 90 days. If a refreshed page does not improve, escalate to links, true intent mismatch or algorithmic suppression rather than refreshing again.

## Patterns

Scoring the refresh backlog by expected gain per editor hour:

```python
import pandas as pd
inv = pd.read_csv("content_inventory.csv")   # url, clicks, conv, ref_dom, words, lastmod
today = pd.Timestamp("2026-10-01")
inv["age_months"] = ((today - pd.to_datetime(inv.lastmod)).dt.days / 30).round(1)
inv["decay"]       = inv.clicks.clip(lower=1) ** (inv.age_months / 12)     # decaying clicks
inv["headroom"]    = (top10_median_clicks_for_query(inv.url) - inv.clicks).clip(lower=0)
inv["effort_h"]    = 4 + inv.words.fillna(0) / 400                         # rewrite hours
inv["roi"]         = (inv.headroom * 0.4 + inv.clicks * 0.6) / inv.effort_h
print(inv.sort_values("roi", ascending=False)
        .head(20)[["url", "clicks", "age_months", "headroom", "effort_h", "roi"]])
```

Deciding refresh versus rewrite versus consolidate:

```python
def verdict(r):
    if r.clicks < 50 and r.ref_dom < 5:            return "CONSOLIDATE"   # no signal, merge into a hub
    if r.words < top10_median(r.url) * 0.7:       return "EXPAND"       # thin vs SERP
    if r.words > top10_median(r.url) * 1.6:       return "CUT"          # bloat, prune
    if r.age_months > 12:                          return "REFRESH"      # decay, substance intact
    return "HOLD"
```

Diffing a rewrite against its SERP, so coverage is provable:

```python
import requests, difflib

def coverage_report(url, target_keywords):
    before = {k: rank(url, k) for k in target_keywords}          # rank via the SERP API
    after  = {k: rank(url, k) for k in target_keywords}
    gained = [k for k in before if (after[k] or 99) < (before[k] or 99)]
    lost   = [k for k in before if (after[k] or 99) > (before[k] or 99)]
    return {"gained": gained, "lost": lost,
            "net": sum(1 for k in after if (after[k] or 99) <= 5)}
```

Server-rendered page after the rewrite — client-only content is invisible to the crawler:

```html
<h1>Crawl Budget Optimization</h1>
<p class="standfirst">Updated 30 Sep 2026 with 2026 field data from a 2M-URL site.</p>
<section>
  <h2>What is crawl budget?</h2>
  <p>Crawl budget is the number of URLs Googlebot requests from your server in a
     crawl session. It scales with your site's size, structure and server health...</p>
  <table>
    <caption>Crawl frequency by site size, 2026 field medians</caption>
    <tbody><tr><th scope="row">&lt; 1,000 URLs</th><td>every 3-7 days</td></tr>
           <tr><th scope="row">&gt; 200,000 URLs</th><td>every 3-14 weeks</td></tr></tbody>
  </table>
</section>
```

```python
# refresh QA: assert the new build kept everything the SERP needs
def qa(url):
    html = fetch(url)
    assert len(re.findall(r"<h2", html)) >= 6, "SERP needs more section coverage"
    assert "dateModified" in extract_jsonld(html), "no dateModified for a refresh"
    assert extract_h1_count(html) == 1
    assert not re.search(r"(?i)\b(sign up|subscribe)\s+to\s+read", html), "gate before content"
```

## Checklist

- [ ] Candidates selected from 16 months of GSC data by position band, CTR gap and traffic decay.
- [ ] Decay cause classified per page (staleness, intent, competitor, link loss, core update, SERP feature).
- [ ] Live SERP re-captured; required archetype and top-10 median recorded before editing.
- [ ] Substance updated (statistics, screenshots, tools, references) — not just a `lastmod` bump.
- [ ] Intent match fixed for the new archetype (comparison table, pricing, CTA, FAQ as applicable).
- [ ] Technical layer repaired: 3+ relevant inlinks, valid canonical and schema, fixed broken links, alt text.
- [ ] Duplicates consolidated with 301s and internal links updated; zero-impression pages `noindex`ed then 410'd.
- [ ] Author byline, `datePublished`/`dateModified` and primary-source references present.

## Anti-patterns

- **Bumping `lastmod` without changing content** — Google detects that `lastmod` tracks deploys rather than edits and stops trusting it.
- **Rewriting the whole page instead of the specific gap** — full rewrites lose ranking signals and topical associations and often regress. Make surgical additions to the sections the SERP now requires.
- **Adding an FAQ block with answers not visible elsewhere** — schema-only FAQ markup violates Google's policy, and FAQ rich results are restricted regardless. Answer PAA questions in real H2 sections.
- **Refreshing only the top-20 pages** — pages that fell from 40 to 90 are often the cheapest long-term wins. Include the 20–50 band.
- **Refreshing a page whose real issue is a lost external link** — no content edit recovers lost link equity. Restore the link, then judge the content.

## References

- Google's `dateModified` guidance recommends using it to identify substantial content updates that may benefit from re-crawling.
- CTR-by-position curves vary by query type, seasonality and device; use them as a relative signal (gap versus band median), not absolute benchmarks.