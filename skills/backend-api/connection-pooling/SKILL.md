---
name: connection-pooling
description: Sizes and bounds database and HTTP client pools so concurrency stays under what the datastore can serve. Use when adding a datastore client, raising concurrency, or diagnosing pool timeouts and saturation.
---

# Connection Pooling

**Use when:** creating a database or HTTP client, raising worker concurrency, or diagnosing "too many connections" and pool-exhausted errors.
**Do not use when:** work is CPU-bound and has no upstream to pool — see `background-jobs`.

## Instructions

1. Treat the pool as a hard cap on concurrent upstream work. Postgres and most HTTP/2 frontends serialise requests, so raising pool size raises latency rather than throughput.
2. Size a database pool from the upstream limit, not from your pod count. Budget `max_connections` across all instances plus reserved slots for operators and migrations.
3. Bound total connections with `instances × poolMax ≤ max_connections − reserve`. Unbounded per-pod pools multiply during a scale-out and take the database down.
4. Keep `poolMax` at or below the Postgres `max_connections` you were actually granted; a container default of 100 across 30 pods exceeds a shared `max_connections` of 50.
5. Set a `connectionTimeoutMillis` in the low thousands so requests fail fast with a clear signal instead of piling up on a dead pool.
6. Cap `idleTimeoutMillis` below the upstream idle-connection timeout, or the pool hands out sockets the server already closed and every query fails once.
7. Reuse one client per process. A pool created per request opens and closes sockets continuously and never benefits from keep-alive.
8. For HTTP, cap total connections and keep per-host limits low enough to preserve headroom for health checks and retries.
9. Alert on saturation ratio and acquire-wait time. A pool at 100% with no errors is still the thing that took the site down.

## Patterns

Database pool sized from the shared budget:

```ts
import { Pool } from "pg";

const REPLICA_COUNT = Number(process.env.REPLICA_COUNT ?? 3);
const DB_MAX_CONNECTIONS = Number(process.env.DB_MAX_CONNECTIONS ?? 200);
const RESERVED_FOR_OPERATIONS = 10;              // migrations, psql, monitoring
const PODS_PER_REPLICA = Number(process.env.PODS_PER_REPLICA ?? 4);

// Integer division leaves headroom instead of overshooting the budget.
const POOL_MAX = Math.max(4, Math.floor((DB_MAX_CONNECTIONS - RESERVED_FOR_OPERATIONS) / (REPLICA_COUNT * PODS_PER_REPLICA)));

export const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: POOL_MAX,                 // 15 at the defaults above, not 100 per pod
  idleTimeoutMillis: 20_000,     // below typical server idle_timeout of 60s
  connectionTimeoutMillis: 3_000,// fail fast rather than wait forever for a slot
  application_name: `orders-${process.env.HOSTNAME ?? "local"}`,
  statement_timeout: 5_000,      // a stuck query still releases the socket eventually
  keepAlive: true,
});

pool.on("error", (err) => logger.error({ err }, "idle client errored and was discarded"));

// Export this so saturation alerts on ratio and acquire wait, not just errors.
export const poolSaturation = () => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max: POOL_MAX });
```

Splitting reads and writes across a primary and replicas:

```ts
const writerPool = new Pool({ ...base, max: Math.ceil(POOL_MAX / 2) });
const readerPool = new Pool({ ...base, max: POOL_MAX - Math.ceil(POOL_MAX / 2), options: "-c default_transaction_read_only=on" });

export async function findOrder(id: string, consistency: "strong" | "eventual"): Promise<Order | null> {
  const target = consistency === "strong" ? writerPool : readerPool;
  const { rows } = await target.query("SELECT * FROM orders WHERE id = $1", [id]);
  return rows[0] ?? null;
}

// After a write, subsequent reads must hit the writer: a replica can lag by seconds.
export async function createOrder(data: CreateOrder): Promise<Order> {
  const { rows } = await writerPool.query(
    "INSERT INTO orders (customer_id, total_minor, currency) VALUES ($1,$2,$3) RETURNING *",
    [data.customerId, data.totalMinor, data.currency],
  );
  return rows[0];
}
```

Bounded HTTP agent with explicit headroom:

```ts
import { Agent } from "undici";

export const upstreamAgent = new Agent({
  connections: 32,                  // total sockets, not per origin
  pipelining: 1,                    // keep pipelining off: it amplifies latency under load
  keepAliveTimeout: 4_000,          // below typical 5s LB idle close
  keepAliveMaxTimeout: 60_000,
  timeout: 5_000,                   // per-request ceiling; retries bounded separately
});

export async function fetchWithBudget(url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, { ...init, dispatcher: upstreamAgent, signal: AbortSignal.timeout(5_000) });
  if (response.status === 429 || response.status >= 500) {
    // Release the socket rather than reading a body we are throwing away.
    await response.body?.cancel();
    throw new UpstreamError(response.status, url);
  }
  return response;
}
```

## Checklist

- [ ] Pool max is derived from the upstream `max_connections` budget minus a reserve
- [ ] `instances × poolMax` stays under the grant, including scale-out headroom
- [ ] One pool per process, reused for the process lifetime
- [ ] `connectionTimeoutMillis` is set to fail fast
- [ ] `idleTimeoutMillis` is below the upstream idle-connection timeout
- [ ] Read/write splitting respects replica lag for read-your-writes
- [ ] HTTP agent has a total socket cap, pipelining off, and per-request timeout
- [ ] Saturation ratio and acquire-wait time are exported and alerted

## Anti-patterns

**Sizing the pool from your own worker count.** `poolMax = workers × 2` ignores how many pods will run, so a scale-out multiplies connections past `max_connections` and the database refuses new sessions. Derive it from the shared budget.

**A default 100-connection pool on every pod.** Twenty pods request 2,000 connections against a 200-connection server; the excess waiters time out and look like application errors. Compute the share explicitly.

**A pool created per request.** New sockets per call defeat keep-alive, exhaust upstream connection churn limits, and add a TCP plus TLS handshake to every operation. Construct once at startup.

**No acquire timeout.** When the pool is exhausted, requests queue indefinitely behind the connection budget, latency climbs until every upstream caller times out at once. Fail fast with a clear error.