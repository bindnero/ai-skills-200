---
name: system-design
description: Turns a vague feature request into a written system design with capacity numbers, a data model, component boundaries, named failure modes, and a staged rollout. Use when starting a new service or a cross-cutting feature, when a design review is due before code exists, or when a scaling limit must be reasoned about up front.
---

# System Design

**Use when:** a new service, a feature crossing system boundaries, or a scaling ceiling has to be decided before code is written.
**Do not use when:** the question is where an existing monolith's seam belongs - use `microservices-boundaries`; a single endpoint's contract - use `rest-api-design`.

## Instructions

1. Write the requirements before the architecture: functional (what it does), non-functional (latency, throughput, availability, consistency, cost ceiling), and the explicit non-goals. Most bad designs are a missing non-goal.
2. Estimate the load with arithmetic on the real numbers - peak requests per second, not "high traffic". Derive storage, bandwidth, and connection counts from that estimate and write the derivation down.
3. Pick the data model before the API. Ownership of each table decides which service may write it, and a shared mutable table across services is a distributed lock you did not design.
4. Choose the boundary deliberately and record why the obvious alternative lost. Stateless compute, a single writer per entity, and asynchronous work off the request path are the three defaults worth defending.
5. Name every failure mode before the happy path diagram: dependency down, timeout, partial write, duplicate message, clock skew, retry storm, and one region or one AZ lost.
6. Set a budget per hop. A p99 budget of 300ms spent on database, cache, queue, and third-party calls needs to be divided before anyone optimises the wrong one.
7. Define the consistency model per piece of data, in words a user would accept: "the balance updates immediately, the dashboard may lag up to a minute".
8. Plan the rollout as a sequence - schema, then dark launch, then backfill, then traffic shift, then cleanup - and make every step reversible without a data migration.
9. Write the observability plan with the design: which metric proves each assumption, and what the alert threshold is.
10. Review against the failure list, not the diagram. A design that cannot state what happens when its database is unreachable is not finished.

## Patterns

Capacity arithmetic that constrains the design before any code exists:

```ts
// Peak 2k rps, p99 budget 300ms, reads are 95% of traffic.
const PEAK_RPS = 2000;
const P99_BUDGET_MS = 300;
const CACHE_HIT = 0.9;

// Per-request budget: 120ms DB/cache, 60ms own compute, 80ms third-party, 40ms slack.
const budget = {
  data: 120,      // connection-pool wait + query time; see query-optimization
  compute: 60,
  thirdParty: 80, // every external call needs a deadline below the remaining budget
  slack: P99_BUDGET_MS - (120 + 60 + 80),
};

// Database capacity: 200 rps of misses after the cache, 20 rows per list page.
const dbRps = PEAK_RPS * (1 - CACHE_HIT);
const rowsPerSec = dbRps * 20;
// 30-day retention at 2 KB per row sets the volume for the storage decision.
const storedGb = (rowsPerSec * 60 * 60 * 24 * 30 * 2) / 1024 ** 3;
```

Decision record with the rejected alternative kept in:

```md
## Decision: checkout owns its own database

Context: orders and inventory are read together on every checkout attempt.
Options considered:
  1. Shared orders/inventory schema, single service  - rejected: inventory writes
     would contend with order writes on the same rows.
  2. Checkout owns both tables, orders service reads via API  - rejected: extra hop
     on the hottest path for data that is never edited independently.
  3. Checkout owns orders, inventory service owns stock, event carries reservation.

Decision: 3. Reservation is a saga step; orders row is written `pending` first, then
confirmed on the stock-reserved event, then compensated on payment failure.
Consistency: stock is never oversold (authoritative write in inventory), order status
is eventually consistent by design (documented in the API response schema).
Rollback: flag `checkout.syncInventory=true` restores the synchronous path without a
schema change.
```

## Checklist

- [ ] Functional requirements, non-functional requirements, and non-goals written before the diagram
- [ ] Load estimate derived from peak rps, with storage and connection counts computed from it
- [ ] Latency budget divided across data, compute, and third-party hops with slack
- [ ] Every table has exactly one owning service; no cross-service writes
- [ ] Consistency model stated per data set in user-visible terms
- [ ] Failure modes enumerated: dependency down, timeout, partial write, duplicate message, retry storm, region loss
- [ ] Idempotency keys on every retryable write path
- [ ] Rollout staged, each step reversible without a data migration
- [ ] One metric per assumption, with an alert threshold written down

## Anti-patterns

**Designing the happy path and calling it done.** Every diagram looks good until the dependency is down. Name the failure modes first, then check the design against them.

**"Scalable" with no numbers.** "Scales horizontally" without peak rps, data volume, or a latency budget is a slogan. If nobody can compute the database row count or the connection count, the architecture was picked by taste.

**A shared database across services.** Two services writing one table means every future change is a coordinated deploy, and neither can be scaled or migrated independently. Give each service its own schema.

**Premature decomposition.** Splitting a system into five services before it has any users pays the distributed-systems tax - retries, partial failure, distributed tracing, eventual consistency - for no proven benefit. Split along a real scaling or ownership boundary, and keep the monolith until then.
