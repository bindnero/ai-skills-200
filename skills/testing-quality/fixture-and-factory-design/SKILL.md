---
name: fixture-and-factory-design
description: Builds typed test data factories and fixtures with defaults, overrides, freeze semantics, and composable builders. Use when test setup is verbose or error-prone, or when fixtures are mutated by one test and break another.
---

# Fixture And Factory Design

**Use when:** tests repeat large object literals, when one test's mutation leaks into another through a shared fixture, or when a schema change must be reflected in test data in one place.
**Do not use when:** the data is produced by a seed script against a real database — use `test-data-management`; or the values are three primitives — a plain literal is clearer.

## Instructions

1. Create a factory per entity with all valid defaults baked in, so a test only states the fields it cares about. Defaults must be valid, not minimal.
2. Override by merging shallowly at the top level; for nested structures accept a function (`overrides => ({ ...overrides, items: [...] })`) so callers never have to restate a whole object.
3. Return a new object on every call — never export a shared instance from a fixture module. Object identity is the most common cross-test leak.
4. Freeze the result in development (`Object.freeze`, shallow plus nested lists) so an accidental `user.email = ...` throws in the test instead of corrupting a sibling test.
5. Use a builder only when construction genuinely has steps (multi-step sign-up, nested collections). For plain data, a plain function beats a fluent builder.
6. Compose factories rather than inheriting them: an `orderFactory` that takes a `customer` from `customerFactory()` keeps relations honest without subclass chains.
7. Support the escape hatch: `overrides` typed as `Partial<T>` so the compiler rejects misspelled fields, plus an escape type for intentionally invalid objects used in validation tests.
8. Support sequences for uniqueness: `factory.sequence(n)` so ids, emails, and slugs differ per call without reaching for `Math.random()`.
9. Separate fixtures (arrangements, cleanup, server start) from factories (data). Mixing them means every test file boots infrastructure just to build an object.
10. Version factories with the schema: when the entity changes, the factory is the first thing that must compile-fail, proving the tests exercise current fields.

## Patterns

Typed factory with overrides, sequences, freezing, and composition:

```ts
// test/factories/index.ts
import { faker } from '@faker-js/faker';

export type Address = { line1: string; city: string; country: 'US' | 'CA'; postcode: string };
export type Customer = { id: string; email: string; name: string; address: Address; tags: string[] };
export type Order = {
  id: string;
  customer: Customer;
  lineItems: { sku: string; quantity: number; unitPriceCents: number }[];
  status: 'draft' | 'paid';
};

export function customerFactory(overrides: Partial<Customer> = {}): Customer {
  return deepFreeze({
    id: faker.string.uuid(),
    email: faker.internet.email({ firstName: 'ada' }),
    name: faker.person.fullName(),
    address: { line1: faker.location.streetAddress(), city: faker.location.city(), country: 'US', postcode: faker.location.zipCode() },
    tags: ['fixture'],
    ...overrides,
  });
}

export function orderFactory(overrides: Partial<Order> | ((base: Order) => Partial<Order>) = {}): Order {
  const base: Order = {
    id: faker.string.uuid(),
    customer: customerFactory(),
    lineItems: [{ sku: 'sku-1', quantity: 1, unitPriceCents: 1000 }],
    status: 'draft',
  };
  return deepFreeze({ ...base, ...(typeof overrides === 'function' ? overrides(base) : overrides) });
}

export function sequence(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
/** Deliberately unescaped shape for validation tests. */
export function invalidCustomerFactory(): unknown {
  return { email: 'not-an-email', address: null };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
```

Factory consumers override what they care about, freeze, and stay unique:

```ts
// src/checkout/discount.test.ts
import { describe, expect, it } from 'vitest';
import { orderFactory, sequence } from '../../test/factories';

describe('applyDiscounts', () => {
  it('stacks two 10 percent discounts into 19 percent', () => {
    const order = orderFactory((base) => ({
      lineItems: [
        { sku: 'sku-1', quantity: 2, unitPriceCents: 2500 },
        { sku: 'sku-2', quantity: 1, unitPriceCents: 1000 },
      ],
      customer: { ...base.customer, tags: ['vip'] },
    }));
    expect(applyDiscounts(order, ['PROMO10', 'LOYAL10'])).toBe(1140);
  });
  it('gives each order a distinct customer email', () => {
    const id = sequence('order');
    const orders = Array.from({ length: 3 }, () => orderFactory({ id: id() }));

    expect(new Set(orders.map((o) => o.customer.email)).size).toBe(3);
  });

  it('cannot be mutated by the code under test', () => {
    const order = orderFactory();

    expect(() => {
      (order as { status: string }).status = 'paid';
    }).toThrow();
  });
});
```

## Checklist

- [ ] One factory per entity, with valid defaults covering every required field
- [ ] `overrides` accept both a partial object and an updater function
- [ ] Every call returns a fresh object; no shared exported fixture instances
- [ ] Factories deep-freeze results so accidental mutation throws
- [ ] Relations composed via other factories rather than duplicated literals
- [ ] Uniqueness handled with a deterministic sequence, not `Math.random()`
- [ ] Invalid-data cases have their own deliberately-unescaped factory
- [ ] Fixtures (setup/cleanup) live apart from factories (data construction)

## Anti-patterns

**Shared fixture instance.** `export const admin = { ... }` mutated by one test makes every later test depend on execution order. Fix: export a factory function and call it per test.

**Minimal defaults.** Defaults set only the fields the first test needed, so every later test explodes on missing properties. Fix: defaults describe a fully valid entity.

**Fluent builders for plain data.** Ten chained methods to construct an object with four fields is ceremony, not clarity. Fix: a plain function with overrides; reserve builders for genuinely multi-step construction.

**Deep-merge overrides.** Merging `lineItems` deeply produces a half-object that satisfies the type but is semantically nonsense. Fix: shallow merge plus an updater function for nested replacement.