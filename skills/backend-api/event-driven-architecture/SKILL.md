---
name: event-driven-architecture
description: Decouples services with a transactional outbox, sagas, and idempotent consumers over a durable event log. Use when splitting a monolith, introducing asynchronous workflows, or coordinating multi-service transactions.
---

# Event-Driven Architecture

**Use when:** work must span multiple services without a shared transaction, or you need to decouple producers from consumers that fail independently.
**Do not use when:** one service can complete the operation in a single database transaction — keep it simple and local.

## Instructions

1. Publish through a transactional outbox. Write the domain change and the event row in one transaction, then relay to the broker; this is the only way to avoid losing an event between commit and publish.
2. Make consumers idempotent and assume at-least-once. A crash between the side effect and the offset commit guarantees redelivery.
3. Design events as facts in the past tense (`OrderPlaced`, `PaymentCaptured`), not commands. Events are immutable with many consumers; commands have one recipient and expect a reply.
4. Include a minimal envelope: `eventId` as idempotency key, `type`, `schemaVersion`, `occurredAt`, `producer`, `correlationId`, `causationId`.
5. Use sagas for multi-service workflows and define the compensating action next to each forward action; distributed transactions are not an option.
6. Publish purpose-built payloads. Never mirror internal rows with private schema and database identifiers you would want to change.
7. Keep consumers version-tolerant, since producers and consumers deploy independently; ignore unknown types and evolve additively.
8. Keep the read model a pure function of the log so "rebuild from scratch" is a supported operation you can run for real.
9. Document the delivery guarantee per topic. "We use Kafka" says nothing about ordering scope, retention, or duplicate behaviour.

## Patterns

Transactional outbox that cannot lose an event:

```sql
CREATE TABLE outbox (
  id             bigserial   PRIMARY KEY,
  aggregate_type text        NOT NULL,
  aggregate_id   text        NOT NULL,
  event_type     text        NOT NULL,
  schema_version int         NOT NULL DEFAULT 1,
  payload        jsonb       NOT NULL,
  correlation_id uuid        NOT NULL,
  causation_id   uuid,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  published_at   timestamptz,
  attempts       int         NOT NULL DEFAULT 0
);
CREATE INDEX outbox_unpublished_idx ON outbox (id) WHERE published_at IS NULL;
```

```ts
export async function placeOrder(input: PlaceOrderInput): Promise<Order> {
  return db.$transaction(async (tx) => {
    const order = await tx.order.create({ data: { ...input, status: "pending" } });

    // Same transaction: either both the order and the event exist, or neither does.
    await tx.outbox.create({
      data: {
        aggregateType: "order",
        aggregateId: order.id,
        eventType: "OrderPlaced",
        // Purpose-built payload, not the internal order row.
        payload: { orderId: order.id, customerId: order.customerId, totalMinor: order.totalMinor, currency: order.currency, lineCount: order.lines.length },
        correlationId: randomUUID(),
      },
    });

    return order;
  });
}

export async function relayOutbox(batchSize = 200): Promise<{ published: number }> {
  const rows = await db.$queryRaw<OutboxRow[]>`
    SELECT * FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`;
  if (rows.length === 0) return { published: 0 };

  await broker.send({
    topic: "order.events",
    messages: rows.map((r) => ({
      key: r.aggregate_id, // keyed by aggregate: per-order ordering preserved
      value: JSON.stringify({
        eventId: `outbox-${r.id}`, type: r.event_type, schemaVersion: r.schema_version,
        occurredAt: r.occurred_at.toISOString(), producer: "orders-service",
        correlationId: r.correlation_id, causationId: r.causation_id, data: r.payload,
      }),
      headers: { "event-type": r.event_type, "schema-version": String(r.schema_version) },
    })),
  });

  await db.outbox.updateMany({ where: { id: { in: rows.map((r) => Number(r.id)) } }, data: { publishedAt: new Date() } });
  return { published: rows.length };
}
```

Idempotent consumer tolerant of unknown types:

```ts
type OrderPlaced = { eventId: string; type: string; schemaVersion: 1 | 2; correlationId: string; data: { orderId: string; customerId: string; lineCount: number; warehouseId?: string } };

export async function consumeOrderEvent(raw: string): Promise<void> {
  const envelope = JSON.parse(raw) as OrderPlaced;

  // A consumer from last month must not crash on a newly added event type.
  if (envelope.type !== "OrderPlaced") {
    metrics.increment("consumer.event_ignored", { type: envelope.type });
    return;
  }

  const applied = await db.$transaction(async (tx) => {
    // Dedupe in the same transaction as the side effect: no gap between the two.
    const inserted = await tx.processedEvent.createMany({
      data: [{ eventId: envelope.eventId, consumer: "inventory-projection", processedAt: new Date() }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) return false;

    await tx.inventoryReservation.upsert({
      where: { orderId: envelope.data.orderId },
      create: { orderId: envelope.data.orderId, lineCount: envelope.data.lineCount, warehouseId: envelope.data.warehouseId ?? "default" },
      update: { lineCount: envelope.data.lineCount },
    });
    return true;
  });

  metrics.increment(applied ? "consumer.event_applied" : "consumer.event_duplicate", { type: envelope.type });
}
```

Saga with an explicit compensating step per forward action:

```ts
type SagaStep = { name: string; execute: () => Promise<void>; compensate: () => Promise<void> };

export async function runSaga(steps: SagaStep[], sagaId: string): Promise<void> {
  const completed: SagaStep[] = [];

  for (const step of steps) {
    try {
      await step.execute();
      completed.push(step);
      await sagaStore.record(sagaId, { step: step.name, state: "completed" });
    } catch (err) {
      await sagaStore.record(sagaId, { step: step.name, state: "failed", error: String(err) });

      // Compensate in reverse. Compensations can themselves fail, so each is
      // retried independently and the saga parks for manual intervention.
      for (const done of completed.reverse()) {
        try {
          await done.compensate();
          await sagaStore.record(sagaId, { step: done.name, state: "compensated" });
        } catch (compErr) {
          await sagaStore.record(sagaId, { step: done.name, state: "compensation_failed", error: String(compErr) });
          await pager.alert({ title: `Saga ${sagaId} needs manual compensation`, step: done.name, error: String(compErr) });
        }
      }
      throw err;
    }
  }
}
```

## Checklist

- [ ] Events are published through an outbox committed with the state change
- [ ] Every consumer dedupes on `eventId` in the same transaction as its side effect
- [ ] Events are past-tense facts with a documented delivery guarantee per topic
- [ ] Envelope carries `eventId`, `type`, `schemaVersion`, `occurredAt`, and `correlationId`
- [ ] Multi-service workflows use a saga with a compensation defined per step
- [ ] Events expose no internal database identifiers or private schema
- [ ] Consumers ignore unknown types and evolve additively across deploys
- [ ] Outbox relay lag and consumer lag are alerting metrics

## Anti-patterns

**Publishing directly to the broker after commit.** Between the commit and the publish there is a window where a crash loses the event permanently, and no consumer will ever know. Use an outbox.

**Publishing events that mirror internal rows.** Emitting a full `users` row with internal ids and `deleted_at` locks every consumer to your schema; the first column rename breaks them.

**Assuming exactly-once from the broker.** Consumers crash after committing a side effect but before committing the offset, so the message is redelivered. Without an `eventId` dedupe record, the customer is charged twice.

**Commands published as events with one silent consumer.** Broadcasting `ShipOrder` and hoping one service picks it up turns a missing consumer into silent data loss with no queue to inspect. Send commands to a named queue.