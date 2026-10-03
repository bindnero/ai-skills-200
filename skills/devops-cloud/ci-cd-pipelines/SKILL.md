---
name: ci-cd-pipelines
description: Authors GitHub Actions workflows and GitLab CI pipelines with lockfile caching, matrix builds, OIDC cloud auth, concurrency gates and post-deploy smoke tests. Use when creating or repairing a CI/CD pipeline, adding a deploy stage, or when builds are slow, flaky, or leaking credentials.
---

# CI/CD Pipelines

**Use when:** Writing, repairing or speeding up a `.github/workflows/*.yml` or `.gitlab-ci.yml` pipeline that builds, tests, scans and publishes an artifact.
**Do not use when:** The pipeline already works and you only need the runtime manifests it ships — use `kubernetes-manifests` or `helm-chart-authoring` instead.

## Instructions

1. Read the pipeline and the real project manifest (`package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`) first. Extract the actual install, build and test commands; never invent them.
2. Model the pipeline as jobs with explicit `needs`, so fan-out and join points are visible and no deploy job can start before every required check passes.
3. Pin third-party actions to a full 40-character commit SHA and container images to a digest. Mutable tags are how supply-chain compromises reach production.
4. Cache dependency directories with `actions/cache` keyed on the lockfile checksum, plus a `restore-keys` prefix fallback so a partial hit still restores.
5. Authenticate to cloud providers with OIDC federation. Mint a short-lived token per run; never store long-lived cloud keys in repository secrets.
6. Declare `permissions: contents: read` at workflow level and elevate to write scopes inside only the single job that pushes or deploys.
7. Add `concurrency` keyed by ref, and by environment for deploys, with `cancel-in-progress: true` on pull-request builds so superseded runs die instead of burning minutes.
8. Make the pipeline idempotent and re-runnable: scope caches and uploaded artifacts to the commit SHA and set explicit retention days.
9. Consume a previously built immutable artifact in the deploy job — the image digest or chart version produced earlier in the same run. Never rebuild inside deploy.
10. Fail loudly on quality gates: exit non-zero on test, lint, typecheck and vulnerability findings, and wire those job names as required status checks in branch protection.

## Patterns

Build, test, scan and publish with a cache keyed on the lockfile and an explicit permission block:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  build:
    runs-on: ubuntu-24.04
    outputs:
      digest: ${{ steps.push.outputs.digest }}
      repository: ${{ steps.push.outputs.repository }}
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - uses: actions/setup-node@1e60f620b9541dca151f0f3b5dc6c4eb2d9e2d5b # v4.0.3
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: package-lock.json

      - run: npm ci
      - run: npm run build
      - run: npm test -- --ci
      - run: npm audit --audit-level=high

      - uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502 # v4.0.2
        with:
          role-to-assume: arn:aws:iam::111122223333:role/gha-deploy
          aws-region: us-east-1

      - id: push
        uses: aws-actions/amazon-ecr-login@6c92537d734e4302d0a0625c0e361c7ef497d0f # v2.0.6
      - run: |
          IMG=${{ steps.push.outputs.repository }}:${{ github.sha }}
          docker buildx build --sbom=true --provenance=mode=max -t "$IMG" --push .
          docker inspect --format='{{index .RepoDigests 0}}' "$IMG"
```

A gated deploy that promotes the digest the build job produced, then smoke-tests it:

```yaml
  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-24.04
    environment: production
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
      - uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502
        with:
          role-to-assume: arn:aws:iam::111122223333:role/gha-deploy
          aws-region: us-east-1
      - run: |
          aws eks update-kubeconfig --name prod --alias prod
          helm upgrade --install api ./charts/api \
            --kube-context prod \
            --set image.repository="${{ needs.build.outputs.repository }}" \
            --set image.digest="${{ needs.build.outputs.digest }}" \
            --atomic --timeout 5m
      - run: |
          curl -fsS --retry 10 --retry-connrefused --retry-delay 5 \
            https://api.acme.com/health/ready | grep -q '"status":"ok"'
```

## Checklist

- [ ] Every third-party action is pinned to a full commit SHA
- [ ] Workflow-level `permissions` is least-privilege; write scopes scoped to one job
- [ ] Cloud auth is OIDC; no static keys or long-lived tokens in secrets
- [ ] Cache key includes the lockfile hash with a `restore-keys` fallback
- [ ] Deploy consumes the artifact digest from `needs` and never rebuilds
- [ ] `--atomic` or an equivalent rollback is configured on the deploy step
- [ ] Required status checks in branch protection map to real job names
- [ ] Artifact and cache retention days set; artifacts scoped to the commit SHA

## Anti-patterns

- **Rebuilding during deploy.** A second build can produce a different digest than the tested one, so what shipped was never tested. Pass the digest forward through job outputs.
- **Mutable tag pins (`@v4`, `:latest`).** Tags move; a compromised upstream silently enters your pipeline. Pin to a commit SHA or image digest and bump via Dependabot.
- **Long-lived cloud secrets in CI.** Static keys survive a runner compromise forever. Use OIDC federation with a trust policy scoped to the exact repo, ref and workflow.
- **Serial monorepo builds.** Testing forty packages one after another is the largest single CI cost. Use a matrix with `fail-fast: false` and shard the heavy test job.
- **`continue-on-error` on security scanners.** It buries real findings behind a green check. Fail the job, or route exceptions through a reviewed, versioned allowlist file.