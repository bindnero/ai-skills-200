---
name: caching-strategies
description: Caches database and HTTP responses with correct invalidation, stampede protection, and bounded TTLs. Use when the same expensive read is repeated and stale data is tolerable for a bounded window.
---

# Caching Strategies

**Use when:** the same read is hot enough that recomputing it costs latency or database capacity.
**Do not use when:** the caller needs read-your-writes consistency — serve through, then warm the cache.

## Instructions

1. Cache by key with an explicit version prefix, so a deploy that changes serialization or query shape cannot serve old-format entries.
2. Pick the TTL from the staleness you can actually tolerate, not from a default. Zero TTL is a cache-shaped way of saying "no cache".
3. Invalidate on write, but only after the transaction commits. Invalidating before commit repopulates the cache with pre-commit state and the write is invisible forever.
4. Guard against stampede with a short lock or stale-while-revalidate. When a popular key expires, every concurrent request misses and they all run the query at once.
5. Treat cache-aside misses as a normal path. Measure hit ratio, miss latency, and evictions; a cache with a 5% hit ratio is pure added cost.
6. Bound every value. Unbounded cached blobs exhaust memory, and an unbounded `MGET` of key lists turns one request into a memory spike.
7. Never cache responses that vary by `Authorization` under a shared key; that leaks one user's data to the next.
8. Keep a bounded negative cache for known-miss keys with a short TTL, or a flood of requests for one absent id re-queries the database each time.
9. Add jitter to TTLs so a batch of keys written together does not expire together and stampede later.

## Patterns

Cache-aside read with a single-flight lock and stale-while-revalidate:

```ts
type Cached<T> = { value: T; storedAt: number };

export async function readThrough<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const k = `v3:${key}`;
  const hit = await redis.get(k);
  if (hit) {
    const parsed = JSON.parse(hit) as Cached<T>;
    if (Date.now() - parsed.storedAt < ttlMs) return parsed.value;

    // Stale but usable: serve it now, refresh in the background once.
    if (!await redis.set(`lock:${k}`, "1", { NX: true, EX: 30 })) return parsed.value;
    void loader().then((fresh) => redis.set(k, JSON.stringify({ value: fresh, storedAt: Date.now() }), { EX: Math.ceil(ttlMs / 1000) + 60 }))
      .catch((err) => logger.warn({ err, k }, "background refresh failed"))
      .finally(() => redis.del(`lock:${k}`));
    return parsed.value;
  }

  // Single-flight: only the first miss runs the query; the rest wait on it.
  const acquired = await redis.set(`lock:${k}`, "1", { NX: true, EX: 30 });
  if (!acquired) return retryAfter(await sleep(50), () => readThrough(key, ttlMs, loader));

  try {
    const value = await loader();
    // Jitter keeps a batch of keys from expiring together.
    const jitter = Math.floor(Math.random() * (ttlMs / 10));
    await redis.set(k, JSON.stringify({ value, storedAt: Date.now() }), { EX: Math.ceil((ttlMs + jitter) / 1000) });
    return value;
  } finally {
    await redis.del(`lock:${k}`);
  }
}
```

Key design and post-commit invalidation:

```ts
// Version prefix + caller-scoped parts: never a bare entity id on a shared cache.
export const orderKey = (tenantId: string, orderId: string) => `v3:order:${tenantId}:${orderId}`;
export const orderListKey = (tenantId: string, status: string, cursor: string) => `v3:orderlist:${tenantId}:${status}:${hash(cursor)}`;

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  await db.$transaction(async (tx) => {
    const order = await tx.order.update({ where: { id: orderId }, data: { status } });

    // Outbox row, not a cache call: the broker performs the invalidation after commit.
    await tx.cacheInvalidation.create({
      data: { keys: [orderKey(order.tenantId, order.id), `v3:orderlist:${order.tenantId}:*`], queuedAt: null },
    });
  });
}

export async function drainInvalidations(): Promise<number> {
  const rows = await db.cacheInvalidation.findMany({ where: { queuedAt: null }, take: 500 });
  let deleted = 0;
  for (const row of rows) {
    // SCAN, never KEYS: KEYS blocks the single-threaded server.
    deleted += await scanAndDelete(row.keys);
    await db.cacheInvalidation.update({ where: { id: row.id }, data: { queuedAt: new Date() } });
  }
  return deleted;
}

async function scanAndDelete(patterns: string[]): Promise<number> {
  let cursor = "0"; let n = 0;
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", patterns[0], "COUNT", 500);
    cursor = next;
    if (keys.length) n += await redis.del(keys);
  } while (cursor !== "0");
  return n;
}
```

## Checklist

- [ ] Every cache key carries a version prefix
- [ ] TTLs derive from tolerable staleness, with jitter to avoid synchronized expiry
- [ ] Invalidation happens after commit, never before
- [ ] Hot keys use single-flight or stale-while-revalidate to prevent stampedes
- [ ] Values are size-bounded and listings are truncated, not cached whole
- [ ] Keys include tenant and caller scope; authenticated responses are never shared
- [ ] Negative lookups use a short TTL
- [ ] Hit ratio, miss latency, and eviction rate are monitored

## Anti-patterns

**Cache invalidated inside the transaction.** The invalidation runs before commit, a concurrent read repopulates with pre-commit data, and the change is then invisible until the TTL expires. Invalidate after commit.

**No stampede guard on a hot key.** At expiry every in-flight request misses simultaneously and the database absorbs the whole spike, often failing while the cache still reports healthy. Lock or serve stale.

**Global cache key for user-specific data.** `cache:order:{id}` without a tenant or caller scope serves one user's order to whoever asks next. Scope the key to the tenant.

**TTL set to "as long as possible."** Long TTLs mean no invalidation path is ever exercised, so the first stale write persists for days and nobody notices. Keep the TTL short enough that correctness does not depend on invalidation.