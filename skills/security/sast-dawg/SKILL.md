---
name: sast-dawg
description: Runs static application security testing with dataflow-aware taint analysis, triages results by reachability, and gates merges on high-confidence findings. Use when setting up SAST in CI, tuning rules, triaging a scanner report, or explaining a taint-tracking finding.
---

# SAST and Taint Analysis

**Use when:** running static analysis across a codebase, wiring it into a pre-merge gate, triaging a scanner report for real exploitability, or reducing false positives so the gate is trusted.
**Do not use when:** checking for known CVEs in dependency versions — use `dependency-vulnerability-audit`; and for review by a human of new logic — use `secure-coding-review`.

## Instructions

1. Choose a taint-aware analyzer for the language — CodeQL, Semgrep with dataflow rules, Bearer, Bandit, gosec, or Brakeman — and run it on every pull request and on a schedule for the full repository, not only changed files.
2. Define the sanitizer libraries the project actually uses, so validated-and-encoded flows are not reported. An analyzer that does not know your ORM or escaping helper produces unusable noise and gets disabled.
3. Triage every finding with a written verdict: real with a path, real but mitigated, or false positive with the specific reason. Store the verdict so the next run does not re-litigate it.
4. Judge reachability, not just taint. Track from the source (request parameter, header, file, message) through propagation to the sink (query execution, template render, process spawn, path open, deserializer) and confirm the path executes in production code, not tests, examples, or dead code.
5. Gate merges on high-confidence findings with a non-zero exit, and require an explicit, time-bounded suppression with an owner and a linked issue for anything waived.
6. Track false positive rate over time. If it exceeds roughly 30 percent, fix detection rules or add sanitizers before adding more rules; a noisy gate gets disabled rather than fixed.
7. Add a baseline for legacy findings so new issues stand out, with an owner and a burn-down plan rather than a permanent backlog.
8. Scan for the classes the tools catch reliably — injection, path traversal, unsafe deserialization, weak cryptography, hardcoded secrets, missing authorization on routes — and route the classes tools miss to code review and dedicated checks.
9. Emit machine-readable output (SARIF) and store results as a build artifact so trend, ownership, and recurrence are measurable across releases.
10. Pair SAST with runtime verification: a critical finding should be reproduced with a benign probe and converted into a regression test, which is the only way to confirm the fix.

## Patterns

SARIF-based CI gate:

```yaml
name: sast
on: [pull_request]
permissions:
  contents: read
  security-events: write
jobs:
  codeql:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: python, javascript-typescript
          queries: security-extended
      - uses: github/codeql-action/autobuild@v3
      - uses: github/codeql-action/analyze@v3
```

Semgrep taint rule for a sink the project has not sanitized:

```yaml
rules:
  - id: acme-unparameterized-sql
    languages: [python]
    severity: ERROR
    message: SQL built by string formatting reaches cursor.execute. Use a bound parameter.
    mode: taint
    pattern-sources:
      - pattern: request.$ANY
    pattern-sinks:
      - pattern: $CURSOR.execute($SQL, ...)
    pattern-sanitizers:
      - pattern-inside: |
          $X = sanitize_identifier(...)
          ...
    metadata:
      cwe: "CWE-89: Improper Neutralization of Special Elements used in an SQL Command"
      owasp: "A03:2021 - Injection"
```

Analyzer configuration with real sanitizers:

```ini
# .semgrep.yml
rules:
  - id: acpe-taint-command-injection
    mode: taint
    languages: [python]
    pattern-sources:
      - pattern: request.$ANY
    pattern-sinks:
      - patterns:
          - pattern: subprocess.run(..., shell=True, ...)
    pattern-sanitizers:
      - pattern: shlex.quote(...)
      - pattern-inside: subprocess.run([$BIN, $ARG, ...])
    message: Untrusted request data reaches a shell command.

  - id: acpe-no-verify-false
    languages: [python]
    pattern: requests.$F(..., verify=False, ...)
    message: TLS certificate verification disabled.
    severity: ERROR
```

Triage record that survives the next run:

| Rule | Location | Source → Sink | Reachable | Verdict | Action |
| --- | --- | --- | --- | --- | --- |
| acme-unparameterized-sql | `api/orders.py:88` | `request.args["sort"]` → `cursor.execute` | yes, public route | real | parameterize; add test |
| acpe-no-verify-false | `tests/conftest.py:31` | n/a | test only | false positive | scope rule to `src/` |

```bash
# scope the gate to production code so tests do not block merges
semgrep scan --config .semgrep.yml --exclude 'tests/**' --exclude '**/fixtures/**' \
  --error --sarif --output semgrep.sarif

bandit -r src/ -ll -f json -o bandit.json       # Python
gosec ./... -fmt sarif -out gosec.sarif          # Go
brakeman -f json -o brakeman.json                # Rails
```

## Checklist

- [ ] A taint-aware analyzer runs on every pull request and on a schedule across the whole repository.
- [ ] The analyzer knows the project's real sanitizers (ORM binds, escaping helpers, `subprocess` list form).
- [ ] Every finding has a recorded verdict — real, mitigated, or false positive with the reason.
- [ ] Reachability was traced from source to sink and confirmed to execute in production code.
- [ ] The merge gate fails on high-confidence findings, with an explicit owner and expiry on every suppression.
- [ ] False positive rate is measured and below the threshold where the gate stays credible.
- [ ] SARIF output is archived so recurrence, ownership, and trend are measurable.
- [ ] Every remediated high-severity finding has a regression test with a benign probe.

## Anti-patterns

- **Disabling the gate on first failure.** Turning SAST off after one noisy week is the standard outcome and removes the control permanently. Fix rules and add sanitizers instead.
- **Treating scanner output as findings.** A taint path through test fixtures or a report endpoint is not a vulnerability. Confirm the path executes in production before assigning work.
- **Custom regex rules only.** Regular expressions miss multi-step flows and aliases entirely. Use taint mode with source, sink, and sanitizer definitions so the analysis follows real data flow.
- **No ownership or trend tracking.** A SARIF file in a build artifact nobody reads decays into ritual. Track recurrence per rule and assign an owner per rule owner.
- **Treating SAST as complete coverage.** Static analysis cannot prove authorization correctness or business-logic flaws. Pair it with `secure-coding-review` and runtime tests; do not let green SAST stand in for both.