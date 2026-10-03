---
name: local-seo
description: Optimizes local search presence — Google Business Profile, NAP consistency, LocalBusiness schema, location pages, reviews, citations and local link acquisition. Use when a multi-location or service-area business needs map-pack visibility, or when Google Business Profile data conflicts with the website.
---

# Local SEO

**Use when:** A business with physical locations or a service area needs to appear in the map pack and local results, when Google Business Profile information disagrees with the website, or when acquiring local citations and reviews.
**Do not use when:** the business is fully online with no physical presence — GBP does not apply; use `saas-seo` instead.

## Instructions

1. Build or audit the Google Business Profile for every location. Required: exact business name (no keyword stuffing), primary and additional categories, service area or address, hours including special hours, phone, website, photos, services with descriptions, attributes. The primary category is the single strongest factor within the GBP surface.
2. Reconcile NAP exactly across sources. Name, address and phone must be byte-identical on the website, GBP and every citation — one canonical format (`Ste 200` vs `#200` is a mismatch). Track citations in a sheet with target/actual diffs.
3. Build one dedicated local page per location: unique `LocalBusiness` schema with correct `geo`, `openingHoursSpecification`, `address`, `telephone` and `areaServed`; genuinely unique content (local projects, local staff bios, local pricing); embedded map and directions. Do not template with the city name swapped — see `programmatic-seo`.
4. Use the most specific LocalBusiness subtype (`Plumber`, `Dentist`, `Restaurant`, `AutoRepair`), not generic `LocalBusiness` — the subtype carries category signals.
5. Build citations in authority order: Google, Bing Places, Apple Business Connect, Yelp, TripAdvisor and industry directories first; data aggregators (Data Axle, Bizapedia) second. Prioritize quality and NAP consistency over volume.
6. Implement a review strategy: a system for requesting reviews post-purchase by email/SMS, honest responses to all reviews including negatives, and no gating or incentives for positive reviews. Reviews feed both GBP ranking and rich-result stars.
7. Add `Review`/`AggregateRating` schema matching reviews visibly rendered on the page, with real reviewer names. Markup not shown to users violates Google's structured data policy.
8. Optimize local on-page signals: crawlable NAP in the footer or contact page, `LocalBusiness` JSON-LD on each location page, location pages linked from a global Locations hub and from relevant service pages, city/service terms in title and H1.
9. Earn local links: chamber of commerce, local press, sponsorships, supplier and customer pages, NAP-anchored directories, and unlinked-mention reclamation. Prioritize links from other local businesses and local news.
10. Track per location: GBP discovery/search/booking metrics, map-pack ranking per keyword, local pack impression share, review count and rating velocity, citation consistency rate, and local organic sessions alongside GBP calls/directions. Local rankings are location-plus-keyword specific.

## Patterns

`LocalBusiness` schema, NAP matching the Google Business Profile exactly:

```html
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "Plumber",
  "name": "Acme Plumbing", "image": "https://acme.example/og/storefront-1200.jpg",
  "telephone": "+44-20-7946-0142", "priceRange": "££",
  "address": { "@type": "PostalAddress", "streetAddress": "1200 Market St",
    "addressLocality": "London", "addressRegion": "Greater London",
    "postalCode": "SE1 9GF", "addressCountry": "GB" },
  "geo": { "@type": "GeoCoordinates", "latitude": 51.5074, "longitude": -0.1278 },
  "openingHoursSpecification": [
    { "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
      "opens": "07:00", "closes": "19:00" },
    { "@type": "OpeningHoursSpecification", "dayOfWeek": "Saturday",
      "opens": "08:00", "closes": "16:00" } ],
  "areaServed": [ { "@type": "City", "name": "London" },
                  { "@type": "Place", "name": "Southwark" } ],
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.7", "reviewCount": "184" },
  "hasOfferCatalog": { "@type": "OfferCatalog", "name": "Services",
    "itemListElement": [ { "@type": "OfferCatalog", "name": "Boiler installation",
      "itemListElement": { "@type": "Offer", "priceCurrency": "GBP",
                           "price": "1899.00", "priceValidUntil": "2026-12-31" } } ] } }
</script>
```

GBP fields the website must mirror, generated from the database of record:

