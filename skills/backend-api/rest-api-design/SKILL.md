---
name: rest-api-design
description: Designs resource-oriented HTTP endpoints with correct method semantics, status codes, and un-enveloped response bodies. Use when creating or reviewing REST routes, controllers, or OpenAPI specs where URL layout and verb choice are being decided.
---

# REST API Design

**Use when:** you are adding or reviewing HTTP endpoints and must settle URLs, verbs, status codes, and body shapes.
**Do not use when:** the client wants one endpoint with a typed query language — use `graphql-schema-design`.

## Instructions

1. Model nouns, not verbs. `/orders/{orderId}/line-items` is a resource; `/getOrderLineItems` is a procedure wearing a URL. When a transition has no natural resource, mint one: `POST /orders/{id}/cancellations`, never `POST /orders/{id}/cancel`.
2. Choose the verb by safety and idempotency: `GET` safe and cacheable, `PUT` idempotent full replace, `PATCH` idempotent partial update, `POST` non-idempotent create.
3. Encode hierarchy in the path only when a child cannot exist without its parent. Beyond two levels, the child is a collection with a `parentId` filter, not a nested route.
4. Put filtering, sorting, and pagination in the query string on `GET` collections. Overloading `POST /orders/search` for a safe read breaks caches and prefetch.
5. Return the resource as the top-level body. A `{ "data": ... }` wrapper duplicates the transport envelope and makes `204` and `304` structurally impossible.
6. Use status codes as machine-readable control flow: `201` + `Location` for creation, `202` for accepted-async, `204` empty for delete, `304` for conditional reads, `409` for state conflicts, `422` for semantic validation.
7. Make every write that can be double-submitted accept a client idempotency key, and emit `ETag` plus `If-None-Match` handling on every cacheable representation.
8. Keep the whole route table in one module. If you cannot grep one file and see the entire HTTP surface, the boundary is not real.

## Patterns

Routes with contracts and status codes bound at the edge:

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { orders, etagOf, ConflictError, NotFoundError } from "./orders.js";

const CreateOrder = z.object({
  customerId: z.string().uuid(),
  currency: z.string().length(3),
  lines: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive().max(999) })).min(1).max(100),
});
const OrderIdParams = z.object({ orderId: z.string().uuid() });

export async function registerOrderRoutes(app: FastifyInstance): Promise<void> {
  app.post("/orders", { schema: { tags: ["orders"], body: CreateOrder, response: { 201: { $ref: "Order#" } } } }, async (req, reply) => {
    const order = await orders.create(req.body, { idempotencyKey: req.headers["idempotency-key"] as string | undefined });
    return reply.header("Location", `/orders/${order.id}`).code(201).send(order);
  });

  app.get("/orders/:orderId", { schema: { params: OrderIdParams } }, async (req, reply) => {
    const order = await orders.find(req.params.orderId);
    if (!order) throw new NotFoundError("order_not_found", `order ${req.params.orderId} does not exist`);
    const tag = etagOf(order);
    if (req.headers["if-none-match"] === tag) return reply.code(304).send();
    return reply.header("ETag", tag).header("Cache-Control", "private, max-age=0, must-revalidate").send(order);
  });

  app.delete("/orders/:orderId", { schema: { params: OrderIdParams, response: { 204: { type: "null" }, 409: { $ref: "Problem#" } } } }, async (req, reply) => {
    try {
      await orders.cancel(req.params.orderId);
    } catch (err) {
      if (err instanceof ConflictError) return reply.code(409).send({ error: { code: err.code, message: err.message } });
      throw err;
    }
    return reply.code(204).send();
  });
}
```

The status map clients actually branch on:

```http
POST   /orders                    -> 201 Created  + Location: /orders/{id}
POST   /orders/{id}/cancellations -> 202 Accepted + Retry-After: 5
GET    /orders/{id}               -> 200 OK | 304 Not Modified | 404 Not Found
PATCH  /orders/{id}               -> 200 OK (full representation) | 409 Conflict
DELETE /orders/{id}               -> 204 No Content (zero-length body)
POST   /webhooks                  -> 422 Unprocessable Content (valid shape, invalid semantics)
```

## Checklist

- [ ] Every URL segment is a plural noun; no verb appears in any path
- [ ] Non-idempotent writes accept an idempotency key or server-side dedupe
- [ ] `201` responses carry a `Location` header pointing at the created resource
- [ ] `204` responses have a zero-length body, not `null` or `{ "ok": true }`
- [ ] `422` is distinguished from `400` and status codes come from a documented map
- [ ] Cacheable `GET`s emit an `ETag` and honour `If-None-Match`
- [ ] No response body is wrapped in an extra `data` object
- [ ] The complete route table is listable from one file or one OpenAPI tag group

## Anti-patterns

**RPC in a trenchcoat.** `POST /api/createUser` makes every response uncacheable, forces `POST` for reads, and severs the client's ability to prefetch or bookmark a resource. Model the user as a resource and let the verb carry the action.

**The `{ "data": ..., "success": true }` envelope.** Every client unwraps, field-level conditional requests break, and a `204` becomes impossible. Return the resource and move status into the status line.

**`200 OK` for everything.** A delete returning `200 {"status":"deleted"}` is indistinguishable from a no-op, so retry logic and alerting both guess at intent.

**State transitions hidden behind `PATCH` action flags.** `PATCH /orders/1 {"cancel": true}` puts a business rule in a client-controlled boolean, so the rule now lives in two places. Create a `/cancellations` sub-resource and let the server own the transition.