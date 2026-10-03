---
name: code-signing
description: Signs and verifies software artifacts, containers, commits, and packages with isolated keys, short-lived certificates, and enforced verification gates. Use when setting up release signing, verifying a downloaded binary before execution, signing container images, or requiring signature checks in a deployment pipeline.
---

# Code Signing

**Use when:** publishing artifacts that users or machines must trust, verifying a download before execution, signing container images or package releases, or adding a mandatory signature check to a deploy or install path.
**Do not use when:** protecting the build pipeline itself from tampering before an artifact exists — use `supply-chain-security` for pipeline hardening and provenance.

## Instructions

1. Decide what identity you are asserting: who built it, from which source revision and workflow, and under what policy. A signature without a verifiable identity claim is only an integrity check.
2. Generate signing keys in an HSM, KMS, or hardware token. Never store a private signing key on a developer machine, in a repository, in a container image, or in an environment variable in a build job.
3. Prefer short-lived OIDC-based certificates for CI signing so no long-lived private key exists to steal. Require MFA on the identity provider account that issues them.
4. Sign the artifact and its provenance together: the binary digest, the source commit, the builder identity, and the SBOM reference. Signing the binary alone does not attest where it came from.
5. Bind the signature to the artifact digest and verify the digest recomputed locally before trusting the signature, so a valid signature cannot be applied to different bytes.
6. Define and publish a verification policy: which identities are trusted, which workflows qualify, and whether transparency-log inclusion is required. Treat every other signer as untrusted.
7. Enforce verification as a gate, not a recommendation: the installer, the deploy pipeline, and the update client all fail closed on a missing, invalid, expired, or untrusted signature.
8. Keyless verification with Fulcio certificates means clients need a trust root bundle and an identity claim they can evaluate. Ship the root bundle in the platform trust store and pin the expected identity pattern.
9. Rotate and revoke deliberately. Because short-lived certificates limit exposure, keep a plan for compromised long-lived keys: revoke the signing certificate or key, publish the revocation, and rebuild and re-sign affected releases.
10. Record provenance metadata with every released artifact so consumers and responders can reconstruct what was signed, when, by which identity, and against which digest.

## Patterns

Keyless signing with Sigstore in CI:

```yaml
name: release
on:
  push:
    tags: ["v*"]
permissions:
  contents: read
  id-token: write          # OIDC token for short-lived Fulcio certificate
  packages: write
jobs:
  sign:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: make build
      - name: Sign the binary (keyless, ephemeral certificate)
        env:
          BINARY: dist/acme-cli
        run: |
          cosign sign-blob --yes --output-signature dist/acme-cli.sig \
            --output-certificate dist/acme-cli.crt "$BINARY"
      - name: Attest provenance
        run: |
          cosign attest --yes --predicate provenance.json \
            --type slsaprovenance "$IMAGE@sha256:$DIGEST"
```

Verify before execution:

```bash
# 1. verify the signature against a trusted identity claim
cosign verify-blob \
  --certificate dist/acme-cli.crt \
  --signature dist/acme-cli.sig \
  --certificate-identity-regexp '^https://github.com/acme/acme-cli/\.github/workflows/release\.yml@refs/tags/v.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  dist/acme-cli

# 2. confirm the signed bytes are the bytes about to run
sha256sum -c dist/acme-cli.sha256
```

Long-lived KMS key for platform-specific signing (macOS, Windows):

```bash
# Signing happens inside the KMS; the private key never leaves it.
az kvs sign --version --keyvault <vault> --name <key> \
  --algorithm RS256 --file dist/acme-cli.dmg --output dist/acme-cli.sig
```

Image signing, plus the deployment gate that enforces it:

```bash
cosign sign --keyless "$IMAGE@sha256:$DIGEST"

# Kubernetes rejects any image without a valid trusted signature (fail closed).
# Deploy gate: verify signer identity before rollout.
ref="${IMAGE}@sha256:${DIGEST}"
cosign verify "$ref" --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github.com/acme/platform/\.github/workflows/deploy\.yml@.*'
echo "signature and identity verified for $ref"
```

Installer-side enforcement:

```sh
#!/bin/sh
set -eu
# Download, verify, then install. Never install before verification succeeds.
curl -fsSLO "$REPO/releases/latest/download/acme-cli"
curl -fsSLO "$REPO/releases/latest/download/acme-cli.sig"
curl -fsSLO "$REPO/releases/latest/download/acme-cli.crt"
cosign verify-blob --certificate acme-cli.crt --signature acme-cli.sig \
  --certificate-identity-regexp '^https://github.com/acme/acme-cli/.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com acme-cli
install -m 0755 acme-cli /usr/local/bin/acme-cli
```

## Checklist

- [ ] Signing keys live in an HSM, KMS, or hardware token and never in a repo, image, or build environment variable.
- [ ] CI uses short-lived OIDC certificates where possible, with MFA required on the issuing identity.
- [ ] The signature asserts builder identity, source revision, and policy, not just a digest.
- [ ] Verification recomputes the artifact digest locally and confirms the signed bytes match what will run.
- [ ] A published trust policy defines the accepted signer identities, workflows, and issuers.
- [ ] Deploy, install, and update paths fail closed on missing, invalid, expired, or untrusted signatures.
- [ ] Keyless signing ships or uses a maintained trust root bundle and a pinned identity pattern.
- [ ] A documented rotation and revocation path exists, with re-sign and re-publish steps for a compromised key.

## Anti-patterns

- **Private key in a CI secret or environment variable.** Any workflow change, malicious dependency, or log leak exfiltrates it, and it is valid until someone notices. Use OIDC keyless signing or a KMS that signs without exporting the key.
- **Verify-then-install race.** Downloading, then verifying, then running leaves a window where the file on disk can be replaced. Verify immediately before use, or write to a path only the verifying user can write.
- **Signature without identity.** `gpg --verify` confirms integrity and that some key signed it, not that the signer is you. Pin the key fingerprint, certificate identity, and issuer.
- **Advisory verification only.** Documentation telling users to "check the signature" produces skipped verification. Enforce it in the installer and the deploy pipeline, where skipping requires a deliberate override.
- **One long-lived signing key for years.** A stolen key can sign malware for as long as it is valid. Prefer short-lived certificates and define revocation before you need it.