---
name: pagination-patterns
description: Implements offset, keyset, and cursor pagination with stable sort orders and jump-pagination paths. Use when adding list endpoints, fixing duplicated or skipped rows across pages, or solving deep-paging performance problems.
---

# Pagination Patterns

**Use when:** you are building a list endpoint and must choose offset versus cursor pagination, define a stable sort key, or make deep pages performant.
**Do not use when:** the consumer genuinely needs an exact total over a large table — that requirement forces offset or a maintained counter.

## Instructions

1. Default to keyset pagination for anything that changes while being read. Offset skips and duplicates rows whenever an insert lands before the current position — a duplicate order across two pages is a correctness bug.
2. Make the sort key total. `ORDER BY created_at DESC` alone is non-deterministic when timestamps collide; append the primary key (`ORDER BY created_at DESC, id DESC`).
3. Keyset the full tuple into the cursor, and bind the cursor to the query via a filter fingerprint so a cursor from one filter set cannot be replayed against another.
4. Enforce a default and a hard maximum on `limit` (20-50 default, 100-200 max). An uncapped `limit` is an accidental denial of service against your own pool.
5. Omit `totalCount` from cursor responses. Derive `hasNextPage` by fetching `limit + 1` rows, which costs zero extra queries; an exact `COUNT(*)` is a scan that dwarfs the page fetch.
6. For random page jumps, keep offset but require a deterministic sort and cap `OFFSET` around 10,000; beyond that, steer to cursor pagination.
7. Expire cursors. Embed an issued-at timestamp and reject past a TTL so a stale cursor cannot pin an index plan that no longer matches.
8. Never expose raw database offsets as the page token; it is an enumeration hint and leaks row-count information.

## Patterns

Keyset cursor with fingerprint validation and no `COUNT`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

const CURSOR_TTL_MS = 15 * 60 * 1000;
type Cursor = { v: 1; f: string; k: [string, string]; iat: number };

const SECRET = Buffer.from(process.env.CURSOR_SECRET!, "base64");

const fingerprint = (filters: Record<string, unknown>) =>
  createHmac("sha256", SECRET).update(JSON.stringify(filters, Object.keys(filters).sort())).digest("base64url").slice(0, 16);

export function decodeCursor(token: string | undefined, filters: Record<string, unknown>): Cursor | null {
  if (!token) return null;

  let payload: Cursor;
  try {
    payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_cursor", "Cursor is not valid base64url JSON");
  }

  const expected = createHmac("sha256", SECRET).update(payload.f ?? "").digest();
  const actual = createHmac("sha256", SECRET).update(fingerprint(filters)).digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new HttpError(400, "cursor_filter_mismatch", "Cursor was issued for a different filter set");
  }
  if (Date.now() - payload.iat > CURSOR_TTL_MS) throw new HttpError(410, "cursor_expired", "Cursor is older than the paging window");
  return payload;
}

export async function listOrders(filters: { status?: string; limit?: number; cursor?: string }) {
  const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100);
  const cursor = decodeCursor(filters.cursor, filters);

  const rows = await db.order.findMany({
    where: {
      status: filters.status,
      // Row-value comparison against the total sort tuple: this is the keyset predicate.
      ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.k[0]) } }, { createdAt: new Date(cursor.k[0]), id: { lt: cursor.k[1] } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], // tiebreaker makes the order total
    take: limit + 1, // one extra row answers hasNextPage with no extra query
  });

  const hasNextPage = rows.length > limit;
  const data = hasNextPage ? rows.slice(0, limit) : rows;
  const last = data.at(-1);

  return {
    data,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage && last
        ? Buffer.from(JSON.stringify({ v: 1, f: fingerprint(filters), k: [last.createdAt.toISOString(), last.id], iat: Date.now() } satisfies Cursor)).toString("base64url")
        : null,
    },
  };
}
```

The equivalent SQL predicate, and offset pagination when a pager is unavoidable:

```sql
-- Page 1
SELECT id, created_at, total_cents FROM orders
 WHERE status = 'open'
 ORDER BY created_at DESC, id DESC
 LIMIT 26;                      -- limit + 1

-- Page 2: pass the last (createdAt, id) from page 1.
SELECT id, created_at, total_cents FROM orders
 WHERE status = 'open'
   AND (created_at, id) < ('2026-02-11T09:31:02.114Z', 'ord_9f2a')
 ORDER BY created_at DESC, id DESC
 LIMIT 26;

-- Jump-to-page, capped. Exact COUNT(*) per page is a full scan and is stale the
-- instant a row lands, so the pager uses planner statistics for pageCount.
SELECT id, created_at, total_cents FROM orders
 WHERE status = 'open'
 ORDER BY created_at DESC, id DESC
 OFFSET 2000 LIMIT 25;          -- rejected above OFFSET 10000
```

## Checklist

- [ ] Sort order is total, with the primary key as an explicit tiebreaker
- [ ] Cursor encodes the full sort tuple plus a filter fingerprint
- [ ] Cursors are tamper-evident, filter-scoped, and time-limited
- [ ] `limit` has both a default and a hard server-side maximum
- [ ] `hasNextPage` comes from fetching `limit + 1`, not from a `COUNT`
- [ ] No exact `totalCount` is computed per page on a cursor endpoint
- [ ] Offset pagination is capped and requires a deterministic sort
- [ ] Contract tests assert no duplicates and no gaps under concurrent writes

## Anti-patterns

**`ORDER BY created_at DESC` without a tiebreaker.** Two orders created in the same millisecond have an unspecified relative order across queries, so page boundaries repeat or drop one of them. Append `, id DESC`.

**Returning `totalCount` on every keyset page.** `COUNT(*)` scans the whole table and is stale within milliseconds. Fetch `limit + 1` and expose `hasNextPage`.

**Uncapped `limit`.** Honoring `?limit=1000000` turns a list endpoint into a denial of service against your connection pool and memory. Clamp server-side.

**Offset pagination on a mutating dataset.** `OFFSET 5000 LIMIT 20` skips exactly the rows a concurrent insert pushes into the gap, so users report "my order disappeared". Keyset the tuple.