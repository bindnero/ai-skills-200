---
name: mutation-testing
description: Measures test strength with Stryker mutators, per-test coverage analysis, mutation score thresholds, and diff-scoped runs. Use when coverage looks high but assertions are weak, or when adding a strict quality gate for critical modules.
---

# Mutation Testing

**Use when:** line coverage is high but the assertions are weak, a critical package needs proof that its tests would catch a real regression, or you want to find which files have hollow tests.
**Do not use when:** you still need a baseline of any coverage at all — use `test-coverage-analysis` first; mutation on generated code or vendored files is pure noise.

## Instructions

1. Treat line coverage as a prerequisite. Stryker's `coverageAnalysis` finds no coverage for a file if no test covers it, so run coverage first and scope mutation to covered modules.
2. Exclude everything you do not own: generated clients, migrations, type-only files, config, and vendored code in `mutate`/`ignoredMutationPaths`, or your score becomes a number nobody can act on.
3. Choose mutators deliberately per directory — arithmetic replacements for pricing code, string replacements for routing and state machines, conditional-boundary mutations for validation and pagination.
4. Start with `thresholds: { high: 80, low: 60, break: 65 }` and ratchet upward once the suite is stable; do not start at 95 and drown in backlog on day one.
5. Set `coverageAnalysis: "perTest"` so only tests that cover the mutated file run per mutant — this is the single biggest speed lever, and `"off"` in the same repo is a common mistake.
6. Run mutation on the diff in PRs, full-repo mutation nightly. `stryker run --mutate "src/orders/**"` against the changed directories keeps the gate under two minutes.
7. Read surviving mutants as test-design instructions, not as code defects. A surviving `if (x > y)` mutant means no test covers the boundary; add the boundary test rather than excluding the mutant.
8. Exclude a mutant only with an inline comment naming the reason (equivalent mutant, generated code, defensive branch) — an unexplained `// Stryker disable` is a hidden coverage gap.
9. Track the survivor list per module over time and require the count to not increase, so quality cannot silently regress between sprints.
10. Pair mutation results with a per-directory score report published to CI, so teams see which packages have hollow assertions rather than a single repo number.

## Patterns

Stryker config tuned for a PR gate and a nightly full run:

```json
// stryker.conf.json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "testRunner": "vitest",
  "reporters": ["clear-text", "progress", "html", "json"],
  "coverageAnalysis": "perTest",
  "incremental": true",
  "concurrency": 4,
  "thresholds": { "high": 80, "low": 60, "break": 65 },
  "mutate": ["src/**/*.ts", "!src/**/*.d.ts", "!src/generated/**"],
  "ignoreStatic": true,
  "mutator": {
    "excludedMutations": ["objectRest"],
    "mutators": ["ArithmeticOperator", "BooleanOperator", "ConditionalBoundary"]
  }
}
```

Per-directory mutator selection and justification, colocated with the source:

```ts
// stryker.mutator.json (referenced via `mutate` glob in stryker.conf.json)
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "mutator": {
    "mutators": ["StringLiteral", "ArrayDeclaration", "ArrowFunction", "ObjectLiteral"]
  }
}
```

```ts
// src/orders/tax.ts
export function taxFor(totalCents: number, region: string): number {
  /* Stryker disable next-line: region table is validated upstream; mutation here is equivalent */
  const rate = RATES[region];
  if (totalCents > 100_000) {
    return Math.round(totalCents * (rate + 0.02));
  }
  return Math.round(totalCents * rate);
}
```

Diff-scoped PR run and nightly full run:

```yaml
# .github/workflows/mutation.yml
jobs:
  mutation-diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx vitest run --coverage --coverage.reporter=json-summary
      - name: Mutate only changed source
        run: |
          CHANGED=$(git diff --name-only origin/${{ github.base_ref }}...HEAD \
            | grep -E '^src/.*\.ts$' | tr '\n' ',' | sed 's/,$//')
          if [ -n "$CHANGED" ]; then npx stryker run --mutate "$CHANGED"; fi
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: mutation-report, path: reports/mutation/html }

  mutation-full:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx stryker run --concurrency 8
      - uses: actions/upload-artifact@v4
        with: { name: mutation-report-nightly, path: reports/mutation/html }
```

```bash
npx stryker run --thresholdBreak 75 --reporters clear-text,progress
```

## Checklist

- [ ] Coverage runs first; mutation is scoped to files that tests actually cover
- [ ] Generated, type-only, and vendored paths excluded from `mutate`
- [ ] `coverageAnalysis` is `perTest`, not `off`
- [ ] Score thresholds set at a ratcheting level the suite can actually hold
- [ ] PR runs mutate only changed files; the full repo runs nightly
- [ ] Every excluded mutant has an inline comment justifying equivalence
- [ ] Surviving mutants are converted into boundary tests, not ignored
- [ ] Per-module score is published so regressions in one package are visible

## Anti-patterns

**Mutation scoring on generated code.** Mutating an OpenAPI client produces thousands of equivalent survivors that bury real signal. Fix: exclude generated paths and only mutate the hand-written business logic.

**Full-repo mutation on every PR.** A ten-minute gate gets disabled within two sprints. Fix: diff-scoped runs on PRs, full run scheduled nightly with the report published.

**Fixing low scores with exclusions.** Adding `// Stryker disable` for every survivor converts the gate into a no-op while reporting a green number. Fix: treat a survivor as a missing test; add the case that kills it.

**Measuring mutation on everything equally.** Trivial getters and critical pricing logic get the same weight, so the score is dominated by code nobody cares about. Fix: per-directory mutators and a threshold that targets critical modules.