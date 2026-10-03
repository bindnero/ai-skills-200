---
name: query-optimization
description: Diagnoses slow SQL with EXPLAIN ANALYZE, fixes N+1 access patterns, and tunes indexes and statistics. Use when a query is slow, database CPU is high, or an endpoint exceeds its latency budget.
---

# Query Optimization

**Use when:** a specific query or endpoint is slow, a plan regressed after a volume change, or you need to read a plan to decide on an index.
**Do not use when:** the bottleneck is application CPU or an upstream dependency — capture a trace first; a cache will mask the query problem without fixing it.

## Instructions

1. Measure before changing anything. `EXPLAIN (ANALYZE, BUFFERS)` with realistic parameters; a plan without `ANALYZE` shows guesses, and estimated versus actual rows is where the truth lives.
2. Read the plan outside-in. A bad estimate on the innermost node propagates upward and produces a wrong join order that no index can fix; fix statistics before adding indexes.
3. Eliminate N+1 access first. It is usually the largest single win and needs no schema change: batch with `WHERE id = ANY($1)`, or use a per-request DataLoader.
4. Confirm index usage with `EXPLAIN`, not with the index's existence. A sequential scan is correct when reading a large fraction of the table, and an unused index is pure write overhead.
5. Match index column order to the query: equality predicates on leading columns, then a range on the last, then ordering columns for index-only scans.
6. Prefer partial indexes for skewed predicates. `WHERE deleted_at IS NULL` produces a fraction of the size and stays hot in cache.
7. Fix query shape before adding hardware. `SELECT *` into a large model, `OFFSET 100000`, `NOT IN` with NULLs, implicit casts on indexed columns, and `LIKE '%x'` each defeat indexes outright.
8. Keep statistics fresh: `ANALYZE` after a bulk load, raise the statistics target on skewed columns, and watch autovacuum thresholds.
9. Re-measure with the same harness after each change and archive the plan. A fix that lowers latency at one parameter but plans a hash join at production volume is not a fix.

## Patterns

Plan analysis that exposes the real problem and the fix:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.created_at, c.display_name, o.total_minor_units
  FROM orders o JOIN customers c ON c.id = o.customer_id
 WHERE o.status = 'pending' AND o.created_at >= now() - interval '7 days'
 ORDER BY o.created_at DESC LIMIT 50;

-- BEFORE
-- Seq Scan on orders  (cost=0.00..48210.55 rows=1 width=52)
--   Filter: (status = 'pending' AND created_at >= ...)
--   Rows Removed by Filter: 4999998
-- Nested Loop  (actual time=0.031..1840.442 rows=1 loops=1)
-- Execution Time: 1841.905 ms
--
-- Diagnosis: 5M rows read to find ~50. A partial covering index turns this into
-- an index-only scan touching a few dozen buffers.

CREATE INDEX CONCURRENTLY idx_orders_pending_recent
  ON orders (created_at DESC, customer_id, total_minor_units)
  INCLUDE (status)
  WHERE status = 'pending';

-- AFTER
-- Index Scan using idx_orders_pending_recent on orders
--   (actual time=0.018..0.412 rows=50 loops=1)
--   Buffers: shared hit=6 read=1
-- Execution Time: 0.981 ms
```

DataLoader that removes N+1 from a resolver path:

```ts
import DataLoader from "dataloader";

export function createLoaders(db: Db): Loaders {
  // One loader per request. Sharing across requests leaks tenant data and serves
  // rows from before an invalidation.
  const orderById = new DataLoader<string, Order | null>(async (ids) => {
    const rows = await db.order.findMany({ where: { id: { in: [...ids] } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id) ?? null); // one value per key, in order
  });

  const itemsByOrderId = new DataLoader<string, OrderItem[]>(async (orderIds) => {
    const rows = await db.orderItem.findMany({ where: { orderId: { in: orderIds } } });
    const grouped = new Map<string, OrderItem[]>();
    for (const row of rows) grouped.set(row.orderId, [...(grouped.get(row.orderId) ?? []), row]);
    return orderIds.map((id) => grouped.get(id) ?? []);
  });

  return { orderById, itemsByOrderId };
}

// 200 orders resolved with itemsByOrderId.loadMany: 2 queries total, not 201.
```

Anti-joins and the NULL trap, plus index hygiene:

```sql
-- NOT IN with a NULL anywhere in the subquery returns zero rows for the whole batch.
-- Correct and index-friendly:
SELECT u.* FROM users u
  LEFT JOIN bans b ON b.user_id = u.id AND b.revoked_at IS NULL
 WHERE b.user_id IS NULL;

-- Unused indexes cost write throughput and disk forever.
SELECT s.relname AS table_name, i.indexrelname AS index_name,
       pg_size_pretty(pg_relation_size(i.oid)) AS size, s.idx_scan
  FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelname = s.indexrelname
 WHERE s.idx_scan = 0 AND i.indisunique = false
 ORDER BY pg_relation_size(i.oid) DESC;

-- Skewed column: raise the target so the planner stops underestimating.
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 1000;
ANALYZE orders;
SELECT attname, n_distinct, most_common_freqs FROM pg_stats WHERE tablename = 'orders' AND attname = 'status';
```

## Checklist

- [ ] `EXPLAIN (ANALYZE, BUFFERS)` captured on the real query with production parameters
- [ ] Estimated versus actual rows compared at every node, read outside-in
- [ ] N+1 access eliminated with batching or a per-request DataLoader
- [ ] Each new index verified as used by the planner, not merely created
- [ ] Composite index order matches equality-then-range-then-sort
- [ ] Partial indexes used for skewed predicates with low selectivity
- [ ] `SELECT *`, large `OFFSET`, and `NOT IN` with possible NULLs removed
- [ ] Statistics refreshed and column targets raised where estimates are off

## Anti-patterns

**Adding indexes until it feels faster.** Every index slows inserts, updates, vacuum, and storage. Without a plan diff you cannot tell which one helped, and the write amplification is permanent. Measure, add one, re-measure.

**Reading `EXPLAIN` without `ANALYZE`.** Estimates are frequently off by orders of magnitude on skewed data, and the un-analyzed plan confidently shows the wrong join order. You need the plan with actual rows and times.

**Fixing N+1 with a cache.** The cache masks the 201 queries for cached ids and still issues them for cold ones, so latency depends on cache warmth. Batch the query.

**Implicit casts on indexed columns.** `WHERE uuid_col = 'abc-123'` with an untyped literal makes PostgreSQL cast the column, not the literal, and the index is unusable. Cast the parameter instead.