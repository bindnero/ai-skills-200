---
name: sitemap-generation
description: Generates and validates XML sitemaps and sitemap indexes — URL selection, lastmod accuracy, freshness automation, image and video extensions, hreflang alternates and Search Console submission. Use when submitting a sitemap, when content is discovered late, when lastmod is unreliable, or when building sitemaps for a large or multi-locale site.
---

# Sitemap Generation

**Use when:** Publishing a new sitemap or sitemap index, when new pages take weeks to be discovered, when `lastmod` values are stale or all identical, or when automating sitemaps for a large or multi-region site.
**Do not use when:** URLs are being removed from the index rather than discovered — use `indexation-control`.

## Instructions

1. Define sitemap scope as a whitelist of indexable canonical URLs generated from the database or route table — not from a crawler dump. Include every URL with a 200 status, an indexable canonical, and a robots directive permitting indexing.
2. Exclude everything else deterministically: non-200, 3xx, 4xx, 5xx, `noindex` pages, robots-blocked URLs, faceted/session/tracking parameters, soft-404s and staging. A sitemap listing excluded URLs teaches Google to ignore the file.
3. Use a sitemap index above 50,000 URLs or 50MB uncompressed. Split by logical section (products, blog, locales), never arbitrarily by date, so each child has a meaningful scope and validates independently.
4. Set `lastmod` to a real timestamp: the last time the page's primary content or Google-indexed body changed — not the last deploy, not the build time. Use W3C 8601 or ISO 8601 consistently.
5. Never set `lastmod` to a future date or to `now()` per request. Google treats unreliable `lastmod` as noise and ignores it entirely; if you must not signal freshness, omit the tag rather than lie.
6. Add image extensions only for images genuinely on the indexable page at stable, crawlable URLs, with `image:loc`, `image:caption` and `image:license` where applicable. Do not reference images the crawler cannot resolve.
7. Add video extensions (`video:content_loc`, `video:title`, `video:description`, `video:thumbnail_loc`, `video:duration`, `video:uploader`) only for pages with real hosted video; `video:content_loc` must be the raw media file on a public URL.
8. Declare `xmlns:xhtml` and use `xhtml:link rel="alternate" hreflang` for every locale version of each URL, including a self-reference and `x-default`. Keep sitemap hreflang byte-identical to in-page tags.
9. Generate on a schedule (not per request) — daily for news/ecommerce, weekly for blogs — serve static gzipped files with cache headers, and diff against the previous version to log added/removed URL counts.
10. Submit the sitemap index (not each child) in Search Console, verify the last-read date, and monitor indexed vs. unindexed counts weekly, investigating any gap by status.

## Patterns

Sitemap index with per-section children:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://www.example.com/sitemaps/products.xml</loc><lastmod>2026-10-01T06:00:00+00:00</lastmod></sitemap>
  <sitemap><loc>https://www.example.com/sitemaps/blog.xml</loc><lastmod>2026-10-01T06:00:00+00:00</lastmod></sitemap>
  <sitemap><loc>https://www.example.com/sitemaps/en-US.xml</loc><lastmod>2026-10-01T06:00:00+00:00</lastmod></sitemap>
</sitemapindex>
```

Child sitemap with image, video and hreflang alternates:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://www.example.com/guides/crawl-budget/</loc>
    <lastmod>2026-09-30T11:20:00+00:00</lastmod>
    <xhtml:link rel="alternate" hreflang="en-US" href="https://www.example.com/en-us/guides/crawl-budget/"/>
    <xhtml:link rel="alternate" hreflang="de-DE" href="https://www.example.com/de-de/guides/crawl-budget/"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="https://www.example.com/guides/crawl-budget/"/>
    <image:image>
      <image:loc>https://www.example.com/media/crawl-budget-1200x630.png</image:loc>
      <image:caption>Crawl budget optimization dashboard, 2026 benchmarks</image:caption>
    </image:image>
  </url>
  <url>
    <loc>https://www.example.com/videos/crawl-budget-explained/</loc>
    <lastmod>2026-09-28T09:00:00+00:00</lastmod>
    <video:video>
      <video:thumbnail_loc>https://www.example.com/media/cb-thumb.jpg</video:thumbnail_loc>
      <video:title>Crawl Budget Explained in 4 Minutes</video:title>
      <video:description>How to measure and raise Googlebot crawl frequency from logs.</video:description>
      <video:content_loc>https://www.example.com/media/crawl-budget.mp4</video:content_loc>
      <video:duration>248</video:duration>
      <video:uploader info="https://www.example.com/authors/dana/">Dana Reyes</video:uploader>
    </video:video>
  </url>
</urlset>
```

