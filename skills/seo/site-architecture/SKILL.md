---
name: site-architecture
description: Designs and audits URL structure, directory depth, pagination, taxonomies and hierarchy so crawl paths stay short and internal authority concentrates correctly. Use when planning a new site or section, flattening deep hierarchies, or when asked about site structure, information architecture or URL design.
---

# Site Architecture

**Use when:** Building a new site or a major section, flattening an over-deep hierarchy, designing a taxonomy or category tree, or auditing why internal equity never reaches deep pages.
**Do not use when:** the problem is that pages are excluded from the index rather than poorly linked — use `indexation-control`.

## Instructions

1. Map the current architecture as a graph, not a folder tree. Extract every internal link, then compute depth (clicks from `/`), inbound links, outbound links and an authority-weighted inlink count. Export as CSV or a Gephi file.
2. Set a hard depth ceiling of 3 clicks site-wide and 4 for money pages. Anything deeper must be reachable through a hub. Confirm against the crawl: `max_depth > 3` is a structural defect, not a content defect.
3. Classify pages by type (home, hub, category, product/article, utility, tag/archive, error) and give each type exactly one structural role. A URL serving two roles — a category that is also a landing page — splits its own signals.
4. Design the URL scheme under three constraints: short, stable, human-legible. Lowercase, hyphens, no file extensions, no dates, no session IDs, no pagination in the path (`?page=2` or `/page/2/` both fine; `/2026/05/` is not, because it forces a redirect every month).
5. Keep faceted URLs out of the indexable path space. Sort, filter, price range, availability and color create combinatorial URL explosion. Either render them client-side or exclude them from the crawlable link graph.
6. Build hubs: every section has a hub page, every hub links to its children, every child links back up. Assert backlink symmetry in CI with `child has >= 1 link to its parent hub`.
7. Consolidate tag and archive pages. If two tags share more than 70% of their URL set, merge and 301. Every thin tag page dilutes the site's internal equity.
8. Validate with the flat-proportion test: in a healthy site, URLs at depth 1 outnumber depth 2, which outnumber depth 3. An inverted pyramid means equity is pooling in the wrong place.
9. Define "orphan" precisely: a URL in the XML sitemap with zero internal inlinks is the worst case (discovered but unendorsed); a URL with inlinks but absent from the sitemap is fine. Fix the first class by adding links, never by adding sitemap entries.
10. Produce the target architecture as a URL manifest — current URL, target URL, redirect type, rationale — which becomes the input to a migration plan.

## Patterns

Build the graph and measure depth and inlinks:

```python
import networkx as nx, pandas as pd

edges = pd.read_csv("internal_links.csv")            # source, target
G = nx.DiGraph()
G.add_edges_from(zip(edges.source, edges.target))

def depth_from_root(root="/"):
    depth, frontier = {root: 0}, [root]
    while frontier:
        nxt = []
        for u in frontier:
            for n in G.successors(u):
                if n not in depth:
                    depth[n] = depth[u] + 1
                    nxt.append(n)
        frontier = nxt
    return depth

depth = depth_from_root()
inlinks = dict(G.in_degree())
nodes = pd.DataFrame({"url": list(G.nodes),
                      "depth": [depth.get(u, 99) for u in G.nodes],
                      "inlinks": [inlinks.get(u, 0) for u in G.nodes]})
print(nodes.groupby("depth").size())          # must decrease monotonically
print("orphans:", nodes[(nodes.depth > 0) & (nodes.inlinks == 0)].url.tolist())
```

Fail the build on an inverted pyramid or a depth breach:

```python
by_depth = nodes[nodes.depth > 0].groupby("depth").size()
for d in by_depth.index[:-1]:
    assert by_depth[d] > by_depth[d + 1], \
        f"depth {d} ({by_depth[d]}) <= depth {d+1} ({by_depth[d+1]}) — inverted pyramid"
assert by_depth.max() <= 3, f"max depth {by_depth.max()} exceeds the 3-click ceiling"
```

Backlink symmetry assertion, run in CI:

```python
from bs4 import BeautifulSoup

def parent_hub_linked(html, hub_path):
    hrefs = {a.get("href", "") for a in BeautifulSoup(html, "html.parser")
             .find_all("a", href=True)}
    return any(h == hub_path or h.startswith(hub_path) for h in hrefs)

assert parent_hub_linked(child_html, "/blog/"), "child does not link to its parent hub"
```

URL manifest as the migration input, plus full-chain redirect detection:

```csv
current_url,target_url,redirect_type,rationale
https://ex.com/blog.html,https://ex.com/blog,301,folder -> clean path
https://ex.com/blog/post-1,https://ex.com/blog/post-1/,301,trailing slash normalization
https://ex.com/tag/seo,https://ex.com/blog/seo/,301,thin tag consolidated into blog cluster
https://ex.com/products/,https://ex.com/shop/,301,single canonical commerce root
```

```python
def build_redirect_map(crawl_df):
    """Walk full chains; report any multi-hop path rather than hop 1 only."""
    pairs = []
    for r in crawl_df.itertuples():
        if 300 <= r.status_code < 400:
            chain, url = [r.url], r.url
            while r.destination:
                url = r.destination
                chain.append(url)
                r = crawl_df.loc[crawl_df.url == url].iloc[0]
            if len(chain) > 1:
                pairs.append({"from": chain[0], "to": chain[-1],
                              "hops": len(chain) - 1})
    return pd.DataFrame(pairs).sort_values("hops", ascending=False)
```

## Checklist

- [ ] Internal link graph exported with depth, inlinks and outlinks per URL.
- [ ] Depth ceiling of 3 site-wide and 4 for money pages verified from the crawl.
- [ ] Every page type assigned exactly one structural role.
- [ ] URL scheme free of dates, extensions, session IDs and facets in the indexable path.
- [ ] Every section has a hub and every child links to its hub, asserted in CI.
- [ ] Depth distribution monotonically decreasing (flat-proportion test passes).
- [ ] Tags/archives with >70% URL-set overlap merged with 301s.
- [ ] Orphans (in sitemap, zero inlinks) resolved by adding links, not sitemap entries.

## Anti-patterns

- **Putting the date in the URL for evergreen content** — `/2026/10/crawl-budget/` forces a redirect every October forever and splits link equity across vintages. Date only genuinely time-bound content.
- **Nesting categories to mirror an org chart** — internal departments are not user search paths. `/shop/tools/measuring/laser/` means nothing to Google and everything to friction. Flatten to `/shop/laser-measuring/`.
- **Rendering `?sort=` as a crawlable nav link** — every sort value becomes a URL duplicating the default. Sort must be client-side state or `noindex` plus disallowed.
- **Splitting one intent across `blog/x/` and `resources/x/`** — two URLs, one SERP, permanent cannibalization. One canonical URL per intent regardless of which department owns it.
- **Using 302 for a permanent move** — 302 says "temporary", Google keeps indexing both and consolidates no equity. Permanent is always 301 with the target returning 200.

## References

- Google's site structure guide recommends descriptive, concise URLs and flat hierarchies so any page is three clicks from the homepage.
- The flat-proportion model is an information-architecture heuristic; treat a failure as a prompt to investigate, not as a ranking penalty.