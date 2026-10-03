---
name: structured-logging
description: Emits machine-parseable JSON logs conforming to the OpenTelemetry log data model with correlation IDs, level discipline, redaction and sampling. Use when replacing print statements with real logs, correlating logs with traces, or a log pipeline is failing to ingest or leak secrets.
---

# Structured Logging

**Use when:** Replacing ad-hoc console output with parseable JSON logs, correlating logs with traces, or fixing a log pipeline that drops fields or leaks sensitive data.
**Do not use when:** You need metrics or traces rather than events; use `metrics-and-alerting` and `distributed-tracing` for those signals.

## Instructions

1. Emit one JSON object per line with a fixed envelope: `@timestamp`, `level`, `message`, `service`, `version`, `environment`, plus your own fields. Never build log strings by concatenation.
2. Use the OpenTelemetry log data model field names, or ECS, and map them once in the collector so queries work regardless of implementation language.
3. Attach `trace_id` and `span_id` to every record automatically via the logger's OpenTelemetry integration, not by passing IDs around by hand.
4. Propagate an inbound `traceparent` or `X-Request-Id` into the logging context so one user action yields one searchable thread across services.
5. Reserve levels for meaning: `ERROR` means a human must act, `WARN` means degraded but self-correcting, `INFO` for lifecycle and business events, `DEBUG` for diagnostics that are off in production.
6. Put variable context in structured fields, not in the message. Log `"order_id": "abc"` not `"Order abc failed"`, so the field is filterable and aggregatable.
7. Redact at the logger, not at the call site. Maintain a deny-list of key names and mask values in the formatter so a new call site cannot leak.
8. Convert thrown exceptions into structured fields with type, message and stack, and log the exception rather than `String(err)`, which flattens everything.
9. Sample high-frequency success logs with a configurable rate, and always log errors, warnings and audit-relevant events at full rate.
10. Write multiline exceptions as a single JSON record and let the collector handle continuation lines, so stack traces do not break ingestion.

## Patterns

A logger with automatic trace correlation, level discipline and redaction:

```typescript
import { trace, context } from "@opentelemetry/api";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const REDACT = new Set([
  "password", "token", "authorization", "cookie",
  "secret", "api_key", "access_token", "refresh_token", "card_number",
]);

function redact(input: unknown, depth = 0): unknown {
  if (depth > 6 || input === null || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).map(([k, v]) =>
      REDACT.has(k.toLowerCase()) ? [k, "[REDACTED]"] : [k, redact(v, depth + 1)]
    )
  );
}

export function log(level: Level, message: string, fields: Record<string, unknown> = {}) {
  if (LEVELS[level] < LEVELS[(process.env.LOG_LEVEL as Level) ?? "info"]) return;

  const span = trace.getSpan(context.active());
  process.stdout.write(JSON.stringify({
    "@timestamp": new Date().toISOString(),
    level,
    severity_text: level.toUpperCase(),
    message,
    "service.name": process.env.OTEL_SERVICE_NAME,
    "service.version": process.env.APP_VERSION,
    "deployment.environment.name": process.env.DEPLOY_ENV,
    ...(span && { trace_id: span.spanContext().traceId, span_id: span.spanContext().spanId }),
    ...redact(fields),
  }) + "\n");
}

export function logError(message: string, err: unknown, fields: Record<string, unknown> = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  log("error", message, {
    ...fields,
    exception_type: e.name,
    exception_message: e.message,
    exception_stacktrace: e.stack?.split("\n").slice(0, 12).join("\n"),
  });
}
```

A Fluent Bit pipeline that preserves fields and never breaks on multiline stacks:

```ini
[INPUT]
    Name             tail
    Path             /var/log/containers/*.log
    Tag              kube.*
    multiline.parser docker, cri
    Mem_Buf_Limit    32MB
    Skip_Long_Lines  On

[FILTER]
    Name    kubernetes
    Match   kube.*
    Merge_Log    On
    Keep_Log     Off
    K8S-Logging.Parser   On
    K8S-Logging.Exclude  On

[OUTPUT]
    Name    loki
    Match   kube.*
    Host    loki-gateway
    Port    443
    Tenant_ID  acme
    Labels      job=app,namespace=$kubernetes['namespace_name']
    line_format json
    Label_Keys  $level,$service_name
```

LogQL queries that only work because the fields are structured:

```logql
{service_name="checkout"} | json | level = "error"
{service_name="checkout"} | json | duration_ms > 1000 | line_format "{{.message}} order={{.order_id}}"
sum by (level) (count_over_time({service_name="checkout"} | json | level="error" [5m]))
```

## Checklist

- [ ] Every line is a single-line JSON object with a fixed envelope
- [ ] `trace_id` and `span_id` present automatically on every record
- [ ] Variable context in structured fields, never interpolated into the message
- [ ] Redaction list applied in the formatter, not at individual call sites
- [ ] `ERROR` reserved for actionable failures; no routine paths logged at error
- [ ] Exceptions logged with type, message and stack, not flattened to a string
- [ ] Multiline payloads ingested as one record via a multiline parser
- [ ] Success-path sampling applied; error and audit events logged in full

## Anti-patterns

- **`console.log("user " + id + " failed: " + err)`.** Free-text logs cannot be filtered, aggregated or alerted on; you end up grepping instead of querying. Emit fields.
- **Log everything at `ERROR`.** When 95 percent of errors are noise, the alert fires constantly and nobody reads it. Reserve `ERROR` for failures that need a human.
- **Logging inside tight loops without sampling.** A single hot loop produces millions of records per minute, which is both a bill and a way to lose real events in the noise. Sample the success path.
- **Passing tokens through log fields because "the log store is private".** Log storage is replicated, retained long past the incident, and widely readable. Redact in the formatter so no call site can leak.
- **Hand-rolling a request id per service.** One user action produces four unrelated ids and correlation becomes guesswork. Propagate W3C trace context and read the id from the active span.