---
name: chaos-testing
description: Injects latency, packet loss, and dependency outages with Toxiproxy and fault-injection seams, then asserts the system degrades and recovers correctly. Use when validating retries, circuit breakers, timeouts, and graceful degradation before a launch.
---

# Chaos Testing

**Use when:** you need evidence that retries, circuit breakers, timeouts, and degraded-mode behaviour actually work — typically before a launch, after an incident, or when a dependency has caused outages.
**Do not use when:** verifying normal-path correctness — use `integration-testing`; or guessing where the risk is — use `test-strategy-planning` to pick the fault first.

## Instructions

1. Start from a real incident or a named SLO risk. "Inject latency into the payments dependency because our p99 tripled last quarter" beats running a generic chaos experiment.
2. Hypothesise explicitly before injecting: "with payments at 3s, checkout should degrade to 'payment unavailable' in under 5s, not queue indefinitely." Write the pass condition first — chaos without an assertion is just vandalism.
3. Use real network-level faults (Toxiproxy) for HTTP dependencies so timeouts, retries, and socket errors behave like production, rather than monkey-patching the client.
4. Define the blast radius: single pod, non-production environment, one dependency at a time, and a hard abort when a customer-visible SLO burns faster than expected.
5. Start with latency and packet loss before hard failure. Most production incidents are partial degradation, and it exposes retry storms earlier than a clean connection refusal.
6. Assert the recovery path, not just survival: circuit opens after N failures, half-open probes succeed, and the breaker closes again — with a test that proves the state transition.
7. Cap retry amplification deliberately. Verify retries are exponential with jitter, bounded, and that a dependency outage does not turn into a self-inflicted denial of service.
8. Inject at the level the app actually uses: connection pool limits, queue depth, and thread-pool starvation all need explicit limits or chaos just moves the outage.
9. Record every experiment in a runbook with the hypothesis, the injection, the observation, and the fix — chaos that produces no change is wasted budget.
10. Never run chaos against a customer-facing production environment without an abort switch, a kill command, and a staffed operator.

## Patterns

Toxiproxy fault injection with an explicit pass condition:

```ts
// test/chaos/payments-degradation.test.ts
import { Toxiproxy } from 'toxiproxy-javascript';
import { afterAll, expect, it } from 'vitest';

const proxy = new Toxiproxy('http://127.0.0.1:8474');
let paymentsProxy: { name: string; setToxics: (t: unknown[]) => Promise<void>; delete: () => Promise<void> };

afterAll(async () => {
  await paymentsProxy?.delete();
});

it('degrades checkout within 5s when payments is slow', async () => {
  paymentsProxy = await proxy.create({ name: 'payments', listen: '0.0.0.0:8475', upstream: 'payments.internal:8080' });
  await paymentsProxy.setToxics([
    { name: 'payments_latency', stream: 'downstream', toxicity: 1.0, attributes: { latency: 3000, jitter: 250 } },
  ]);

  const startedAt = Date.now();
  const response = await fetch('http://127.0.0.1:4000/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartId: 'c_1' }),
  });
  const elapsed = Date.now() - startedAt;

  // Bounded failure with a user-presentable state, not a hang.
  expect(elapsed).toBeLessThan(5_000);
  expect(response.status).toBe(503);
  expect((await response.json()).code).toBe('PAYMENT_UNAVAILABLE');
}, 15_000);
```

Circuit-breaker transitions proven as assertions, plus a retry-amplification bound:

```ts
// src/payments/breaker.test.ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CircuitBreaker } from './breaker';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('opens_after_three_failures_and_closes_after_a_successful_probe', async () => {
  const probe = vi.fn().mockRejectedValue(new Error('down'));
  const breaker = new CircuitBreaker(probe, { failureThreshold: 3, resetTimeoutMs: 5_000 });

  for (let i = 0; i < 3; i++) await breaker.call();
  expect(breaker.state).toBe('open');

  // Open circuit short-circuits without calling the dependency.
  await expect(breaker.call()).rejects.toThrow(/circuit open/);
  expect(probe).toHaveBeenCalledTimes(3);

  vi.advanceTimersByTime(5_001);
  probe.mockResolvedValue('ok');

  await expect(breaker.call()).resolves.toBe('ok');
  expect(breaker.state).toBe('closed');
});

it('never_exceeds_three_attempts_within_one_request', async () => {
  const downstream = vi.fn().mockRejectedValue(new Error('down'));
  const retry = new CircuitBreaker(downstream, { failureThreshold: 3, maxRetries: 2 });

  await expect(retry.call()).rejects.toThrow();

  expect(downstream).toHaveBeenCalledTimes(3); // 1 attempt + 2 bounded retries
});
```

Running the experiment against a disposable environment:

```bash
docker compose -f infra/chaos.compose.yaml up -d toxiproxy payments app
BASE_URL=http://127.0.0.1:4000 npx vitest run test/chaos/payments-degradation.test.ts
docker compose -f infra/chaos.compose.yaml down -v
```

## Checklist

- [ ] Every experiment has a written hypothesis and a measurable pass condition before injection
- [ ] Faults injected at the network layer (Toxiproxy) rather than by patching the client
- [ ] Blast radius bounded to one dependency, non-production, one fault at a time
- [ ] Latency and packet loss tried before hard connection refusal
- [ ] Recovery path asserted: breaker opens, half-open probes, closes again
- [ ] Retry attempts bounded per request and proven against amplification
- [ ] Timeouts, pool sizes, and queue depths have explicit limits
- [ ] A staffed abort switch exists before any run near customer traffic

## Anti-patterns

**Chaos without a hypothesis.** Randomly killing dependencies during a demo produces stories and no engineering. Fix: name the expected behaviour and the pass condition first, then inject.

**Fault injection in unit tests with a mocked client.** Mocked timeouts never reproduce real socket behaviour, retries, or connection-pool exhaustion. Fix: use Toxiproxy against the real client in a disposable environment.

**Unbounded retries.** An outage plus naive retries is a self-inflicted denial of service against your own dependency. Fix: assert the exact attempt count and exponential backoff with jitter.

**Running against production on a hunch.** Unannounced degradation in production burns real revenue and trust. Fix: staged environments first, staffed abort switch, and a written rollback before every experiment.