---
name: api-documentation
description: Produces accurate OpenAPI specs and runnable documentation with typed clients generated from the contract. Use when writing or updating an OpenAPI document, adding endpoint examples, or publishing an SDK reference.
---

# API Documentation

**Use when:** writing or updating an OpenAPI document, adding endpoint examples, or generating SDKs and reference docs from the contract.
**Do not use when:** the API is GraphQL or gRPC — see `graphql-schema-design` and `grpc-service-design` for those contracts.

## Instructions

1. Treat the spec as generated output. Define schemas once in code (Zod, TypeBox, JSON Schema) and generate OpenAPI from them, so documentation cannot drift from validation.
2. Document every operation with `summary` (present-tense verb phrase), `description` (what it does plus non-obvious side effects), and an `operationId` in camelCase that becomes the generated method name.
3. Describe all responses, not just the happy path. Document every status your error catalog can emit, each referencing the Problem Details schema.
4. Give every parameter an example and every schema a `description`; examples are what developers copy, and a type without one forces them to invent a value.
5. Mark required fields and constraints exactly. `maxLength`, `pattern`, `enum`, and `minimum` are the only thing a client generator has to enforce the contract you actually validate.
6. Include realistic working `curl` examples with a placeholder token, plus one schema example per response status.
7. Document auth explicitly: the scheme name, the required scopes per operation, and how to obtain credentials. A `bearerAuth` scheme with no `security` on operations generates an unauthenticated client.
8. Generate clients from the spec in CI and fail on drift, because a spec and code that can disagree will disagree.
9. Mark deprecated operations with `deprecated: true` plus `Sunset` and a successor link, so generated SDKs flag the method before you retire it.

## Patterns

Schemas as the single source, generating both validation and OpenAPI:

```ts
import { z } from "zod";
import { zodToOpenAPI, registry } from "zod-to-openapi";

const CreateOrderBody = z.object({
  customerId: z.string().uuid().describe("Customer the order belongs to"),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/).describe("ISO 4217 currency code, e.g. USD"),
  lines: z.array(z.object({
    sku: z.string().min(1).max(64).describe("Stock keeping unit"),
    quantity: z.number().int().positive().max(999).describe("Units ordered"),
    unitPriceCents: z.number().int().min(0).describe("Amount in minor units"),
  }).strict()).min(1).max(100).describe("At least one line, at most 100"),
}).strict().describe("Payload to create an order");

const Order = z.object({
  id: z.string().uuid().describe("Stable order identifier"),
  status: z.enum(["pending", "confirmed", "shipped", "cancelled"]).describe("Current fulfilment state"),
  totalCents: z.number().int().min(0).describe("Amount in minor units"),
  currency: z.string().length(3),
  lineCount: z.number().int().positive(),
  createdAt: z.string().datetime().describe("RFC 3339 timestamp with offset"),
}).strict().describe("A customer order");

zodToOpenAPI(registry, { schema: { path: "/openapi.json", zodSchema: CreateOrderBody } });

registry.registerPath({
  method: "post",
  path: "/v1/orders",
  tags: ["Orders"],
  summary: "Create an order",
  description: "Creates a pending order and reserves stock. Safe to retry: send a stable `idempotencyKey`. Repeating the same key with the same payload replays the original response.",
  operationId: "createOrder",
  security: [{ bearerAuth: ["orders:write"] }],   // scopes per operation, not just globally
  request: { body: { content: { "application/json": { schema: CreateOrderBody } } } },
  responses: {
    201: {
      description: "Order created",
      headers: { Location: { schema: z.string(), description: "URL of the created order" } },
      content: { "application/json": { schema: Order, example: { id: "01J9Z8K2QW4RT7YH0B3NX5V6M8A", status: "pending", totalCents: 4999, currency: "USD", lineCount: 2, createdAt: "2026-10-02T14:03:11.204Z" } } },
    },
    401: { description: "Missing or invalid access token", content: { "application/problem+json": { schema: Problem } } },
    403: { description: "Token lacks the orders:write scope", content: { "application/problem+json": { schema: Problem } } },
    422: { description: "Semantically invalid input", content: { "application/problem+json": { schema: Problem, example: { type: "https://docs.acme.io/errors/validation_failed", title: "Validation failed", status: 422, detail: "One or more fields failed validation.", instance: "/v1/orders", code: "validation_failed", traceId: "01J9Z8K4B2G7M3O9Q6RX1S2T3U4", errors: [{ pointer: "lines.0.quantity", code: "too_small", message: "Quantity must be positive" }] } } } },
    429: { description: "Rate limit exceeded", headers: { "Retry-After": { schema: z.number(), description: "Seconds to wait" } }, content: { "application/problem+json": { schema: Problem } } },
  },
});
```

