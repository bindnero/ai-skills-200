# 03 · Backend & API Engineering

Designing and operating the server side: resource shapes and contracts, transport choices, the cross-cutting concerns every public API needs, and the data layer underneath.

25 skills. Each row links to the bundle — read it before doing the work it describes.

## Transport & contracts

Choosing and shaping the wire format, and versioning it without breaking clients.

| Skill | Use it when |
| --- | --- |
| [`rest-api-design`](../skills/backend-api/rest-api-design/SKILL.md) | Designs resource-oriented HTTP endpoints with correct method semantics, status codes, and un-enveloped response bodies. Use when creating or reviewing REST routes, controllers, or OpenAPI specs where URL layout and verb choice are being decided. |
| [`graphql-schema-design`](../skills/backend-api/graphql-schema-design/SKILL.md) | Designs GraphQL SDL schemas with sound nullability, non-null propagation rules, and query-root ergonomics. Use when creating or refactoring a `.graphql` schema, defining object and input types, or deciding mutation and error contracts. |
| [`grpc-service-design`](../skills/backend-api/grpc-service-design/SKILL.md) | Designs protobuf service definitions with field-number-safe evolution, deadlines, and status codes. Use when defining or reviewing a `.proto` file, generated gRPC stubs, or the request/response contract between internal services. |
| [`websocket-realtime`](../skills/backend-api/websocket-realtime/SKILL.md) | Builds resilient WebSocket servers with heartbeat liveness, backpressure handling, and Redis-backed fan-out. Use when adding live updates, presence, or subscriptions over a persistent connection rather than polling. |
| [`api-versioning`](../skills/backend-api/api-versioning/SKILL.md) | Evolves public HTTP APIs with URL or header versioning, additive-change discipline, and a dated deprecation runway. Use when shipping a breaking change to a live endpoint or retiring an old version safely. |
| [`api-documentation`](../skills/backend-api/api-documentation/SKILL.md) | Produces accurate OpenAPI specs and runnable documentation with typed clients generated from the contract. Use when writing or updating an OpenAPI document, adding endpoint examples, or publishing an SDK reference. |

## API mechanics

The things that separate a demo endpoint from one you can put in front of strangers.

| Skill | Use it when |
| --- | --- |
| [`pagination-patterns`](../skills/backend-api/pagination-patterns/SKILL.md) | Implements offset, keyset, and cursor pagination with stable sort orders and jump-pagination paths. Use when adding list endpoints, fixing duplicated or skipped rows across pages, or solving deep-paging performance problems. |
| [`idempotency-keys`](../skills/backend-api/idempotency-keys/SKILL.md) | Makes HTTP writes safely retryable using an `Idempotency-Key` header, request fingerprinting, and atomic replay storage. Use when implementing POST handlers for payments, orders, or any endpoint clients will retry after a timeout. |
| [`input-validation`](../skills/backend-api/input-validation/SKILL.md) | Validates and coerces untrusted API input with schema libraries, typed errors, and size limits enforced before parsing. Use when adding request validation to endpoints, hardening parsers, or turning untyped bodies into TypeScript types. |
| [`error-contract-design`](../skills/backend-api/error-contract-design/SKILL.md) | Defines stable machine-readable error codes with a Problem Details envelope and correct HTTP status mapping. Use when designing error responses, adding error types, or making failures programmatically distinguishable. |
| [`rate-limiting`](../skills/backend-api/rate-limiting/SKILL.md) | Enforces request quotas with token-bucket and sliding-window limiters, tiering, and standards-compliant headers. Use when protecting an endpoint from abuse, adding per-tenant quotas, or diagnosing unexpected 429 responses. |
| [`graphql-performance`](../skills/backend-api/graphql-performance/SKILL.md) | Optimizes GraphQL execution with DataLoader batching, query depth and cost limits, and response caching. Use when a GraphQL endpoint is slow, over-fetches, or needs protection against abusive queries. |

## Identity

Tokens, sessions, third-party authorization, and files that come in from outside.

