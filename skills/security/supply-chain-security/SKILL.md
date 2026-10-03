---
name: supply-chain-security
description: Secures the build and delivery path with pinned dependencies, provenance attestation, isolated CI, and signed artifacts to prevent compromised packages and poisoned releases. Use when hardening a build pipeline, adding dependency pinning or SBOMs, or reviewing a release process for tampering risk.
---

# Supply Chain Security

**Use when:** a change touches CI workflows, dependency resolution, build tooling, release publishing, or container base images, and the goal is to prevent or detect tampering before it reaches production.
**Do not use when:** auditing the versions already present in a lockfile for known CVEs — use `dependency-vulnerability-audit`.

## Instructions

1. Pin every dependency to an exact version and commit the lockfile. Use `npm ci` or an equivalent that installs strictly from the lockfile and fails rather than silently resolving to a newer version.
2. Enable the ecosystem's integrity verification and avoid installing from unpinned git references, `latest` tags, or a URL without a hash. A mutable reference is remote code execution at install time.
3. Generate an SBOM for every build and store it with the artifact, so a newly disclosed vulnerability in a transitive package can be matched to what you actually shipped.
4. Harden CI execution: pin third-party actions to a full commit SHA with a version comment, set `permissions: contents: read` by default, and avoid `pull_request_target` with checkout of untrusted head code.
5. Require human approval for publishing steps and separate build from publish so a compromised fork pull request cannot reach the release job. Protect release branches and tag rules.
6. Build in an ephemeral, network-restricted runner. Give the job the minimum credentials needed and issue short-lived tokens rather than long-lived secrets stored in repository settings.
7. Produce cryptographic provenance for artifacts: build in a trusted builder or sign with a key isolated from the CI job, and verify the signature and identity before deployment.
8. Scan images for known vulnerabilities and pin base images by digest, not by tag, so a rebuilt `latest` cannot change what you deploy.
9. Monitor after release: watch for unexpected new maintainers on critical dependencies, unexpected maintainer email or repository changes, and anomalous post-install scripts.
10. Document the dependency-review expectations for contributors: how to add a dependency, when a version bump needs security review, and who approves exceptions.

## Patterns

Pinning actions by digest:

```yaml
name: ci
on: [push, pull_request]
permissions:
  contents: read          # least privilege by default; widen per job only when needed
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci --ignore-scripts=false     # installs strictly from the lockfile
      - run: npm run build
      - name: Generate SBOM
        run: npx @cyclonedx/cyclonedx-npm --output-file sbom.cdx.json
      - name: Upload artifact plus SBOM
        uses: actions/upload-artifact@v4
        with:
          name: build-output
          path: |
            dist/
            sbom.cdx.json
```

Isolating publish from untrusted pull requests:

```yaml
name: release
on:
  push:
    tags: ["v*"]
permissions:
  contents: write          # only this trusted, tag-triggered job has write scope
jobs:
  publish:
    environment: production        # requires a reviewer in the protection rules
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with: { name: build-output }
      - run: ./scripts/verify-provenance.sh   # fails closed on bad or missing signature
```

Image pinning and provenance:

```dockerfile
# pin by digest: `latest` can point at different bytes tomorrow
FROM node:22.14.0-bookworm-slim@sha256:<manifest-digest> AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs22-debian12@sha256:<runtime-digest>
COPY --from=build /app/dist ./dist
USER nonroot
CMD ["dist/server.js"]
```

Provenance generation with Sigstore, and the deploy-time gate:

```bash
cosign attest --yes --predicate sbom.cdx.json \
  --type cyclonedx "$IMAGE@sha256:$DIGEST"

# deployment gate: verify signer identity before rollout
cosign verify-attestation --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github.com/acme/repo/\.github/workflows/release\.yml@.*' \
  "$IMAGE@sha256:$DIGEST"
```

Dependency addition policy in contributor docs:

```md
- Pin the exact version; never use `latest`, a git URL, or an unpinned action tag.
- New runtime dependencies require a license check and a vulnerability audit run.
- Packages with an install/postinstall script need an explicit security review note.
- Maintainer changes on a critical dependency are alerted on automatically.
```

## Checklist

- [ ] Lockfile committed, installed with a strict CI install, and no unpinned git or tag references.
- [ ] Ecosystem integrity verification enabled; install scripts reviewed where present.
- [ ] SBOM generated per build and archived alongside the artifact.
- [ ] Third-party CI actions pinned to full commit SHAs, and `pull_request_target` is not combined with untrusted checkout.
- [ ] Default job permissions are minimal, publish requires approval, and build is separated from publish.
- [ ] Build runs in an ephemeral, network-restricted runner using short-lived credentials.
- [ ] Artifacts carry verified provenance, and deployment fails closed when verification fails.
- [ ] Base images are pinned by digest and monitored for unexpected maintainer or ownership changes.

## Anti-patterns

- **Floating references.** `uses: some/action@main` or an install from a branch means anyone controlling that reference executes in your pipeline with your credentials. Pin to a commit SHA.
- **`pull_request_target` with a head checkout.** That combination runs fork-controlled code with access to repository secrets. Use `pull_request` for untrusted builds and reserve privileged events for trusted refs only.
- **Secrets available to every job.** Long-lived tokens in repository settings are readable by any workflow change that an attacker gets merged. Use environment-scoped, short-lived, per-job credentials.
- **Verifying nothing at deploy.** An unsigned artifact pushed by anyone with registry access is indistinguishable from a legitimate release. Verify provenance and identity as a hard deployment gate.
- **Trusting the registry tag.** `myapp:latest` may be rebuilt from a different base or toolchain. Deploy by digest and record which digest corresponds to which build.