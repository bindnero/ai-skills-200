---
name: integration-testing
description: Verifies real subsystem wiring against disposable Postgres, Redis, and HTTP services using Testcontainers, Vitest globalSetup, and transactional isolation. Use when a bug only appears once the database, cache, queue, or two services actually talk to each other.
---

# Integration Testing

**Use when:** the behaviour under test depends on real SQL semantics, serialization, transactions, locks, cache invalidation, or service-to-service contracts that mocks cannot reproduce.
**Do not use when:** the logic is a pure function or the failure is purely visual in a rendered component — use `unit-testing-strategy` or `component-test-harness`.

## Instructions

1. Decide the boundary before writing the test. Integration means at least one real I/O boundary plus the code under test; a test with a single mocked database is neither integration nor unit — push it to the unit layer.
2. Boot throwaway infrastructure with Testcontainers in `globalSetup`, not per file. One Postgres container per whole run keeps the layer fast enough to run on every PR.
3. Import `getConnectionUri()` from the global setup through Vitest's `provide`/`inject` API so tests never hardcode `localhost:5432`.
4. Run migrations against the container once in `globalSetup`; drop and recreate per test via a transaction rollback rather than truncating tables.
5. Wrap each test in a transaction, execute the code under test, then `ROLLBACK` in `afterEach`. This gives per-test isolation at near-zero cost and survives parallel files.
6. Assert on observable state read back through the same driver the production code uses (`SELECT count(*)`) rather than on the values passed into a `create*` call.
7. Test real constraints deliberately: duplicate unique key, FK violation, and NOT NULL violation each get a case asserting the error code the service maps to a response.
8. Cover the transaction semantics explicitly — rollback on thrown error, isolation under `SERIALIZABLE`, and concurrent read-modify-write on the same row — because these only surface here.
9. Keep integration files on the real DB and out of the default `vitest run` watch loop if they exceed 2s each; gate them behind a Vitest project so fast feedback stays fast.
10. Delete the container on exit with `afterAll` in `globalSetup` so CI leaves nothing behind, and set `withReuse(false)` for deterministic CI runs.

## Patterns

Vitest globalSetup with a shared Postgres container and injected URI:

```ts
// test/global-setup.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer;

export default async function setup({ provide }: { provide: (k: string, v: unknown) => void }) {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const uri = container.getConnectionUri();
  await runMigrations(uri);
  provide('DATABASE_URL', uri);
  return async () => {
    await container.stop();
  };
}
```

```ts
// test/integration/order-repository.test.ts
import { afterEach, beforeEach, describe, expect, it, inject } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { OrderRepository } from '../src/orders/order-repository';

describe('OrderRepository', () => {
  const pool = new Pool({ connectionString: inject('DATABASE_URL'), max: 5 });
  let tx: PoolClient;
  let repo: OrderRepository;

  beforeEach(async () => {
    tx = await pool.connect();
    await tx.query('BEGIN');
    repo = new OrderRepository(tx);
  });

  afterEach(async () => {
    await tx.query('ROLLBACK');
    tx.release();
  });

  it('persists_an_order_and_returns_it_with_generated_id', async () => {
    const created = await repo.create({ customerId: 'c_1', totalCents: 4500 });

    const { rows } = await tx.query('SELECT id, total_cents FROM orders WHERE id = $1', [
      created.id,
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].total_cents).toBe(4500);
  });

  it('maps_unique_violation_to_conflict_error', async () => {
    const order = { customerId: 'c_1', totalCents: 100, reference: 'ref-1' };
    await repo.create(order);

    await expect(repo.create(order)).rejects.toMatchObject({ code: '23505' });
  });
});
```

Config that keeps the container out of every hot reload:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    hookTimeout: 120_000,
    testTimeout: 15_000,
    include: ['test/integration/**/*.test.ts'],
  },
});
```

## Checklist

- [ ] Infrastructure starts once in `globalSetup` and stops in the teardown it returns
- [ ] Tests read the connection URI from `inject(...)`, never from a hardcoded host
- [ ] Migrations run once at setup, not per test file
- [ ] Per-test isolation uses transaction rollback, not table truncation
- [ ] Assertions read state back with a real query against the same driver as production code
- [ ] Unique, FK, and NOT NULL violations each have a case asserting the mapped error code
- [ ] Transaction rollback and concurrency behaviour have explicit coverage
- [ ] The layer runs against real services and is separated from the fast unit project

## Anti-patterns

**Mocking the database in an integration test.** Replacing the driver with a stub means SQL syntax errors, index behaviour, and constraint semantics are never executed. Fix: run against real Postgres via Testcontainers and keep the mock for the unit layer only.

**Truncating tables between tests.** `TRUNCATE ... CASCADE` on every test serialises the suite, breaks under parallel files, and leaks rows into foreign keys you forgot. Fix: wrap each test in a transaction and roll it back.

**One container per test file.** Startup dominates runtime and the suite drifts past the PR time budget. Fix: a single container in `globalSetup` plus per-test transactions.

**Asserting on the argument you just passed.** `expect(result.totalCents).toBe(4500)` where `4500` went straight into `create()` proves the function echoed its input. Fix: query the row back and assert on the stored column.
