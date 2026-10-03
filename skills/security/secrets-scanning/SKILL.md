---
name: secrets-scanning
description: Finds and removes leaked credentials, API keys, and tokens from repositories and history using entropy and pattern detection, then rotates and verifies each exposed secret. Use when auditing a repo for committed secrets, before open-sourcing a project, during pre-commit setup, or when investigating a suspected credential exposure.
---

# Secrets Scanning

**Use when:** auditing a codebase or its git history for embedded credentials, adding secret detection to a repository's pre-commit and CI pipeline, or triaging a reported leak.
**Do not use when:** designing how secrets are issued, scoped, stored, and rotated at runtime — use `api-key-management` instead.

## Instructions

1. Establish the scope: working tree, full git history, branches and tags, release artifacts, container images, CI logs, and documentation. A secret absent from `HEAD` is still live in history and in every prior clone.
2. Run a pattern-based scanner over the working tree first to build a baseline of false positives. Record the tool version and config so results are reproducible.
3. Run high-entropy generic detection over source, config, fixtures, and notebooks, with per-language minimum entropy thresholds. Tighten the threshold for long opaque strings and loosen it for languages like JavaScript that legitimately contain many random-looking identifiers.
4. Verify every hit by reading the surrounding context and confirming the value is a live credential rather than a placeholder, example, or public identifier. Manually inspect anything that would be skipped as a false positive before dismissing it.
5. For each confirmed live secret: revoke and reissue it first. Removal from the repository without rotation leaves the credential valid and the incident open.
6. Purge the value from history with `git filter-repo` using a replacement file for targeted path or data removal, then force-push rewritten refs to every remote and have every collaborator reclone. Rewriting history does not notify forges or existing clones.
7. Add the confirmed patterns to the pre-commit and CI scanner configuration so the same class of secret is blocked at introduction time.
8. Search provider and vendor dashboards for use of the exposed key from the first commit timestamp onward. Any use you did not make means assume compromise and expand the scope.
9. Write up the finding without reproducing the secret value: reference the file and commit hash, the credential type, the exposure window, and the actions taken.
10. Establish the ongoing control: pre-commit hook for developers, CI enforcement with non-zero exit, a defined bypass process with expiry, and a periodic full-history rescan including new branches.

## Patterns

Local scan covering history and branches:

```bash
# pattern-based, whole history, all refs
gitleaks detect --source . --redact --report-format json --report-path gitleaks.json

# targeted secret types only, to triage a specific report
gitleaks detect --source . --redact --log-level warn
trufflehog git file://. --only-verified --results=verified,unknown
```

History rewrite for a single leaked value:

```bash
# 1. list commits containing the value (treat output as sensitive)
git log --all -S 'EXAMPLE_TOKEN_PREFIX_abc' --oneline

# 2. rewrite with a replacement blob (use a real temp file, not shell quoting)
git filter-repo --replace-text replacements.txt --force

# 3. verify the value is gone from every reachable object
git log --all -S 'EXAMPLE_TOKEN_PREFIX_abc' --oneline   # expect no output

# 4. force-push all refs, then have every collaborator reclone
git push --force --mirror origin
```

GitHub push protection and CI enforcement:

```yaml
# .github/workflows/secret-scan.yml
name: secret-scan
on: [push, pull_request]
permissions:
  contents: read
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # history must be scanned, not just the tip
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Pre-commit hook with a documented, expiring bypass:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.2
    hooks:
      - id: gitleaks
        args: ["--redact", "--config", ".gitleaks.toml"]
# Bypass for a verified false positive: SKIP=gitleaks git commit -m "...",
# and it must be recorded in the PR description with a removal date.
```

Baseline allowlist, kept explicit and expiring:

```toml
# .gitleaks.toml — allowlist only known-safe, documented values
[allowlist]
description = "Non-secret test fixtures and vendor public IDs"
paths = [
  '''(^|/)testdata/fixtures/''',
  '''(^|/)vendor/public_keys\.pem$''',
]
```

## Checklist

- [ ] Scan covered working tree, full history, all branches, tags, and built artifacts — not only `HEAD`.
- [ ] Every hit was manually triaged; confirmed live secrets are distinguished from placeholders and public IDs.
- [ ] Each confirmed live credential was revoked and reissued before any repository cleanup.
- [ ] History rewrite completed and verified by a negative search across all refs.
- [ ] Remote refs force-pushed and collaborators instructed to reclone; downstream forks and CI caches considered.
- [ ] Provider usage reviewed from the first exposure timestamp; unexpected use escalates to incident response.
- [ ] Confirmed patterns added to the pre-commit and CI scanner so the class is blocked at introduction.
- [ ] The writeup references file, commit hash, credential type, and exposure window without reproducing the value.

## Anti-patterns

- **Deleting the file but not rotating the key.** Removing a `.env` from the working tree while the credential remains valid on the provider is the most common outcome and provides zero protection. Revocation is step one, not step six.
- **Ignoring history.** Secrets removed in a later commit remain recoverable from every prior commit, every fork, and every CI cache. History must be rewritten and the exposed value still rotated.
- **Trusting the scanner's verdict in both directions.** Scanners produce false negatives on obfuscated or split credentials and false positives on fixtures. Missed findings and dismissed real findings both come from never reading the surrounding code.
- **Adding the hook and nothing else.** A pre-commit hook bypassed with `--no-verify` provides no protection, while CI enforcement cannot be skipped silently. Enforce in CI with a non-zero exit and define an explicit, recorded, expiring bypass path.
- **Rotating without investigating.** The value is logged in git history, CI output, forks, and possibly a public secret-search index. Treat the exposure as a potential incident and check for misuse before closing it.