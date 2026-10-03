---
name: bundle-size-triage
description: Finds and removes JavaScript weight by analysing production build stats, tracing duplicated dependencies, and eliminating barrel-file imports. Use when the bundle grows unexpectedly, when CI fails a size budget, or when a dependency upgrade adds hundreds of kilobytes.
---

# Bundle Size Triage

**Use when:** the JavaScript bundle grows unexpectedly, CI fails a size budget, a dependency upgrade adds a large amount of code, or you need to attribute bytes to specific modules.
**Do not use when:** the weight is images or fonts — use `image-optimization` and `font-loading`; for deferring code that legitimately must ship see `lazy-loading-strategies`.

## Instructions

1. Measure the production build, never the dev server. Run `vite build` / `next build` with minification and source maps, and record gzip and brotli sizes per chunk.
2. Generate a treemap or sunburst (`rollup-plugin-visualizer`, `webpack-bundle-analyzer`, `source-map-explorer`) so bytes are attributable to modules rather than guesses.
3. Classify every large chunk as vendor, framework, app, or asset. Most regressions are one vendor dependency, not application code.
4. Hunt duplicated dependencies: the same package present at two versions means both copies ship. Deduplicate with `resolutions`/`overrides` in the lockfile.
5. Replace barrel imports. `import { debounce } from "lodash-es"` can pull in the whole library because the barrel re-exports everything and side effects survive tree shaking. Import from the specific path.
6. Audit what actually gets used: many wrappers ship more than you call. Compare your usage against the package's exports and drop the dependency if the surface is thin.
7. Fix tree-shaking blockers rather than disabling it: `sideEffects: false` in the package's `package.json` (your own packages included), and avoid top-level side effects in modules.
8. Keep dev-only dependencies out of the graph. A `debug` or `logger` import in production code survives minification if it is referenced; wrap with `import.meta.env.DEV` plus a dynamic import.
9. Enforce a budget in CI per route and per entry chunk, failing the build on regression rather than noticing next quarter.
10. Record the analysis in the PR: what grew, why, and the gzipped delta. Bundle regressions are invisible in review without numbers.

## Patterns

Bundle analyser plus source-map attribution:
```ts
// vite.config.ts
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    visualizer({ filename: "dist/stats.html", gzipSize: true, brotliSize: true, template: "treemap" }),
  ],
  build: {
    sourcemap: true, // required for source-map-explorer
    rollupOptions: {
      output: {
        // Keep the framework in its own long-lived chunk
        manualChunks: (id) =>
          id.includes("node_modules/react") || id.includes("node_modules/scheduler") ? "react" : undefined,
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
```

```bash
# Which modules dominate a chunk, in real transferred bytes
npx source-map-explorer 'dist/assets/index-*.js' --only-mapped
npx vite-bundle-visualizer dist/stats.html

# Compare two builds before touching the code
git stash && npm run build && cp -r dist ../dist-base && git stash pop && npm run build
npx vite-bundle-visualizer dist/stats.html --json > dist/after.json
```

Deduplicate and import specific paths:
```json
{
  "resolutions": { "lodash": "4.17.21", "semver": "7.6.3" },
  "overrides": { "date-fns": "^4.1.0" }
}
```
```ts
// Barrel import: the whole package can end up in the chunk
import { debounce, throttle } from "lodash-es";

// Specific paths: tree shaking can actually drop the rest
import debounce from "lodash-es/debounce.js";
import { DatePicker } from "react-day-picker";
import debounceFn from "debounce";

export const onSearch = debounce((q: string) => void fetchResults(q), 200);
```

Strip dev-only code from the graph and enforce a budget:
```ts
// A static import survives minification even behind a false condition
import { debug } from "debug";
export const log = debug("app");

// Dynamic import inside the guard keeps it out of the production graph
export async function debugDump(state: unknown) {
  if (!import.meta.env.DEV) return;
  const { debug } = await import("debug");
  debug("app")(state);
}
```
```json
{
  "scripts": { "size": "vite build && size-limit" },
  "size-limit": [
    { "path": "dist/assets/index-*.js", "limit": "120 kB", "brotli": true },
    { "path": "dist/assets/react-*.js", "limit": "45 kB", "brotli": true }
  ]
}
```

## Checklist

- [ ] Sizes measured from a production build with gzip and brotli numbers recorded.
- [ ] Treemap or source-map attribution generated before any code changes.
- [ ] Every large chunk classified as vendor, framework, app, or asset.
- [ ] Duplicate dependency versions resolved via lockfile overrides.
- [ ] Barrel imports replaced with specific-path imports for large packages.
- [ ] No static imports of debug/logging libraries in production paths.
- [ ] Per-route size budget enforced in CI and failing on regression.
- [ ] PR descriptions quote the gzipped delta and the reason for each change.

## Anti-patterns

**Analysing the dev server bundle.** Dev builds are unminified, unchunked, and include source maps and dev-only modules, so the numbers bear no relation to production. Fix: analyse `dist/` output only, and turn on source maps for the analysis build.

**Shrinking by minifying harder.** Switching to a better minifier typically saves a few kilobytes while an unnoticed duplicate dependency ships 80KB. Fix: attribute bytes per module first, then optimise the actual offenders.

**Disabling tree shaking to "fix" a build error.** Turning off `treeshake` to stop a package from breaking increases the shipped bundle rather than fixing the cause. Fix: mark side-effect-free packages correctly and remove top-level side effects from your own modules.