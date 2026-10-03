---
name: content-strategy
description: Designs the topical architecture of a site's content — pillars, clusters, publishing cadence and measurement — mapping every piece to a commercial stage rather than to a keyword volume figure. Use when planning an editorial roadmap, deciding how many posts to publish, or when asked for a content strategy or topic cluster plan.
---

# Content Strategy

**Use when:** Building or re-planning an editorial roadmap, and you need to decide which topics earn production time and how they interconnect into an authority structure.
**Do not use when:** A single keyword's page-level optimization is the task — use `on-page-seo`.

## Instructions

1. Map the commercial funnel of the actual business to content types. For a SaaS: problem-aware blog, solution-aware comparison pages, evaluation-stage docs and case studies, purchase-stage product/pricing pages. Every content type maps to exactly one funnel stage; a post that maps to none is deleted.
2. Inventory existing content before planning anything. Export every indexable URL with its traffic, conversions, referring domains and last-modified date. Sort into `perform` (converts, keep and refresh), `improve` (traffic but no conversions), `consolidate` (overlapping topics), `kill` (no traffic, no links, no conversions).
3. Define pillars. One pillar per core business concept — not one per head keyword. A pillar is a page comprehensive enough that a practitioner would treat it as a reference, typically 2,500–4,000 words with 30+ internal links.
4. Define clusters. For each pillar, enumerate 4–10 genuinely distinct sub-questions. Test each for distinctness against existing URLs with SERP overlap; if the sub-question's SERP matches the pillar's SERP, it belongs inside the pillar, not as its own page.
5. Assign every planned piece one target query, one funnel stage, one owner URL and a publish date. A piece without all four is not on the roadmap.
6. Set cadence from capacity, not ambition. Weekly means 52 pieces/year; if the team sustains four per month, plan 48 and hold the rest as backlog. Publishing three posts a month for two years outperforms publishing ten a month for four months then stopping.
7. Design the linking rule: every cluster article links up to its pillar in the first 300 words, and the pillar links down to every child. This is a hard requirement, not a nice-to-have — it is what converts a pile of posts into a topical cluster.
8. Design the update rule: any page ranking 5–30 gets reviewed every 90 days; pages outside that range get reviewed annually. Set the trigger on position, not on a calendar for everything, so review effort concentrates where ranking is winnable.
9. Define the measurement before publishing. Per piece: impressions, clicks, CTR, target position, assisted conversions, and internal inlinks received at 30/90/180 days. A piece that gets impressions but no clicks after 6 months gets rewritten for intent match, not promoted harder.
10. Run a quarterly pruning pass: no-link, no-impression pages over 18 months old get `noindex` then 410 after the index drops. Keeping them inflates the domain's thin-content ratio and dilutes internal PageRank.

## Patterns

Cluster architecture as data:

```json
{ "pillar": { "url": "/guides/crawl-budget/", "target_query": "crawl budget",
              "word_target": 3200,
              "links_out_to": ["/blog/log-file-analysis/", "/blog/sitemaps/"],
              "children": [
                { "url": "/blog/crawl-budget-log-files/", "intent": "informational",
                  "links_to_pillar": true, "word_target": 1800 },
                { "url": "/blog/when-to-noindex/", "intent": "informational",
                  "links_to_pillar": true, "word_target": 1500 } ] } }
```

Content inventory decision table:

```python
import pandas as pd

inv = pd.read_csv("content_inventory.csv")  # url, clicks, conv, ref_dom, lastmod, words
today = pd.Timestamp("2026-10-01")
inv["age_months"] = ((today - pd.to_datetime(inv.lastmod)).dt.days / 30).round()

def action(r):
    if r.clicks >= 500 and r.conv > 0:   return "PERFORM"     # protect
    if r.clicks >= 500 and r.conv == 0:   return "IMPROVE"     # intent/CTA mismatch
    if r.ref_dom >= 10 and r.clicks < 50: return "CONSOLIDATE"  # links exist, topics overlap
    if r.age_months > 18:                 return "KILL"         # noindex, then 410
    return "HOLD"

inv["action"] = inv.apply(action, axis=1)
print(inv.groupby("action").agg(urls=("url","count"), clicks=("clicks","sum")))
```

Cadence sized to real capacity, not ambition:

```python
HOURS_PER_PIECE = 6          # research + brief + draft + edit + publish
annual_capacity = int(40 * 46 / HOURS_PER_PIECE)    # 1 FTE, 46 working weeks
print(f"Realistic annual output: {annual_capacity} pieces")
```

Editorial brief every piece must ship with:

```markdown
- Target query: <one query, plus the SERP archetype it matched>
- Funnel stage: informational | commercial | transactional
- Owner URL: <existing URL to rewrite, or NEW>
- Required questions (verbatim from PAA + related searches): <list>
- Original asset required: <dataset / calculator / expert quote / test result>
- Internal links: up -> <pillar>, down -> <2 siblings>
- Target length: top-10 median is <N>; must reach <N>
- Publish date: <date>   |   90-day review trigger: position between 5 and 30
```

## Checklist

- [ ] Every existing URL assigned one of PERFORM / IMPROVE / CONSOLIDATE / KILL with the rule that produced the decision.
- [ ] Every content type maps to a single funnel stage; unmapped content deleted.
- [ ] Pillars and clusters pass SERP-overlap distinctness testing — no child duplicates its parent.
- [ ] Every roadmap item has target query, funnel stage, owner URL and publish date.
- [ ] Upward and downward internal links specified per piece and enforced at publication.
- [ ] Cadence derived from measured writing capacity, with a named review owner.
- [ ] Refresh trigger is position-based (5–30, every 90 days), not blanket-scheduled.
- [ ] Measurement defined per piece before publication: impressions, clicks, CTR, position, conversions, inlinks at 30/90/180 days.

## Anti-patterns

- **Publishing volume without a linking structure** — 40 isolated posts with no cross-links and no pillar produce 40 pages that compete with each other and none that accumulates topical authority. The internal link graph is the strategy; the posts are just inputs.
- **Killing content because traffic is low without checking links** — a page with zero traffic and 40 inlinks from authoritative sites still transfers equity to everything it links to. Consolidate it and pass the links on, never delete it outright.
- **Rewriting successful pages to chase a new keyword** — a page with 4,000 clicks and 300 links loses ranking the moment its primary target is changed. Add a new section for the secondary term instead.
- **Treating word count as the goal** — median top-10 length is a floor, not a target. Padding to hit a number produces no snippet eligibility, no links, and no conversions; the SERP archetype decides length.
- **Sizing the roadmap from competitor output** — a competitor publishing 300 posts a year has a 30-person content team. Copying their volume with your headcount produces 300 thin posts that drag down the whole domain's quality signal.

## References

- Google's "helpful, reliable, people-first content" documentation scores content at the page and site level, not per keyword — site-level thin-content ratios do affect how aggressively new content is crawled.
- Search Console Content grouping by page (not query) is the reliable unit for reporting content performance.