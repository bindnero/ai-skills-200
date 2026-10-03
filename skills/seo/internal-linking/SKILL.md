---
name: internal-linking
description: Builds and audits the internal link graph — anchor text distribution, hub-and-spoke clusters, orphan rescue, navigation and footer link governance, and authority flow. Use when priority pages lack inbound internal links, after a content launch, when equity pools on the homepage, or as a scheduled link audit.
---

# Internal Linking

**Use when:** Priority pages have few or no inbound internal links, after publishing new content, when traffic concentrates on the homepage while deep pages earn nothing, or as a scheduled link-audit pass.
**Do not use when:** the problem is crawlability — a page blocked in robots.txt or `noindex` cannot benefit from links; use `robots-and-canonicals` first.

## Instructions

1. Pull the internal link graph from a full crawl and compute inbound internal links per URL, weighted by the source page's own authority (use its organic traffic or referring-domain count as the weight). Weighted count, not raw count, shows where equity actually lands.
2. Set target inlink counts per template from the top-10 SERP median. Compare each page's weighted inlinks to that median; the delta is the work list, ordered descending.
3. Classify internal link types and give each a rule: global nav (all pages, no more than 25 links), breadcrumbs (parent chain), contextual in-body links (the only kind that passes meaningful equity), hub-to-spoke, spoke-to-hub, footer (utility only, treated as near-worthless), related posts and pagination.
4. Enforce anchor text discipline. Vary naturally across the cluster: exact-match under 20% of anchor instances to any one target, with brand, partial-match, URL and natural-language anchors making up the rest. All internal links must be `dofollow`; internal `nofollow` is never correct.
5. Fix orphans first. Any indexable page with zero internal inlinks gets at least 3 contextual inlinks from related, higher-authority pages in the same cluster. Do not fix orphans via the footer — that is not an endorsement.
6. Implement hub-and-spoke: the pillar links down to every child, every child links up to the pillar and across to 2–3 siblings. This is what makes a cluster read as a topic to crawlers and readers.
7. Audit placement, not just presence. A link in the first body paragraph or introduction passes more usable context than 40 links in a sidebar. Assert every priority page receives at least one link above the fold.
8. Handle pagination correctly: self-referencing canonicals on `?page=2` (never `noindex` or canonicalized to page 1), `<link rel="next">`/`rel="prev"` where supported, and in-body sibling links so paginated archives are fully crawlable.
9. Find and fix redirect-hiding links. Crawl for internal links pointing at 301 destinations and rewrite them to the final URL so no internal equity is spent on a hop.
10. Audit quarterly and log every change (source, target, anchor, date, added/removed) so equity movements can be attributed to specific edits.

## Patterns

Weighted inlink audit against the SERP median, with anchor caps enforced:

```python
import pandas as pd

links = pd.read_csv("internal_links.csv")   # source, target, anchor, dofollow
auth  = pd.read_csv("page_authority.csv")    # url, referring_domains
weight = dict(zip(auth.url, auth.referring_domains.fillna(1)))
links["weight"] = links.dofollow.astype(bool) * links.source.map(weight).fillna(1)

weighted_in = links.groupby("target").weight.sum().rename("weighted_inlinks")
audit = weighted_in.reset_index().merge(auth[["url"]], left_on="target",
                                        right_on="url", how="left")
audit["gap"] = 47 - audit.weighted_inlinks      # 47 = top-10 median inlinks
audit = audit[audit.gap > 0].sort_values("gap", ascending=False)

for t in weighted_in.index:
    total = (links.target == t).sum()
    slug = t.rstrip("/").split("/")[-1].lower()
    exact = links[(links.target == t) & (links.anchor.str.lower() == slug)].shape[0]
    assert exact / total < 0.20, f"{t}: exact-match anchor at {exact/total:.0%} (>20%)"
```

Hub-and-spoke generator and anchor rotation for one target:

