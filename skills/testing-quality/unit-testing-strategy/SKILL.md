---
name: unit-testing-strategy
description: Sets unit test boundaries and writes AAA-structured Vitest suites with dependency injection, injected clocks, fake timers, and table-driven cases. Use when deciding what to unit-test, splitting a module or class for testability, or lifting mutation score on pure business logic.
---

# Unit Testing Strategy

**Use when:** a unit's behaviour can be asserted with no network, database, filesystem, or browser, and you want sub-second feedback on the logic itself.
**Do not use when:** the assertion only holds when two real subsystems interact — use `integration-testing`; or the logic only exists once rendered — use `component-test-harness`.

## Instructions

1. Inventory the module's public surface and mark each exported function as pure, clock-dependent, or I/O-dependent. Only pure and clock-dependent code qualifies for unit tests; the rest moves to an integration layer.
2. Find the seam before writing a test. If a function calls `fetch`, `Date.now()`, `randomUUID`, or `process.env` directly, change its signature to accept those as parameters before testing it — refactor-for-testability is cheaper than mocking modules.
3. Write the test name as `unit_state_expectation` so a failure message is a sentence, not a number. `rejects_expired_token_with_401`, not `test 3`.
4. Structure every test as Arrange / Act / Assert with blank lines between the blocks. The Act block is exactly one call — two calls means two tests or a helper.
5. Assert on return values and thrown error types plus messages, never on the number of internal function calls. If a test needs `expect(spy).toHaveBeenCalledTimes(3)`, the unit has a private dependency leaking out.
6. Convert repetitive cases into a table with `it.each`, keeping case objects narrow so the diff on failure shows exactly the input that broke.
7. Drive time explicitly: inject a `now: () => number` dependency, or use `vi.useFakeTimers()` with `vi.setSystemTime` and `vi.advanceTimersByTime`. Never assert against the real wall clock.
8. Keep each unit test under 5ms. If setup needs a database, a temp directory, or a rendered component, the test is misplaced.
9. Seed randomness through an injectable `rng` or a fast-check generator, not `vi.spyOn(Math, 'random')`, so the seed is reproducible and the assertion meaningful.
10. Cover the failure branches deliberately: empty input, boundary at exactly the limit, one past the limit, and the throwing path are the four cases most often missed.

## Patterns

Table-driven unit suite with a single-call Act block and injected clock:

```ts
import { describe, expect, it } from 'vitest';
import { rateLimiter } from '../src/rate-limiter';

describe('rateLimiter', () => {
  const now = { value: 1_700_000_000_000 };

  const limiter = () =>
    rateLimiter({ limit: 3, windowMs: 60_000, now: () => now.value });

  it.each([
    { calls: 3, expected: true, label: 'at the limit' },
    { calls: 4, expected: false, label: 'one past the limit' },
  ])('after $calls calls ($label) allow=$expected', ({ calls, expected }) => {
    const rl = limiter();

    let allowed = true;
    for (let i = 0; i < calls; i++) allowed = rl.hit('key-a');

    expect(allowed).toBe(expected);
  });

  it('reopens the window once windowMs has elapsed', () => {
    const rl = limiter();
    for (let i = 0; i < 3; i++) rl.hit('key-a');
    expect(rl.hit('key-a')).toBe(false);

    now.value += 60_001;

    expect(rl.hit('key-a')).toBe(true);
  });

  it('does not share counters between keys', () => {
    const rl = limiter();
    rl.hit('key-a');

    expect(rl.hit('key-b')).toBe(true);
  });
});
```

Throwing path asserted by type and message, no mock bookkeeping:

```ts
import { describe, expect, it } from 'vitest';
import { chargeCard } from '../src/payments';

describe('chargeCard', () => {
  it('throws_declined_error_when_issuer_returns_402', async () => {
    const gateway = {
      charge: async () => {
        throw new Error('gateway timeout');
      },
    };

    await expect(
      chargeCard({ gateway, amount: 100, idempotencyKey: 'k1' }),
    ).rejects.toMatchObject({ code: 'GATEWAY_UNAVAILABLE', retryable: true });
  });
});
```

## Checklist

- [ ] Every unit test runs in under 5ms with no network, DB, or filesystem access
- [ ] Time, randomness, and environment are injected, not read from globals
- [ ] Each test has exactly one Act call and a blank-line-separated AAA layout
- [ ] Test names read as `state_expectation` and locate the failure without opening the file
- [ ] Repetitive input/output pairs are expressed with `it.each`, not copy-paste
- [ ] Empty, boundary, boundary-plus-one, and throwing branches each have a case
- [ ] No assertion depends on the count or order of internal function calls
- [ ] `vitest run src/**.test.ts` completes the whole unit layer in well under 10s

## Anti-patterns

**Mocking the code under test.** Replacing the subject's own collaborators with mocks and then asserting on those mocks means the test passes even when the logic is inverted. Fix: assert the returned value, and if that value is unobservable, redesign the unit's interface instead.

**Asserting private call sequences.** `expect(ledger.write).toHaveBeenCalledBefore(audit.emit)` breaks on every refactor while catching no real bug. Fix: assert the persisted effect through a real collaborator in an integration test, and leave the unit test on return values.

**Freezing the clock with a real sleep.** `await new Promise(r => setTimeout(r, 1500))` makes the suite slow and machine-dependent. Fix: inject `now()` or use `vi.useFakeTimers()` plus `vi.advanceTimersByTime(1500)`.

**One mega-setup per describe.** A 60-line `beforeEach` shared by 30 tests hides which state each test depends on and makes every test sensitive to the whole fixture. Fix: extract a small builder per behaviour group and let tests declare only what they need.

**Testing getters and trivial accessors.** `expect(u.getEmail()).toBe(u.email)` adds runtime and mutation noise, since mutating the getter body still passes. Fix: delete the accessor or fold it into a test that exercises real behaviour.
