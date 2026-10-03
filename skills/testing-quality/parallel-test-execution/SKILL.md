---
name: parallel-test-execution
description: Runs suites concurrently with Vitest pools and thread affinity, Playwright shards, per-worker databases, and nextest profiles. Use when the suite exceeds the CI time budget, or when tests collide on shared ports, databases, or files.
---

# Parallel Test Execution

**Use when:** the suite is slower than the CI budget and can be split safely, or when parallel runs collide on a shared port, database, or filesystem path.
**Do not use when:** tests share mutable global state that nobody has isolated — parallelising first guarantees failures; fix isolation first, then parallelise.

## Instructions

1. Prove serial correctness first. `vitest run --no-file-parallelism --pool=forks` must be green before any parallel claim means anything.
2. Give every worker its own external resource. Allocate a database or schema from the worker id, and derive ports from it; a fixed `DATABASE_URL` or `PORT=3000` is the top cause of parallel-only failures.
3. Choose the pool deliberately: `threads` for CPU-bound unit tests and the fastest startup, `forks` for anything touching native modules, process-wide state, or `process.env` mutation, `vmThreads` for isolated globals with VM memory cost.
4. Tune concurrency to the machine, not to the number of cores alone. Each worker holding a database connection and a browser context has a memory cost; start at `cores / 2` and raise while the OOM risk is low.
5. Shard Playwright by test file, never by test count, and keep shard assignment stable across retries — otherwise a failed test moves shards and never reproduces.
6. Balance shards by measured duration, not by file count, using `--list` output with recorded timings.
7. Cache and reuse expensive setup per worker, not per test, but make it idempotent so a crashed worker can be recreated cleanly.
8. Cap fan-out in CI: each shard gets its own browser, so unbounded workers on a 4-core runner creates memory pressure that manifests as timeout flake.
9. Emit per-worker timing (`--reporter=verbose` plus `--logHeapUsage`) and check for stragglers; the slowest shard sets your wall-clock time.
10. Keep a serial lane for the handful of tests that genuinely require single-instance access (port binding, migration of the shared schema), rather than serialising the whole suite.

## Patterns

Per-worker isolation derived from the Vitest worker id:

```ts
// test/setup-per-worker.ts
import { afterAll, beforeAll } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from './migrate';

const workerId = process.env.VITEST_WORKER_ID ?? '1';
const adminUrl = process.env.DATABASE_ADMIN_URL!;
const admin = new Pool({ connectionString: adminUrl, max: 1 });

/** Each worker owns one database, created once and dropped on exit. */
beforeAll(async () => {
  const dbName = `test_w${workerId}`;
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);
  process.env.DATABASE_URL = `${adminUrl.slice(0, adminUrl.lastIndexOf('/'))}/${dbName}`;
  process.env.PORT = String(4000 + Number(workerId));
  await runMigrations(process.env.DATABASE_URL);
});

afterAll(async () => {
  const dbName = process.env.DATABASE_URL!.split('/').pop()!;
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});
```

Vitest pools: unit tests in threads, integration in forks:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          pool: 'threads',
          fileParallelism: true,
          maxWorkers: '50%',
          minWorkers: 2,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          pool: 'forks', // native modules and per-worker process.env
          setupFiles: ['./test/setup-per-worker.ts'],
          maxWorkers: 3,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
```

```bash
# Sharding, a serial lane for port binding, and straggler reporting
npx playwright test --shard=${{ matrix.shard }}/${{ matrix.total }}
npx playwright test e2e/local-server.spec.ts --workers=1
npx playwright test --list > test-list.json && node scripts/shard-balance.mjs test-list.json 4
```

## Checklist

- [ ] Suite passes fully serial before parallelising (`--no-file-parallelism`)
- [ ] Per-worker database/schema and port derived from worker id, never hardcoded
- [ ] Pool chosen deliberately (`threads` vs `forks`) with a stated reason
- [ ] Worker count set below core count and checked against memory limits
- [ ] Shards balanced by measured duration and stable across retries
- [ ] Genuinely single-instance tests isolated in a `--workers=1` lane
- [ ] Worker setup is idempotent and recreated cleanly after a crash
- [ ] Per-worker timings recorded so stragglers are visible

## Anti-patterns

**One shared database across workers.** Parallel files truncate each other's rows, producing failures that only happen when the suite is split. Fix: per-worker database created in `setupFiles`.

**Parallelising before isolating.** Sharing `process.env` or a singleton across workers in `threads` causes cross-talk that reads as application bug. Fix: serial green first, then per-worker resources.

**Shard by file count.** One file with 200 tests and nine with five produce a 12-minute shard next to a 20-second one. Fix: balance on recorded durations.

**Raising workers to speed up CI.** More workers than memory allows causes browser OOMs and timeout flake that looks like product instability. Fix: cap workers by memory, and add a serial lane for port-binding specs.