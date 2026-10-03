---
name: mocking-strategies
description: Replaces network and boundary dependencies with MSW request handlers and vi.mock module stubs, choosing the seam and controlling coverage per test. Use when testing code that calls fetch or third-party SDKs, or when a real service is too slow or unavailable.
---

# Mocking Strategies

**Use when:** the code under test talks to something outside the process — HTTP APIs, clock, third-party SDKs, file system — and you need controlled responses including errors and latency.
**Do not use when:** the bug lives in the interaction between two real components — use `integration-testing`; and never mock the module under test itself.

## Instructions

1. Mock at the narrowest seam you can. Prefer MSW handlers at the network boundary over `vi.mock` of the HTTP client, because MSW exercises your real fetch, headers, and serialization code.
2. Choose the strategy by dependency type: HTTP → MSW `http` handlers; npm SDK → a hand-written fake injected at construction; time → `vi.useFakeTimers`; randomness → seeded generator; environment → an injected config object.
3. Start the MSW server once per test file in `beforeAll` with `onUnhandledRequest: 'error'`, so an unexpected call fails loudly instead of reaching the real internet.
4. Keep baseline responses in a shared `handlers` array and override per test with `server.use(...)`; reset with `server.resetHandlers()` in `afterEach`. Never mutate the shared array between tests.
5. Model the failure modes you actually hit: 500 with a body, empty 200, slow response, malformed JSON, and a 2xx with an unexpected shape. A single happy-path handler proves nothing about error handling.
6. Use `delay()` or `delay('infinite')` explicitly to test loading, cancellation, and timeout states rather than relying on timing.
7. When you must use `vi.mock`, give it a factory (never an automock) so imports stay lazy, and keep the fake adjacent to the test with a name that states what it replaces.
8. Prefer partial fakes over full ones: spread the real implementation (`{ ...actual, track: vi.fn() }`) so unmocked methods keep working and the fake cannot silently diverge.
9. Assert on the outbound request the fake received, once, with a purpose-built matcher — that is where missing idempotency keys and wrong auth headers hide.
10. Review mocks for drift quarterly: delete any mock that no longer matches the real payload shape, because a stale mock is worse than no mock.

## Patterns

MSW v2 server with strict unhandled-request policy and per-test overrides:

```ts
// test/mocks/server.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('https://api.stripe.com/v1/charges/:id', () =>
    HttpResponse.json({ id: 'ch_1', amount: 4500, status: 'succeeded' })),
];
export const server = setupServer(...handlers);
```

```ts
// src/billing/charge.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { server } from '../../test/mocks/server';
import { chargeCustomer } from './charge';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('chargeCustomer', () => {
  it('returns the charge id from a 200', async () => {
    const charge = await chargeCustomer({ customerId: 'cus_9', amountCents: 4500 });
    expect(charge.id).toBe('ch_1');
  });

  it('surfaces declines as non-retryable', async () => {
    server.use(
      http.post('https://api.stripe.com/v1/charges', () =>
        HttpResponse.json({ error: { code: 'card_declined' } }, { status: 402 }),
      ),
    );
    await expect(chargeCustomer({ customerId: 'cus_9', amountCents: 4500 })).rejects.toMatchObject(
      { code: 'card_declined', retryable: false },
    );
  });

  it('treats a hanging charge as a timeout', async () => {
    server.use(
      http.post('https://api.stripe.com/v1/charges', async () => {
        await delay('infinite');
        return new HttpResponse(null, { status: 200 });
      }),
    );
    await expect(
      chargeCustomer({ customerId: 'cus_9', amountCents: 4500, timeoutMs: 50 }),
    ).rejects.toMatchObject({ code: 'ETIMEDOUT' });
  });

  it('retries a transient 503 at most twice', async () => {
    const attempts = vi.fn();
    server.use(
      http.post('https://api.stripe.com/v1/charges', () => {
        attempts();
        return HttpResponse.json({ message: 'boom' }, { status: 503 });
      }),
    );
    await expect(
      chargeCustomer({ customerId: 'cus_9', amountCents: 4500, maxRetries: 2 }),
    ).rejects.toThrow();
    expect(attempts).toHaveBeenCalledTimes(3);
  });
});
```

SDK fake built by spreading the real module:

```ts
// src/notify/send-email.test.ts
import { expect, it, vi } from 'vitest';

it('does not email bounced addresses', async () => {
  const deliver = vi.fn().mockResolvedValue({ messageId: 'm1' });
  const real = await vi.importActual<typeof import('./transport')>('./transport');
  vi.mock('./transport', () => ({ ...real, deliver }));
  const { sendWelcome } = await import('./send-welcome');
  await sendWelcome({ email: 'bounced@example.com', userId: 'u1' });
  expect(deliver).not.toHaveBeenCalled();
});
```

## Checklist

- [ ] Mocks sit at a boundary the code under test does not own
- [ ] MSW runs with `onUnhandledRequest: 'error'`
- [ ] Baseline handlers live in a shared array; overrides use `server.use` and reset after each test
- [ ] Error, empty, slow, and malformed responses are all represented
- [ ] Timeouts and cancellation are exercised with explicit `delay`, not by luck
- [ ] `vi.mock` always uses a factory and keeps real behaviour via `importActual`
- [ ] Outbound request assertions exist for idempotency keys, auth headers, and pagination params
- [ ] Mock payloads still match the real service schema (verified against the contract suite)

## Anti-patterns

**Automocking a module.** `vi.mock('./pricing')` with no factory replaces every export with a no-op, so the test passes while production logic would break. Fix: always provide a factory, spread `importActual`, and override only the one function.

**Mocking the code under test.** Stubbing the module that holds the logic under test makes the test tautological. Fix: mock only leaf dependencies one layer out, and verify behaviour through the public export.

**One happy-path handler per endpoint.** Tests then pass while the real API returns 429s with a `Retry-After` header and the code loops forever. Fix: model rate limits, 5xx, and empty responses with real payload shapes.

**Shared mutable mock state.** Reusing one `vi.fn()` across tests without `mockClear` makes call counts depend on execution order. Fix: `mockClear` in `beforeEach`, or create fakes inside the test.
