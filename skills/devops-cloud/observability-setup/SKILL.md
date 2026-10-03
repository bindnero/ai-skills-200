---
name: observability-setup
description: Wires end-to-end observability with OpenTelemetry auto-instrumentation, a Collector, Prometheus, Grafana, Loki and Tempo plus real health endpoints. Use when adding telemetry to a service, standing up a metrics/log/trace pipeline, or turning on readiness and liveness probes.
---

# Observability Setup

**Use when:** Adding telemetry to a service, standing up a metrics/log/trace collection pipeline, or implementing health and readiness endpoints.
**Do not use when:** You are choosing SLIs, targets or alert thresholds for the resulting signals; use `sre-slos` and `metrics-and-alerting` for that.

## Instructions

1. Use OpenTelemetry auto-instrumentation first. Zero-code instrumentation covers HTTP, database and messaging spans before you write a single manual span.
2. Set resource attributes at process start — `service.name`, `service.version`, `deployment.environment.name` — because these become your primary filtering dimensions.
3. Propagate W3C `traceparent` across every hop, and verify with a test that asserts a trace id survives a queue and a service boundary.
4. Deploy the Collector as a DaemonSet for host metrics and logs and a Deployment for trace and metrics routing, with memory limits and a health check endpoint.
5. Scrape on a schedule matched to your SLO window. Sub-15-second intervals cost storage without meaningfully improving detection.
6. Use exemplars to link histograms to traces, so a latency spike is answered by opening the actual slow request rather than guessing.
7. Implement three distinct endpoints: `/health/live` for process liveness only, `/health/ready` for readiness including critical dependencies with bounded timeouts, and `/health/startup` for slow-booting services.
8. Keep health checks unauthenticated on a dedicated port and never expose secrets, version strings or dependency hostnames in the response body.
9. Sample traces deliberately: head sampling at the SDK for low-volume services, tail sampling in the Collector for high-volume ones so errors and high latency are always kept.
10. Instrument with the RED method by default — request rate, error rate, duration — and add business counters only for the operations you would page on.

## Patterns

Node SDK bootstrap with resource attributes, OTLP export and W3C propagation:

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME!,
    [ATTR_SERVICE_VERSION]: process.env.APP_VERSION ?? "dev",
    "deployment.environment.name": process.env.DEPLOY_ENV ?? "local",
  }),
  textMapPropagator: new W3CTraceContextPropagator(),
  traceExporter: new OTLPTraceExporter({ url: "http://otel-collector:4318/v1/traces" }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: "http://otel-collector:4318/v1/metrics" }),
    exportIntervalMillis: 15000,
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
process.on("SIGTERM", async () => {
  await sdk.shutdown();
  process.exit(0);
});
```

A Collector config that batches, tail-samples and routes all three signals:

```yaml
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }

processors:
  memory_limiter:
    check_interval: 1s
    limit_percentage: 80
    spike_limit_percentage: 20
  tail_sampling:
    decision_wait: 10s
    policies:
      - { name: errors, type: status_code, status_code: { status_codes: [ERROR] } }
      - { name: slow, type: latency, latency: { threshold_ms: 1000 } }
      - { name: baseline, type: probabilistic, probabilistic: { sampling_percentage: 10 } }
  batch: { send_batch_size: 8192, timeout: 5s }

exporters:
  otlphttp/tempo: { endpoint: http://tempo:4318 }
  prometheus:
    endpoint: 0.0.0.0:8889
    resource_to_telemetry_conversion: { enabled: true }
  prometheusremotewrite: { endpoint: http://prometheus:9090/api/v1/write }

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, tail_sampling, batch]
      exporters: [otlphttp/tempo]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus, prometheusremotewrite]
```

Health endpoints with genuinely different semantics, so probes cannot cause an outage:

```typescript
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!, { lazyConnect: true, connectTimeout: 500 });

// Liveness answers only: can this process respond at all? Never checks dependencies.
export async function live() {
  return Response.json({ status: "ok" });
}

// Readiness gates traffic, so it may check dependencies, with a hard timeout.
export async function ready() {
  try {
    const pong = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 800)),
    ]);
    return Response.json({ status: pong === "PONG" ? "ok" : "degraded" },
      { status: pong === "PONG" ? 200 : 503 });
  } catch {
    return Response.json({ status: "degraded" }, { status: 503 });
  }
}
```

## Checklist

- [ ] `service.name`, `service.version` and environment set as resource attributes
- [ ] W3C `traceparent` verified to survive queue and service boundaries
- [ ] Collector deployed with memory limiter, batching and a health check
- [ ] Three distinct endpoints: `/health/live`, `/health/ready`, `/health/startup`
- [ ] Liveness checks no dependencies; readiness has a bounded timeout
- [ ] Health port carries no auth requirement and leaks no secrets or hostnames
- [ ] Trace sampling keeps errors and high latency unconditionally
- [ ] RED metrics instrumented on every inbound request path

## Anti-patterns

- **A single `/health` endpoint returning 200 regardless of state.** The load balancer then routes traffic into a process that cannot serve it, and the outage is caused by your own health check. Separate liveness from readiness.
- **Liveness probing the database.** When the database blips, every replica restarts at once and a dependency outage becomes a full outage. Liveness must prove only that the process works.
- **100 percent trace sampling.** Storage cost explodes and high-volume traces drown out the ones that matter. Tail-sample on error and latency, and keep a small baseline.
- **Logs without a service name or version.** Once two deployments run side by side, unattributed logs are unsearchable. Set resource attributes at the process, not per call site.
- **Scrape intervals of 1 second.** It multiplies cardinality and storage cost without shortening detection time. Match the interval to your fastest SLO window.