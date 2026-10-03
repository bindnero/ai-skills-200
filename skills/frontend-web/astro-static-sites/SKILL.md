---
name: astro-static-sites
description: Builds content-driven sites with Astro using islands with the right client directive, typed content collections, `getStaticPaths`, prerendering, and `astro:assets`. Use when marketing sites, docs, or blogs feel slow, when shipping too much JS, or when adding Markdown/MDX content with schemas.
---

# Astro Static Sites

**Use when:** building a marketing site, documentation, or blog where most pages need no client JavaScript, when bundle size must stay tiny, or when adding Markdown/MDX content with validated frontmatter.
**Do not use when:** the site is a fully interactive application — use the framework skill for that; for image pipeline specifics in a React app use `image-optimization`.

## Instructions

1. Pick the client directive per island deliberately: `client:load` for above-the-fold interactive widgets, `client:idle` for secondary UI, `client:visible` for below-the-fold content, `client:media` for width-conditional UI, and nothing (a plain `.astro` component) for static content.
2. Default to no directive. A component with no `client:*` directive renders static HTML and ships zero JavaScript — this is the default you should reach for.
3. Pass serialisable props to islands. Rich objects become props only if they serialise; otherwise fetch inside the island.
4. Define content collections in `src/content.config.ts` with the `glob()` loader and a Zod schema so frontmatter is validated at build time and types are generated.
5. Generate dynamic routes with `getStaticPaths` and keep the return type narrow (`{ params: { slug: string }, props: Post }`) so page data is typed.
6. Choose the output mode deliberately: `static` by default, `server` only for routes needing request-time data, and `export const prerender = false` per route to opt out of static generation.
7. Use `astro:assets` (`<Image>`, `<Picture>`, `getImage`) instead of raw `<img>` so Astro generates responsive `srcset`, modern formats, and hashed filenames.
8. Keep third-party scripts inside an `.astro` island with a directive rather than in `<script>` in the layout, so they only load where used.
9. Add RSS, sitemap, and canonical URLs: `@astrojs/rss`, `@astrojs/sitemap`, plus a per-page `<link rel="canonical">` generated from `Astro.url`.
10. Set explicit `width` and `height` (or let `astro:assets` infer them) on every image and embed, and validate a production build's JS budget in CI.

## Patterns

Content collection with a validated schema:
```ts
// src/content.config.ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ base: "./src/content/posts", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string().max(70),
    description: z.string().max(160),
    publishedAt: z.coerce.date(),
    hero: z.string().optional(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { posts };
```

Dynamic route with typed props and no client JavaScript:
```astro
---
// src/pages/blog/[...slug].astro
import { getCollection, render } from "astro:content";
import type { GetStaticPaths } from "astro";

export const getStaticPaths = (async () => {
  const posts = await getCollection("posts", ({ data }) => !data.draft);
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}) satisfies GetStaticPaths;

const { post } = Astro.props;
const { Content } = await render(post);
---

<article>
  <h1>{post.data.title}</h1>
  <time datetime={post.data.publishedAt.toISOString()}>
    {post.data.publishedAt.toLocaleDateString("en-GB", { dateStyle: "long" })}
  </time>
  <Content />
  <a href={`/rss.xml`}>Subscribe</a>
</article>
```

Island with the cheapest viable directive, plus an optimized image:
```astro
---
// src/components/PriceCalculator.astro
import { Image } from "astro:assets";
import chart from "../assets/pricing-chart.png";
import Calculator from "./Calculator.tsx"; // React island
---

<Image
  src={chart}
  alt="Typical monthly cost by team size"
  widths={[480, 960]}
  sizes="(min-width: 1024px) 640px, 100vw"
  format="avif"
  loading="lazy"
/>

<!-- Fetches data on mount, so client:idle keeps it off the critical path -->
<Calculator client:idle plan="pro" />

<!-- Below-the-fold, so hydrate only when scrolled into view -->
<RelatedPosts client:visible posts={related} />

<!-- config: output "static", integrations: [react(), sitemap()] -->
```

## Checklist

- [ ] Every interactive island has a justified `client:*` directive; static components have none.
- [ ] No island is `client:load` unless it is above the fold and immediately interactive.
- [ ] Collection schemas validate frontmatter and generate types; drafts are filtered at build time.
- [ ] `getStaticPaths` is typed with `satisfies GetStaticPaths` and minimal `props`.
- [ ] Output mode is `static` unless a route genuinely needs request-time data.
- [ ] Images go through `astro:assets` with explicit `widths` and `sizes`.
- [ ] Third-party scripts live inside islands, not in the layout.
- [ ] A JS-size budget check runs in CI against the production build.

## Anti-patterns

**`client:load` on every component.** The entire page hydrates on load, defeating the reason to use Astro; a marketing page ships 300KB of JS for a tab switch. Fix: no directive for static content, `client:visible` for below-the-fold, `client:idle` for secondary.

**Raw `<img src="/hero.png">` with no dimensions.** The browser cannot reserve space, so LCP suffers and the page jumps as images arrive. Fix: `<Image>` from `astro:assets`, which infers dimensions and emits `srcset`.

**Validating content in the page instead of the schema.** A missing `publishedAt` or a malformed date only fails at that one route, and often silently. Fix: a Zod schema in the collection, so the build fails with the file name and field path.