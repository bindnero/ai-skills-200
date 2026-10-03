---
name: serverless-functions
description: Designs and hardens AWS Lambda and Cloud Run functions with idempotency keys, SQS partial batch failure handling, reserved concurrency, DLQs and cold-start mitigation. Use when writing a serverless handler, processing an event stream, or debugging timeouts and duplicate invocations.
---

# Serverless Functions

**Use when:** Writing or hardening a function-as-a-service handler — Lambda, Cloud Run functions — that processes events, queues or HTTP requests.
**Do not use when:** The function is a long-running service with its own container lifecycle; use `aws-deployment` or `gcp-deployment` for platform-level placement.

## Instructions

1. Assume at-least-once delivery everywhere. Make the handler idempotent with a business key (an idempotency key header, an event ID) and a unique constraint in the datastore, not with in-memory state.
2. Handle partial batch failure explicitly: return `{"batchItemFailures": [...]}` for SQS and Kinesis so unprocessed records go back to the queue instead of being dropped or retried wholesale.
3. Separate fast acknowledgement from slow work. Persist the message and return within the timeout budget; process on a queue or workflow when the job exceeds a few seconds.
4. Set the timeout deliberately rather than accepting the default, and configure a DLQ plus destination-on-failure so failed invocations are inspectable instead of vanishing after the retry limit.
5. Bound concurrency with a reserved concurrency setting on the critical path. Unbounded fan-out from SQS is the most common cause of a self-inflicted downstream outage.
6. Tune memory to CPU deliberately: in Lambda, memory scales CPU roughly linearly, so a memory-starved handler shows up as unexplained timeouts.
7. Mitigate cold starts by bundling to a single file with esbuild or SAM, keeping handler modules small, moving initialisation into module scope, and using SnapStart or provisioned concurrency only where measured latency demands it.
8. Emit structured JSON logs with a request or correlation ID and set `tracing` to `Active` so invocations join existing traces.
9. Validate every event payload against a schema and reject early with a clear error. Malformed events reaching business logic produce inconsistent failures that cannot be reproduced.
10. Test the handler with real recorded event fixtures through SAM local or a Node harness, not with hand-written guesses at the payload shape.

## Patterns

An idempotent SQS consumer using partial batch failure and early acknowledgement:

```typescript
export const handler = async (event: OrderEvent[]) => {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  const jobs: Promise<void>[] = [];

  for (const record of event) {
    let payload: OrderPayload;
    try {
      payload = JSON.parse(record.Body);
    } catch {
      // Unparseable body will never succeed; requeuing it loops forever.
      console.error(JSON.stringify({ level: "error", msg: "unparseable body", id: record.MessageId }));
      continue;
    }

    jobs.push(
      processOrder(payload).catch((err) => {
        batchItemFailures.push({ itemIdentifier: record.MessageId });
        console.error(JSON.stringify({ level: "error", msg: "order failed", orderId: payload.orderId, err: String(err) }));
      })
    );
  }

  await Promise.all(jobs);
  return { batchItemFailures };
};

async function processOrder(order: OrderPayload) {
  // Uniqueness on orderId makes redelivery a no-op rather than a double charge.
  await db.orders.insertOnConflictIgnore({
    orderId: order.orderId,
    customerId: order.customerId,
    totalCents: order.totalCents,
    status: "received",
  });
}
```

A SAM definition with reserved concurrency, DLQ, SnapStart and partial batch reporting wired together:

```yaml
Globals:
  Function:
    Runtime: nodejs22.x
    Architectures: [arm64]
    MemorySize: 1024
    Timeout: 15
    Tracing: Active
    Environment:
      Variables:
        POWERTOOLS_SERVICE_NAME: checkout
        NODE_OPTIONS: "--enable-source-maps"

Resources:
  ProcessOrder:
    Type: AWS::Serverless::Function
    Properties:
      Handler: dist/handler.processOrder
      CodeUri: ./
      DeadLetterQueue:
        Type: SQS
        DeadLetterQueueArn: !GetAtt Dlq.Arn
      ReservedConcurrentExecutions: 100
      SnapStart:
        ApplyOn: PublishedVersions
      Events:
        OrderQueue:
          Type: SQS
          Properties:
            QueueArn: !GetAtt OrderQueue.Arn
            BatchSize: 10
            FunctionResponseTypes: [ReportBatchItemFailures]
            MaximumBatchingWindowInSeconds: 5
```

## Checklist

- [ ] Handler is idempotent via a business key and a datastore uniqueness constraint
- [ ] Partial batch failure reported for SQS and Kinesis sources
- [ ] Timeout set deliberately; DLQ or `onFailure` destination configured
- [ ] Reserved concurrency applied to every consumer of a shared downstream
- [ ] Memory and CPU tuned from measurements, not defaults
- [ ] Initialisation hoisted to module scope; bundle is a single file with source maps
- [ ] Structured JSON logs with correlation IDs and tracing active
- [ ] Payloads schema-validated and malformed events rejected explicitly

## Anti-patterns

- **Assuming exactly-once delivery.** SQS, SNS and EventBridge all deliver at least once, and retries are routine. Without an idempotency key and a unique constraint, every retry is a duplicate charge or a duplicate row.
- **Ignoring `batchItemFailures` and returning success.** Failed records are silently dropped and the data is gone with no DLQ entry and no alarm. Return the failed identifiers so the queue re-delivers them.
- **A 900-second Lambda doing a 30-second job of work.** Timeout and memory are the only cost and concurrency knobs, and long functions hold capacity queues need. Acknowledge fast and process asynchronously.
- **Re-initialising the database client inside the handler.** A new connection pool per invocation exhausts the database and the handler fails on the first warm call. Initialise once in module scope and reuse it.
- **`Promise.all` over an unbounded array.** Ten thousand concurrent calls to a downstream API is a self-inflicted outage. Bound concurrency with a worker pool and a queue in front.