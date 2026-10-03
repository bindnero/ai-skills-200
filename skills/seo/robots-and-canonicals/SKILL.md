---
name: robots-and-canonicals
description: Writes and audits robots.txt directives and rel=canonical tags — www/http normalization, parameter handling, redirect-to-canonical patterns and AI crawler rules. Use when duplicate URLs split rankings, when canonicals conflict or point to redirects, when writing robots.txt blocks, or when consolidating URL variants.
---

# Robots and Canonicals

**Use when:** The same content is reachable at multiple URLs (www, http, trailing slash, parameters, case), when canonicals are missing, self-wrong or point at redirects, or when writing and auditing robots.txt blocks.
**Do not use when:** the intent is to remove a page from the index while leaving no trace — use `indexation-control` for `noindex` decisions.

## Instructions

1. Inventory URL variants. Crawl and bucket every URL by scheme (http/https), host (www/non-www), trailing slash, case, port and parameters. Each variant reachable and returning 200 is a duplicate risk.
2. Pick one canonical form per page and enforce it server-side. Choose scheme, host, trailing-slash and case convention, then 301 everything else. Server-side normalization before routing is far more reliable than CMS settings.
3. Verify self-referencing canonicals. Every indexable page's `rel=canonical` must equal its absolute canonical URL. Cross-canonical is for true duplicates only, and the target must itself be indexable and 200.
4. Ensure the canonical target is not a redirect and not `noindex`. A canonical pointing at a 301 or a `noindex` page wastes every signal it consolidates; point directly at the final 200.
5. Keep canonical tags, XML sitemap `<loc>` values and internal links byte-identical. Mismatches among the three are the primary cause of "Duplicate, Google chose different canonical".
6. Handle parameters by class. Canonicalize away tracking and session parameters (`utm_*`, `gclid`, `ref`); use `noindex` for space-orthogonal parameters (facets). Never canonical every combination to the bare URL when content genuinely differs — that is a canonical lie.
7. Write robots.txt to control crawling, not indexing. Reserve blocks for crawl traps (facets, internal search, infinite spaces) and for specific unwanted bots. Never block CSS/JS/images.
8. Include `Sitemap:` as an absolute URL, keep the file under 500KB/50k directives, and avoid patterns like `Disallow: /*?` that catch parameters you need crawled. `Allow`/`Disallow` use longest-match-wins, so ordering is irrelevant.
9. Test with Google's robots.txt tester, verify each critical URL's fetch status (Allowed/Blocked) plus its rendered canonical, and confirm sitemap entries are all Allowed.
10. Log every canonical and redirect rule in one versioned config file so URL consolidation is auditable and reversible, and re-run the variant inventory after any infrastructure change.

## Patterns

Production `robots.txt` with crawler separation and sitemap pointer:

```text
# SEO-relevant agents allowed; everything else is not the point of this file
User-agent: Googlebot
User-agent: Bingbot
User-agent: GPTBot
User-agent: ClaudeBot
Allow: /
Disallow: /cart/
Disallow: /checkout/
Disallow: /*?add-to-cart=
Disallow: /*?orderby=
Disallow: /search?
Disallow: /account/
Disallow: /internal-search/
Disallow: /cdn-cgi/
Allow: /*.css$
Allow: /*.js$
Allow: /*.woff2$

User-agent: AhrefsBot
Disallow: /

Sitemap: https://www.example.com/sitemaps/index.xml
```

Canonical rules for every template, and the two that must never be ignored:

```python
CANONICAL_RULES = {
    # sort/filter views canonicalise to the clean category URL
    "/category/*?sort=*":   "/{category}/",
    "/search*":             "/search/?q={literal query}",
    # paginated lists are self-canonical; page 1 is not canonicalised to page 2
    "/blog/page/{n}/":      "/blog/page/{n}/",
    # genuine duplicates point at the primary: http/https, trailing slash, www
    "http://www.example.com/{path}/": "https://example.com/{path}/",
    "/product/{sku}/amp/":  "/product/{sku}/",
}
```

nginx, serving one correct canonical for every variant:

```nginx
# host, scheme and index.html collapse to a single 301, before any page renders
if ($scheme = "http")           { return 301 https://$host$request_uri; }
if ($host = "www.example.com")  { return 301 https://example.com$request_uri; }
if ($request_uri ~ "^/(.*)/index\.(html?)$") { return 301 /$1/; }
location / { proxy_set_header X-Canonical-Path "$uri"; proxy_pass http://app; }
```

Python head links with self-reference, cross-domain and pagination rules:

```python
def head_links(request, page):
    origin = "https://www.example.com"          # never from the Host header
    out = [f'<link rel="canonical" href="{origin}{page.path}">']
    if page.prev_path: out.append(f'<link rel="prev" href="{origin}{page.prev_path}">')
    if page.next_path: out.append(f'<link rel="next" href="{origin}{page.next_path}">')
    out += [f'<link rel="alternate" hreflang="{l}" href="{origin}{page.path}">' for l in page.locales]
    return "".join(out)
```

Validation gate for both files, run on every deploy:

```python
import re, requests
from bs4 import BeautifulSoup

def check(url):
    soup = BeautifulSoup(requests.get(url, timeout=20).text, "html.parser")
    canon = soup.select_one('link[rel=canonical]')
    robots = requests.get(f"{url}/robots.txt", timeout=20).text
    if not canon: return ["no canonical tag"]
    if canon["href"].rstrip("/") != url.rstrip("/"): return ["canonical points elsewhere"]
    if soup.select_one('meta[name=robots][content*=noindex]'): return ["canonical + noindex conflict"]
    if re.search(r"(?im)^user-agent:\s*\*\s*$", robots): return ["wildcard block: name agents explicitly"]
    return []
```

## Checklist

- [ ] Full URL-variant inventory crawled (scheme, host, slash, case, port, params).
- [ ] One canonical form enforced server-side; all other variants 301 to it.
- [ ] Every indexable page has a self-referencing canonical matching its absolute URL.
- [ ] No canonical points to a redirect, a `noindex` page, or a 4xx/5xx.
- [ ] Canonical string byte-identical across page, sitemap `<loc>` and internal links.
- [ ] Tracking params canonicalized away; facet params handled with `noindex`, not canonical-to-bare.
- [ ] robots.txt blocks only crawl traps and allows all CSS/JS/image paths.
- [ ] robots.txt validated in Google's tester; every sitemap URL shows "Allowed".

## Anti-patterns

- **Using robots.txt to block duplicate URLs** — blocking a duplicate stops Google from seeing its `noindex` or `canonical`, so the wrong version can win. Duplicates must be crawlable and resolved with canonical or 301.
- **Canonicalizing across genuinely different content** — pointing `?color=red` at the base product URL asserts a duplicate that is not one. Either the variant really is duplicate (canonical is correct) or it is `noindex`; never a canonical lie.
- **Mixing trailing-slash conventions** — `/blog` and `/blog/` both 200 with the canonical on one form means every internal link to the other spends a hop. Normalize server-side and fix internal links.
- **Canonicalizing paginated or filtered pages to the homepage** — a common CMS default that tells Google the entire archive duplicates `/`, so it drops the archive. Each page self-canonicals or `noindex`es.
- **Blocking `/media/` or `/assets/` to save crawl budget** — images referenced in structured data and OG tags then cannot be fetched, breaking image search, rich results and social previews. Assets are not crawl waste.

## References

- Google's canonicalization documentation states rel=canonical is a hint, not a directive; Google selects the canonical most consistent across signals.
- `Allow`/`Disallow` resolution uses longest-match-wins then lowest specificity; order in the file does not matter.