```python
NAP_FIELDS = ["name", "street", "city", "region", "postal_code", "phone", "hours"]
# source of truth: the booking system; the website and GBP both render from it
def location_page(location):
    return {"title": f"{location['name']} — {location['city']} | Acme Plumbing",
            "description": f"Call {location['phone']}. Boiler repair in {location['city']}, "
                           f"open {location['hours']}. Gas Safe registered, £99 callout.",
            "schema": LocalBusiness(**{k: location[k] for k in NAP_FIELDS}),
            "hours_display": format_hours(location["hours"])}   # identical text to GBP
```

City and service pages with real local evidence, not doorway templates:

```html
<title>Boiler Repair in Leeds | Same-Day, Gas Safe Registered | Acme Heating</title>
<h1>Boiler Repair in Leeds</h1>
<p>We repair boilers across LS1–LS14. Fixed callout £89, same-day slots before 4pm.</p>
<section>
  <h2>Recent work in Leeds</h2>
  <ul>
    <li>Beacon Road, LS6 — Ideal Logic 24kW, interlock replaced, 3 Mar 2026</li>
    <li>Harehills, LS8 — Worcester Greenstar, PCB fault, 1 Mar 2026</li>
  </ul>
</section>
<h2>Leeds boiler repair prices</h2>
<table><tr><th>Job</th><th>Typical price</th></tr>
  <tr><td>Callout and diagnosis</td><td>£89</td></tr>
  <tr><td>Interlock replacement</td><td>£145–£190</td></tr></table>
```

Review markup that reflects only real, on-page reviews:

```html
<div itemscope itemtype="https://schema.org/Review">
  <meta itemprop="datePublished" content="2026-09-14">
  <p itemprop="reviewRating" itemscope itemtype="https://schema.org/Rating">
     <span itemprop="ratingValue" content="5">5</span> out of 5</p>
  <p itemprop="reviewBody">Engineer arrived on time and had the part.</p>
  <span itemprop="author" itemscope itemtype="https://schema.org/Person">
    <span itemprop="name">Sarah K.</span></span>
</div>
```

```python
# citation and NAP consistency check before publishing a location page
NAP_CHECKS = [
    "website address == GBP address", "phone identical in page, schema and GBP",
    "hours text identical to GBP hours", "no keyword-stuffed city list in the H1",
    "no fake addresses on non-existent streets",
]
```

## Checklist

- [ ] GBP complete per location: unstuffed name, primary + secondary categories, hours, services, photos, attributes.
- [ ] NAP byte-identical on website, GBP and all citations; consistency rate measured above 90%.
- [ ] One dedicated, genuinely unique local page per location with the correct LocalBusiness subtype.
- [ ] `geo`, `openingHoursSpecification` (including closures), `address`, `telephone`, `areaServed`, `hasMap` present per location.
- [ ] Location pages linked from a Locations hub and relevant service pages; embedded map and directions.
- [ ] Review request system in place, all reviews answered, no gating or incentives.
- [ ] Review/AggregateRating schema matches reviews visibly rendered on the page.
- [ ] Citations prioritized by authority (GBP, Bing Places, Apple, Yelp, industry) before aggregators.

## Anti-patterns

- **Stuffing the business name with keywords in GBP** — "Acme Plumbing | 24 Hour Emergency Plumber SF" gets the profile suspended or downgraded. The name must be the real-world name only.
- **Repeating the city name across title, H1 and headers** — "San Francisco Plumber — Best Plumber in San Francisco" reads as spam and dilutes relevance. City once in title, once in H1, then earn the rest with local content.
- **Templating location pages with only the city name swapped** — the classic doorway-page pattern; Google's local content guidance requires real local information or experience.
- **Buying reviews or incentivizing positive ones** — explicitly prohibited; triggers GBP suspension and manual actions. Ask every customer neutrally and respond to everything.
- **Inconsistent NAP across directories** — different formats, old numbers and stale addresses fragment the entity signal. Normalize every citation to one canonical format before pursuing new ones.

## References

- Google Business Profile guidelines require the business name to reflect the real-world name and prohibit promotional text in that field.
- Google's local ranking guidance emphasizes relevance (categories plus keywords), distance and prominence (reviews, links, citations).