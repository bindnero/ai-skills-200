---
name: queue-design
description: Designs message broker topology with topic and partition strategy, consumer groups, delivery guarantees, and dead-letter handling. Use when selecting or configuring SQS, Kafka, RabbitMQ, or BullMQ for inter-service messaging.
---

# Queue Design

**Use when:** choosing a broker type, setting partition or shard counts, defining delivery semantics, or diagnosing ordering and backlog problems.
**Do not use when:** the task is a single deferred unit of work with no stream semantics — use `background-jobs`.

## Instructions

1. Pick the broker from the access pattern. RabbitMQ and SQS give at-least-once delivery with per-queue ordering and consumer groups; Kafka gives replayable partitioned streams and long retention. A notification does not need a log.
2. Size partitions from your parallelism target, not volume. With Kafka, a topic with fewer partitions than consumers caps throughput at the partition count no matter how many consumers you add.
3. Choose the message key before you produce. Keys sharing a partition are processed in order; unkeyed messages are round-robined and can reorder. Key by the entity whose order matters.
4. State the delivery semantic in the queue's contract: at-most-once (drop on failure), at-least-once (the sane default), or effectively-once (at-least-once plus an idempotent consumer).
5. Never rely on exactly-once from the broker. Make the consumer idempotent and document it; this is the most common source of duplicate charges and emails.
6. Cap broker-level retries and then dead-letter. Infinite redelivery hides a poison message and starves everything behind it.
7. Set visibility timeouts longer than p99 handler duration, or extend them for long work, or the same message is redelivered while the first attempt still runs.
8. Alert on consumer lag, oldest-unprocessed age, and DLQ depth. A queue processing at full capacity but 20 minutes behind is an outage in slow motion.
9. Version message schemas additively; a message in flight during a deploy may be read by the new consumer.

## Patterns

Kafka topology sized from measured throughput, with keyed ordering:

```properties
# 40 partitions: 34,000 msg/s peak / 850 per-partition p99 = 40. Planned consumer
# concurrency is 24, below the partition count, leaving rebalance headroom.
orders.events.partitions=40
orders.events.replication.factor=3
orders.events.min.insync.replicas=2
orders.events.retention.ms=604800000

# Long handlers must not trigger rebalance storms.
max.poll.interval.ms=1800000
session.timeout.ms=45000
max.poll.records=200
```

Producer that preserves per-order ordering and states its guarantees:

```ts
import { Kafka, logLevel } from "kafkajs";

const kafka = new Kafka({ clientId: "orders-api", brokers: [process.env.KAFKA_BROKERS!], logLevel: logLevel.WARN });
const producer = kafka.producer({ idempotent: true, maxInFlightRequests: 5, transactionTimeout: 30_000 });

export async function publishOrderEvent(event: OrderEvent): Promise<void> {
  await producer.send({
    topic: "orders.events",
    acks: -1, // all in-sync replicas
    timeout: 30_000,
    messages: [
      {
        // Key = entity id, so all events for one order share a partition and stay
        // ordered. Unkeyed messages round-robin and may be reordered.
        key: event.orderId,
        value: JSON.stringify(event),
        headers: {
          "event-id": event.id,                 // consumer idempotency key
          "event-type": event.type,              // additive: ignore unknown types
          "schema-version": "2",
          "occurred-at": event.occurredAt,
        },
        timestamp: String(Date.parse(event.occurredAt)),
      },
    ],
  });
}
```

SQS with visibility timeout, redrive policy, and FIFO deduplication:

```json
{
  "Attributes": {
    "VisibilityTimeout": "180",
    "MessageRetentionPeriod": "1209600",
    "ReceiveMessageWaitTimeSeconds": "20"
  },
  "RedrivePolicy": {
    "deadLetterTargetArn": "arn:aws:sqs:us-east-1:1234:emails-dlq",
    "maxReceiveCount": 5
  }
}
```

