---
name: on-page-seo
description: Optimizes a single page's ranking elements — title tag, H1, heading hierarchy, internal links, word depth, intent match and duplicate handling — against its target SERP. Use when a page ranks on page two or three, when a new page is published, or when asked to optimize specific URLs for organic search.
---

# On-Page SEO

**Use when:** A specific URL needs to move for a specific query — it ranks page 2+, was just published, or was identified in an audit as under-optimized for a keyword it already targets.
**Do not use when:** The title/description/social cards are the only concern — use `metadata-and-social-cards`.

## Instructions

1. Lock the target. One page, one primary query, one secondary set. Write down the query and the SERP archetype the page must match. If the page cannot match the archetype, fix that before touching anything else.
2. Rewrite the title tag against the top-10 median pixel width, not a character count. Use SERP preview tools; aim 580–600px desktop, and place the primary keyword in the first half so it survives mobile truncation. Include the brand as a suffix, never mid-string.
3. Set a single H1 that matches the page's actual subject, keep the H1 and title aligned but not identical, and validate that the heading hierarchy is unbroken — no H2 before an H1, no skipped levels. Skipped levels break assistive tech and remove the topical outline Google uses.
4. Answer the PAA questions as H2s. Pull every People Also Ask question from the live SERP and structure each as an H2 immediately followed by a 40–60 word direct answer. This is what earns featured-snippet and AI Overview eligibility.
5. Add the original asset the SERP lacks. Every top-10 page is text; the page that wins is the one with data nobody else has — original benchmark numbers, a calculator, a real screenshot, a named expert quote. Text-only parity produces text-only parity in rankings.
6. Build internal links in, from the strongest relevant pages on the site. Target the top-10 median internal inlink count for that template. Anchor text should be the target's actual variant, varied naturally, and every link must be followed (`rel` must not contain `nofollow` on internal links).
7. Compress the HTML. Rendered page weight and DOM node count matter for crawling on large sites; strip unused CSS/JS payloads on non-critical pages and remove dead `<div>` wrappers left by page builders.
8. Handle intent explicitly. Add the conversion path the archetype requires: comparison pages need a comparison table, transactional pages need price and a CTA above the fold, informational pages need a contextual CTA, not a hard sell.
9. Verify the rendered result, not the source. Fetch the URL, confirm the title, H1, meta robots and canonical in the served HTML, then re-fetch with a JS renderer to confirm the same elements survive rendering. A React SPA that sets the title client-side has a different title than its source suggests.
10. Record a before/after row: URL, query, position, impressions, CTR, lastmod — so the next review can prove whether the change worked or needs reverting.

## Patterns

Title tag and heading skeleton:

```html
<head>
  <title>Crawl Budget Optimization: How to Stop Google Wasting Crawls</title>
  <link rel="canonical" href="https://example.com/seo/crawl-budget/">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
</head>
<body>
  <h1>Crawl Budget Optimization</h1>
  <p>Crawl budget is the number of URLs Googlebot requests from your server per
     crawl session. It scales with your site's size and health...</p>

  <h2>What is crawl budget?</h2>
  <p>Crawl budget is the number of URLs Googlebot requests...</p>

  <h2>How do I measure crawl budget?</h2>
  <p>Measure it by comparing Googlebot log hits per crawl session...</p>

  <h2>How much crawl budget does my site have?</h2>
</body>
```

Brief plan built from the live SERP, not from a template:

```json
{ "target_query": "crawl budget",
  "paa_questions": [
    { "h2": "What is crawl budget?", "answer_words": 45, "target_feature": "paragraph_snippet" },
    { "h2": "How do I measure crawl budget?", "answer_words": 52, "target_feature": "paragraph_snippet" },
    { "h2": "How much crawl budget does my site have?", "answer_words": 60, "target_feature": "featured_snippet" }
  ],
  "median_top10_words": 2400, "target_words": 2600,
  "original_asset": "crawl stats from our own 2M-URL client site, published as a table" }
```

Validate rendered output, not the source, and measure inbound links:

```python
import re, requests
from bs4 import BeautifulSoup

def audit_onpage(url):
    soup = BeautifulSoup(requests.get(url, timeout=30).text, "html.parser")
    levels = [int(h.name[1]) for h in soup.find_all(re.compile("^h[1-6]$"))]
    return {"title": soup.title.string if soup.title else None,
            "h1_count": levels.count(1),
            "heading_jumps": [(levels[i-1], levels[i]) for i in range(1, len(levels))
                              if levels[i] - levels[i-1] > 1],
            "canonical": (soup.find("link", rel="canonical") or {}).get("href"),
            "meta_robots": (soup.find("meta", attrs={"name":"robots"}) or {}).get("content"),
            "nofollow_internal": len(soup.select("a[href^='/'][rel*=nofollow]")),
            "word_count": len(soup.get_text(" ").split())}

gap = median_inbound_inlinks - count_inbound_internal_links(target_url)
assert gap <= 0, f"acquire {gap} more internal inlinks before expecting movement"
```

## Checklist

- [ ] One page, one primary query documented before any edit.
- [ ] Title tag validated at SERP pixel width, primary keyword in the first half, brand suffixed.
- [ ] Exactly one H1; heading hierarchy checked for skipped levels (none).
- [ ] Every live People Also Ask question is an H2 with a 40–60 word direct answer.
- [ ] At least one original asset present that no top-10 competitor has.
- [ ] Inbound internal links measured against the top-10 median; `nofollow` absent on internal links.
- [ ] Meta robots allows index and sets `max-snippet:-1` and `max-image-preview:large`.
- [ ] Rendered DOM re-fetched and confirmed to match source for title, H1, canonical, robots.

## Anti-patterns

- **Keyword stuffing the title with modifiers and city names** — "SEO Services | Expert SEO Services | Affordable SEO Services" is demoted by Google's spam classifiers and truncates in SERP anyway. One primary term, one differentiator.
- **Changing the primary keyword of an established page** — the page's URL, its 300 internal links and its link graph all encode the old topic. Pivot by adding a new page and 301-ing only if the topics are genuinely the same.
- **H1 stuffed with keywords while the page has no matching H2s** — keyword density in headings is not a ranking signal and reads as spam. Topic coverage across H2s is what matters.
- **Adding `nofollow` to internal links "to pass PageRank selectively"** — internal `nofollow` was introduced for user-generated link schemes and actively degrades internal signal flow. Use `rel` only for genuine cross-domain requirements.
- **Optimizing a page whose URL is not the canonical it declares** — editing a duplicate instead of the canonical wastes every change. Confirm `site:example.com` ownership and canonical target before writing a single word.

## References

- Title and description truncation varies by SERP, device and viewport; measure with a pixel-width preview rather than a character count.
- Google's `max-snippet:-1` and `max-image-preview:large` directives are the default for indexable pages but must be restated when any restrictive robots directive is set.