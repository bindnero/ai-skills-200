---
name: svelte-kit-patterns
description: Applies SvelteKit 2 and Svelte 5 conventions — universal versus server `load` functions, streamed promises, form actions with `use:enhance`, `hooks.server.ts`, and runes. Use when building SvelteKit routes, mutating data from the client, or fixing double-fetching and layout data loss between navigations.
---

# SvelteKit Patterns

**Use when:** building SvelteKit routes and layouts, choosing between `+page.ts` and `+page.server.ts`, wiring form actions with progressive enhancement, or debugging double fetches and lost layout state.
**Do not use when:** the project is plain Svelte SPA without SvelteKit routing — use `vue-patterns`-style component guidance only for component concerns; for PWA and offline work use `service-worker-pwa`.

## Instructions

1. Decide the load scope first: `+page.server.ts` runs only on the server (secrets, databases, `cookies()`), `+page.ts` runs on both (reusing client-cached data), `+layout.server.ts` for data every nested route needs.
2. Read navigation data with `$app/state` in SvelteKit 2.12+ (`page`, `navigating`, `updated`); `$app/stores` is the legacy equivalent and only needed for older versions.
3. Read request-scoped data (`cookies`, `headers`, `locals`) only in server load or server hooks — they throw when accessed from a universal load.
4. Return promises from `load` instead of awaiting them, and render them with `{#await}`; the shell streams first and TTFB drops.
5. Call dependent queries in parallel. Only await when a later query genuinely needs an earlier result.
6. Mutate data through form actions in `+page.server.ts`, never with ad-hoc `fetch` from the component — actions keep CSRF handling, progressive enhancement, and revalidation in one place.
7. Return `fail(400, { errors })` for validation problems and `error(404)` for missing resources; never redirect with a status that loses the reason.
8. Access request state with `event` parameters (`load({ params, url, fetch, parent })`, `redirect(303, url)`), never through module-level variables — the server handles concurrent requests in one process.
9. Keep secrets and API keys in `$env/static/private` and expose only public values to the client; guard hooks with `locals`.
10. Handle errors at three levels: `+error.svelte` for the page, `handleError` in `hooks.server.ts` for server logs, and `handle` for responses/headers.

## Patterns

Universal load that streams independent queries in parallel:
```ts
// src/routes/products/+page.ts
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url, fetch, depends }) => {
  depends("app:products");
  const page = Number(url.searchParams.get("page") ?? 1);
  // Started together: neither await blocks the other, so the shell flushes first
  const products = fetch(`/api/products?page=${page}`).then((r) => r.json());
  const facets = fetch("/api/facets").then((r) => r.json());
  return { page, products, facets }; // promises, not values
};
```

Form action with validation, consumed with progressive enhancement:
```ts
// src/routes/products/[id]/+page.server.ts
import { fail } from "@sveltejs/kit";
import type { Actions } from "./$types";

export const actions: Actions = {
  update: async ({ request, params }) => {
    const form = await request.formData();
    const priceCents = Number(form.get("priceCents"));
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      return fail(400, { priceCents, message: "Enter a price in whole cents" });
    }
    await db.products.update(params.id, { priceCents });
    return { success: true }; // invalidates every load() that called depends("app:products")
  },
};
```

The matching page component:
```svelte
<!-- +page.svelte — works with and without JavaScript -->
<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";
  const { products, facets } = $props(); // Svelte 5 runes
</script>

<form method="POST" action="?/update" use:enhance>
  <label for="price">Price (cents)</label>
  <input id="price" name="priceCents" type="number" min="0" step="1" value={page.data.priceCents} />
  {#if page.form?.message}<p role="alert">{page.form.message}</p>{/if}
  <button type="submit">Save</button>
</form>

{#await products}
  <p>Loading products…</p>
{:then list}
  <ul>{list.items.map((p) => <li>{p.name}</li>)}</ul>
  <p>Filters: {facets.count}</p>
{:catch error}
  <p role="alert">Could not load products: {error.message}</p>
{/await}
```

Server hooks: sequence, locals, and structured error logging:
```ts
// src/hooks.server.ts
import { sequence } from "@sveltejs/kit/hooks";
import type { Handle } from "@sveltejs/kit";

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return response;
};

export const handle = sequence(securityHeaders, async ({ event, resolve }) => {
  event.locals.user = await getUserFromCookie(event.cookies.get("session"));
  event.locals.requestId = crypto.randomUUID();
  try {
    // Only forward the headers the client actually needs
    return await resolve(event, { filterSerializedResponseHeaders: (n) => n === "x-total-count" });
  } catch (error) {
    // Log with the requestId; rethrow so +error.svelte renders
    console.error(JSON.stringify({ level: "error", requestId: event.locals.requestId, cause: String(error) }));
    throw error;
  }
});
```

## Checklist

- [ ] Secrets and DB access live in `+page.server.ts` or server hooks, never universal `load`.
- [ ] `$app/state` is used instead of `$app/stores` on SvelteKit 2.12+.
- [ ] Independent queries are started in parallel and returned as promises for streaming.
- [ ] All mutations go through form actions with `fail()` for validation errors.
- [ ] Every form has `method="POST" action="?/name"` and `use:enhance`, so it works without JS.
- [ ] No module-level request state; everything flows through `event` parameters.
- [ ] `depends()` is called for anything a mutation must invalidate.
- [ ] `+error.svelte`, `handleError`, and `handle` each cover their own layer.

## Anti-patterns

**Fetching in an `onMount` inside a page component.** The request runs after hydration, doubles up with `load`, and the result flashes empty on every navigation. Fix: fetch in `load` and stream the promise into `{#await}`.

**Mutating with `fetch` from the component.** Bypasses action CSRF protection, skips automatic invalidation, and leaves the UI out of sync after a refresh. Fix: a form action that mutates and returns; read the result from `page.form`.

**Reading `cookies()` or `headers()` in `+page.ts`.** These throw in a universal load, so the route breaks as soon as it is prerendered. Fix: read them in `+page.server.ts` and pass plain values down through the returned data.