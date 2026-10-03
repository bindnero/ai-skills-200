---
name: release-management
description: Runs a release process with semantic versioning, conventional commits, automated changelog and tag generation, SBOM-attested artifacts and staged promotion. Use when cutting a release, structuring a changelog, or making release metadata traceable to a commit.
---

# Release Management

**Use when:** Cutting a release, structuring versioning and changelogs, or making a released artifact traceable back to a commit.
**Do not use when:** A release has just gone wrong in production and needs to be undone; use `rollback-strategy` instead.

## Instructions

1. Version with SemVer and let the type of change determine the bump: `MAJOR` for a breaking API change, `MINOR` for new backwards-compatible behaviour, `PATCH` for fixes.
2. Drive versioning from conventional commits so the bump is derived, not chosen. Human-assigned version numbers drift from the actual change set.
3. Automate the changelog and the tag with `release-please` or `semantic-release`, configured with a `CHANGELOG.md` updater and GitHub release notes.
4. Never hand-write a git tag; tag from the release commit in CI so the tag always matches the artifact that was built and tested.
5. Build once, promote the same artifact. A rebuild at deploy time can differ from the tested bits; promote by digest, never by re-running the build.
6. Emit an SBOM and a provenance attestation per release, and store them next to the release so a vulnerability lookup maps to an exact version.
7. Sign release artifacts and container images with cosign, and verify the signature in the deployment pipeline rather than trusting the registry.
8. Keep a `CHANGELOG.md` in Keep a Changelog format with an `Unreleased` section, linking each entry to the comparing URL and the commit.
9. Use prerelease channels such as `2.0.0-rc.1` for release candidates consumed by early adopters, and gate them to opt-in environments.
10. After release, verify by artifact: pull the digest, check the signature, and confirm the running version string matches before declaring success.

## Patterns

`release-please` config deriving the bump from conventional commits:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": {
      "release-type": "node",
      "package-name": "@acme/web",
      "changelog-path": "CHANGELOG.md",
      "bump-minor-pre-major": true,
      "extra-files": ["package.json", "apps/web/package.json"],
      "include-component-in-tag": false,
      "draft": false,
      "prerelease-type": "rc",
      "changelog-sections": [
        { "type": "feat", "section": "Features" },
        { "type": "fix", "section": "Bug Fixes" },
        { "type": "perf", "section": "Performance" },
        { "type": "deps", "section": "Dependencies" },
        { "type": "security", "section": "Security" },
        { "type": "revert", "section": "Reverts" }
      ]
    }
  }
}
```

Building once and producing signed, attested release artifacts:

```bash
set -euo pipefail
VERSION=$(jq -r '.version' package.json)
IMAGE="ghcr.io/acme/web"

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --sbom=true --provenance=mode=max \
  --tag "${IMAGE}:${VERSION}" \
  --push .

DIGEST=$(crane digest "${IMAGE}:${VERSION}")
cosign sign --yes "${IMAGE}@${DIGEST}"
cosign attest --yes --type sbom --predicate sbom.spdx.json "${IMAGE}@${DIGEST}"

# The digest, not the tag, is what downstream stages consume.
echo "IMAGE_DIGEST=${DIGEST}" >> "$GITHUB_ENV"
gh release create "v${VERSION}" --generate-notes sbom.spdx.json "${IMAGE}@${DIGEST}"
```

A pipeline that promotes the identical artifact through environments, verifying the signature first:

```yaml
  promote:
    needs: build
    runs-on: ubuntu-24.04
    strategy:
      max-parallel: 1
      matrix:
        environment: [staging, production]
    steps:
      - name: Verify signature before deploy
        run: cosign verify "${IMAGE}@${{ needs.build.outputs.digest }}"
      - name: Deploy by digest
        run: |
          helm upgrade --install web ./charts/web \
            --kube-context "${{ matrix.environment }}" \
            --set image.digest="${{ needs.build.outputs.digest }}" \
            --atomic --timeout 5m
```

## Checklist

- [ ] Version bump derived from conventional commits, not chosen by hand
- [ ] Changelog generated automatically in Keep a Changelog format
- [ ] Git tag created in CI from the release commit, never by hand
- [ ] Artifact built once and promoted by digest to every environment
- [ ] SBOM and provenance attestation produced per release and stored with it
- [ ] Artifacts and images signed with cosign; signature verified before deploy
- [ ] `MAJOR` reserved for genuine breaking changes, documented in the changelog
- [ ] Release verified by digest and version string after deployment

## Anti-patterns

- **Rebuilding the artifact in the deploy job.** A rebuild can produce different bytes than what was tested and scanned, so the thing you shipped is not the thing you verified. Promote the digest.
- **Manually editing the version in three files.** The version drifts, the changelog lies, and the next automated release becomes confusing. Let the tool own it.
- **Tagging without signing.** A mutable tag plus an unsigned registry means anyone with push access can replace what users install. Sign with cosign and verify on the deploy side.
- **One version across all services.** Independent services on a shared version force coordinated releases and make partial rollbacks impossible. Version each service separately.
- **Calling the release done when CI turns green.** A green pipeline can have deployed nothing. Verify the running digest and the version endpoint before announcing.