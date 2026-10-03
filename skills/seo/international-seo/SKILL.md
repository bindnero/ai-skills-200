---
name: international-seo
description: Sets up and audits multilingual and multiregional SEO with hreflang, locale subfolders or subdomains, per-market canonical strategy, translation quality and local keyword mapping. Use when launching or restructuring an international site, when Google serves the wrong locale, or when hreflang errors appear.
---

# International SEO

**Use when:** Launching or restructuring a multilingual site, Google serves the wrong country/language version, hreflang or canonical errors appear, or translating existing content for new markets.
**Do not use when:** the site is single-language but geolocates by IP — a different mechanism; use `indexation-control` for geolocation gating.

## Instructions

1. Choose the URL structure deliberately: country subfolder (`/de-de/`), subdomain (`de.example.com`) or ccTLD (`example.de`). Subfolders consolidate authority and cost least; ccTLDs give the strongest geo signal but require external trust. Never mix structures for the same content across locales.
2. Set locale targeting per market. Serve each locale on its own subfolder with a correct hreflang set and `og:locale`; for ccTLDs, server-render the right content for the host. Never IP-redirect to a language folder — it blocks users unpredictably and Google largely ignores geo-IP redirects for language pages.
3. Implement a complete, reciprocal hreflang set on every locale version. Each version lists all versions including itself, every annotation is mirrored on every version, and an `x-default` entry points to a global or language-selector page.
4. Pair hreflang with correct canonicals: each locale URL self-referencing-canonical (unless it is a genuine duplicate) and the canonical aligned with the hreflang cluster. Cross-canonical within a cluster collapses it.
5. Define the fallback for untranslated pages explicitly: either serve the translated-or-English URL with correct hreflang, or redirect to the source-locale version whose hreflang points back. Never serve a translated page whose hreflang declares it another language.
6. Get the return-tag encoding right: language lowercase, region uppercase, hyphen-separated (`pt-BR`, not `pt-br` or `pt_BR`). Use BCP 47 and set a matching `<html lang>`.
7. Map keywords per locale instead of translating them. Run local keyword research per market — a literal translation of "best running shoes" can have near-zero volume while the colloquial term is large. Track each locale as a separate ranking set.
8. Localize the surrounding experience: nav, footer, currency, legal copy and the language switcher's own labels, so users can find their language. Machine translation with wrong terminology produces low-quality signals and high bounce.
9. Keep translation completeness high. One thin locale alongside nine rich locales drags perceived quality; ship fewer complete, quality locales over many partial ones.
10. Monitor the Search Console International Targeting report per locale pair and hreflang errors after every content migration or head/template change.

## Patterns

Hreflang cluster, self-reference plus `x-default` required:

```html
<link rel="alternate" hreflang="en-us" href="https://example.com/en-us/products/widget/">
<link rel="alternate" hreflang="en-gb" href="https://example.co.uk/en-gb/products/widget/">
<link rel="alternate" hreflang="de-de" href="https://example.de/de-de/produkte/widget/">
<link rel="alternate" hreflang="x-default" href="https://example.com/en-us/products/widget/">
<link rel="canonical" href="https://example.com/en-us/products/widget/">
```

Correct configuration for subfolders, subdomains and ccTLDs:

| Setup | URL | Hosting | Notes |
| --- | --- | --- | --- |
| ccTLD | `example.de/de/produkte/widget/` | any | strongest signal, highest cost |
| Subdomain | `de.example.com/produkte/widget/` | any | one certificate wildcard, cheap |
| Subfolder | `example.com/de/produkte/widget/` | any | single codebase, slowest signal |

```nginx
# subfolder routing: strip the locale prefix, 301 the bare path to x-default
map $uri $locale_prefix {
    ~^/en-us/(?<rest>.*)$   "/en-us/$rest";
    ~^/de-de/(?<rest>.*)$   "/de-de/$rest";
    ~^/(?<rest>.*)$          "/en-us/$rest";
}
location ~ ^/(en-us|de-de)/ {
  rewrite ^/(en-us|de-de)/(.*)$ /$2 last;      # app sees one unprefixed path
}
```

