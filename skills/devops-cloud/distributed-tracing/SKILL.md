---
name: distributed-tracing
description: Instruments distributed traces with OpenTelemetry spans, W3C trace context propagation, span links for asynchronous work and controlled sampling. Use when adding tracing to a service, debugging latency across service or queue boundaries, or when traces are missing hops.
---

# Distributed Tracing

**Use when:** Adding tracing to a service, following a request across services or queues, or when traces are missing hops and end-to-end latency is unexplained.
**Do not use when:** You need per-request log lines rather than timing relationships; use `structured-logging` for that.

## Instructions

1. Start with OpenTelemetry auto-instrumentation to get HTTP, database and messaging spans without writing code, then add manual spans only for genuinely business-significant operations.
2. Propagate W3C `traceparent` across every boundary: HTTP headers, SQS message attributes, Kafka headers, and database comment fields where a query triggers a callback.
3. Follow the span naming convention `<operation>.<object>` and never include ids or user data in a span name, because span names are low-cardinality by design and become the primary grouping key.
4. Mark errors explicitly with `recordException` plus `SpanStatusCode.ERROR`, so error status reaches the sampler and the backend.
5. Use span links, not parent-child relationships, for asynchronous fan-out such as queue producers, batch jobs and scheduled tasks. Forcing a parent link across a queue invents causality that did not happen and skews every duration calculation.
6. Sample deliberately. Parent-based sampling plus a ratio is fine for low-volume services; for high-volume services, tail-sample in the Collector so errors and slow spans are always kept.
7. Put a strict bound on span attributes. Every attribute is stored per span, and a user id or SQL statement repeated across millions of spans is a large, useless bill.
8. Record semantic-convention attributes such as `http.request.method` and `http.response.status_code` so the backend's out-of-the-box views work.
9. Propagate baggage only for values you genuinely filter on, and never for secrets or PII; baggage is recorded in exporters and is visible to anyone with trace access.
10. Verify end to end with a test that asserts one trace id across two services and one queue hop, so instrumentation regressions are caught in CI.

## Patterns

Context propagation through an SQS message so the consumer joins the producer's trace:

```typescript
import { context, propagation, trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";

export async function publishOrder(order: Order) {
  await sqs.sendMessage({
    QueueUrl: process.env.ORDER_QUEUE_URL!,
    MessageBody: JSON.stringify(order),
    MessageAttributes: carrierHeaders(), // built from propagation.inject(context.active(), ...)
  });
}

export async function consumeOrder(record: SQSRecord) {
  const parent = propagation.extract(context.active(), carrierFromAttributes(record.messageAttributes));
  const span = tracer.startSpan(
    "order.process",
    { kind: SpanKind.CONSUMER, attributes: { "messaging.system": "aws.sqs", "messaging.message.id": record.messageId } },
    parent
  );

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      await handleOrder(JSON.parse(record.body));
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}
```

Using links instead of parenting for fan-out producers, so queue latency is not attributed to a request:

```typescript
export async function fanOut(eventIds: string[]) {
  const links = eventIds.map(() => ({
    context: trace.getSpanContext(context.active())!,
    attributes: { "link.type": "produce", "messaging.destination": "fanout" },
  }));

  await tracer.startActiveSpan(
    "fanout.publish",
    { kind: SpanKind.PRODUCER, links, attributes: { "messaging.message.count": eventIds.length } },
    (span) => span.end()
  );
}
```

A Collector tail-sampling configuration that keeps what matters and drops the rest:

```yaml
processors:
  tail_sampling:
    decision_wait: 30s
    num_traces: 100000
    policies:
      - name: errors
        type: status_code
        status_code: { status_codes: [ERROR, UNSET] }
      - name: slow
        type: latency
        latency: { threshold_ms: 500 }
      - name: important-routes
        type: string_attribute
        string_attribute: { key: "route", values: ["/v1/checkout", "/v1/login"] }
      - name: baseline
        type: probabilistic
        probabilistic: { sampling_percentage: 10 }
```

## Checklist

- [ ] Auto-instrumentation enabled before any manual spans are written
- [ ] `traceparent` propagated over HTTP, queues and any callback boundary
- [ ] Span names follow `<operation>.<object>` with no ids or user data
- [ ] Errors call `recordException` and set status to `ERROR`
- [ ] Async fan-out uses span links rather than fabricated parent-child
- [ ] Sampling keeps errors, slow spans and important routes unconditionally
- [ ] Attribute count bounded; no PII or secrets in spans or baggage
- [ ] Semantic-convention attributes set so backend defaults work

## Anti-patterns

- **Parenting a producer span to the consumer's request across a queue.** The queue wait time becomes request latency and every duration in the trace is wrong. Use span links for asynchronous boundaries.
- **Auto-instrumentation plus a manual span on the same call.** You get duplicate spans, doubled latency and a trace harder to read than no trace. Turn instrumentation off per-operation where you instrument manually.
- **100 percent sampling in production.** Storage and ingest cost explode and high-volume traces bury the interesting ones. Tail-sample on error and latency in the Collector.
- **Putting user ids or SQL statements in span attributes.** Attributes are stored per span, so this multiplies cost by traffic and creates a PII retention problem in the tracing backend. Reference the user in logs instead.
- **Propagating context only on the HTTP hop.** The moment a request enters a queue the trace splits and you cannot see where the time went. Propagate through message attributes and test both sides extract correctly.