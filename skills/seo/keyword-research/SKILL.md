---
name: keyword-research
description: Builds a keyword-to-page map from search volume, SERP difficulty and intent data, then assigns each cluster one owning URL. Use when planning new content, deciding whether a keyword needs a new page or an existing one, or when asked for keyword research, a content backlog, or topic clusters.
---

# Keyword Research

**Use when:** Deciding what to build next — new pages, section hubs, or blog posts — and each target needs one owner URL and a defensible reason it deserves to rank.
**Do not use when:** The keyword is already chosen and you are validating whether the current SERP is beatable — use `serp-analysis`.

## Instructions

1. Seed the list from what the business already sells, not from a thesaurus. Start from the site's existing converting pages and pull their query set from Search Console — those are proven demand, not guesses.
2. Expand with tools (Ahrefs, Semrush, Google Keyword Planner, or the free Google Ads API) into the four buckets: head terms (volume >10k), mid-tail (500–10k), long-tail (<500), and question/voice queries. Discard anything with zero SERP volume even if the tool reports a large figure.
3. Classify intent per keyword against four buckets only: informational, commercial investigation, transactional, navigational. If a transactional keyword's SERP shows mostly blog posts, the classification is wrong or the SERP is soft — re-check before committing.
4. Compute opportunity, not volume. Rank by `volume × (1 - current_rank_position_weight) × margin`, where an existing ranking at position 8–20 scores far higher than a page at position 60 because the increment is achievable.
5. Estimate difficulty from the SERP itself, not just a proprietary score: count how many of the top 10 results are DR>80 domains, whether any are forums or UGC, and how many are non-English or off-topic. A SERP with two Reddit threads and three forums is winnable at volume 2,000.
6. Check the "one page per intent" rule. If two keywords share intent, SERP overlap and SERP features, they belong on one page. Use `A && B != A && !B` SERP-overlap testing to confirm.
7. Build the topic cluster: one pillar URL per head term, 3–8 supporting URLs per pillar, each supporting URL internally linking to the pillar with varied anchor text from the first sentence.
8. Map keyword → existing URL first, new URL second. Only ~15% of keyword targets should become net-new pages; the rest are additions to pages that already exist but under-optimize that keyword.
9. Score and backlog. Assign each target a difficulty (K/D), business value, current position, and target position. Sort descending by projected incremental clicks, not by volume.
10. Re-run quarterly. Track position and click deltas per mapped URL in a single sheet joined on the URL, never on the keyword.

## Patterns

Opportunity scoring that weights achievable gains over raw volume:

```python
import pandas as pd

kw = pd.read_csv("keywords.csv")  # keyword, volume, kd, intent, url, position

def position_weight(pos):
    if pd.isna(pos) or pos == 0:  return 0.0    # not ranking at all
    if pos <= 3:                   return 0.10   # protect; low upside
    if pos <= 10:                  return 0.25   # CTR still high
    if pos <= 20:                  return 0.85   # biggest quick win
    if pos <= 50:                  return 0.45   # needs depth plus links
    return 0.20

kw["opportunity"] = (kw.volume * position_weight(kw.position)
                     * kw.value_multiplier).round(0)   # margin per conversion
print(kw.sort_values("opportunity", ascending=False)
        .head(20)[["keyword", "volume", "kd", "position", "opportunity"]])
```

SERP-overlap test deciding one page versus two:

```python
def serps_overlap(set_a, set_b):
    union = set_a | set_b
    return len(set_a & set_b) / len(union) if union else 0.0

# near-zero overlap in both directions = genuinely different intents = new page
if serps_overlap(top10_intel, top10_commercial) < 0.2:
    plan_new_page()
```

Demand validation with no third-party tool, using the free Google Ads API:

```python
import requests

def keyword_ideas(seed, lang="en", country="US"):
    r = requests.post(
        "https://keywordplanning.googleapis.com/v1/keywords:generateKeywordIdeas",
        headers={"Authorization": f"Bearer {token}"},
        json={"request": {"language": lang, "geoTargetCountries": [country],
                          "keywordSeed": [{"keyword": seed}],
                          "keywordPlanNetwork": {"ignoreVolumes": False,
                                                 "targetMonthlySearches": True}}},
        timeout=30)
    return [{"kw": i["text"],
             "vol": i["searchVolumeInfo"]["monthlySearches"],
             "competition": i["competition"]}
            for i in r.json().get("result", {}).get("keywordIdeas", [])]
```

## Checklist

- [ ] Seed list derived from existing converting pages and GSC query data, not from guesswork.
- [ ] Every keyword classified into one of four intents with the SERP evidence noted.
- [ ] Difficulty sanity-checked against top-10 composition, not just a vendor KD score.
- [ ] Each keyword assigned exactly one owning URL; net-new pages under ~15% of targets.
- [ ] SERP-overlap test run on any pair of keywords proposed for separate pages.
- [ ] Backlog sorted by incremental click projection, not raw volume.
- [ ] Tracked URL-level position/click deltas in a sheet joined on URL.

## Anti-patterns

- **Buying traffic on the wrong intent** — ranking a transactional term with a 1,200-word blog post earns impressions and zero conversions. Match page type to intent: transactional terms need a product, category or service page with pricing and CTAs.
- **Treating keyword difficulty as a fixed property** — KD is a third-party backlink estimate. The real barrier is what is already ranking; a KD 60 head term whose SERP is all forums is easier than a KD 30 term held by three national brands.
- **Building a page per exact-match variant** — "best running shoes" and "top rated running shoes" are one page. Splitting them cannibalizes both and splits the link equity.
- **Ignoring the SERP feature already occupying the slot** — if the SERP shows a People Also Ask box with four questions, the article must answer all four in H2s or the page cannot take position 1.
- **Logging keyword position without the URL** — the same keyword ranks differently per URL. Reporting an aggregate "we rank #4" hides a site where one URL ranks #4 and three more sit at #40, cannibalizing each other.

## References

- Search Console Performance report exports `query`, `page`, `position`, `clicks`, `impressions` — join on both dimensions.
- Google Ads Keyword Planner API (`keywordplanning.googleapis.com`) is free with an Ads account and returns monthly searches plus competition band.