Runnable examples and the generated client pipeline:

```yaml
# Inline in the registered path so examples live beside the contract.
x-codeSamples:
  - lang: curl
    source: |
      curl -X POST https://api.acme.io/v1/orders \
        -H "Authorization: Bearer $ACME_ACCESS_TOKEN" \
        -H "Content-Type: application/json" \
        -H "Idempotency-Key: $(uuidgen)" \
        -d '{"customerId":"01J9Y2K3M4N5P6Q7R8S9T0V1W2","currency":"USD",
             "lines":[{"sku":"WIDGET-1","quantity":2,"unitPriceCents":1500}]}'
  - lang: TypeScript
    source: |
      const acme = new Acme({ accessToken: process.env.ACME_ACCESS_TOKEN! });
      const order = await acme.orders.create({ customerId: "01J9Y2K3M4N5P6Q7R8S9T0V1W2", currency: "USD", lines: [{ sku: "WIDGET-1", quantity: 2, unitPriceCents: 1500 }] });
```

```bash
# Generate types, SDKs, and reference docs from the validated spec.
npx openapi-typescript openapi/openapi.json -o src/generated/api-types.ts
npx @hey-api/openapi-ts -i openapi/openapi.json -o src/generated/client
npx @redocly/cli build-docs openapi/openapi.json --output docs/api/index.html
```

```yaml
# CI: fail when the committed spec is stale, invalid, or breaking.
name: api-docs
on:
  pull_request:
    paths: ["src/routes/**", "src/schemas/**"]

jobs:
  spec-diff:
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run generate:openapi
      - run: git diff --exit-code -- openapi/openapi.json
      - run: npx --yes @redocly/cli@latest lint openapi/openapi.json --extends minimal
```

## Checklist

- [ ] OpenAPI is generated from the validation schemas, not hand-maintained
- [ ] Every operation has `summary`, `description`, `operationId`, and tags
- [ ] Every error status from the error catalog appears with a Problem Details schema
- [ ] Every field and parameter has a description, constraints, and an example
- [ ] Security requirements are declared per operation with named scopes
- [ ] `curl` and typed-client examples are runnable with placeholder credentials
- [ ] CI regenerates the spec and fails when the committed version is stale
- [ ] Deprecated operations carry `deprecated: true` plus `Sunset` and a successor link

## Anti-patterns

**Hand-written specs alongside hand-written validators.** The two drift, and consumers hit the difference in production while the spec still claims a guarantee it does not provide. Generate the spec from the schemas you validate with.

**Documenting only the happy path.** A spec with just `200` forces consumers to reverse-engineer failure modes by triggering them. Document each error status so clients can build real handling.

**Parameter types without constraints.** `quantity: { type: integer }` says nothing about the bounds your validator enforces, so consumers write clients that fail at runtime. Include `minimum`, `maximum`, `pattern`, `maxLength`, `enum`.

**A spec with no security on operations.** Declaring `bearerAuth` globally and relying on developers to notice produces an unauthenticated client that 401s on every call. Declare `security` with scopes per operation.