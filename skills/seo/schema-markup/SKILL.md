---
name: schema-markup
description: Implements and validates JSON-LD structured data for rich results — Organization, Article, Product, FAQ, BreadcrumbList and LocalBusiness — under Google's current eligibility rules. Use when a page qualifies for rich results but shows none, or when adding structured data to product, article, recipe, event or local page templates.
---

# Schema Markup

**Use when:** A page is eligible for a rich result (stars, price, FAQ accordions, breadcrumbs, sitelinks, event dates) but no enhancement appears, or when adding structured data to templates for products, articles, recipes, events or local businesses.
**Do not use when:** The page is not eligible at all — content-intent match and indexation come first via `indexation-control`.

## Instructions

1. Choose the schema type from the page's primary purpose, one per page. A recipe page uses `Recipe`; a product page uses `Product`. Do not stack `Article` on a product page to grab article rich results — mismatched types are a manual-action risk.
2. Use JSON-LD in a `<script type="application/ld+json">` block, in the initial server-rendered HTML. Google reads JSON-LD most reliably, it survives most CMS re-saves, and client-injected markup is frequently missed by the fetch deadline.
3. Model the entity graph, not isolated blobs. Every node gets a stable `@id`; use `@graph` so `WebPage`, `WebSite`, `Organization`, `BreadcrumbList` and `Article` reference each other instead of repeating literal values.
4. Populate only what is visible on the page. Google's policy requires marked-up content to be visible to the user. Markup-only FAQ answers, collapsed content, or `Review`/`AggregateRating` not rendered in the DOM are violations.
5. Wire `mainEntityOfPage`, `headline` (≤110 chars), `datePublished`, `dateModified`, `author` as a `Person` node with `url`, and `publisher` with a `logo` ImageObject — the eligibility fields for Article.
6. For `Product`, include `offers` with `price`, `priceCurrency`, `availability`, `priceValidUntil`, `itemCondition` and `url`, plus `aggregateRating` or `review`. A Product without either is ineligible for price/review stars. Never generate ratings absent from the DOM.
7. For `LocalBusiness`, use the most specific subtype, with `geo` lat/long, `openingHoursSpecification` for every day including closures, `address`, `telephone`, `areaServed` and `priceRange`. NAP must match the Google Business Profile exactly.
8. Add `BreadcrumbList` with consecutive `itemListElement` positions 1..n and absolute `item` URLs; breadcrumbs render in SERP and corroborate the structured hierarchy.
9. Validate in three stages: Schema Markup Validator (schema validity), Rich Results Test (Google eligibility), then URL Inspection Tool on the live URL (production fetch). All three must pass; the Rich Results Test alone misses environment failures.
10. Monitor the Search Console Rich Results report after deployment; track eligible vs. detected items weekly for the first month.

## Patterns

`@graph` entity model with stable cross-references:

```html
<script type="application/ld+json">
{ "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": "https://acme.example/#website", "url": "https://acme.example/",
      "name": "Acme Analytics", "publisher": { "@id": "https://acme.example/#org" } },
    { "@type": "Organization", "@id": "https://acme.example/#org",
      "name": "Acme Analytics", "url": "https://acme.example/",
      "logo": { "@type": "ImageObject", "url": "https://acme.example/logo-600x600.png",
                "width": 600, "height": 600, "caption": "Acme Analytics" }, "sameAs": ["https://www.linkedin.com/company/acme-analytics"] },
    { "@type": "BreadcrumbList", "@id": "https://acme.example/seo/crawl-budget/#crumbs",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://acme.example/" },
        { "@type": "ListItem", "position": 2, "name": "SEO", "item": "https://acme.example/seo/" },
        { "@type": "ListItem", "position": 3, "name": "Crawl Budget Optimization" } ] },
    { "@type": "WebPage", "@id": "https://acme.example/seo/crawl-budget/#webpage",
      "url": "https://acme.example/seo/crawl-budget/", "inLanguage": "en-US",
      "isPartOf": { "@id": "https://acme.example/#website" },
      "breadcrumb": { "@id": "https://acme.example/seo/crawl-budget/#crumbs" } },
    { "@type": "Article", "@id": "https://acme.example/seo/crawl-budget/#article",
      "isPartOf": { "@id": "https://acme.example/seo/crawl-budget/#webpage" },
      "mainEntityOfPage": { "@id": "https://acme.example/seo/crawl-budget/#webpage" },
      "headline": "Crawl Budget Optimization: How to Stop Google Wasting Crawls",
      "description": "Log-file formulas, 2026 benchmarks and five fixes that raise crawl frequency.",
      "datePublished": "2026-08-14T09:00:00Z", "dateModified": "2026-09-30T11:20:00Z",
      "author": { "@type": "Person", "name": "Dana Reyes",
                  "url": "https://acme.example/authors/dana-reyes/",
                  "jobTitle": "Principal SEO Engineer" },
      "publisher": { "@id": "https://acme.example/#org" },
      "image": ["https://acme.example/og/crawl-budget-1200x630.png"], "wordCount": 2640 } ] }
</script>
```

