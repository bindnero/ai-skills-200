---
name: edge-caching-strategy
description: Designs HTTP caching with Cache-Control, Vary, CDN stale-while-revalidate, surrogate keys and cache invalidation webhooks. Use when tuning CDN or browser cache headers, reducing origin load, or fixing stale or leaking content at the edge.
---

# Edge Caching Strategy

**Use when:** Tuning CDN or browser cache headers, reducing origin load, or fixing content that is served stale or leaked between users.
**Do not use when:** Nothing is cached and you are choosing a CDN provider; use `cloudflare-edge` for provider-specific configuration.

## Instructions

1. Classify every route before writing a header. Public, authenticated, per-user and transactional content need four different strategies, not one shared default.
2. Set `Cache-Control` on the origin response. Edge configuration alone is overridden by the origin header and by intermediaries, so headers must be correct at the source.
3. Use explicit `max-age` and `s-maxage` rather than relying on heuristics. `s-maxage` controls the shared cache, `max-age` the browser, and confusing them causes stale content for one and misses for the other.
4. Mark personalised responses `private` or `no-store`. A CDN caching a per-user response is a data leak, not a performance win.
5. Set `Vary` on every header the response depends on. A missing `Vary: Accept-Encoding` serves gzip to clients that cannot decode it; a missing `Vary` on content negotiation serves the wrong variant.
6. Use `stale-while-revalidate` and `stale-if-error` for read-heavy content so a slow or failing origin does not produce visible errors.
7. Invalidate by surrogate key, not by URL list. Purge-by-prefix purges far more than intended and leaves the real entries behind.
8. Trigger invalidation from the write path — after a successful database commit, not before — so the CDN never repopulates with stale data.
9. Guard against stampedes: collapse concurrent misses onto a single origin request so one popular key expiry does not generate hundreds of simultaneous requests.
10. Measure hit ratio and origin offload per route, and alert when hit ratio drops sharply, since a broken cache usually looks like a latency problem instead.

## Patterns

Headers that distinguish the four content classes precisely:

```http
# 1. Immutable, content-addressed asset: cache forever, safe because the URL changes on change.
HTTP/1.1 200 OK
Cache-Control: public, max-age=31536000, immutable
Content-Type: application/javascript; charset=utf-8

# 2. Shared, cacheable API response: long CDN TTL, short browser TTL.
HTTP/1.1 200 OK
Cache-Control: public, max-age=60, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=604800
Vary: Accept-Encoding
ETag: "W-1f3a9c2b"
Surrogate-Key: catalog category:electronics

# 3. Per-user response: never shared, briefly browser-cached.
HTTP/1.1 200 OK
Cache-Control: private, no-cache, max-age=0, must-revalidate
Vary: Cookie, Authorization

# 4. Non-idempotent write: must never be cached anywhere.
HTTP/1.1 201 Created
Cache-Control: no-store
```

A Fastly or Cloudflare-style surrogate purge and stampede collapse on the write path:

```python
"""Invalidate the CDN after a successful commit, collapsing concurrent misses."""
import asyncio
import hashlib
import logging
import time

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

PURGE_URL = "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache"
IN_FLIGHT: dict[str, asyncio.Task] = {}


async def _purge(keys: list[str]) -> None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(
            PURGE_URL.format(zone_id=ZONE_ID),
            headers={"Authorization": f"Bearer {CF_TOKEN}"},
            json={"surrogate_keys": keys},
        )


async def invalidate(keys: list[str]) -> None:
    """Purge after the commit, and collapse a burst of identical purges into one."""
    fingerprint = hashlib.sha256("|".join(sorted(keys)).encode()).hexdigest()
    if fingerprint in IN_FLIGHT:
        await IN_FLIGHT[fingerprint]
        return

    task = asyncio.create_task(_purge(keys))
    IN_FLIGHT[fingerprint] = task
    try:
        await task
        log.info("purged surrogate keys", extra={"keys": keys})
    except httpx.HTTPError:
        # A failed purge is not fatal: the TTL is the backstop, not the primary path.
        log.warning("purge failed, relying on TTL", extra={"keys": keys})
    finally:
        IN_FLIGHT.pop(fingerprint, None)


async def update_price(db: AsyncSession, sku: str, price_cents: int) -> None:
    async with db.begin():
        db.execute(
            text("UPDATE catalog SET price_cents = :p WHERE sku = :s"),
            {"p": price_cents, "s": sku},
        )
    # Only after the commit succeeds, otherwise the CDN refills from the old value.
    await invalidate([f"catalog", f"sku:{sku}"])
```

Nginx-level micro-caching for anonymous traffic that misses the CDN entirely:

```nginx
proxy_cache_path /var/cache/nginx/keys_zone=api:32m levels=1:2 max_keys=100k
                     inactive=10m use_temp_path=off;

server {
    listen 8080;

    # Only anonymous GETs are cached; anything with a session cookie bypasses the cache.
    map $http_authorization $skip_cache { default 1; "" 0; }
    map $cookie_session     $skip_session { default 1; "" 0; }

    location /api/ {
        proxy_pass http://upstream_api;
        proxy_cache api;
        proxy_cache_bypass $skip_cache $skip_session ...;
        proxy_no_cache $skip_cache $skip_session;
        proxy_cache_valid 200 302 1m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_lock on;              # collapse concurrent misses into one origin request
        proxy_cache_lock_timeout 5s;
        add_header X-Cache-Status $upstream_cache_status always;
    }
}
```

## Checklist

- [ ] Every route classified: public, personalised, or non-cacheable
- [ ] `Cache-Control` set at the origin, not only in the CDN dashboard
- [ ] `max-age` and `s-maxage` set deliberately and differ where intended
- [ ] `private` or `no-store` on anything user-specific
- [ ] `Vary` lists every header the response depends on
- [ ] `stale-while-revalidate` and `stale-if-error` on read-heavy content
- [ ] Invalidation triggered after commit, keyed by surrogate key
- [ ] Hit ratio measured per route and alerting on a sharp drop

## Anti-patterns

- **`Cache-Control: public` on a per-user response.** The CDN stores one user's data and serves it to everyone until the TTL expires. This is a data breach, not a slow page.
- **Purge-by-prefix after every write.** It purges far more than intended, leaving real stale entries behind while destroying the cache hit ratio. Purge exact keys or surrogate keys.
- **Invalidating before the database commit.** The CDN refills from the unchanged row and stays stale for the full TTL, so the invalidation appears not to work.
- **A long `max-age` with no `Vary`.** Compressed or localised variants get served to clients that cannot read them, producing intermittent, hard-to-reproduce breakage.
- **No `stale-if-error`.** When the origin is down, every cached entry expires simultaneously and users see errors instead of slightly stale content.