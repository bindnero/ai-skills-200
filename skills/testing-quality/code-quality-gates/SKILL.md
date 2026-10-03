---
name: code-quality-gates
description: Wires automated test and quality enforcement into CI with layered jobs, required status checks, coverage and mutation gates, and size-of-change limits. Use when setting up or repairing a merge gate, or when CI is slow or unreliable.
---

# Code Quality Gates

**Use when:** you are defining what must pass before code merges or deploys, or repairing a pipeline that is slow, flaky, or routinely bypassed.
**Do not use when:** you are deciding which tests to write for a feature — use `test-strategy-planning`; gates enforce a strategy, they do not choose one.

## Instructions

1. Define the gate as a contract with named jobs and clear owners. Each required check must map to a failure someone is expected to fix, not to a metric nobody owns.
2. Split the pipeline into a fast lane (lint, typecheck, unit tests, coverage) and a slow lane (integration, E2E shards, mutation), with the fast lane gating the expensive jobs via `needs`.
3. Order for cost: run cheap deterministic checks first so a formatting error never costs a 12-minute E2E run.
4. Run matrix jobs in parallel and split E2E into shards, but cap each matrix leg's resource use — an over-fanned matrix buys no speed and costs a runner bill.
5. Make required status checks explicit in branch protection: fast lane plus the E2E shard aggregator, never "all checks". Unrequired checks are advisory and get ignored.
6. Gate on deltas, not absolutes, for metrics that drift: coverage ratchet and mutation on changed files, so unrelated legacy code cannot block an unrelated PR.
7. Add timeouts and a concurrency group to every job, and cancel superseded runs on the same ref — otherwise queued retries create duplicate flakes.
8. Fail loudly and precisely: publish reports as artifacts with `if: always()` and put the failing assertion in the job summary, not only in a log 4000 lines down.
9. Fail closed on infrastructure errors. If the coverage upload or the test-container step crashes, the job must not report green — distinguish skipped from passed explicitly.
10. Measure the gate. Track wall-clock time and flake rate per job monthly; a gate that regularly takes over 20 minutes gets bypassed, which is worse than no gate.

## Patterns

Layered pipeline: fast lane gates the slow lane, shards in parallel, artifacts always uploaded:

```yaml
# .github/workflows/ci.yml
name: ci
on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  static:
    runs-on: ubuntu-latest
    timeout-minutes: 8
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: Lint and format
        run: npm run lint -- --max-warnings=0
      - run: npm run typecheck
      - name: Test ownership of new code
        run: |
          npx vitest run --changed
          echo "All new code has tests" >> "$GITHUB_STEP_SUMMARY"

  unit:
    needs: static
    runs-on: ubuntu-latest
    timeout-minutes: 12
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx vitest run --coverage --reporter=default --reporter=json-summary
      - name: Coverage ratchet
        run: |
          curl -fsSL -o coverage/baseline-summary.json \
            "https://raw.githubusercontent.com/${{ github.repository }}/main/coverage/baseline-summary.json"
          node scripts/coverage-ratchet.ts | tee -a "$GITHUB_STEP_SUMMARY"
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: coverage-report, path: coverage/, retention-days: 7 }

  mutation-diff:
    needs: static
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: Mutate changed source only
        run: |
          CHANGED=$(git diff --name-only origin/${{ github.base_ref }}...HEAD \
            | grep -E '^src/.*\.ts$' | tr '\n' ',' | sed 's/,$//' || true)
          if [ -n "$CHANGED" ]; then
            npx stryker run --mutate "$CHANGED" --reporters clear-text,progress --concurrency 2
          else
            echo "No changed source files" >> "$GITHUB_STEP_SUMMARY"
          fi
```

Branch protection as configuration, so the required set is auditable rather than folklore:

```bash
# Required checks are named individually — "all checks" hides which gate is advisory.
gh api -X PATCH repos/$REPO/branches/main/protection \
  -f required_status_checks[strict]=true \
  -f 'required_status_checks[contexts][]=static / lint and format' \
  -f 'required_status_checks[contexts][]=unit / Coverage ratchet' \
  -f 'required_status_checks[contexts][]=e2e (1, 2, 3, 4)' \
  -f 'required_status_checks[contexts][]=mutation-diff / Mutate changed source only' \
  -f enforce_admins=true \
  -f required_pull_request_reviews[required_approving_review_count]=1
```

## Checklist

- [ ] Every required status check maps to a named owner and a real failure mode
- [ ] Fast lane completes in under ten minutes and gates the slow lane via `needs`
- [ ] Expensive work is sharded or matrixed with a cap on fan-out
- [ ] Coverage and mutation gate on diffs, so legacy code cannot block unrelated PRs
- [ ] Every job has `timeout-minutes` and `fail-fast: false` where partial results are useful
- [ ] Superseded runs on the same ref are cancelled
- [ ] Reports upload with `if: always()` and summaries land in the job summary
- [ ] Infrastructure errors fail the job rather than skipping it as green

## Anti-patterns

**A single 25-minute job.** Everything runs after everything else, so a formatting fix costs a full E2E suite. Fix: split into fast and slow lanes and let `needs` order them.

**"All checks" as the requirement.** Unrequired checks silently fail and get ignored, and the required set becomes whatever happened to be set up. Fix: name each required check explicitly in branch protection.

**Absolute thresholds on an old codebase.** A 90% global coverage gate on a repo with 40% history blocks every PR and gets disabled. Fix: ratchet the delta and raise the bar over time.

**Green on infrastructure failure.** If the container step fails and the test step is skipped, the pipeline reports success on a build nobody ran. Fix: explicit failure on skipped steps and `if: always()` artifact uploads so the log proves what ran.