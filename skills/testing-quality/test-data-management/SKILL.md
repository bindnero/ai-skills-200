---
name: test-data-management
description: Seeds, scopes, and resets test data with deterministic Faker, migration-based fixtures, per-test transactions, and seed-recorded replay. Use when tests interfere through shared rows, when data volume skews results, or when a failure needs a reproducible dataset.
---

# Test Data Management

**Use when:** the correctness of a test depends on the data it runs against, and you need deterministic seeds, isolation between tests, and volume that mirrors production shape.
**Do not use when:** the only "data" is inline arguments to a pure function — use `fixture-and-factory-design` for the builder API and `unit-testing-strategy` for the assertions.

## Instructions

1. Separate *shape* data from *content* data. Persisted rows, uploads, and third-party resources are shape data and belong in seeded fixtures; everything a test asserts on is content data and must be explicit in the test file.
2. Choose isolation per layer: transaction rollback for database unit-ish tests, truncate-and-reseed for integration suites that commit, unique schema or database per parallel worker, and API reset endpoints for E2E.
3. Make the seed deterministic. Create one seeded Faker instance per test file with an explicit seed derived from the file path, so a failure replays exactly while other files stay different.
4. Record the seed in the failure output. If a random test failed, the seed must be in the error message or the run is unreproducible.
5. Seed through the same write path production uses (repositories, factories in a global setup script), never with raw bulk `INSERT` scripts that skip validation, defaults, and triggers.
6. Generate volume deliberately: seed 200 base users and query paginated endpoints over them, rather than seeding one row and calling it realistic.
7. Include the dirty edge cases in the seed set — a user with a null avatar, an order in a terminal state, a record with a very long name — because those break rendering and sorting.
8. Keep fixtures as SQL migrations only for immutable reference data (countries, plan tiers, feature flags). Mutable business rows belong in seed scripts you can re-run and delete.
9. Provide one `reset()` used by E2E setup that truncates in dependency order, then reseeds reference data. Anything else in the setup path turns into mystery state.
10. Cache expensive generated artifacts (files, images, encrypted blobs) in a temp directory keyed by content hash so the suite does not regenerate them per test.

## Patterns

Deterministic Faker instance and a reseedable dataset builder:

```ts
// test/data/faker-instance.ts
import { Faker, en } from '@faker-js/faker';
import { createHash } from 'node:crypto';

/** Stable per-file seed: same file -> same data, different files -> different data. */
export function seedForFile(path: string): number {
  return createHash('sha256').update(path).digest().readInt32BE(0) >>> 0;
}

export function fakerForFile(path: string) {
  return new Faker({ locale: en, seed: seedForFile(path) });
}
```

```ts
// test/data/seed.ts
import { fakerForFile } from './faker-instance';
import { db } from './db';

export async function seedDataset(file = 'unknown') {
  const faker = fakerForFile(file);
  const seed = seedForFile(file);
  await db.truncate(['orders', 'users'], true);

  await db.batchInsert(
    'users',
    Array.from({ length: 200 }, () => ({
      id: faker.string.uuid(),
      email: faker.internet.email({ firstName: 'ada' }),
      name: faker.person.fullName(),
      avatar_url: faker.datatype.boolean() ? faker.image.avatar() : null,
      created_at: faker.date.between({ from: '2024-01-01', to: '2026-01-01' }),
    })),
  );

  return { seed, count: 200 };
}
```

Report the seed on failure so the dataset is replayable:

```ts
// test/integration/report.test.ts
import { expect, it } from 'vitest';
import { seedDataset } from '../data/seed';
import { renderReport } from '../../src/reports/render';

it('groups_by_month', async () => {
  const { seed } = await seedDataset('report.test.ts');
  try {
    expect(renderReport().buckets).toHaveLength(24);
  } catch (error) {
    throw new Error(`${(error as Error).message}\nreplay with: SEED=${seed}`, {
      cause: error,
    });
  }
});
```

E2E reset endpoint that reseeds reference data only:

```ts
// src/routes/test-support.ts
router.post('/api/test/reset', async (req, reply) => {
  await db.truncate(['orders', 'users'], true);
  await seedReferenceData(db);
  await redis.del('users:active');
  await queue.drain('report-emails');
  return reply.send({ ok: true });
});
```

## Checklist

- [ ] Every random dataset is generated from a seed that is printed on failure
- [ ] Seeds are stable per file so a failure replays but files do not collide
- [ ] Isolation strategy is explicit per layer (rollback, truncate+reseed, per-worker database)
- [ ] Mutable data is seeded through production write paths, not raw bulk inserts
- [ ] Reference data lives in migrations; business rows live in re-runnable seed scripts
- [ ] Volume matches production shape for pagination, sorting, and aggregation tests
- [ ] Dirty edge cases (nulls, long strings, unicode) are present in the seed set
- [ ] Expensive artifacts are cached by content hash instead of regenerated per test

## Anti-patterns

**Unseeded `Math.random()` in fixtures.** A failing test that cannot be reproduced burns hours and gets "fixed" by loosening the assertion. Fix: use one seeded Faker per file and include the seed in the failure message.

**Shared seed database across parallel workers.** Workers writing the same rows produce order-dependent failures that only appear in CI. Fix: one database per worker id, or transaction rollback so no row is ever committed.

**Bulk-insert fixtures that bypass validation.** Direct `INSERT` seeds skip application defaults and invariants, so tests pass against data production can never create. Fix: seed via repositories and the real write path.

**One handcrafted row for a paginated list.** A single row hides every off-by-one and ordering bug in pagination. Fix: seed hundreds of rows with skewed timestamps and generate stable ids so ordering is deterministic.
