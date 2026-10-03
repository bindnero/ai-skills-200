---
name: api-testing
description: Tests HTTP endpoints through the real handler stack with Supertest and Fastify inject, Ajv validation against the OpenAPI schema, and auth, pagination, and idempotency matrices. Use when adding or changing a REST endpoint, or when an API's status codes and error bodies must be proven correct.
---

# API Testing

**Use when:** you own the endpoint and need to verify status codes, headers, auth behaviour, pagination, validation, and error shapes against the real handler stack.
**Do not use when:** you are verifying a consumer's expectations across a service boundary — use `contract-testing`; or the user journey through a browser — use `e2e-test-authoring`.

## Instructions

1. Exercise the real stack. Build the app with the same factory production uses (`buildApp()`) and call it over `supertest` (Express) or `app.inject` (Fastify). Never import a route handler and call it directly.
2. Validate every success response against the OpenAPI schema with Ajv compiled from the spec, so a field rename fails the test instead of a consumer.
3. Assert the full error envelope — status, machine-readable `code`, human `message`, and field-level `details` — on every 4xx and 5xx path.
4. Cover auth exhaustively with a matrix: no token, malformed token, expired token, valid token without the role, valid token with the role. Any untested cell is a potential access-control bug.
5. Test pagination and filtering at their boundaries: page 0, page past the end, `limit` above the maximum, and a filter matching nothing.
6. Verify idempotency and caching where they exist — a repeated `POST` with the same `Idempotency-Key` must not write twice — and assert documented list headers such as `Link` or `X-Total-Count`.
7. Use real database transactions for data-dependent assertions and roll them back, so endpoint tests stay independent and parallel-safe.
8. Express repetitive cases as a table (`it.each`) of method, path, headers, and expected status, so the matrix reads as one readable list.
9. Keep most tests in-process for speed and run one real-TCP suite in CI against a deployed build — injection proves logic, the deployed run proves wiring.

## Patterns

Real-stack HTTP tests with schema validation and an auth matrix:

```ts
// test/api/orders.test.ts
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import request from 'supertest';
import Ajv from 'ajv';
import { buildApp, type App } from '../src/app';
import openApi from '../openapi.json';

const validateOrder = new Ajv({ strict: false }).compile(
  (openApi.components as { schemas: { Order: object } }).schemas.Order,
);
const auth = (role: string) => ({ Authorization: `Bearer token-${role}` });
let app: App;
beforeAll(() => { app = buildApp({ databaseUrl: inject('DATABASE_URL'), logger: false }); });

describe('GET /orders/:id', () => {
  it.each([
    { label: 'no token', header: {}, expected: 401 },
    { label: 'malformed token', header: { Authorization: 'Bearer nope' }, expected: 401 },
    { label: 'viewer role', header: auth('viewer'), expected: 200 },
    { label: 'admin role', header: auth('admin'), expected: 200 },
  ])('returns $expected for $label', async ({ header, expected }) => {
    const res = await request(app.server).get('/orders/1').set(header);

    expect(res.status).toBe(expected);
    if (expected !== 200) return expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(validateOrder(res.body), JSON.stringify(res.body)).toBe(true);
  });

  it('returns a typed 404 for a missing order', async () => {
    const res = await request(app.server).get('/orders/nope').set(auth('viewer'));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: 'ORDER_NOT_FOUND', message: expect.any(String), details: expect.any(Object) });
  });
});

describe('POST /orders', () => {
  it('is idempotent for a repeated key', async () => {
    const post = () =>
      request(app.server).post('/orders').set({ ...auth('admin'), 'Idempotency-Key': 'key-1' })
        .send({ customerId: 'c_1', totalCents: 4500 });
    const first = await post();
    const second = await post();

    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
  });

  it('rejects invalid input with field-level details', async () => {
    const res = await request(app.server).post('/orders').set(auth('admin')).send({ customerId: '', totalCents: -5 });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details.fields).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'customerId' })]));
  });
});

afterAll(() => app.close());
```

Fastify in-process injection where no socket is needed:

```ts
// test/api/health.inject.test.ts
import { expect, it } from 'vitest';
import { buildApp } from '../src/app';

it('GET /health/ready reports dependency status', async () => {
  const app = await buildApp({ databaseUrl: process.env.DATABASE_URL!, logger: false });
  const res = await app.inject({ method: 'GET', url: '/health/ready' });

  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ status: 'ok', checks: { db: 'ok' } });
  await app.close();
});
```

```bash
# The same specs over real TCP against a deployed build, once per pipeline.
docker compose -f infra/test.compose.yaml up -d --wait
npx wait-on tcp:localhost:8080 --timeout 60000
BASE_URL=http://localhost:8080 npx vitest run --config vitest.deployed.config.ts
docker compose -f infra/test.compose.yaml down -v
```

## Checklist

- [ ] Requests go through the real app factory, including plugins and middleware
- [ ] Success responses validated against the OpenAPI schema with Ajv
- [ ] Every error path asserts status, `code`, `message`, and field-level details
- [ ] Auth matrix covers missing, malformed, expired, under-privileged, and privileged tokens
- [ ] Pagination and filter boundaries tested (page 0, past the end, over-max limit, no match)
- [ ] Repeated idempotency keys and documented list headers asserted
- [ ] Data-dependent assertions roll back, so tests stay parallel-safe
- [ ] In-process injection for speed plus one deployed-build HTTP run in CI

## Anti-patterns

**Calling route handlers directly.** `handler(req, res)` skips auth middleware, validation, and serialization, so the test passes while the route is exposed. Fix: build the app and call it over HTTP or `inject`.

**Asserting only status codes.** `expect(res.status).toBe(200)` accepts an empty or wrong-shaped body. Fix: assert the body fields and validate against the OpenAPI schema.

**Happy-path-only auth coverage.** Only a valid admin token is tested, leaving viewer and anonymous paths unproven. Fix: parameterize a role matrix and assert both allowed and forbidden outcomes.

**Ignoring headers and pagination metadata.** Clients break on missing `Link` headers or absent total counts long after the suite goes green. Fix: assert the documented envelope on every list endpoint.