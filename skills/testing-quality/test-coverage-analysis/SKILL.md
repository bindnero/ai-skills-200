---
name: test-coverage-analysis
description: Interprets V8 coverage reports, sets per-directory thresholds, and ratchets against a base-branch baseline. Use when deciding where to add tests, when coverage dropped, or when a coverage gate needs realistic numbers.
---

# Test Coverage Analysis

**Use when:** coverage fell in a PR, a threshold is blocking merges, or you must decide which untested file to test next rather than chasing a percentage.
**Do not use when:** your tests execute but assert nothing — coverage will be 100% and meaningless; use `mutation-testing` to measure assertion strength instead.

## Instructions

1. Read coverage as a diagnostic, not a target. Use `json-summary` plus per-file data to find untested branches, then convert findings into named test cases.
2. Set thresholds per directory, not globally. One number for the whole repo hides that `src/legacy` is 20% while `src/billing` is 96%.
3. Ratchet rather than reset: store `coverage-summary.json` as a CI artifact from `main` and fail the PR if the delta is negative, with an explicit override for intentional refactors.
4. Exclude what cannot be meaningfully tested — `*.d.ts`, generated clients, barrel re-exports, `main.ts`, and config — with a comment per pattern so the exclusion list stays auditable.
5. Enable `all: true` so untested files count. Without it, adding a new file with no tests reports 100% coverage for the diff.
6. Branch coverage is where real gaps live. Target lines ≥ 80% and branches ≥ 70% for application code; anything higher without mutation testing is self-deception.
7. Investigate "covered but risky" files — high line coverage with assertions removed in the same PR — by spot-reading three random uncovered branches per file.
8. Use `--changed` on PRs, a full run nightly, and publish the HTML report and per-directory table every run, so a number in CI logs is not the only signal about where to work.
9. Re-baseline deliberately after an architecture change, in its own commit, with a rationale in the PR body — never as a side effect of unrelated work.

## Patterns

Vitest coverage config with per-directory thresholds and honest exclusions:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov', 'html'],
      reportsDirectory: './coverage',
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        'src/generated/**', // OpenAPI client output
        'src/**/index.ts', // barrel re-exports
        'src/main.ts',
        'vitest.config.ts',
      ],
      thresholds: {
        lines: 82,
        functions: 85,
        branches: 74,
        statements: 82,
        perFile: false,
        'src/billing/**': { lines: 90, branches: 85 },
        'src/legacy/**': { lines: 25, branches: 15 },
      },
    },
  },
});
```

Coverage ratchet that fails on a negative delta against the base branch:

```ts
// scripts/coverage-ratchet.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

type Key = 'lines' | 'branches';
const BASELINE = 'coverage/baseline-summary.json';

const current = Object.fromEntries(
  (['lines', 'branches'] as Key[]).map((key) => {
    const s = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
    const entry = s[key] as { total: number; pct: number };
    return [key, entry.total === 0 ? 100 : Number(entry.pct.toFixed(2))];
  }),
) as Record<Key, number>;

if (!existsSync(BASELINE)) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2));
  console.log('coverage baseline created', current);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<Key, number>;
const regressions = (Object.keys(current) as Key[]).filter((k) => current[k] < base[k]);

for (const k of regressions) console.error(`coverage regression in ${k}: ${base[k]}% -> ${current[k]}%`);
process.exit(regressions.length ? 1 : 0);
```

```bash
npx vitest run --coverage --changed          # PR gate, related tests only
npx vitest run --coverage                    # nightly full run
node scripts/coverage-ratchet.ts             # fails on negative delta
```

Per-file triage query that answers "where do I test next":

```bash
node -e '
  const s = require("./coverage/coverage-summary.json");
  const rows = Object.entries(s)
    .filter(([k]) => k !== "total")
    .map(([file, v]) => ({ file: file.replace(process.cwd() + "/", ""), lines: v.lines.pct,
      branches: v.branches.pct, uncovered: v.lines.total - v.lines.covered }))
    .filter((r) => r.lines < 80 && r.uncovered > 5)
    .sort((a, b) => b.uncovered - a.uncovered);
  console.table(rows);
'
```

## Checklist

- [ ] `all: true` so untested files are counted in the total
- [ ] Exclusions are each justified (generated, barrel, entrypoint, type-only)
- [ ] Thresholds set per directory, with the legacy path explicitly marked low
- [ ] Branch thresholds exist alongside line thresholds
- [ ] A baseline summary is committed and the ratchet fails on negative deltas
- [ ] Reports published on every PR (HTML + summary table)
- [ ] PR runs use `--changed`; a full run happens nightly
- [ ] Coverage findings are converted into named test cases, not just a percentage

## Anti-patterns

**Coverage as the goal.** Teams add assertion-free calls until a file hits 100% while the branch that matters is still untested. Fix: treat coverage as a search tool, confirm strength with mutation testing.

**A single global threshold.** One number forces either ignoring real regressions in core code or blocking on legacy modules nobody will fix. Fix: per-directory thresholds and a documented ratchet.

**Resetting the baseline in a refactor PR.** Coverage "improves" because the bar moved. Fix: separate re-baselining commits with a written rationale, reviewed explicitly.

**Skipping `all: true`.** New files with no tests are absent from the report, so the most dangerous additions are invisible. Fix: enable `all` and keep the include list tight to `src`.