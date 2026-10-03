---
name: serp-analysis
description: Reverse-engineers a live Google or Bing results page to decide whether a target query is winnable and what format the ranking page must take. Use when evaluating a specific keyword before committing effort, diagnosing why a page ranks on page two, or when asked for SERP research, competitor SERP review, or ranking feasibility.
---

# SERP Analysis

**Use when:** A specific keyword or keyword set is on the table and you need to know what type of page ranks for it, who ranks, and what features occupy space above position 1.
**Do not use when:** You need to decide *what to write about* rather than whether you can win — use `keyword-research` for the map and this skill for the per-query verdict.

## Instructions

1. Capture the SERP yourself, not from a vendor's cached snapshot. Query incognito, non-personalized, `&num=20&gl=us&hl=en`, and screenshot it. Vendor SERP data ages; the live page does not.
2. Record the SERP feature inventory in order: AI Overview, featured snippet (which subtype: paragraph, list, table), People Also Ask (every question, verbatim), image pack, video pack, local pack, Shopping/Product carousel, top stories, "Other sites", forums block. Each occupied feature pushes organic position 1 down by roughly one to two rows of layout space, which changes what "ranked #1" looks like on screen.
3. Classify each of the top 10 by page archetype: category, product, comparison, review, definition/informational, tool, forum/UGC, video. The modal archetype is your required format. Deviating from the modal archetype requires an explicit reason to be credible.
4. Extract each ranking page's word count, H1/H2 structure, publish/update date, media count, and link profile (referring domains, follow vs nofollow ratio). Compute the median of the top 10 — the median is your target, not the maximum.
5. Compare the gap: your page vs. the top-3 median, on word count, internal links pointing in, and referring domains. Whichever gap is largest is the actual work item; do not report all three as equally weighted.
6. Test the "blocker" hypothesis. Identify the single page that outranks you and explain the specific mechanism — a proprietary dataset, 400 referring domains, a video they embed, a decade of brand queries, or an answer you do not provide. A verdict without a named blocker is not a verdict.
7. Check historical volatility. Look for the query in Ahrefs/Semrush rank history or Google's own "was this result popular in 2024" cues. A SERP that reshuffles monthly is a low-value investment; a stable SERP with entrenched incumbents is high difficulty but durable.
8. Compare across engines. Run the same query on Bing and check Copilot answers. If Bing's SERP is materially different, a single SERP verdict is insufficient; note the divergence explicitly.
9. Issue the verdict: `WON` (monolith, DR filter passes), `WINNABLE-LONG-TERM` (format match + content gap, needs links), `LONG-TAIL ONLY` (needs sub-intent), or `NOT WORTH IT` (SERP owned by brands/aggregators with no gap). Include the specific reason and the required effort tier.

## Patterns

Capture and structure a SERP for archetype and format analysis:

```python
import requests, re
from bs4 import BeautifulSoup

def capture_serp(query, region="us-en"):
    r = requests.post("https://html.duckduckgo.com/html/",
                      data={"q": query, "kl": region},
                      headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    for res in soup.select("div.result"):
        link, snip = res.select_one("a.result__a"), res.select_one("a.result__snippet")
        if link:
            out.append({"url": link["href"], "title": link.get_text(strip=True),
                        "snippet": snip.get_text(strip=True) if snip else "",
                        "domain": re.sub(r"^www\.", "", link["href"].split("/")[2])})
    return out
```

Score the target page against the top-10 median, then name the single blocker:

```python
import statistics as st

median_words = st.median([r["words"]  for r in top10])
median_links = st.median([r["ref_dom"] for r in top10])
gaps = {"content":   median_words - page.words,
        "authority": median_links - page.ref_dom,
        "internal":  median_depth - page.internal_inlinks}
primary_blocker = max(gaps, key=gaps.get)     # the only work item that matters first
```

Verdict rubric:

```python
def verdict(features, top10_domains, our_ref_dom):
    median = st.median(top10_domains)
    if "ai_overview" in features and our_ref_dom >= median * 0.3:
        return "WINNABLE-LONG-TERM", "Medium", \
               "Block the AIO with a direct 40-word answer plus an original data table"
    if median > 200 and our_ref_dom < median * 0.1:
        return "NOT WORTH IT", "High", \
               "Authority gap is 20x; link building must precede content work"
    if "shopping" in features:
        return "NOT WORTH IT", "n/a", \
               "Merchant SERP is ad-and-feed driven; organic entry needs free listings"
    return "WINNABLE-LONG-TERM", "Medium", "Format match achievable; close the link gap"
```

## Checklist

- [ ] SERP captured live and incognito with country/language pinned, screenshot archived with date.
- [ ] Every SERP feature enumerated in display order, including all People Also Ask questions verbatim.
- [ ] Top-10 page archetypes classified; required page format identified.
- [ ] Median (not max) word count, referring domains and internal inlinks computed for top 10.
- [ ] Single named blocker for the target page, not a list of all deficits.
- [ ] Rank history checked for volatility; stability noted.
- [ ] Bing and Copilot compared; divergence flagged if present.
- [ ] Verdict issued from the four-value rubric with a specific effort tier and rationale.

## Anti-patterns

- **Reading a vendor SERP snapshot as current** — vendor rank trackers sample the SERP at intervals and miss layout changes entirely. A SERP with a new AI Overview will not appear in a monthly snapshot.
- **Counting only positions 1–10** — features like AI Overview, PAA and the shopping carousel push the visible organic result below the fold. Track the real organic slot, not the raw position.
- **Comparing against the #1 result only** — the #1 is usually an outlier. Building to the median of positions 2–6 is what actually moves a page 40 to 10.
- **Ignoring freshness when the SERP is date-sensitive** — for "best [product] 2026" queries the top results are all updated within 90 days. A page last touched 14 months ago cannot compete regardless of its links, and the fix is a refresh, not new content.
- **Calling a query "competitive" without naming the competitor** — "high KD" is unusable. The actionable output names the domain, the page, and the specific asset (a 2019 dataset, a 300k-review corpus) that gives it the edge.

## References

- DuckDuckGo's `html.duckduckgo.com/html/` POST endpoint returns server-rendered results; usable for structural analysis, not as a Google rank source.
- Google's AI Overview and PAA boxes change layout weekly; re-capture before any decision that depends on available space above position 1.