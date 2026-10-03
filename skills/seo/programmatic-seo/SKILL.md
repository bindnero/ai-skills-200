---
name: programmatic-seo
description: Designs and audits templated pages at scale — indexable pattern limits, unique data fields, internal linking between variants, parameter control and thin-page pruning. Use when scaling landing pages by keyword/location/product combination, when Google thins or ignores a programmatic set, or when deciding which parameter combinations to index.
---

# Programmatic SEO

**Use when:** Generating many URLs from templates (location × service, product × attribute, compare × versus), when deciding which parameter combinations are indexable, or when a templated set ranks thinly or not at all.
**Do not use when:** pages are hand-authored one at a time — the risk profile is different; use `on-page-seo`.

## Instructions

1. Define the indexable pattern before generating anything. The unit is a pattern (e.g. `/{city}/{service}`), not a URL. Write down which parameters are indexable, which are canonicalized away, which are `noindex` plus blocked. Enforce it in one place, not per template.
2. Apply the combinatorial reality check. `2 cities × 3 services × 4 tiers = 24` pages is fine. `200 × 40 × 6 = 48,000` is a crawl trap and a thin-content liability. Compute the count before launch; above a few thousand indexable pages without unique data behind each, cut the pattern.
3. Make each page unique in *data*, not in prose. Unique elements must come from a real source: local pricing, local regulations, local statistics, local provider availability, local inventory. Templated marketing copy with the city name swapped is duplicate content across the entire set.
4. Pull at least three unique data fields per page, rendered server-side: a local number (pricing, count, distance), a local named entity (provider, landmark, regulation), and a local text block written for that specific combination. Word count alone proves nothing; these fields do.
5. Link the set internally in both directions. Every variant links to its parent hub, to its siblings (other cities, same service) and up one level. Unlinked programmatic pages are orphans and will not be crawled.
6. Handle pagination and hreflang correctly on templated URLs: self-referencing canonicals, real alternate annotations, no cross-canonical between variants.
7. Watch index bloat in Search Console. If the templated set's "Discovered – currently not indexed" ratio exceeds roughly 50%, the pattern is being down-weighted — enrich and reduce the count rather than adding variants.
8. Audit thin variants and prune. Any instance with near-zero impressions after 6 months and no links gets `noindex` (not deleted), removal from the sitemap, and internal links repointed to the nearest valuable sibling.
9. Ensure the set satisfies Google's local content guidance — genuinely local information or experience, not a token page with a swapped city name.
10. Monitor the set as a cohort: average positions, indexed count and click distribution across the whole set. A programmatic set's health is a distribution, not one page's rank.

## Patterns

Programmatic page generation with explicit quality gates:

```python
import pandas as pd

def decide_page(row, median_depth, median_links):
    if row.search_demand < 50:                       return "skip"          # no demand to win
    if row.affiliate_supply < 3:                     return "skip"          # thin content by design
    if row.competition_score > 0.7:                  return "test_small"    # probe before scaling
    if row.unique_data_ratio < 0.3:                  return "skip"          # would be a doorway page
    if row.inbound_links_estimate < median_links:    return "consolidate"   # merges into a hub instead
    return "publish" if row.outbound_links_estimate >= median_depth else "enrich_first"

matrix = pd.read_csv("pages.csv").assign(
    decision=lambda d: d.apply(lambda r: decide_page(r, 12, 47), axis=1))
print(matrix.groupby("decision").agg(pages=("url", "count"),
                                    demand=("search_demand", "sum")))
```

Template with genuine per-record data, the only kind that scales:

```ejs
<%# /tools/%7Bslug%7D — every field must come from the record, not the slug %>
<title><%= tool.name %>: <%= tool.alt %> (<%= tool.year %>) | Acme</title>
<link rel="canonical" href="<%= canonicalUrl(tool) %>">
<meta name="description" content="<%= tool.summary %>. Covers <%= tool.brandCount %> models, <%= tool.specCount %> specs.">

<h1><%= tool.name %></h1>
<p><%= tool.verbatimDescription %></p>
<table>
  <caption><%= tool.name %> specifications, updated <%= tool.updatedAt.toISODateString() %></caption>
  <tbody>
    <% tool.specs.forEach(function (s) { %>
    <tr><th scope="row"><%= s.label %></th><td><%= s.value %> <%= s.unit %></td></tr>
    <% }); %>
  </tbody>
</table>
<p>Last verified by <%= tool.reviewer.name %> on <%= tool.reviewedAt.toISOString() %>:
   tested on <%= tool.testProtocol %></p>
```

Managing the indexable URL space as an SLO, not as an accident:

```python
INDEXABLE_PAGES = 10_000        # what we can afford to keep fresh
CRAWL_BUDGET_SHARE = 0.05       # of Googlebot's requests to this host

def prune(measurements):
    keep, drop = [], []
    for m in sorted(measurements, key=lambda r: r.impressions, reverse=True):
        (keep if len(keep) < INDEXABLE_PAGES else drop).append(m.url)
    # pages outside the indexable budget get noindex + a real 301 to their parent hub
    return keep, [d for d in drop if d.conversions == 0]
```

Quality gate in CI, before any programmatic URL ships:

```python
import difflib

def near_duplicate_rate(urls):
    hashes = {}
    for u in urls:
        body = fetch_text(u)[:8000]
        hashes[u] = body
    dupes = 0
    for i, u in enumerate(urls):
        for v in urls[i + 1: i + 12]:
            if difflib.SequenceMatcher(None, hashes[u], hashes[v]).ratio() > 0.85:
                dupes += 1
    return dupes / max(1, len(urls))

assert near_duplicate_rate(new_urls) < 0.1, "programmatic pages too similar: doorway risk"
```

## Checklist

- [ ] Indexable patterns enumerated with a written parameter whitelist before generation.
- [ ] Combinatorial page count computed and compared to a hard ceiling; count reduced if exceeded.
- [ ] ≥3 genuinely unique *data* fields per variant (local number, local entity, local text block), server-rendered.
- [ ] City/service names not merely swapped into otherwise identical marketing prose.
- [ ] Every variant links to its parent hub, its siblings and cross-service pages.
- [ ] Each variant self-canonicals; no cross-canonical between city/service pages.
- [ ] "Discovered – currently not indexed" ratio on the set checked and kept below ~50%.
- [ ] Zero-impression variants over 6 months `noindex`ed, de-sitemapped and relinked to siblings.

## Anti-patterns

- **"City swapping"** — generating `/plumber-nyc` and `/plumber-la` from one template with only the city name replaced is the exact pattern Google names in its spam policies. No unique value, mutual competition, manual-action risk. Fix: real per-city data or don't index.
- **Indexing the full parameter space** — every filter combination (`?color=red&size=large&sort=price`) as a crawlable indexable URL multiplies pages combinatorially. Only human-searched combinations earn indexable URLs; the rest `noindex` and leave the link graph.
- **Producing 500,000 pages "because we can"** — volume without unique data is thin content at scale and the fastest route to a sitewide quality demotion. Scale only as fast as you can populate real data.
- **Not linking variants together** — thousands of unlinked programmatic URLs are orphans. Google discovers them via the sitemap only if it already trusts the set, which it will not if nothing links to them.
- **Templated "Best X in Y" blog posts at scale** — a token local page and a blog post targeting the same query cannibalize each other. One page per intent, enriched with data.

## References

- Google's spam policies document "doorway pages" and scaled content abuse: pages built to rank for similar queries across many locations or variants without genuine added value.
- Google's quality rater guidelines and local content guidance treat city-name-swapped token pages as low value.