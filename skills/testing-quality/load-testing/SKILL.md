---
name: load-testing
description: Builds k6 scenarios with arrival-rate load models, threshold gates, custom Trend and Rate metrics, and staged soak tests. Use when validating throughput or latency SLOs before a launch, when capacity regresses, or when choosing instance sizes.
---

# Load Testing

**Use when:** you need numbers about concurrency, latency percentiles, and error rates under traffic, and a capacity or performance regression must fail a build or block a release.
**Do not use when:** correctness under rare inputs is the question — use `property-based-testing`; or a single user journey is broken — use `e2e-test-authoring`.

## Instructions

1. Write the SLO as thresholds before writing the script: target RPS, p95 latency, and error budget. A k6 run without `thresholds` is a curiosity, not a gate.
2. Model arrival with `ramping-arrival-rate` for open-loop traffic — a closed `vus` model hides latency collapse because slow responses reduce the request rate exactly when the system suffers.
3. Start with a smoke profile (5 VUs, 30s) to prove auth, payloads, and assertions, then run smoke, load, and stress profiles from the same script using `--env PROFILE=`.
4. Seed test users and tokens in `setup()` with a shared-iterations arrangement, and pass them to scenarios as data — never log in inside the measured VU loop.
5. Assert business preconditions with `check()` plus a custom `Rate`, so a run that returns HTTP 200 with an empty basket still fails.
6. Track latency with `http_req_duration` (which includes waits) *and* a critical-operation `Trend` so you can see which endpoint degrades first.
7. Tag every request with a tag (`{ tags: { flow: 'checkout' } }`) and use `--tag test:smoke` to run a fast gate while keeping one script for every profile.
8. Treat thresholds as a ratchet: record the current p95 as the new baseline after any deliberate performance work, and tighten rather than loosen without an explanatory comment.
9. Keep environments comparable. A load test against a laptop with a mocked database proves nothing; run against a deployed, production-shaped environment and say so in the report.
10. Report percentiles (p50/p90/p95/p99) and error rate alongside throughput — an average latency number is meaningless for tail latency.

## Patterns

One k6 script, three profiles, threshold gates:

```js
// perf/checkout.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const checkoutDuration = new Trend('checkout_duration', true);
const outOfStock = new Rate('out_of_stock_rate');
const TAG = __ENV.TEST_TAG ?? 'regression';

export const options = {
  scenarios: {
    checkout: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { target: 50, duration: '2m' },
        { target: 200, duration: '5m' },
        { target: 0, duration: '30s' },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<800'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    out_of_stock_rate: ['rate<0.02'],
    checkout_duration: ['p(95)<600'],
  },
};

export function setup() {
  const res = http.post(`${__ENV.BASE_URL}/api/test/tokens`, JSON.stringify({ count: 300 }), {
    headers: { 'Content-Type': 'application/json' },
  });
  return { tokens: res.json().tokens };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.tokens[__VU % data.tokens.length]}`,
  };
  const tags = { flow: 'checkout', test: TAG };

  const cart = http.post(`${__ENV.BASE_URL}/api/cart`, JSON.stringify({ sku: `sku-${__VU % 40}` }), { headers, tags });
  const started = Date.now();
  const order = http.post(`${__ENV.BASE_URL}/api/orders`,
    JSON.stringify({ cartId: cart.json('id'), paymentToken: 'tok_test' }), { headers, tags });
  checkoutDuration.add(Date.now() - started);

  const ok = check(order, {
    'status is 200 or 409': (r) => [200, 409].includes(r.status),
    'order id returned': (r) => (r.status === 409 ? true : !!r.json('id')),
  });
  if (order.status === 409) outOfStock.add(ok === true);

  sleep(Math.random() * 0.5);
}
```

```bash
# Fast gate, then the full profile in a dedicated performance environment.
k6 run --env PROFILE=smoke --tag test:smoke --vus 5 --duration 30s perf/checkout.js
k6 run --env BASE_URL=https://perf.internal k6 run perf/checkout.js --out json=perf-results.json
```

Budget-style CI gate that fails the build on regression:

```bash
#!/usr/bin/env bash
set -euo pipefail
k6 run --quiet --summary-export=perf/summary.json perf/checkout.js
node -e '
  const s = require("./perf/summary.json");
  const p95 = s.metrics.http_req_duration.values["p(95)"];
  if (p95 > 300) { console.error(`p95 ${p95}ms exceeds 300ms budget`); process.exit(1); }
  const fail = s.metrics.http_req_failed.values.rate;
  if (fail > 0.01) { console.error(`error rate ${fail} exceeds 1%`); process.exit(1); }
'
```

## Checklist

- [ ] Thresholds exist for p95 latency, error rate, and at least one business check rate
- [ ] Arrival-rate executor used for open-loop traffic; `vus` only for closed-loop comparison
- [ ] Smoke profile runs in under a minute and is the PR gate
- [ ] Tokens and users created in `setup()` and passed as scenario data
- [ ] Critical operations have their own `Trend`/`Counter`/`Rate` metric
- [ ] Requests tagged by flow and test tier so a subset can be re-run
- [ ] Results reported as percentiles plus throughput and error rate
- [ ] Thresholds only tightened with a written reason, never silently loosened

## Anti-patterns

**Closed-loop VUs for capacity questions.** With fixed VUs, the load generator slows down exactly when the server does, hiding the queue collapse you are trying to measure. Fix: `ramping-arrival-rate` with `maxVUs` as the only ceiling.

**No thresholds.** A run is reported "looks fine" against no baseline, so nobody can say whether a 3x regression happened. Fix: encode the SLO as `thresholds` so k6 exits non-zero.

**Authenticating inside the VU loop.** Login dominates the measurement and the auth service becomes the bottleneck being measured. Fix: mint tokens in `setup()` and cache them.

**Benchmarks against a dev machine.** Numbers from a laptop with local mocks are used in planning decks and are meaningless. Fix: run against a deployed, production-shaped environment and label capacity conclusions with the environment spec.