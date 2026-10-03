---
name: database-migrations
description: Ships reversible expand-and-contract schema changes with online DDL and deployment-safe sequencing. Use when adding, renaming, or dropping columns, indexes, or tables in a live database.
---

# Database Migrations

**Use when:** changing a schema that live traffic reads from — adding or dropping columns and indexes, backfilling data, renaming, splitting tables.
**Do not use when:** the change is purely in application code with no schema delta — see `rest-api-design`.

## Instructions

1. Use expand-and-contract for every live-table change, as four separate deploys: add the new structure while the old still works, deploy code that writes both, backfill, switch reads, then remove the old.
2. Never run long or blocking DDL on application startup. A migration on boot stalls the deploy until the lock is granted, and two pods booting at once contend for it.
3. Separate migrations from deploys. Apply DDL via a dedicated runner or CI step, then deploy code compatible with both the old and new schema.
4. Add constraints as `NOT VALID` and `VALIDATE CONSTRAINT` in a later transaction; validation scans the table and blocks writes.
5. Create indexes with `CREATE INDEX CONCURRENTLY`, which cannot run inside a transaction. Accept the longer build and clean up the invalid index if it fails.
6. Backfill in bounded, resumable batches outside any transaction. One 20-million-row `UPDATE` holds locks for minutes and doubles the table in dead tuples.
7. Write the `down` before the `up`, and document the recovery path explicitly when reversal is impossible.
8. Set `lock_timeout` so a contended migration fails fast instead of queueing every subsequent query behind it.
9. Test against a production-sized snapshot; index build time, rewrites, and lock waits only appear at real row counts.

## Patterns

Expand-and-contract across four deploys for a column rename:

```sql
-- Deploy 1: EXPAND. Additive only; nothing reads it yet.
BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE orders ADD COLUMN total_minor_units bigint;
ALTER TABLE orders ADD COLUMN currency_code text;
ALTER TABLE orders ADD CONSTRAINT orders_currency_code_check
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$') NOT VALID;

-- Cannot run inside a transaction; longer build, but does not block writes.
CREATE INDEX CONCURRENTLY idx_orders_currency_code ON orders (currency_code);
COMMIT;
```

```sql
-- Deploy 2: resumable backfill in bounded batches, outside any transaction.
DO $$
DECLARE batch_size int := 5000; updated int := 0;
BEGIN
  LOOP
    UPDATE orders
       SET total_minor_units = round(total_dollars * 100)::bigint,
           currency_code = COALESCE(currency_code, 'USD')
     WHERE id IN (SELECT id FROM orders WHERE total_minor_units IS NULL ORDER BY id LIMIT batch_size)
     RETURNING id INTO updated;
    EXIT WHEN updated = 0;
    PERFORM pg_sleep(0.05);   -- yield so live traffic is not starved
  END LOOP;
END $$;
```

```sql
-- Deploy 3: CONTRACT. Only once every pod reads total_minor_units.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- Postgres 12+ scans for this without a full table rewrite.
ALTER TABLE orders ALTER COLUMN total_minor_units SET NOT NULL;
ALTER TABLE orders VALIDATE CONSTRAINT orders_currency_code_check;
COMMIT;

-- Old columns are NOT dropped here. Drop in a later deploy, once rollback is moot.
```

Framework migration with a concurrent index build and a real down:

```ts
export class AddOrderIndex extends Migration {
  async up(db: Knex): Promise<void> {
    // Outside a transaction: CREATE INDEX CONCURRENTLY cannot run inside one.
    await db.raw(`SET lock_timeout = '3s'`);
    await db.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status_created ON orders (status, created_at DESC)`);
  }

  async down(db: Knex): Promise<void> {
    await db.raw(`DROP INDEX CONCURRENTLY IF EXISTS idx_orders_status_created`);
  }
}
```

Application code that dual-writes and asserts readiness instead of migrating on boot:

```ts
export async function createOrder(input: OrderInput): Promise<Order> {
  return db.order.create({
    data: {
      totalDollars: input.totalCents / 100, // legacy column, still populated
      totalMinorUnits: input.totalCents,    // new column
      currencyCode: input.currency,
    },
  });
}

// Deploy 3's precondition: the backfill must be complete or NOT NULL fails.
export async function assertBackfillComplete(): Promise<void> {
  const { count } = await db.order.count({ where: { totalMinorUnits: null } });
  if (count > 0) throw new Error(`${count} orders missing total_minor_units; contract migration blocked`);
}

export async function assertSchemaReady(): Promise<void> {
  const client = await db.connect();
  try {
    const { rows } = await client.query("SELECT max(version) AS v FROM schema_migrations WHERE applied_at IS NOT NULL");
    if (Number(rows[0].v ?? 0) < REQUIRED_SCHEMA_VERSION) throw new Error("schema behind required version");
  } finally {
    client.release();
  }
}
```

## Checklist

- [ ] Every live-table change is expand-and-contract across separate deploys
- [ ] Migrations run outside application startup and are gated by a concurrency lock
- [ ] Long DDL uses `CONCURRENTLY` or `NOT VALID` plus `VALIDATE`
- [ ] New indexes are `CONCURRENTLY` and never inside a transaction
- [ ] Backfills run in bounded, resumable batches outside any transaction
- [ ] `lock_timeout` is set so a contended migration fails fast
- [ ] Every migration has a working `down` or a documented manual recovery path
- [ ] The app asserts schema readiness instead of running migrations

## Anti-patterns

**Renaming a column in one deploy.** A rename drops the old name instantly; any pod on the previous build fails on every request and rolling back cannot restore the data. Add, dual-write, backfill, switch, then drop.

**Creating an index inside a transaction.** `CREATE INDEX CONCURRENTLY` errors inside a transaction block, so the migration either fails or falls back to a locking build that blocks writes. Run it standalone.

**Migrations on application boot.** Two pods booting together contend on the same DDL lock; the second blocks and the deploy looks like a hang. Run migrations in a dedicated step.

**Single-transaction backfill.** Updating millions of rows in one transaction holds locks for minutes and generates as many dead tuples as rows, bloating the table. Batch it with a checkpoint.