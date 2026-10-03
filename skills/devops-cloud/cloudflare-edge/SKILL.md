---
name: cloudflare-edge
description: Configures Cloudflare Workers, KV, R2, D1 and Pages with wrangler.jsonc, Cache Rules and WAF rules tuned at the edge. Use when moving a service onto Cloudflare, adding edge compute or storage bindings, or fixing cache and WAF behaviour at the CDN layer.
---

# Cloudflare Edge

**Use when:** Moving a service onto Cloudflare, adding edge compute or storage bindings, or fixing cache and WAF behaviour at the CDN layer.
**Do not use when:** The workload is a long-running container or a stateful server you manage yourself; use `kubernetes-manifests` instead.

## Instructions

1. Decide what runs at the edge and what stays at the origin. Workers handle redirects, auth, A/B routing and light API shaping; anything stateful stays on your infrastructure.
2. Configure `wrangler.jsonc` as the single source of truth and commit it. Editing settings in the dashboard makes the next deploy silently revert them.
3. Bind storage explicitly. Use KV for read-heavy configuration and caches, R2 for objects and large payloads, D1 for relational data with SQLite semantics.
4. Set cache rules explicitly with a documented TTL per route. Relying on cache defaults leaves caching inconsistent and unmeasurable.
5. Respect `Cache-Control` from the origin. Where the edge must override, state the reason in the rule description so the next person understands it.
6. Version bindings with `preview_id` and `preview_url` so staging traffic never touches production data.
7. Write the Worker in TypeScript with strict mode, keep handlers small, and use `waitUntil` for non-blocking work such as logging or cache warming.
8. Bind secrets with `wrangler secret put`, never as plaintext in `wrangler.jsonc`, and reference them through the `env` object.
9. Add WAF and rate-limiting rules for abusive paths and credential endpoints, and watch false positives before tightening further.
10. Observe edge behaviour with `wrangler tail` and Workers Analytics, since a Worker that fails only in one colo will not appear in local testing.

## Patterns

A `wrangler.jsonc` with KV, R2, D1 and secrets all declared explicitly:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "acme-edge-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-03-01",
  "observability": { "enabled": true },
  "routes": [{ "pattern": "api.acme.com/*", "zone_name": "acme.com" }],
  "kv_namespaces": [{ "binding": "CONFIG", "id": "8f14e45fceea167a5a36dedd4bea2543" }],
  "r2_buckets": [{
    "binding": "UPLOADS",
    "bucket_name": "acme-uploads",
    "preview_bucket_name": "acme-uploads-preview",
    "preview_id": "1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f"
  }],
  "d1_databases": [{
    "binding": "DB",
    "database_name": "acme-edge",
    "database_id": "a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5a6b"
  }],
  "vars": { "LOG_LEVEL": "info", "ORIGIN_POOL": "https://origin.internal.acme.com" }
  // DATABASE_URL lives in `wrangler secret put`, never here.
}
```

A Worker that fails over cleanly and does not block the response:

```typescript
interface Env {
  CONFIG: KVNamespace;
  UPLOADS: R2Bucket;
  DB: D1Database;
  ORIGIN_POOL: string;
  LOG_LEVEL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", colo: request.cf?.colo });
    }

    // Serve from the edge when warm; otherwise fetch and populate asynchronously.
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    try {
      const upstream = await fetch(new URL(url.pathname + url.search, env.ORIGIN_POOL), {
        headers: { "x-forwarded-for": request.headers.get("cf-connecting-ip") ?? "" },
      });
      if (request.method === "GET" && upstream.ok) {
        const response = upstream.clone();
        ctx.waitUntil(cache.put(cacheKey, response));
      }
      return upstream;
    } catch (err) {
      // Never leak the internal origin hostname to the caller.
      ctx.waitUntil(console.error(JSON.stringify({ path: url.pathname, err: String(err) })));
      return Response.json({ error: "upstream_unavailable" }, { status: 503, headers: { "retry-after": "5" } });
    }
  },
} satisfies ExportedHandler<Env>;
```

Route-specific cache and WAF behaviour that matches the origin headers:

```text
# Cache rules (Cloudflare dashboard > Caching > Cache Rules)
1. Expression:  http.request.uri.path matches "^/static/.*"
   Action:       Eligible for cache, Edge TTL 30 days, Browser TTL 1 hour
2. Expression:  http.request.uri.path eq "/api/config" and http.host eq "api.acme.com"
   Action:       Eligible for cache, Edge TTL 60s, respect origin Cache-Control

# WAF managed rules + rate limiting
3. Expression:  http.request.uri.path matches "^/auth/.*"
   Action:       Rate limit 10 requests / 60s per client IP, response 429
4. Expression:  http.request.uri.path matches "^/wp-admin|^/xmlrpc\\.php"
   Action:       Block, custom response 403
```

## Checklist

- [ ] `wrangler.jsonc` committed and used as the sole source of settings
- [ ] `compatibility_date` pinned and reviewed before each deploy
- [ ] Every binding declared, with `preview_id` for KV and R2
- [ ] Cache rules explicit per route class with documented TTLs
- [ ] Origin `Cache-Control` respected unless an override is justified
- [ ] Secrets via `wrangler secret put`, referenced through `env`
- [ ] Handlers small; non-blocking work in `ctx.waitUntil`
- [ ] Error responses avoid leaking origin hostnames or stack traces

## Anti-patterns

- **Editing Workers settings in the dashboard.** The next `wrangler deploy` overwrites every change silently, so the fix disappears without any record. Keep configuration in the repository.
- **Caching HTML by default with a long TTL.** Users see stale pages and support starts blaming the app. Cache assets aggressively and HTML only as the origin allows.
- **`fetch` without a timeout or catch.** One slow origin request holds the Worker until Cloudflare kills it, and the client sees a generic 1101 instead of a useful error.
- **D1 as a primary database.** D1 is SQLite at the edge with a single-writer model; treat it as a cache or a local replica, not the system of record.
- **Bundling API keys into the Worker.** Anything shipped to the edge is extractable by any user of the site. Validate tokens and call your origin.