Product with Offer, real rating, shipping and return policy:

```html
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "Product",
  "name": "Acme Crawl Monitor", "sku": "ACM-CRM-5M", "gtin13": "4006381333931",
  "description": "Log-file crawl analytics for sites up to 5M URLs.",
  "image": ["https://acme.example/img/monitor-1200.jpg"],
  "brand": { "@type": "Brand", "name": "Acme Analytics" },
  "aggregateRating": { "@type": "AggregateRating",
    "ratingValue": "4.7", "reviewCount": "218", "bestRating": "5", "worstRating": "1" },
  "offers": { "@type": "Offer",
    "url": "https://acme.example/products/crawl-monitor/",
    "price": "299.00", "priceCurrency": "USD", "priceValidUntil": "2026-12-31",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition",
    "seller": { "@id": "https://acme.example/#org" },
    "shippingDetails": { "@type": "OfferShippingDetails",
      "shippingRate": { "@type": "MonetaryAmount", "value": "0.00", "currency": "USD" },
      "shippingDestination": { "@type": "DefinedRegion", "addressCountry": "US" } },
    "hasMerchantReturnPolicy": { "@type": "MerchantReturnPolicy",
      "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
      "merchantReturnDays": 30 } } }
</script>
```

LocalBusiness subtype with hours, geo and rating — NAP must match the Google Business Profile:

```html
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "Plumber",
  "name": "Acme Plumbing", "telephone": "+1-415-555-0142", "priceRange": "$$",
  "address": { "@type": "PostalAddress", "streetAddress": "1200 Market St",
    "addressLocality": "San Francisco", "addressRegion": "CA",
    "postalCode": "94102", "addressCountry": "US" },
  "geo": { "@type": "GeoCoordinates", "latitude": 37.7765, "longitude": -122.4171 },
  "openingHoursSpecification": [
    { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
      "opens": "07:00", "closes": "19:00" },
    { "@type": "OpeningHoursSpecification", "dayOfWeek": "Saturday", "opens": "08:00", "closes": "16:00" } ],
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.7",
                       "reviewCount": "184" } }
</script>
```

## Checklist

- [ ] Exactly one primary schema type per page, matching the page's visible purpose.
- [ ] JSON-LD present in server-rendered HTML, not injected client-side.
- [ ] `@graph` used with stable `@id` cross-references between WebPage, WebSite, Organization, BreadcrumbList.
- [ ] Every marked-up value verified as visibly rendered (diff DOM text against markup).
- [ ] Article includes `headline` ≤110 chars, `datePublished`, `dateModified`, `author.url`, `publisher.logo`.
- [ ] Product has `offers` with price/currency/availability/priceValidUntil plus real `aggregateRating` or `review`.
- [ ] `BreadcrumbList` uses consecutive positions 1..n and absolute URLs.
- [ ] Schema Markup Validator, Rich Results Test and URL Inspection Tool all pass on the live URL.

## Anti-patterns

- **Marking up `FAQPage` where the Q&A is not visible on the page** — Google's August 2023 change restricted FAQ rich results to authoritative government and health sites; elsewhere markup-only FAQs risk a manual action rather than earning an enhancement.
- **Generating `aggregateRating` from a JS widget or a render-time average** — self-serving review markup on a first-party sales page is a documented manual-action trigger, and `Review` must reflect a real person who really reviewed the product.
- **Injecting JSON-LD with client-side JavaScript** — Google's renderer is inconsistent and the fetch deadline can expire before markup exists, so the page appears to have no structured data at all.
- **Stacking `Article`, `Product` and `HowTo` on one page** — mismatched primary types dilute relevance and violate the one-primary-type guidance; `HowTo` rich results were also deprecated in 2023.
- **Hardcoding JSON-LD into thousands of page templates** — one bad required field invalidates the block and there is no way to detect it at scale. Emit schema from the data layer with a CI validation step.

## References

- Google Search Central's structured data general guidelines and per-type appearance docs are the authority; eligibility lists change several times a year.
- Only schema.org types listed in Google's appearance documentation produce rich results — the full schema.org vocabulary is far larger.