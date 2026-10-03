---
name: ecommerce-seo
description: Optimizes online stores for organic search — category and product templates, faceted navigation control, out-of-stock and discontinued SKU handling, variant URLs, Product/Offer schema and feed consistency. Use when scaling category or product pages, controlling filter URLs, retiring products, or fixing rich-result and Merchant Center issues.
---

# Ecommerce SEO

**Use when:** Building or auditing category/product templates, deciding how to handle filters, sorting and subcategories, managing out-of-stock or discontinued products, or fixing product rich results and Merchant Center disapprovals.
**Do not use when:** the business sells services rather than products and needs a lead-gen structure — use `on-page-seo`.

## Instructions

1. Design the category taxonomy around demand, not the warehouse. Category URLs should match how shoppers search ("running shoes"), not internal SKU logic ("footwear/A100/run"). One category page per distinct head term; subcategories only where a distinct query exists.
2. Control the parameter explosion by class. Sort, filters, price range, brand, availability and pagination: `noindex` + out-of-sitemap for filters; `disallow` only for infinite-space search; self-canonical + in-sitemap for genuine pagination. Never let a filter create an indexable duplicate of a category.
3. Decide whether subcategory combinations are indexable. `/shoes/running/` may be indexable; `/shoes/running/womens/` only with a distinct query and ≥20 products; three-deep combinations default to `noindex` until proven. Enforce in the routing layer, not per page.
4. Make product pages complete and indexable: unique title (brand + product + key spec), full description above the fold, price, availability, `Product`/`Offer` schema, high-resolution images, clear add-to-cart. A product page with no price cannot rank for commercial terms.
5. Handle out-of-stock and discontinued products deliberately. Out-of-stock: keep indexed, show the state, mark schema `OutOfStock`, offer restock or alternatives — the URL still has value. Permanently discontinued: 301 to the closest successor or the category, never to the homepage.
6. Consolidate variants. Color and size variants of one product are one canonical URL with variants as `noindex` parameters or 301s; never index each variant as a separate product. Use `ProductGroup` for family/parent-child SKU structures.
7. Ensure product image URLs are crawlable, sized well, present in the sitemap via `image:image`, and used as `og:image`. Image search and Merchant Center need the raw file URL, not a CDN transform that 403s bots.
8. Align structured data with the visible page and the Merchant Center feed. `price`, `availability`, `priceCurrency` and `condition` must match the rendered page exactly, or the item is disapproved and rich results drop.
9. Fix category pagination and internal linking: category links to subcategories and top products, product links back to its exact category via breadcrumb, and sibling categories cross-link. Do not rely on the sitemap for product discovery.
10. Monitor per template: indexed product count vs. catalog size, crawl allocation to product vs. category, and Merchant Center disapproval reasons. Expand the indexable set only as discovery keeps up.

## Patterns

Category tree as data, with the URL policy attached:

```json
{ "path": ["catalog", "widgets", "widget-pro"],
  "url": "/catalog/widgets/widget-pro/", "breadcrumb_name": "Pro Widget",
  "canonical_host": "https://example.com", "indexable": true,
  "filters": ["voltage", "mounting", "colour"], "sort_options": ["relevance", "price_asc", "price_desc"],
  "min_products_to_index": 24, "max_combinations": 120 }
```

Faceted navigation rules — index thin combinations, block the explosion:

```python
def facet_decision(state):
    if state.products < 24 or state.combinations > 120: return "noindex,follow"
    if state.sort in ("price_asc", "price_desc") or state.filter_depth > 2: return "noindex,follow"
    return "index,follow,max-image-preview:large"
# Canonicalise pure sorts to the base category; never canonicalise a filter
# combination to the base category, or the filtered demand signal is lost.
```

Product schema with shipping and return policy:

```html
<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "Product",
  "name": "Pro Widget 3000", "sku": "PW-3000", "gtin13": "4006381333931",
  "image": ["https://example.com/img/pw3000-1200.jpg"], "brand": { "@type": "Brand", "name": "Acme" },
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.6",
                       "reviewCount": "184", "bestRating": "5" },
  "offers": { "@type": "Offer", "url": "https://example.com/p/widget-pro/",
    "price": "249.00", "priceCurrency": "GBP", "priceValidUntil": "2026-12-31",
    "availability": "https://schema.org/InStock", "itemCondition": "https://schema.org/NewCondition",
    "shippingDetails": { "@type": "OfferShippingDetails",
      "shippingRate": { "@type": "MonetaryAmount", "value": "4.95", "currency": "GBP" },
      "shippingDestination": { "@type": "DefinedRegion", "addressCountry": "GB" },
      "deliveryTime": { "@type": "ShippingDeliveryTime",
        "handlingTime": { "@type": "QuantitativeValue", "minValue": 0, "maxValue": 1, "unitCode": "DAY" },
        "transitTime": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 3, "unitCode": "DAY" } } },
    "hasMerchantReturnPolicy": { "@type": "MerchantReturnPolicy",
      "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
      "merchantReturnDays": 30 } } }
</script>
```