Whitelist generator that emits honest `lastmod` (Django):

```python
from django.contrib.sitemaps import Sitemap
from django.urls import reverse
from blog.models import Post

class PostSitemap(Sitemap):
    priority = 0.7
    def items(self):
        return Post.objects.published().select_related("author")   # no drafts
    def lastmod(self, obj):
        return obj.content_updated_at          # real editorial change, not build time
    def location(self, obj):
        return reverse("blog:detail", kwargs={"slug": obj.slug})
    def alternates(self, obj):
        return {"hreflang": {"en-us": obj.get_absolute_url(),
                             "de-de": obj.translate_url("de-de"),
                             "x-default": obj.get_absolute_url()}}
```

CI gate that fails the build on leaks, size limits or dead URLs:

```bash
set -euo pipefail; curl -sf sitemaps/products.xml -o /tmp/sm.xml
python - <<'PY'
import os, sys, xml.etree.ElementTree as ET
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
root = ET.parse("/tmp/sm.xml").getroot()
locs = [u.find("s:loc", NS).text for u in root.findall("s:url", NS)]
if os.path.getsize("/tmp/sm.xml") / 1_048_576 > 50:   sys.exit("FAIL: over the 50MB limit")
if len(locs) > 50_000 or len(locs) != len(set(locs)):  sys.exit("FAIL: >50k URLs or duplicate <loc>")
if any(c in l for l in locs for c in ("?", "#")):      sys.exit("FAIL: parameterised URL leaked")
if any(not l.startswith("https://") for l in locs):     sys.exit("FAIL: non-absolute or non-https URL")
PY
```

## Checklist

- [ ] Sitemap built from a whitelist of indexable canonical 200 URLs, not a crawl dump.
- [ ] Non-200, 3xx, 4xx, `noindex`, robots-blocked, faceted and staging URLs all excluded.
- [ ] Sitemap index used above 50,000 URLs / 50MB, split by logical section.
- [ ] `lastmod` reflects real primary-content change time, never build/deploy time, never future.
- [ ] One consistent date format (W3C 8601 or ISO 8601) across all child sitemaps.
- [ ] `xmlns:xhtml` declared; hreflang in sitemap matches in-page tags exactly, with `x-default`.
- [ ] Image/video extensions only for real crawlable assets with valid durations and captions.
- [ ] Generated on a schedule as static gzipped files, with a hash diff logging URL churn.

## Anti-patterns

- **Generating sitemaps per request** — `lastmod` becomes `now()` on every hit, telling Google every URL changed constantly. Google learns `lastmod` is noise and stops using it. Generate on a schedule.
- **Listing every URL in one sitemap** — a 200k-URL file violates the 50k limit, gets truncated, and the tail is never discovered. Use a sitemap index with per-category children.
- **Including `noindex`, redirect or 404 URLs** — Google discovers the excluded states and reduces trust in the file. A sitemap listing 30% dead URLs signals a low-maintenance site.
- **Setting `lastmod` to a deploy hash or newest DB row for all URLs** — every URL appears identically fresh, indistinguishable from a lie. Google down-weights `lastmod` and genuinely fresh pages lose discovery priority.
- **Assuming a sitemap forces ranking or priority** — `<priority>` and `<changefreq>` are ignored by Google; sitemaps aid discovery only. Using `priority=1.0` on commercial pages has no effect.

## References

- sitemaps.org: maximum 50,000 URLs and 50MB uncompressed per file, with a sitemap index for larger sets; `priority` and `changefreq` are hints only.
- Search Console's Sitemaps report tracks submitted, indexed and coverage errors per submitted file.