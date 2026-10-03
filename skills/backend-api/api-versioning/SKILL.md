---
name: api-versioning
description: Evolves public HTTP APIs with URL or header versioning, additive-change discipline, and a dated deprecation runway. Use when shipping a breaking change to a live endpoint or retiring an old version safely.
---

# API Versioning

**Use when:** a change to an existing endpoint would break clients already in production, or you must retire a version safely.
**Do not use when:** the API is unreleased — do not version pre-1.0; ship one contract and change it freely.

## Instructions

1. Default to no version. Most changes are additive: a new optional field, a new endpoint, a new enum case with an `UNKNOWN` fallback. Ship those under the existing version.
2. Classify every change before coding. Additive (new optional field or endpoint, relaxed validation) stays; breaking (removed or renamed field, widened-narrowed type, new required input, changed default, tightened validation, new required permission) requires a version.
3. Pick one axis per API. URL major (`/v1`) is visible, greppable, and cache-friendly; header media type keeps URLs stable and suits public APIs where URL churn breaks allowlists. Never mix both on one resource.
4. Reserve the major number for business-level breaks. Adding an endpoint is not v2; changing what `amount` means is.
5. Run a compatibility check in CI — `oasdiff` in breaking-change mode against the last published spec, or `buf breaking` for protobuf.
6. Sunset with a dated runway: publish `Deprecation`, `Sunset`, and successor `Link` headers, email consumers identified by API-key call volume, and enforce `410 Gone` at least 90 days out.
7. Version at the boundary. Route to thin per-version adapters that map old shapes onto one internal domain model, so old versions never fork business logic.
8. For GraphQL, prefer additive field evolution plus `@deprecated` over a versioned endpoint — see `graphql-schema-design`.

## Patterns

Change classification applied in review:

| Change | Compatible? | Action |
| --- | --- | --- |
| New optional response field | Yes | Ship under current version |
| New endpoint | Yes | Ship under current version |
| New enum value (with `UNKNOWN = 0`) | Yes | Ship under current version |
| Relaxed validation (longer string) | Yes | Ship under current version |
| Removed or renamed field | No | New major version |
| Type widened (`int` to `string`) | No | New major version |
| New required request field | No | New major version |
| Changed default value | No | New major version |
| Tightened validation | No | New major version |
| New required permission | No | New major version |
| Status code changed for an existing case | No | New major version |

Per-version adapters over one domain model:

```ts
import { Hono } from "hono";
import { orderService } from "./domain/orders.js";

const app = new Hono();

// v1: formatted total string. Adapts to the shared domain call.
app.get("/v1/orders/:id", async (c) => {
  const order = await orderService.get(c.req.param("id"));
  if (!order) return c.json({ error: { code: "not_found" } }, 404);
  return c.json({ id: order.id, total: (order.totalCents / 100).toFixed(2), createdAt: order.createdAt.toISOString() });
});

// v2: integer minor units plus currency. Same domain call, different projection.
app.get("/v2/orders/:id", async (c) => {
  const order = await orderService.get(c.req.param("id"));
  if (!order) return c.json({ error: { code: "order_not_found", traceId: c.get("traceId") } }, 404);
  return c.json({
    id: order.id,
    totalMinor: order.totalCents,
    currency: order.currency,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    links: { self: `/v2/orders/${order.id}`, receipts: `/v2/orders/${order.id}/receipts` },
  });
});

export default app;
```

Sunset signalling plus the CI compatibility gate:

```typescript
// Every response on a deprecated surface carries the RFC 8594 Sunset header.
const SUNSET = new Date("2026-03-01T00:00:00Z").toUTCString();
app.use("/v1/orders/*", async (c, next) => {
  await next();
  c.header("Deprecation", "true");
  c.header("Sunset", SUNSET);
  c.header("Link", '</v2/orders>; rel="successor-version"');
});
```

```yaml
# .github/workflows/api-compat.yml
jobs:
  oasdiff:
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - name: Reject breaking changes against the released spec
        run: npx --yes oasdiff@latest breaking https://spec.acme.io/openapi/prod.yaml openapi/current.yaml --fail-on ERR
```

## Checklist

- [ ] Each change is classified additive or breaking before implementation starts
- [ ] One versioning axis is used consistently across the API
- [ ] Additive changes shipped under the current version required no new version
- [ ] CI runs a breaking-change diff against the last released spec
- [ ] Deprecated versions emit `Deprecation`, `Sunset`, and successor `Link` headers
- [ ] Consumers were identified by API-key call volume before the date was set
- [ ] The sunset date is at least 90 days out and enforcement returns `410 Gone`
- [ ] Old versions are thin serializers over one domain model

## Anti-patterns

**Versioning on day one.** `/v1` on an API with zero consumers buys nothing and creates a second URL, spec, and test matrix to maintain forever. Start unversioned.

**Major churn for additive fields.** Bumping to v2 because you added an optional property trains consumers that every addition is a migration, draining the deprecation process and making people batch-upgrade out of fear.

**Silent sunset.** Dropping support with no `Sunset` header turns the change into an outage. Publish the header, notify from usage data, then return `410 Gone` on the stated date.

**Forked domain logic per version.** Copying business logic into each version's handler means bug fixes must be applied N times and drift silently. Keep one domain service and make versions pure serializers.