---
name: benchmark-testing
description: Measures code performance with Vitest bench, tinybench, and CI budgets that fail on regression. Use when tracking a latency or memory budget, choosing between two implementations, or preventing an optimisation from silently regressing.
---

# Benchmark Testing

**Use when:** you need to prove an optimisation worked, choose between two implementations on evidence, or fail a build when a hot path exceeds its latency or memory budget.
**Do not use when:** the requirement is user-perceived latency under concurrent traffic — use `load-testing`; a microbenchmark cannot predict that.

## Instructions

1. Ask what the number must decide before writing the benchmark: keep it only if a decision changes. Benchmarks with no consumer become noise nobody maintains.
2. Write the benchmark against the public entry point with realistic input sizes from production telemetry, not a hand-picked array of ten items.
3. Warm up before measuring — Vitest bench and tinybench both do iterations, but JIT tiering means the first iterations are not representative. Discard them or use enough iterations.
4. Pre-build the input outside the measured function. Building a 100k-row array inside the benchmark measures array construction.
5. Run multiple samples and report distributions, not a single mean. Use `tinybench` for `hz`, `mean`, `rme`, and per-sample output when variance is high.
6. Guard against dead-code elimination: accumulate or return the result so the optimiser cannot remove the call.
7. Set budgets, not "no regressions": assert a ceiling in nanoseconds/operations relative to a stored baseline, and allow a defined tolerance such as 10%.
8. Pin the environment — same Node version, same CPU governor, no other load — and record machine specs next to every result, since absolute numbers are meaningless across laptops.
9. Run microbenchmarks on a schedule and on demand for specific paths, not on every PR; full sweeps are far too noisy to gate merges.
10. Separate allocation checks from timing: a memory budget needs `process.memoryUsage()` deltas or a heap profiler, not a faster time.

## Patterns

Vitest bench for a regression budget plus tinybench for a distribution:

```ts
// src/orders/price.test.ts
import { bench, describe } from 'vitest';
import { computeTotals } from './price';
import { largeOrder } from './fixtures';

describe('computeTotals', () => {
  bench('1000 line items with promotions', () => {
    computeTotals(largeOrder(1000));
  });

  bench('10 line items (typical cart)', () => {
    computeTotals(largeOrder(10));
  });
});
```

```ts
// scripts/bench-order-path.ts
import { Bench } from 'tinybench';
import { computeTotals } from '../src/orders/price';

const input = buildOrder(1000); // built once, outside the measurement

const bench = new Bench({ time: 2000, warmupTime: 500, warmupIterations: 20 });
let checksum = 0;

bench
  .add('computeTotals#1000', () => {
    checksum += computeTotals(input).grandTotalCents; // defeats dead-code elimination
  })
  .add('computeTotals#10', () => {
    checksum += computeTotals(buildOrder(10)).grandTotalCents;
  });

await bench.run();

console.table(bench.table());
console.log('checksum', checksum);
```

CI budget gate against a committed baseline:

```ts
// scripts/bench-gate.ts
import { Bench } from 'tinybench';
import { readFileSync } from 'node:fs';
import { computeTotals } from '../src/orders/price';

const BASELINE = 'bench/baseline.json';
const TOLERANCE = 1.1; // 10% slower than baseline still passes

const previous: Record<string, number> = readFileSync(BASELINE, 'utf8')
  ? JSON.parse(readFileSync(BASELINE, 'utf8'))
  : {};

const bench = new Bench({ time: 1500, warmupTime: 300 });
bench.add('computeTotals#1000', () => {
  void computeTotals(input);
});
await bench.run();

let failed = false;
for (const task of bench.tasks) {
  const hz = task.result?.throughput.mean ?? 0;
  const baseline = previous[task.name];
  if (!baseline) {
    console.log(`${task.name}: no baseline (${hz.toFixed(2)} ops/s)`);
    continue;
  }
  if (hz < baseline / TOLERANCE) {
    console.error(`${task.name}: ${hz.toFixed(2)} ops/s is more than 10% below ${baseline}`);
    failed = true;
  } else {
    console.log(`${task.name}: ${((hz / baseline - 1) * 100).toFixed(1)}% vs baseline`);
  }
}
process.exit(failed ? 1 : 0);
```

```bash
npx vitest bench --run          # report only
npx vitest bench --run --outputFile=bench/results.json
node scripts/bench-gate.ts      # explicit budget check, run on schedule and on hot-path PRs
```

## Checklist

- [ ] Each benchmark maps to a decision someone will actually make
- [ ] Inputs built outside the measured function and sized from production data
- [ ] Warmup configured and dead-code elimination prevented
- [ ] Results reported as distributions with `rme`, not a single mean
- [ ] Budget expressed against a committed baseline with an explicit tolerance
- [ ] Environment pinned and machine specs recorded with results
- [ ] Microbenchmarks run on demand or on schedule rather than gating every PR
- [ ] Memory budgets measured separately with heap/memoryUsage, not inferred from time

## Anti-patterns

**Benchmarking setup.** Creating the input inside the measured function means the number reflects array construction, and the "optimisation" never shows up. Fix: build inputs once at module scope.

**Single-run means on shared CI.** A noisy neighbour skews the mean, so the gate fires randomly and gets disabled. Fix: multiple samples, `rme` reported, tolerance band, and scheduled rather than per-PR execution.

**Comparing against memory instead of baseline.** "Was 4ms, now 4.5ms" is noise; "was 4ms, now 40ms" is a regression. Fix: store a baseline and gate on a relative threshold.

**Keeping benchmarks nobody reads.** Seventeen microbenchmarks with no owner stop being updated when the code changes, and then they mislead. Fix: delete benchmarks that have not changed an implementation decision in two quarters.