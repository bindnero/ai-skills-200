---
name: snapshot-testing
description: Pins serialized output with Vitest snapshots, asymmetric property matchers, inline snapshots, and CI read-only mode. Use when comparing large stable structures such as markup, i18n bundles, config output, or generated code.
---

# Snapshot Testing

**Use when:** the expected value is large, stable, and worthless to write by hand — rendered HTML, a generated query plan, an i18n key map, or a CLI's structured output.
**Do not use when:** the assertion is about pixels — use `visual-regression-testing`; or about one meaningful value — assert it directly so the failure message is readable.

## Instructions

1. Snapshot only when the whole structure is the contract. If you would never want to edit the expected value by hand, assert the specific fields instead.
2. Freeze every source of nondeterminism inside the snapshot: use `vi.setSystemTime`, pass fixed ids and dates, and sort object keys or map with `toMatchInlineSnapshot` over an ordered array.
3. Replace volatile values with asymmetric matchers — `expect.any(String)`, `expect.objectContaining`, `expect.stringMatching` — so a snapshot does not break on every UUID.
4. Prefer inline snapshots for small structures near the code, since the diff shows in the PR review; keep external `.snap` files for HTML and large blobs.
5. Configure a global `snapshotFormat` (printBasicPrototype, consistent escaping) once so snapshots do not churn between environments.
6. Run CI with `--ci`, which fails on newly written snapshots. Otherwise a typo'd test name silently creates a new snapshot and passes.
7. Review snapshot diffs character by character in the PR. A diff you cannot explain is an unreviewed behaviour change.
8. Track obsolete snapshots with `vitest run --update` after deleting tests, and confirm the count drops — otherwise the `.snap` file grows forever.
9. Set a CI check for the number of snapshot files and total size so a runaway generator gets caught.
10. Keep snapshots out of the coverage denominator — `coveragePathIgnorePatterns` the specs, and never snapshot-test the code you are trying to measure.

## Patterns

One structure, two shapes — external snapshot with matchers plus a reviewable inline snapshot:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    snapshotFormat: { printBasicPrototype: false, escapeString: false, indent: 2 },
  },
});
```

```ts
// src/query-plan.test.ts
import { describe, expect, it, vi } from 'vitest';
import { buildPlan } from './query-plan';

describe('buildPlan', () => {
  it('emits_two_index_lookups_for_the_orders_page', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-04T10:00:00Z'));

    const plan = buildPlan({ entity: 'orders', filters: { status: 'paid' } });

    expect(plan).toMatchSnapshot();
    vi.useRealTimers();
  });

  it('keeps_the_serialised_shape_stable_regardless_of_field_insertion_order', () => {
    const a = buildPlan({ entity: 'orders', filters: { status: 'paid', limit: 20 } });
    const b = buildPlan({ entity: 'orders', filters: { limit: 20, status: 'paid' } });

    expect(normalise(a)).toEqual(normalise(b));
    expect(normalise(a)).toMatchInlineSnapshot(`
      {
        "estimatedRows": 20,
        "steps": [
          { "index": "orders_status_idx", "kind": "index_scan", "table": "orders" },
          { "index": "orders_pkey", "kind": "fetch", "table": "orders" },
        ],
        "traceId": expect.any(String),
      }
    `);
  });
});

function normalise(plan: ReturnType<typeof buildPlan>) {
  return {
    ...plan,
    steps: [...plan.steps].sort((x, y) => x.index.localeCompare(y.index)),
  };
}
```

Markdown/HTML output where matchers carry the volatile bits:

```ts
// src/report/render.test.ts
import { expect, it, vi } from 'vitest';
import { renderReport } from './render';

it('renders_a_stable_markdown_report', () => {
  vi.setSystemTime(new Date('2026-03-04T10:00:00Z'));

  const md = renderReport({ rows: [{ sku: 'a', qty: 2 }, { sku: 'b', qty: 1 }] });

  expect(md).toMatchSnapshot();
  expect(md).toContain('| SKU | QTY |');
  expect(md).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
});
```

```bash
# CI: read-only snapshots, then a deliberate update pass.
npx vitest run --ci
npx vitest run --update     # local only; review `git diff` on .snap files before committing
```

## Checklist

- [ ] Snapshots are used only where the whole structure is the contract
- [ ] Time, randomness, and ids are frozen or replaced with asymmetric matchers
- [ ] Global `snapshotFormat` set so snapshots do not churn across environments
- [ ] CI runs with `--ci` so new snapshots fail instead of being written
- [ ] Small structures use inline snapshots reviewed inside the PR diff
- [ ] Every snapshot diff reviewed line by line, not accepted wholesale
- [ ] Obsolete snapshots removed and the count verified to shrink
- [ ] Test files excluded from coverage and lint noise metrics

## Anti-patterns

**Snapshot as a coverage substitute.** A 200-line `.snap` proves only that something changed, and reviewers rubber-stamp it. Fix: assert the handful of values the behaviour depends on; snapshot only the surrounding structure.

**Snapshotting volatile values.** Embedding `Date.now()` or generated UUIDs guarantees daily diffs, so the suite gets ignored. Fix: freeze time with `vi.setSystemTime` and use `expect.any(String)` for ids.

**Running without `--ci` on the pipeline.** A renamed test silently writes a fresh snapshot and the build goes green with zero assertions executed. Fix: `vitest run --ci` in CI and forbid `expect.addSnapshotSerializer` hacks that mask it.

**Accepting diffs you cannot explain.** `--update` on a 4,000-line snapshot is how a breaking output change reaches production. Fix: review `git diff -- '*.snap'`, and treat unexplained deletions as blocking.