Translation-management workflow with per-locale acceptance:

```json
{ "key": "checkout.shipping_delay",
  "source_locale": "en-us",
  "variants": { "de-de": { "value": "Versand dauert 3-5 Werktage", "state": "translated" },
                "en-gb": { "value": "Delivery takes 3-5 working days", "state": "approved" },
                "fr-fr": { "value": "", "state": "source" } },
  "seo": { "title": { "de-de": { "value": "Versand & Lieferzeiten", "chars": 27, "state": "translated" },
                     "fr-fr": { "value": "", "chars": 0, "state": "source" },
                     "meta_description": { "de-de": { "chars": 148, "state": "approved" } } } }
```

```python
def hreflang_graph(urls_by_locale):
    """Every cluster member must list all others, including itself, or all are ignored."""
    cluster = sorted(urls_by_locale.values())
    missing = {loc: set(cluster) - {u, urls_by_locale.get("x-default")}
               for loc, u in urls_by_locale.items()}
    broken = {loc: sorted(m) for loc, m in missing.items() if m}
    assert not broken, f"incomplete hreflang clusters: {broken}"
    return [f'<link rel="alternate" hreflang="{loc}" href="{u}">' for loc, u in urls_by_locale.items()]
```

Failure modes to test for on every release:

```text
hreflang in <body> or injected by JS        -> ignored; must be in <head> at 200
200 with soft-404 body                      -> cluster dropped
canonical on every locale to one language   -> only one language indexed
no self-referencing hreflang                -> annotation discarded
x-default missing                           -> no fallback for unmatched users
mixed case en-US vs en-us                   -> treated as different locales
auto-translated pages with no hreflang      -> near-duplicate content across locales
```

## Checklist

- [ ] One URL structure chosen (subfolder/subdomain/ccTLD) and applied consistently across locales.
- [ ] No IP-based redirect for language selection; cookie/Accept-Language handling used instead.
- [ ] Every locale page carries a complete reciprocal hreflang set including itself and `x-default`.
- [ ] Each locale URL self-referencing-canonical; no cross-canonical within a cluster.
- [ ] `hreflang` and `<html lang>` use BCP 47 with correct case (`pt-BR`, not `pt-br`).
- [ ] Untranslated-page fallback defined (translated URL with correct hreflang, or redirect with correct cluster).
- [ ] Sitemap `xhtml:link` alternates byte-identical to in-page hreflang.
- [ ] Keyword research run per locale; each locale tracked as a separate ranking set.

## Anti-patterns

- **Using hreflang without canonical (or vice versa)** — Google needs both: hreflang to cluster locales, canonical to consolidate duplicates. hreflang alone across non-self-canonical variants leaves duplicates competing.
- **Geo-IP redirecting `/` to `/de-de/`** — Googlebot and users get inconsistent versions, returning users cannot reach the homepage, and it is a documented anti-pattern. Use `x-default` plus a visible language switcher.
- **Machine-translating without review** — untranslated or badly translated pages index as thin in that locale and can be served to the wrong region, hurting both engagement and targeting.
- **Non-reciprocal hreflang** — if `/de-de/` lists `/en-US/` but `/en-US/` omits `/de-de/`, Google discards the entire cluster. Every annotation must be mirrored everywhere.
- **Mixing `hreflang="en-us"` and `"en-US"`** — Google treats these as different locales, splitting the cluster and often ignoring the tags. Normalize to lowercase language plus uppercase region.

## References

- Google's internationalization documentation requires bidirectional (reciprocal) hreflang annotations and treats `x-default` as the fallback for unmatched users.
- hreflang is a regional-language hint; the result actually served also depends on IP, search history and language settings — hreflang does not force a result.