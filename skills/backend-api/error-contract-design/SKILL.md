---
name: error-contract-design
description: Defines stable machine-readable error codes with a Problem Details envelope and correct HTTP status mapping. Use when designing error responses, adding error types, or making failures programmatically distinguishable.
---

# Error Contract Design

**Use when:** you are defining what an API returns when something fails, adding an error type, or making failures programmatically distinguishable.
**Do not use when:** the failure is a GraphQL field error resolved into a typed union — see `graphql-schema-design`.

## Instructions

1. Give every error a stable machine code (`order_already_shipped`) clients can switch on. Prose is for humans and may be reworded; the code is the contract and its meaning never changes.
2. Adopt RFC 9457 Problem Details (`application/problem+json`) as the single envelope instead of inventing per-endpoint shapes, with `type`, `title`, `status`, `detail`, and `instance`.
3. Map to status by semantics, not exception class: validation `422`, missing auth `401`, insufficient permission `403`, absent `404`, state conflict `409`, throttled `429`, upstream `502`/`503`, defect `500`.
4. Put field-level detail in a machine-readable extension (`errors: [{ pointer, code, message }]`) so a form can highlight the offending input, and keep `detail` to one human sentence.
5. Never leak internals. Stack traces, SQL fragments, and driver messages go to logs with a `traceId`, never to the response.
6. Return `500` only for genuinely unhandled faults, always with a `traceId` the user can quote.
7. Log the same `traceId` you return, so one grep joins a customer report to the stack.
8. Keep one error registry — enum plus a code-to-status-to-title table — so status mapping cannot drift between endpoints.
9. Separate expected rejections from defects in observability: business rejections are business metrics; only unexpected `5xx` pages on-call.

## Patterns

Error registry as the single source of truth:

```ts
export const ERROR_CATALOG = {
  validation_failed: { status: 422, title: "Validation failed", type: "https://docs.acme.io/errors/validation_failed" },
  invalid_cursor: { status: 400, title: "Invalid pagination cursor", type: "https://docs.acme.io/errors/invalid_cursor" },
  cursor_expired: { status: 410, title: "Cursor expired", type: "https://docs.acme.io/errors/cursor_expired" },
  idempotency_key_required: { status: 400, title: "Idempotency key required", type: "https://docs.acme.io/errors/idempotency_key_required" },
  idempotency_key_reused: { status: 422, title: "Idempotency key reused", type: "https://docs.acme.io/errors/idempotency_key_reused" },
  idempotent_request_in_progress: { status: 409, title: "Request in progress", type: "https://docs.acme.io/errors/in_progress" },
  unauthorized: { status: 401, title: "Authentication required", type: "https://docs.acme.io/errors/unauthorized" },
  forbidden: { status: 403, title: "Insufficient permissions", type: "https://docs.acme.io/errors/forbidden" },
  order_not_found: { status: 404, title: "Order not found", type: "https://docs.acme.io/errors/order_not_found" },
  order_already_shipped: { status: 409, title: "Order already shipped", type: "https://docs.acme.io/errors/order_already_shipped" },
  rate_limit_exceeded: { status: 429, title: "Rate limit exceeded", type: "https://docs.acme.io/errors/rate_limit_exceeded" },
  upstream_unavailable: { status: 503, title: "Dependency unavailable", type: "https://docs.acme.io/errors/upstream_unavailable" },
  internal_error: { status: 500, title: "Internal server error", type: "https://docs.acme.io/errors/internal_error" },
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly violations?: Array<{ pointer: string; code: string; message: string }>;
  readonly headers: Record<string, string>;

  constructor(code: ErrorCode, detail: string, opts: { status?: number; violations?: HttpError["violations"]; headers?: Record<string, string> } = {}) {
    super(detail);
    const entry = ERROR_CATALOG[code];             // default status comes from the catalog
    this.name = "HttpError";
    this.code = code;
    this.status = opts.status ?? entry.status;
    this.violations = opts.violations;
    this.headers = opts.headers ?? {};
  }
}
```

Terminal serializer mapping any thrown value to a Problem Details document:

```ts
import { ZodError } from "zod";
import { HttpError, ERROR_CATALOG } from "./errors.js";

export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    const traceId = req.id;

    if (err instanceof HttpError) {
      const entry = ERROR_CATALOG[err.code];
      reply.code(err.status).type("application/problem+json").send({
        type: entry.type, title: entry.title, status: err.status, detail: err.message,
        instance: req.url, code: err.code, traceId,
        ...(err.violations ? { errors: err.violations } : {}),
      });
      return;
    }

    if (err instanceof ZodError) {
      const entry = ERROR_CATALOG.validation_failed;
      reply.code(422).type("application/problem+json").send({
        type: entry.type, title: entry.title, status: 422, detail: "One or more fields failed validation.",
        instance: req.url, code: "validation_failed", traceId,
        errors: err.issues.map((i) => ({ pointer: i.path.join(".") || "(root)", code: i.code, message: i.message })),
      });
      return;
    }

    // Unknown: internals to logs only, never to the wire.
    req.log.error({ err, traceId }, "unhandled error");
    reply.code(500).type("application/problem+json").send({
      type: ERROR_CATALOG.internal_error.type, title: "Internal server error", status: 500,
      detail: "An unexpected error occurred. Quote the traceId when reporting this.",
      instance: req.url, code: "internal_error", traceId,
    });
  });
}
```

What clients receive, in the two shapes that matter:

```json
{
  "type": "https://docs.acme.io/errors/validation_failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "One or more fields failed validation.",
  "instance": "/v1/users",
  "code": "validation_failed",
  "traceId": "01J9Z8K2QW4RT7YH0B3NX5V6M8A",
  "errors": [
    { "pointer": "email", "code": "invalid_string", "message": "Must be a valid email address" },
    { "pointer": "address.postalCode", "code": "too_small", "message": "Must contain at least 2 character(s)" }
  ]
}
```

```json
{
  "type": "https://docs.acme.io/errors/order_already_shipped",
  "title": "Order already shipped",
  "status": 409,
  "detail": "Order ord_9f2a shipped on 2026-02-10T16:04:11Z and can no longer be cancelled.",
  "instance": "/v1/orders/ord_9f2a/cancellations",
  "code": "order_already_shipped",
  "traceId": "01J9Z8K3A1F6M2N8P5QW9R0T2Y"
}
```

## Checklist

- [ ] Every failure has a stable snake_case machine code in one catalog
- [ ] Error bodies use RFC 9457 `application/problem+json` on every endpoint
- [ ] Status codes follow the semantic mapping, not the underlying exception class
- [ ] Validation failures include `errors[]` with pointer, code, and message
- [ ] Stack traces, SQL, and file paths appear only in logs
- [ ] Every error response carries a `traceId` that also appears in server logs
- [ ] `500` responses state what to quote and never imply a client fault
- [ ] Expected rejections are business metrics and do not page on-call

## Anti-patterns

**Free-form error strings.** `send({ error: "Something went wrong" })` forces clients to substring-match prose to branch, which breaks the moment you reword it. Emit a stable `code`.

**Leaking internals in 500s.** Returning `err.stack` or a raw constraint-violation message hands attackers your schema and framework versions. Log it, return a `traceId`.

**Overloading 400 for everything.** Validation, conflicts, throttling, and auth all returning 400 leaves the client unable to retry, prompt the user, or refresh a token. Distinguish 401/403/409/422/429.

**A different envelope per endpoint.** Three services each inventing `{ error, msg }` forces client code to branch on path. Standardize on Problem Details with one `code` field.