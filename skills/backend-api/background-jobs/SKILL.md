---
name: background-jobs
description: Runs slow or retrying work outside the request cycle with a durable queue, idempotent handlers, and exponential backoff. Use when responding fast matters but the work needs retries, scheduling, or fan-out.
---

# Background Jobs

**Use when:** the request must return before the work completes, or the work needs retries, delay, or fan-out over many items.
**Do not use when:** the operation fits comfortably inside the request budget — see `queue-design` for the broker primitives.

## Instructions

1. Enqueue in the same transaction as the state change that justifies the job, via an outbox table. Enqueueing after commit loses the job on a crash between the two.
2. Accept the request only after the job is durably persisted. Otherwise a `202` is a lie and the client retries forever.
3. Make every handler idempotent on a job id, and assume at-least-once delivery; a crash after the side effect but before the ack means redelivery.
4. Retry with exponential backoff plus full jitter, cap the attempts, and move exhausted jobs to a dead-letter table for inspection.
5. Bound the queue. Without a visibility timeout, a job whose worker dies mid-flight is never redelivered and the queue depth hides the leak.
6. Cap attempt duration well below the visibility timeout, and renew the lease for long jobs, or the handler is killed while still working.
7. Classify errors: only transient failures (timeouts, 429, 5xx) retry. A validation failure retried five times just burns quota and delays the alert.
8. Never assume ordering across workers. Carry an aggregate key and enforce sequence in the handler where order actually matters.
9. Instrument queue depth, oldest job age, attempt count, and DLQ size. Queue depth alone hides a backlog that is draining fine.

## Patterns

Enqueue inside the write transaction, then relay:

```sql
CREATE TABLE job_outbox (
  id            bigserial  PRIMARY KEY,
  queue         text       NOT NULL,
  payload       jsonb      NOT NULL,
  dedupe_key    text,
  status        text       NOT NULL DEFAULT 'pending',
  attempts      int        NOT NULL DEFAULT 0,
  run_at        timestamptz NOT NULL DEFAULT now(),
  locked_until  timestamptz,
  locked_by     text,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX job_outbox_dedupe_idx ON job_outbox (queue, dedupe_key) WHERE dedupe_key IS NOT NULL;
```

```ts
export async function enqueueOrderFulfilment(orderId: string) {
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { fulfilment: "queued" } });
    // Dedupe key makes a retried request enqueue exactly one job.
    await tx.jobOutbox.create({ data: { queue: "fulfilment", dedupeKey: `fulfil:${orderId}`, payload: { orderId } } });
  });
}

export async function relayJobs(queue: string, limit = 100): Promise<number> {
  const rows = await db.$queryRaw<JobRow[]>`
    SELECT * FROM job_outbox
     WHERE queue = ${queue} AND status = 'pending' AND run_at <= now() AND (locked_until IS NULL OR locked_until < now())
     ORDER BY run_at LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
  if (rows.length === 0) return 0;

  await db.jobOutbox.updateMany({
    where: { id: { in: rows.map((r) => Number(r.id)) } },
    data: { status: "inflight", lockedUntil: new Date(Date.now() + 60_000), lockedBy: `relay-${process.pid}` },
  });
  return rows.length;
}
```

Idempotent handler with jittered backoff and a dead-letter table:

```ts
const TRANSIENT = /timeout|ECONNRESET|EAI_AGAIN|429|50\d/;

export async function handleFulfilment(job: Job): Promise<void> {
  const claimed = await db.jobOutbox.updateMany({
    where: { id: job.id, status: "inflight" },  // the ack CAS: only one worker proceeds
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return;

  try {
    await db.$transaction(async (tx) => {
      const inserted = await tx.processedJob.createMany({ data: [{ jobId: String(job.id), queue: job.queue }], skipDuplicates: true });
      if (inserted.count === 0) return;                 // already applied; ack and move on
      await tx.shipment.create({ data: { orderId: job.payload.orderId, carrier: await pickCarrier(job.payload.orderId) } });
    });
    await db.jobOutbox.update({ where: { id: job.id }, data: { status: "done" } });
  } catch (err) {
    const message = String(err);
    const attempts = job.attempts + 1;

    if (!TRANSIENT.test(message) || attempts >= 8) {
      await db.$transaction([
        db.jobOutbox.update({ where: { id: job.id }, data: { status: "dead", lastError: message.slice(0, 2000) } }),
        db.deadLetter.create({ data: { jobId: String(job.id), queue: job.queue, payload: job.payload, error: message } }),
      ]);
      await pager.alert({ title: `Job ${job.id} dead-lettered`, queue: job.queue, attempts, error: message });
      return;
    }

    // Full jitter avoids the thundering herd where every failed job retries in lockstep.
    const delay = Math.min(3600_000, 1000 * 2 ** attempts) * Math.random();
    await db.jobOutbox.update({ where: { id: job.id }, data: { status: "pending", runAt: new Date(Date.now() + delay), lockedUntil: null, lastError: message.slice(0, 2000) } });
    metrics.increment("job.retry", { queue: job.queue, attempt: attempts });
  }
}
```

## Checklist

- [ ] Job row is written in the same transaction as the triggering state change
- [ ] The request returns success only after the job is durably persisted
- [ ] Handlers dedupe on job id before applying side effects
- [ ] Retries use exponential backoff with full jitter and a hard attempt cap
- [ ] Non-transient failures skip straight to the dead-letter path
- [ ] A visibility timeout exists and lease renewal covers long jobs
- [ ] Queue depth, oldest job age, and DLQ size are alerting metrics
- [ ] Exhausted jobs are queryable with their payload and last error

## Anti-patterns

**`setTimeout` or in-process `queue` for durable work.** The pod restarts, the timer dies, and the job is silently lost with no retry and no record. Use a durable queue or an outbox table.

**Enqueuing after the response is sent.** A crash between commit and enqueue leaves committed state with no job, and no queue depth to alert on. Enqueue inside the transaction.

**Unbounded retries with no DLQ.** A permanently failing job retries forever, the worker never frees, and the real cause is buried under identical stack traces. Cap attempts and inspect the dead letters.

**Assuming FIFO across workers.** Two workers pulling the same queue can process a follow-up before the job it depends on, so the second fails on missing state. Carry an aggregate key and sequence in the handler.