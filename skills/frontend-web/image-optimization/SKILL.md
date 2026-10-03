---
name: image-optimization
description: Delivers correctly sized, correctly prioritised images using `srcset`/`sizes`, `<picture>` art direction, AVIF/WebP, explicit dimensions to prevent CLS, and LCP-aware `fetchpriority`. Use when images dominate page weight, LCP is an image, or layouts shift when pictures load.
---

# Image Optimization

**Use when:** images dominate page weight, the LCP element is an image, layouts shift when pictures load, or you need AVIF/WebP negotiation and responsive `srcset`.
**Do not use when:** the problem is the JavaScript bundle or font files — use `bundle-size-triage` and `font-loading`; for Astro's pipeline specifically see `astro-static-sites`.

## Instructions

1. Always declare `width` and `height` (or an `aspect-ratio`) so the browser reserves the box. Missing dimensions are the single largest cause of image-driven CLS.
2. Provide `srcset` with `w` descriptors plus a correct `sizes` attribute. Without `sizes`, browsers assume the viewport width and over-download on every device.
3. Use `<picture>` with `type` sources for format negotiation (AVIF, WebP, JPEG fallback). Set `src` last so old browsers get something.
4. Load the LCP image eagerly with `fetchpriority="high"` and `loading="eager"`; lazy-load everything else with `loading="lazy" decoding="async"`.
5. Do not lazy-load the hero. `loading="lazy"` on an above-the-fold image delays LCP and can produce a visible blank frame.
6. Use art direction (`<source media="...">`) when mobile needs a differently cropped image; `srcset` alone cannot change aspect ratio per breakpoint.
7. Prefer inline SVG for icons and logos below ~10KB, and an SVG sprite for repeated icons; a single multicolour hero illustration is often better as AVIF or WebP.
8. Add a low-quality image placeholder (dominant-colour background, `blurhash`, or a 20px-wide base64 preview) to avoid a flash of empty space.
9. Let the framework pipeline do the work where it exists: `next/image` for responsive sources and priority, `astro:assets` for hashed filenames and formats.
10. Audit with real numbers: Coverage tab for over-fetched bytes, `lighthouse` for LCP element size, and a `Content-Length` check per candidate in the Network panel.

## Patterns

Responsive sources, format negotiation, and correct priorities:
```html
<!-- Hero: the LCP element, so eager and high priority -->
<link rel="preconnect" href="https://cdn.example.com" crossorigin />
<picture>
  <source
    type="image/avif"
    srcset="/img/hero-640.avif 640w, /img/hero-960.avif 960w, /img/hero-1440.avif 1440w"
    sizes="(min-width: 1024px) 50vw, 100vw"
  />
  <source type="image/webp" srcset="/img/hero-640.webp 640w, /img/hero-960.webp 960w, /img/hero-1440.webp 1440w" sizes="(min-width: 1024px) 50vw, 100vw" />
  <img
    src="/img/hero-960.jpg"
    srcset="/img/hero-640.jpg 640w, /img/hero-960.jpg 960w, /img/hero-1440.jpg 1440w"
    sizes="(min-width: 1024px) 50vw, 100vw"
    width="1440"
    height="810"
    alt="Support engineer reviewing a dashboard"
    fetchpriority="high"
    loading="eager"
    decoding="async"
    style="background: #e5e7eb"
  />
</picture>
```

Art direction plus a below-the-fold gallery:
```html
<!-- Mobile gets a square crop, desktop a wide one: srcset cannot do this -->
<picture>
  <source media="(max-width: 640px)" srcset="/img/card-square.avif" width="640" height="640" />
  <img src="/img/card-wide.avif" width="1200" height="675" alt="Product photo" loading="lazy" decoding="async" />
</picture>

<img
  src="/img/thumb-320.webp"
  srcset="/img/thumb-320.webp 320w, /img/thumb-640.webp 640w"
  sizes="(min-width: 768px) 320px, 50vw"
  width="320"
  height="320"
  alt=""
  loading="lazy"
  decoding="async"
/>
```

Framework pipelines that automate the same rules:
```tsx
// next/image: responsive sources, AVIF/WebP negotiation, LCP prioritisation
import Image from "next/image";

export function Hero({ product }: { product: Product }) {
  return (
    <Image
      src={product.image}
      alt={product.title}
      width={1440}
      height={810}
      sizes="(min-width: 1024px) 50vw, 100vw"
      quality={70}
      priority // sets fetchpriority="high" and disables lazy loading
      placeholder="blur"
      blurDataURL={product.lqip}
    />
  );
}
```
```bash
# Sharp-based batch conversion, keeping explicit dimensions in the filename
npx @squoosh/cli --quantize=avif --resize width=1440 src/hero.png out/hero-1440.avif
npx sharp-cli -i src/card.jpg -o out/card.webp -f webp -q 72
```

Measuring the over-fetch problem in DevTools:
```js
// Compare the chosen candidate's bytes against the displayed size
const img = document.querySelector("img.hero");
const rect = img.getBoundingClientRect();
const bytes = Number(performance.getEntriesByType("resource").find((r) => r.name.includes(img.currentSrc))?.transferSize);
console.log({
  chosen: img.currentSrc.split("/").pop(),
  displayed: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
  kb: Math.round(bytes / 1024),
  densityFactor: +(img.naturalWidth / rect.width).toFixed(2),
});
```

## Checklist

- [ ] Every image has `width` and `height` or an `aspect-ratio`, so CLS is zero.
- [ ] `srcset` uses `w` descriptors and every entry set has an accurate `sizes`.
- [ ] AVIF and WebP `<source>` elements with a JPEG/PNG `src` fallback.
- [ ] The LCP image uses `fetchpriority="high"` and `loading="eager"`; all others use `lazy` + `async`.
- [ ] Art direction uses `<source media>` when the crop changes, not just `srcset`.
- [ ] Placeholders (dominant colour or LQIP) prevent a flash of empty space.
- [ ] Framework pipelines (`next/image`, `astro:assets`) are used instead of hand-rolled variants.
- [ ] Displayed size versus transferred size verified per image in the Network panel.

## Anti-patterns

**`loading="lazy"` on the hero image.** The browser defers the request until layout, which delays LCP and can leave a blank frame above the fold on slow connections. Fix: `fetchpriority="high"` plus `loading="eager"`, and preload it if the URL is known at build time.

**`srcset` without `sizes`.** The browser assumes the image fills the viewport, picks a 2x candidate for a 400px card, and downloads several times more than needed. Fix: always pair `srcset` with `sizes`.

**Omitting width and height because the image "looks fine".** The box has zero height until the bytes arrive, so content jumps and CLS scores tank. Fix: declare dimensions or set `aspect-ratio` in CSS.