---
name: microservices-boundaries
description: Draws service boundaries by business capability with exclusive data ownership and no cross-service SQL. Use when splitting a monolith, assigning table ownership, or removing cross-service database reads.
---

# Microservices Boundaries

**Use when:** splitting a system into services, deciding which team owns which data, or eliminating cross-service table access.
**Do not use when:** one deployable with clear internal modules solves it — a monolith with good boundaries is a valid architecture.

## Instructions

1. Split by business capability, not technical layer. "Orders, Billing, Fulfilment" change for different reasons and release independently; "Controllers, Services, Jobs" change together and must ship together.
2. Give each service exclusive write ownership of its tables. Two services writing the same rows guarantees they are not separately deployable, whatever the topology claims.
3. Expose other services' data through APIs or events, never direct SQL. A cross-service `SELECT` is a hidden synchronous dependency that bypasses every timeout, retry, and contract test.
4. Design contracts around the consumer's need, not the producer's schema. Returning a full customer row couples every consumer to your internal model permanently.
5. Keep transaction boundaries inside one service. If an operation needs a distributed transaction, it belongs in one service or needs a saga — see `event-driven-architecture`.
6. Standardize the primitives that cause accidents: a shared `Money` type, one `organizationId` convention, one ID format. This is cheap and needs no shared database.
7. Deploy consumers before producers. A producer emitting a new required field before the consumer handles it is an outage; additive changes plus consumer-first ordering removes the risk.
8. Prefer fewer, larger services early. Each boundary adds network failure, deployment coordination, and observability cost; draw one only when the independent change rate justifies it.
9. Scope credentials per service. A shared superuser connection makes every boundary advisory, since a leaked credential reaches every table.

## Patterns

Ownership map that makes the boundary checkable:

```yaml
# ownership.yaml — reviewed in CI. A service may only write its own schemas.
databases:
  orders_db:
    schemas: [orders, order_lines]
    owned_by: orders-service
    read_only_for: [fulfilment-service, analytics-service]
  billing_db:
    schemas: [invoices, ledger_entries, payment_methods]
    owned_by: billing-service
    read_only_for: [orders-service]
  fulfilment_db:
    schemas: [shipments, inventory_reservations]
    owned_by: fulfilment-service
    read_only_for: [orders-service]

# CI check: no service credential holds INSERT/UPDATE/DELETE outside owned_by.
# SELECT is permitted for read_only_for only.
```

Consumer-shaped contracts instead of producer-shaped dumps:

```ts
// billing-service owns the customer record. orders-service asks for exactly what
// it needs, so billing can restructure its columns without breaking anyone.
export interface CustomerBillingProfile {
  customerId: string;
  currency: string;
  paymentMethodToken: string; // opaque reference, never a PAN
  defaultTermsDays: number;
  taxRegion: string;
}

export async function getBillingProfile(customerId: string, signal: AbortSignal): Promise<CustomerBillingProfile> {
  // Typed contract per consumer: adding a field is backwards compatible; removing
  // or retyping one is a breaking change the contract tests catch.
  return http.get<CustomerBillingProfile>(`/v1/customers/${customerId}/billing-profile`, { signal });
}
```

Timeouts, retry policy, and circuit breaking on every outbound call:

```ts
export function createServiceClient(baseUrl: string, opts: { timeoutMs: number }) {
  const breaker = new CircuitBreaker({ failureThreshold: 0.5, resetTimeoutMs: 30_000, halfOpenRequests: 3 });

  return {
    get: <T>(path: string, init: RequestInit = {}): Promise<T> =>
      breaker.run(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
        try {
          const res = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal, headers: { accept: "application/json", ...init.headers } });
          // Retry only idempotent reads. A retried POST that charges a card needs
          // an idempotency key, not a retry.
          if (res.status >= 500 || res.status === 429) throw new RetriableError(res.status, Number(res.headers.get("retry-after") ?? 0) * 1000);
          if (!res.ok) throw new HttpError(res.status, await res.text().catch(() => ""));
          return (await res.json()) as T;
        } finally {
          clearTimeout(timer);
        }
      }),
  };
}
```

Contract tests and a saga instead of a distributed transaction:

```ts
import { describe, it, expect } from "vitest";

describe("billing-service consumer contract (as consumed by orders-service)", () => {
  it("returns every field orders-service depends on", async () => {
    const fixture = await getBillingProfile(fixtureCustomer);

    // Each assertion documents a field orders-service reads. If billing renames or
    // retypes one, this fails in CI instead of in production.
    expect(typeof fixture.customerId).toBe("string");
    expect(fixture.currency).toMatch(/^[A-Z]{3}$/);
    expect(typeof fixture.paymentMethodToken).toBe("string");
    expect(fixture.paymentMethodToken).not.toMatch(/\d{13,19}/); // never a raw PAN
    expect(Number.isInteger(fixture.defaultTermsDays)).toBe(true);
  });
});

export async function placeOrderAndInvoice(input: PlaceOrderInput): Promise<{ orderId: string; invoiceId: string }> {
  const order = await ordersService.create({ customerId: input.customerId, lines: input.lines, idempotencyKey: input.idempotencyKey });

  try {
    const invoice = await billingClient.createInvoice({ orderId: order.id, totalMinor: input.totalMinor, idempotencyKey: `${input.idempotencyKey}:invoice` });
    return { orderId: order.id, invoiceId: invoice.id };
  } catch (err) {
    // Rollback across a network boundary is a domain action, not a transaction rollback.
    await ordersService.markInvoiceFailed(order.id, String(err));
    throw err;
  }
}
```

## Checklist

- [ ] Boundaries follow business capabilities with different change and release rates
- [ ] Each table has exactly one service with write grants, recorded somewhere reviewable
- [ ] No service queries another service's database directly
- [ ] Consumer-facing contracts are shaped for the consumer, not the producer's model
- [ ] No operation spans a distributed transaction; multi-service flows use sagas
- [ ] Outbound calls set timeouts, retry only idempotent operations, and break the circuit
- [ ] Consumers are deployed before producers for any contract-altering change
- [ ] Service credentials are scoped to their own schema and CI enforces it

## Anti-patterns

**The shared database with a service-shaped codebase.** Two services writing the same `users` table cannot deploy or scale independently, and a schema change forces a coordinated release. Own the table and expose it.

**Splitting by technical layer.** Separating "API service", "worker service", and "data service" produces three deployables that must always change together, so you pay the distributed-systems cost with none of the independence. Split by capability.

**Exposing a full entity from every service.** `GET /customers` returning every column makes any internal schema change a breaking change for every consumer. Project a purpose-built response per consumer.

**Assuming the network is reliable.** A cross-service call with no timeout, retry policy, or circuit breaker turns a slow dependency into a cascading outage. Every outbound call needs a deadline.