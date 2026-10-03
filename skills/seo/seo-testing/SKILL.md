---
name: seo-testing
description: Builds automated SEO regression tests — CI assertions for canonicals, robots directives, titles, status codes, structured data, hreflang reciprocity and Core Web Vitals budgets — plus pre-launch URL diffing against production. Use when adding SEO checks to a pipeline, preventing regressions in PRs, or validating a release before deploy.
---

# SEO Testing

**Use when:** Integrating SEO checks into CI/CD, preventing regressions before they reach production, or validating a release against a known-good baseline.
**Do not use when:** performing a one-off exploratory audit of an existing site — use `technical-seo-audit`.

## Instructions

1. Define the invariant set before writing tests. Enumerate the rules the codebase must never break: exactly one H1; self-referencing canonical on indexable pages; `noindex` never coexisting with a robots.txt disallow; title 30–60 chars; meta description present on indexable pages; valid required schema fields per template; hreflang reciprocity; no redirect chains; 200 on indexable routes; `lastmod` never in the future. Every assertion maps to a rule you actually enforce.
2. Test at three layers: unit tests over route/template logic (canonical builder returns an absolute URL; title generator respects length), integration tests fetching rendered HTML (single H1, schema validity), and e2e tests against a production-like environment (headers, CWV budgets). Each layer catches different bug classes.
3. Implement a URL-diff gate for releases. Snapshot the crawl (indexable URLs, statuses, canonicals, title, H1) before and after; fail the build on any new 4xx/5xx, any indexable URL no longer 200, any removed URL lacking a 301, or any canonical changed to a non-self value.
4. Add Lighthouse CI budgets as a performance gate — LCP, CLS, transfer sizes and render-blocking resources per URL pattern, mobile and desktop profiles. Fail on regression, not on absolute lab score.
5. Validate structured data in CI by parsing rendered JSON-LD on representative URLs per route and asserting required properties per type. Do not crawl the whole site on every commit.
6. Assert hreflang correctness on a locale fixture: every page's alternate set equals the full cluster, each self-references, annotations are reciprocal, and encoding is `ll-CC`. Test the cluster, not one page.
7. Enforce noindex/disallow correctness as a test: assert each known utility path returns a robots directive permitting index removal (`noindex`) and is NOT disallowed in robots.txt. This prevents exactly the failure that leaves URLs indexed as bare links.
8. Set the gate to "fail on regression, warn on budget overrun." Hard-failing on absolute SEO scores blocks every deploy; failing on deltas from a baseline is sustainable.
9. Wire the suite into PR checks with actionable failure output (URL, rule, expected, actual) ranked by traffic impact. Opaque failures get skipped by developers.
10. Run a scheduled nightly crawl of production with the same assertions, diff against the previous night's snapshot, and alert on drift — this catches changes made outside the pipeline (CMS edits, config or script drift).

## Patterns

Diffing two crawls so a deploy's SEO impact is measurable, not assumed:

```python
import pandas as pd

def diff(before, after):
    before = before.set_index("url"); after = after.set_index("url")
    added   = after.index.difference(before.index)
    removed = before.index.difference(after.index)
    changed = after.index.intersection(before.index)
    delta = pd.DataFrame({"status_before": before.loc[changed, "status_code"],
                          "status_after":  after.loc[changed, "status_code"],
                          "title_before":  before.loc[changed, "title"],
                          "title_after":   after.loc[changed, "title"],
                          "canonical_before": before.loc[changed, "canonical"],
                          "canonical_after":  after.loc[changed, "canonical"]})
    delta["title_changed"]     = delta.title_before != delta.title_after
    delta["canonical_changed"] = delta.canonical_before != delta.canonical_after
    delta["broke"]             = (delta.status_after >= 400) | \
                                (delta.status_before == 200) & (delta.status_after != 200)
    return {"added": list(added), "removed": list(removed),
            "new_404s": delta[delta.broke].index.tolist(),
            "changed_titles": int(delta.title_changed.sum()),
            "changed_canonicals": int(delta.canonical_changed.sum())}
```

A regression suite for the checks that have historically broken:

```python
import pytest, requests

@pytest.mark.parametrize("path", ["/", "/products/widget-pro/", "/guides/crawl-budget/"])
def test_single_h1_and_self_canonical(path):
    soup = get_soup("https://acme.example" + path)
    assert len(soup.find_all("h1")) == 1, "h1 count changed"
    assert soup.select_one('link[rel=canonical]')["href"].rstrip("/") == \
           ("https://acme.example" + path).rstrip("/"), "canonical is not self-referencing"

@pytest.mark.parametrize("path", ["/", "/cart/", "/search/"])
def test_indexation_directives(path):
    r = requests.get("https://acme.example" + path, timeout=20)
    expected = "noindex" if path in ("/cart/", "/search/") else "index"
    assert expected in r.text, "indexation directive drifted"

def test_sitemap_urls_all_return_200():
    locs = fetch_sitemap_locs("https://acme.example/sitemaps/index.xml")
    bad = [u for u in locs if requests.head(u, timeout=10).status_code != 200]
    assert not bad, f"{len(bad)} sitemap URLs are not 200: {bad[:5]}"
```

Staging gate with shadow checks, so a regression never reaches production:

```nginx
# staging renders the production canonical/robots values, not placeholders
location / {
  add_header X-Robots-Tag $upstream_robots_tag always;
  proxy_pass http://app_staging;
  proxy_set_header X-Crawl-Preview "1";
}
```

```bash
# run the SEO suite on every staging build; block the deploy on any failure
pytest tests/seo -q --junitxml=seo.xml || exit 1
python scripts/crawl_diff.py before.json after.json --fail-on-new-404 --fail-on-lost-url
```

## Checklist

- [ ] Invariant set enumerated; every test maps to an enforced rule.
- [ ] Three layers implemented: unit (logic), integration (rendered HTML), e2e (headers/CWV).
- [ ] URL-diff gate fails on new 4xx/5xx, removed URLs without 301, and non-self canonicals.
- [ ] Lighthouse CI budgets configured for mobile and desktop; fail on regression, warn on overrun.
- [ ] JSON-LD parsed and required fields asserted per template type on representative URLs.
- [ ] hreflang tests assert self-reference, full cluster, reciprocity and `ll-CC` encoding.
- [ ] Utility-path test asserts `noindex` present AND not disallowed in robots.txt.
- [ ] PR checks output URL, rule, expected vs. actual, ranked by traffic impact.

## Anti-patterns

- **Running SEO tests only on the homepage** — the homepage passes everything; the broken templates are category and product pages. Parameterize the suite across every route type.
- **Blocking deploys on absolute SEO scores** — every PR fails on "title is 58 chars, must be under 50" and the gate gets disabled. Fail on regressions from a baseline, not style preferences.
- **Testing source HTML instead of rendered HTML** — a JS-injected canonical or H1 does not exist in the source, so the test passes while production fails. Fetch rendered output.
- **Testing one locale for hreflang** — hreflang bugs are reciprocity bugs and only appear when the whole cluster is checked together.
- **Failing tests with no actionable output** — a bare `assert False` with no URL and no expected/actual gets ignored. Every failure must name the URL and the rule.

## References

- Lighthouse CI (`@lhci/cli`) supports budget assertions suitable for continuous integration; the same categories surface in PageSpeed Insights.
- Testing rendered output rather than source is the only reliable method for SPA and dynamically templated sites, matching how Googlebot renders.