```json
{
  "FifoQueue": true,
  "ContentBasedDeduplication": false,
  "DeduplicationScope": "messageGroup",
  "FifoThroughputLimit": "perQueue"
}
```

Idempotent consumer with jittered retries, DLQ routing, and lag metrics:

```ts
const CONSUMER_GROUP = "fulfillment-v3";
const MAX_ATTEMPTS = 6;

export async function startConsumer(): Promise<void> {
  const consumer = kafka.consumer({ groupId: CONSUMER_GROUP });
  await consumer.connect();
  await consumer.subscribe({ topic: "orders.events", fromBeginning: false });

  await consumer.run({
    partitionsConsumedConcurrently: 8, // must be <= partition count
    eachMessage: async ({ topic, partition, message }) => {
      const event = JSON.parse(message.value!.toString()) as OrderEvent;
      const attempt = Number(message.headers?.["x-retry-count"] ?? 0);

      metrics.gauge("consumer.lag_ms", { topic, partition }, Date.now() - Number(message.timestamp));

      try {
        await handleOrderEvent(event, { idempotencyKey: String(message.headers?.["event-id"]) });
        return; // commit only after the handler succeeds
      } catch (err) {
        if (err instanceof PermanentError) {
          await deadLetter({ topic, partition, offset: message.offset, reason: err.message, event });
          return; // retrying a validation failure is pure waste
        }
        if (attempt >= MAX_ATTEMPTS) {
          await deadLetter({ topic, partition, offset: message.offset, reason: String(err), event });
          metrics.increment("consumer.deadlettered", { topic, reason: "retries_exhausted" });
          return;
        }

        // Full jitter: synchronized retries re-create the overload that caused them.
        const delayMs = Math.min(60_000, 500 * 2 ** attempt) * (0.5 + Math.random());
        await dlq.requeue({ topic, partition, offset: message.offset, headers: { "x-retry-count": String(attempt + 1) }, delayMs });
        metrics.increment("consumer.retried", { topic, attempt: attempt + 1 });
      }
    },
  });
}

// At-least-once means this runs more than once; the key makes that safe.
async function handleOrderEvent(event: OrderEvent, ctx: { idempotencyKey: string }): Promise<void> {
  await runIdempotent("consumer", ctx.idempotencyKey, { method: "POST", path: "/internal/fulfil", body: event }, async (tx) => {
    const order = await tx.order.update({ where: { id: event.orderId }, data: { status: "ready_to_fulfil", version: { increment: 1 } } });
    return { status: 200, headers: {}, body: { id: order.id } };
  });
}
```

## Checklist

- [ ] Broker type chosen from access pattern: work queue versus replayable stream
- [ ] Partition or shard count derived from measured per-partition throughput
- [ ] Message key chosen to preserve the ordering that actually matters
- [ ] Delivery semantic stated explicitly, with at-least-once as the default
- [ ] Every consumer is idempotent; exactly-once is not assumed from the broker
- [ ] Retry count is capped and terminal failures land in a DLQ with the payload
- [ ] Visibility timeout or max-poll interval exceeds p99 handler duration
- [ ] Consumer lag, oldest-message age, and DLQ depth are alerting metrics

## Anti-patterns

**More consumers than partitions.** With 6 partitions and 20 consumers, 14 idle, and every rebalance stops the whole group. Size partitions to the concurrency target and keep concurrency below partition count for headroom.

**Unkeyed messages on an ordering-sensitive topic.** Without a key the producer round-robins, so `order.created` can be consumed after `order.cancelled` on different partitions. Key by the entity whose sequence matters.

**Broker default visibility timeout with long handlers.** A 30-second default against a 90-second handler redelivers the message while the first attempt still runs, duplicating side effects. Extend the timeout or lease the message.

**Infinite redelivery instead of a DLQ.** One malformed message cycles forever, consuming a concurrency slot and starving everything behind it. Cap retries, route to a DLQ with headers and original payload, and alert.