Product listing that does not ship 6 images and 300 reviews per page:

```html
<link rel="canonical" href="https://example.com/catalog/widgets/">
<meta name="robots" content="index,follow,max-image-preview:standard">
<div class="grid" itemscope itemtype="https://schema.org/ItemList">
  <article itemscope itemtype="https://schema.org/Product">
    <a href="/p/widget-pro/" itemprop="url">
      <img src="/img/pw3000-400.jpg" width="400" height="400" loading="lazy" alt="Pro Widget 3000, front view"
           srcset="/img/pw3000-400.jpg 400w, /img/pw3000-800.jpg 800w" sizes="(min-width: 48rem) 25vw, 50vw">
    </a>
    <h2 itemprop="name"><a href="/p/widget-pro/">Pro Widget 3000</a></h2>
    <p itemprop="offers" itemscope itemtype="https://schema.org/Offer"><span itemprop="priceCurrency" content="GBP">GBP</span>
      <span itemprop="price" content="249.00">249.00</span><link itemprop="availability" href="https://schema.org/InStock"></p>
    <p><span itemprop="aggregateRating" itemscope itemtype="https://schema.org/AggregateRating">Rated
      <span itemprop="ratingValue" content="4.6">4.6</span> from <span itemprop="reviewCount" content="184">184</span> reviews</span></p>
  </article>
</div>
```

Out-of-stock handling that keeps rankings instead of returning 404:

```python
def product_response(product):
    if product.discontinued_at and not product.has_ever_been_purchased:
        return HttpResponse(status=410)          # genuinely gone
    if product.stock_level == 0:
        # still indexable: demand persists, and a 404 would lose the ranking
        product.schema_offers = {**product.offers, "availability": "https://schema.org/OutOfStock",
            "priceValidUntil": (product.discontinued_at or date.today() + timedelta(days=7)).isoformat()}
        product.cta = "Notify me when available"  # capture demand, do not fake stock
    return render(request, "product.html", {"product": product})
```

## Checklist

- [ ] Category URLs match shopper demand terms; one page per distinct head query.
- [ ] Sort/filter/price/brand params `noindex` + out-of-sitemap; genuine pagination self-canonical + in-sitemap.
- [ ] Subcategory depth rule enforced in routing; deeper combinations default to `noindex`.
- [ ] Every product page has price, availability, above-the-fold description and Product/Offer schema.
- [ ] Out-of-stock kept indexed with `OutOfStock` schema and alternatives; discontinued 301 to a successor or category.
- [ ] Color/size variants consolidated to one canonical URL; variant params `noindex` or 301'd back.
- [ ] Product image URLs crawlable by bots, used in sitemap `image:image` and `og:image`.
- [ ] Schema `price`/`availability`/`condition` match the rendered page and Merchant Center feed exactly.

## Anti-patterns

- **Indexing every filter combination** — `?color=red&size=9&sort=low` per product creates tens of thousands of thin duplicates that dilute the category and waste crawl budget. Only search-term-driven subcategories earn indexable URLs.
- **Deleting discontinued product URLs** — 410 returns forfeits accumulated signal with no destination. 301 to the closest successor or the exact category instead.
- **Auto-generating `aggregateRating` from order data** — schema ratings must reflect reviews visible on the page and authored by real reviewers; internal order counts are a manual-action trigger.
- **Leaving unbounded internal search crawlable** — `/search?q=` is an unindexable crawl trap. `noindex` plus disallow, and provide real category pages for the demand.
- **Nesting categories to mirror the catalog structure** — `/mens/shoes/running/trail/waterproof/gtx/` is seven clicks deep with near-zero demand at the bottom. Keep the indexable tree three levels and use filters for the rest.

## References

- Google Merchant Center product data specifications require `price`, `availability` and `condition` to match the landing page; rich-result eligibility depends on the same consistency.
- Google's faceted navigation guidance classifies navigations as navigable, crawlable-but-not-indexed, or blocked.