```python
def render_cluster(pillar_url, children):
    """Every child links up to the pillar; the pillar links down to all children."""
    return {
        "pillar": {"down_links": [{"to": c["url"], "anchor": c["anchor"]}
                                  for c in children]},
        **{c["url"]: {
              "up_link": {"to": pillar_url, "anchor": c["anchor_to_pillar"]},
              "sibling_links": [{"to": o["url"], "anchor": o["anchor"]}
                                for o in children if o["url"] != c["url"]][:3],
           } for c in children}
    }
```

```html
<!-- target: /seo/crawl-budget/ — exact match capped at 1 of 6 anchors -->
<a href="/seo/crawl-budget/">crawl budget</a>                <!-- exact -->
<a href="/seo/crawl-budget/">crawl budget optimization</a> <!-- partial -->
<a href="/seo/crawl-budget/">how to fix crawl waste</a>    <!-- natural -->
<a href="/seo/crawl-budget/">our crawl analysis</a>       <!-- brand/natural -->
<a href="/seo/crawl-budget/">Googlebot recrawl limits</a> <!-- natural -->
<a href="/seo/crawl-budget/">Acme's crawl budget guide</a> <!-- brand -->
```

Pagination handled correctly, plus internal links wasting equity on redirects:

```html
<!-- on /blog/page/2/ -->
<link rel="canonical" href="https://ex.com/blog/page/2/">
<link rel="prev" href="https://ex.com/blog/">
<link rel="next" href="https://ex.com/blog/page/3/">
<nav aria-label="Pagination">
  <a href="/blog/">1</a>
  <a href="/blog/page/2/" aria-current="page">2</a>
  <a href="/blog/page/3/">3</a>
</nav>
<!-- sibling archive months linked in-body so the whole archive stays crawlable -->
```

```python
redirects = {r.source: r.destination for r in crawl
             if 300 <= r.status_code < 400}
wasting = links[links.target.isin(redirects)].copy()
wasting["final"] = wasting.target.map(redirects)
print(wasting[["source", "target", "final"]].to_string(index=False))
# then rewrite each `source` to reference `final` directly
```

## Checklist

- [ ] Inbound internal links computed per URL, weighted by source authority, not raw counts.
- [ ] SERP-median inlink target set per template; gap list produced and prioritized.
- [ ] Every priority page receives at least one contextual in-body link above the fold.
- [ ] Zero internal `nofollow` links; anchor distribution per target within a 20% exact-match cap.
- [ ] Orphans (indexable, zero inlinks) given 3+ contextual inlinks from within their cluster.
- [ ] Hub-and-spoke complete: pillar links to all children; children link up and across to 2–3 siblings.
- [ ] Paginated pages self-canonical with prev/next and inter-page body links; not canonicalized to page 1.
- [ ] Internal links pointing at 301s rewritten to the final destination.

## Anti-patterns

- **Adding a "Related articles" block in every page footer** — a template-wide widget with identical links on every page creates an outbound equity dump and passes no context. Related links must be contextually selected per page.
- **Using exact-match anchor text on every internal link** — repeated commercial anchors to one target trigger Google's anchors-keyword analysis. Cap exact match and vary the rest.
- **Inserting links purely to pass authority with no reader value** — hidden nav items, invisible images in empty containers and empty "jump to" anchors fall under Google's link spam policies.
- **Linking only new content and abandoning old content** — the pages with the most authority need links most; old ranking posts decay precisely because their internal signals stopped.
- **Mass-editing anchor text site-wide in one day** — a large-scale internal anchor change reads as a manipulation pattern to Google's spam classifiers. Roll out in batches over weeks and keep distributions within natural bounds.

## References

- Google's spam policies cover link schemes and excessive link exchanges; internal anchor manipulation sits on the same detection surface as external.
- Google publishes no weighting for footer links; empirically footer-only internal links contribute negligibly compared with in-body contextual links.