| Skill | Use it when |
| --- | --- |
| [`auth-token-lifecycle`](../skills/backend-api/auth-token-lifecycle/SKILL.md) | Issues, rotates, refreshes, and revokes access and refresh tokens with reuse detection and server-side allowlists. Use when designing login flows, token expiry, or logout that must actually invalidate access. |
| [`oauth2-integration`](../skills/backend-api/oauth2-integration/SKILL.md) | Implements OAuth 2.0 authorization-code-with-PKCE and client-credentials flows against external identity providers. Use when adding sign-in-with-provider, machine-to-machine tokens, or upstream token introspection. |
| [`session-management`](../skills/backend-api/session-management/SKILL.md) | Manages server-side browser sessions with secure cookies, idle and absolute timeouts, and fixation-safe rotation. Use when implementing login and logout, cookie policy, concurrent session limits, or per-request session lookup. |
| [`file-upload-handling`](../skills/backend-api/file-upload-handling/SKILL.md) | Handles multipart and direct-to-object-storage uploads with presigned URLs, streaming MIME checks, and malware scanning. Use when adding file upload endpoints, image processing, or attachment handling to an API. |

## Async & messaging

Work that must not happen inside a request.

| Skill | Use it when |
| --- | --- |
| [`background-jobs`](../skills/backend-api/background-jobs/SKILL.md) | Runs slow or retrying work outside the request cycle with a durable queue, idempotent handlers, and exponential backoff. Use when responding fast matters but the work needs retries, scheduling, or fan-out. |
| [`queue-design`](../skills/backend-api/queue-design/SKILL.md) | Designs message broker topology with topic and partition strategy, consumer groups, delivery guarantees, and dead-letter handling. Use when selecting or configuring SQS, Kafka, RabbitMQ, or BullMQ for inter-service messaging. |
| [`event-driven-architecture`](../skills/backend-api/event-driven-architecture/SKILL.md) | Decouples services with a transactional outbox, sagas, and idempotent consumers over a durable event log. Use when splitting a monolith, introducing asynchronous workflows, or coordinating multi-service transactions. |
| [`webhook-delivery`](../skills/backend-api/webhook-delivery/SKILL.md) | Delivers outbound webhooks with signed payloads, exponential-backoff retries, and replayable delivery logs. Use when notifying external systems of changes, or implementing a webhook receiver. |

## Data layer

Storage, caching, and the operational realities of running a database.

| Skill | Use it when |
| --- | --- |
| [`caching-strategies`](../skills/backend-api/caching-strategies/SKILL.md) | Caches database and HTTP responses with correct invalidation, stampede protection, and bounded TTLs. Use when the same expensive read is repeated and stale data is tolerable for a bounded window. |
| [`database-migrations`](../skills/backend-api/database-migrations/SKILL.md) | Ships reversible expand-and-contract schema changes with online DDL and deployment-safe sequencing. Use when adding, renaming, or dropping columns, indexes, or tables in a live database. |
| [`query-optimization`](../skills/backend-api/query-optimization/SKILL.md) | Diagnoses slow SQL with EXPLAIN ANALYZE, fixes N+1 access patterns, and tunes indexes and statistics. Use when a query is slow, database CPU is high, or an endpoint exceeds its latency budget. |
| [`connection-pooling`](../skills/backend-api/connection-pooling/SKILL.md) | Sizes and bounds database and HTTP client pools so concurrency stays under what the datastore can serve. Use when adding a datastore client, raising concurrency, or diagnosing pool timeouts and saturation. |

## Boundaries

When to split a service, and what a split costs.

| Skill | Use it when |
| --- | --- |
| [`microservices-boundaries`](../skills/backend-api/microservices-boundaries/SKILL.md) | Draws service boundaries by business capability with exclusive data ownership and no cross-service SQL. Use when splitting a monolith, assigning table ownership, or removing cross-service database reads. |

---

[Full index](../CATALOG.md) · [Install targets](10-install-targets.md) · [Authoring](11-authoring.md)
