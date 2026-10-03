---
name: service-worker-pwa
description: Ships an installable, offline-capable PWA with a Workbox service worker — precaching, per-route caching strategies, update prompts, and background sync. Use when adding offline support, an install prompt, push notifications, or when a service worker is serving stale content.
---

# Service Worker PWA

**Use when:** adding offline support, an install prompt, push notifications, or background sync, or when a deployed service worker is serving stale assets or breaking navigation.
**Do not use when:** the site needs only HTTP caching — configure headers and CDN caching first; for client-side persistence of data see `browser-storage-apis`.

## Instructions

1. Scope the service worker deliberately at `/` and name precache entries by revision hash so a new build produces new cache keys. Stale assets are almost always a missing revision.
2. Use Workbox rather than hand-rolled fetch handlers: `precacheAndRoute(self.__WB_MANIFEST)` handles revisioning, cleanup, and install atomicity.
3. Choose a strategy per route type: `CacheFirst` for immutable hashed assets, `StaleWhileRevalidate` for static pages, `NetworkFirst` with a timeout for authenticated data, and `NetworkOnly` for mutations.
4. Always provide an offline fallback for navigations (`createHandlerBoundToURL` plus a cached offline page) — a navigation request that fails shows the browser's dinosaur.
5. Gate `skipWaiting()` behind user intent. Calling it automatically swaps the worker mid-session and can break in-flight state; instead prompt "A new version is available" and call `skipWaiting` on click.
6. Delete old caches on activate with `cleanupOutdatedCaches()` and a manual sweep of your own versioned cache names.
7. Write the manifest with real icons (192, 512, maskable 512), `display: "standalone"`, `start_url`, `scope`, and `id`. A manifest without maskable icons gets a letterboxed icon on Android.
8. Require HTTPS (or `localhost`) and set `Service-Worker-Allowed` when the scope is broader than the script path.
9. Use Background Sync (`SyncManager`) for retryable offline writes, and guard for support since Safari lacks it.
10. Test the real lifecycle: install a fresh worker, then an update, then a full offline navigation, plus a hard reload during activation. Automated tests alone miss the update path.

## Patterns

Workbox service worker with per-route strategies:
```ts
// src/sw.ts
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute, setCacheHandlerDetails, setDefaultHandler } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { BackgroundSyncPlugin } from "workbox-background-sync";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST); // revisioned by build
cleanupOutdatedCaches();
setDefaultHandler(new StaleWhileRevalidate({ cacheName: "assets-v1" }));

// Immutable hashed assets: never revalidate
registerRoute(
  ({ url }) => url.pathname.startsWith("/assets/"),
  new CacheFirst({ cacheName: "assets-v1", plugins: [new ExpirationPlugin({ maxEntries: 80 })] }),
);

// Navigations: serve the app shell, fall back to the offline page
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/checkout/],
  }),
);

registerRoute(
  ({ url, request }) => url.pathname.startsWith("/api/") && request.method === "GET",
  new NetworkFirst({
    cacheName: "api-v1",
    networkTimeoutSeconds: 4,
    plugins: [
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 }),
      // Retry failed writes when connectivity returns
      new BackgroundSyncPlugin("outbox", { maxRetentionTime: 24 * 60 }),
    ],
  }),
);

// Mutating requests must never be served from cache
registerRoute(({ request }) => request.method !== "GET", new NetworkOnly());

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
```

User-gated update prompt and manifest:
```ts
// src/register-sw.ts — swap only on explicit user intent
navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
  const installing = registration.installing;
  installing?.addEventListener("statechange", () => {
    if (installing.state !== "installed" || !navigator.serviceWorker.controller) return;
    showToast("A new version is available", {
      action: "Reload",
      onAction: () => {
        installing.postMessage({ type: "SKIP_WAITING" });
        navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
      },
    });
  });
});
```
```json
{
  "name": "Acme Field",
  "short_name": "Acme",
  "id": "/?source=pwa",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#111827",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## Checklist

- [ ] Precache manifest is revisioned; a new build changes the cache keys.
- [ ] Cache strategy chosen per route type; non-GET requests are never served from cache.
- [ ] Navigations have a cached shell and an offline fallback page.
- [ ] `skipWaiting()` only fires from an explicit user action on the update prompt.
- [ ] `cleanupOutdatedCaches()` plus a sweep of custom versioned cache names on activate.
- [ ] Manifest declares `id`, `start_url`, `scope`, theme colours, and a maskable 512 icon.
- [ ] HTTPS enforced and `Service-Worker-Allowed` set if the scope exceeds the script path.
- [ ] Update path and offline navigation tested manually, not only in automated tests.

## Anti-patterns

**Auto-calling `skipWaiting()` on install.** The new worker activates while the old page is mid-session, in-flight requests fail, and local state can be lost with no explanation. Fix: prompt the user, then `skipWaiting` on confirmation and reload on `controllerchange`.

**Caching everything with a single strategy.** Precaching authenticated API responses serves one user's data to another on a shared device, and `CacheFirst` on HTML means users never receive updates. Fix: `NetworkOnly` for mutations, `NetworkFirst` for user data, `CacheFirst` only for immutable hashed assets.

**No offline fallback for navigations.** Offline navigation hits no cache entry and the user gets a browser error page rather than your app. Fix: `createHandlerBoundToURL("/index.html")` plus a cached offline route.