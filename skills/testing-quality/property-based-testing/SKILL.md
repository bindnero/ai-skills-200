---
name: property-based-testing
description: Finds counterexamples with fast-check arbitraries, invariants, shrinking, and seeded regression replay. Use when input space is too large to enumerate, when testing parsers, encoders, reducers, or invariants across round trips.
---

# Property-Based Testing

**Use when:** the input space is combinatorial and hand-picked cases cannot cover it, or when the property you care about is an invariant rather than a specific expected value.
**Do not use when:** behaviour is a small, well-understood set of rules — use `unit-testing-strategy` with `it.each`; or when you need a specific known-good output for regression — use `snapshot-testing`.

## Instructions

1. State the property as a sentence before writing any generator: "for any list, `decode(encode(xs))` deep-equals `xs`". If you cannot state it, you cannot test it.
2. Choose generators with structure over `fc.anything()`. `fc.array(fc.integer({ min: -2 ** 31, max: 2 ** 31 - 1 }))` beats a generic any because it stays inside the domain and shrinks to something readable.
3. Keep `numRuns` proportional to the generator's depth — 100 for a flat pair, 1000+ for nested structures — and always pass an explicit `seed` in CI so a CI failure can be replayed locally.
4. Rely on shrinking. When a property fails, fast-check returns a minimal counterexample; read it, then convert it into a deterministic unit test so the specific bug survives generator changes.
5. Test metamorphic relations when reference examples are unavailable: shuffling input does not change the output's order-independent properties, doubling input doubles the result, and adding an item never decreases a monotonic metric.
6. Generate realistic invalid input deliberately (`fc.string()`, huge unicode, `NaN`, boundary integers) because parsers break on the shape you refuse to generate.
7. Attach invariants as parallel properties on the same generator instead of duplicating the generator string, so a change to the generator applies everywhere.
8. Use `fc.asyncProperty` for async units and pass a real timeout; keep the number of remote calls low by testing a pure core and covering the I/O wrapper with MSW.
9. Record shrunk counterexamples in the repo as regression cases, and add a `fc.configureGlobal({ endOnFailure: false })` free test that replays the stored seed on every CI run of the fast lane.
10. Cap runtime: if a property test exceeds a couple of seconds, shrink the generator's size (`maxLength`, `maxDepth`) rather than accepting a slow suite.

## Patterns

fast-check invariants, metamorphic relations, and shrink replay:

```ts
// src/codec.test.ts
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { decode, encode, summarise } from './codec';

const segment = fc.record({
  value: fc.integer({ min: -1_000_000, max: 1_000_000 }),
  label: fc.constantFrom('AAA', 'BBB', 'CCC'),
});

const doc = fc.array(fc.tuple(fc.string({ maxLength: 24 }), segment), { maxLength: 40 });

describe('codec', () => {
  it('round_trips_any_document', () => {
    fc.assert(
      fc.property(doc, (xs) => {
        expect(decode(encode(xs))).toEqual(xs);
      }),
      { numRuns: 500, seed: 20260902 },
    );
  });

  it('summary_is_invariant_under_input_order', () => {
    fc.assert(
      fc.property(doc, (xs) => {
        const ys = fc.shuffle(xs);
        fc.pre(ys.length === xs.length);

        expect(summarise(ys).total).toBe(summarise(xs).total);
      }),
      { numRuns: 300 },
    );
  });

  it('never_crashes_on_arbitrary_strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (input) => {
        expect(() => decode(input)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });
});
```

Converting a shrunk counterexample into a permanent regression test:

```ts
// Reproduced from fast-check seed 20260902, numRuns 500 — shrunk to the minimal input.
import { describe, expect, it } from 'vitest';
import { decode, encode } from './codec';

describe('codec regression', () => {
  it('rejects_a_document_with_a_duplicate_label', () => {
    const xs = [
      ['alpha', { value: -999_999, label: 'AAA' }],
      ['beta', { value: 1, label: 'AAA' }],
    ];

    expect(() => decode(encode(xs))).toThrowError(/duplicate label/i);
  });
});
```

```ts
// Replay a stored failure deterministically.
it('replays_stored_seed', () => {
  const details = fc.check(
    fc.property(fc.integer(), (n) => n !== 13_337),
    { seed: 424242, verbose: 2 },
  );

  if (details.failed) {
    expect(details.counterexample).toEqual([13_337]);
  } else {
    expect(details.counterexamplePath).toBeDefined();
  }
});
```

## Checklist

- [ ] Every property is written as a one-sentence invariant before generators are written
- [ ] Generators are domain-shaped with explicit `min`/`max`/`maxLength` bounds
- [ ] `numRuns` and `seed` are set explicitly, with the seed recorded in CI output
- [ ] Failures are shrunk, understood, and converted into a named regression test
- [ ] Metamorphic relations cover cases where no reference output is known
- [ ] Invalid, empty, unicode, and boundary inputs are generated on purpose
- [ ] Async properties use `fc.asyncProperty` with a real timeout and minimal I/O
- [ ] Total property-test runtime stays inside the fast lane budget

## Anti-patterns

**Property-shaped assertion with examples inside.** `fc.property(fc.integer(), n => expect(fn(n)).toBe(fixedValue))` cannot shrink to anything useful and just re-tests examples. Fix: assert a relation between two calls, not a constant.

**`fc.anything()` for domain data.** Unconstrained unicode objects produce counterexamples no developer believes and slow shrinking. Fix: build an explicit generator per entity with bounded size.

**Never converting a counterexample into a regression test.** The next generator change silently un-covers the bug. Fix: paste the shrunk input into a fixed `it()` and keep the property test as the search tool.

**Property tests over the I/O wrapper.** Two hundred generated cases each hitting a sandbox API turns the fast lane into an integration suite. Fix: generate over a pure core and cover the wrapper with a handful of MSW-driven cases.
