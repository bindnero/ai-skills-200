---
name: docker-image-hardening
description: Hardens container images with multi-stage builds, non-root users, distroless or scratch bases, BuildKit secret mounts and SBOM/CVE scanning. Use when writing or shrinking a Dockerfile, fixing a failing image build, or clearing Trivy/Grype CVE findings on a pushed image.
---

# Docker Image Hardening

**Use when:** Writing, shrinking or securing a `Dockerfile`/containerfile, or clearing high-severity CVE findings from a registry scan.
**Do not use when:** The image is already minimal and you are tuning how it is built, cached and published — use `ci-cd-pipelines` instead.

## Instructions

1. Pick the runtime base first (distroless, `scratch`, or alpine when you genuinely need a shell), then work backwards. Never inherit from a full distro and `apt-get purge` your way back down.
2. Split into a `builder` stage and a `runtime` stage. Compile in the builder and copy only the finished artifact; compilers, headers and package managers never ship.
3. Install dependencies from the lockfile with a frozen or hash-verified flag so a tampered registry cannot silently change resolution.
4. Create a dedicated unprivileged UID and switch to it with `USER`. Prefer a high numeric UID such as 65532 when the runtime has no `/etc/passwd`.
5. Consume secrets with `RUN --mount=type=secret`, never `ARG` or `ENV`. Both persist into image history and leak through provenance attestations.
6. Emit an SBOM and provenance attestation during the build, then scan the result with Trivy or Grype and fail on fixable HIGH/CRITICAL unless an entry exists in a reviewed ignore file.
7. Order layers by change frequency: lockfile and dependency install first, source copy last, so source-only edits reuse cached layers.
8. Prefer orchestrator probes (Kubernetes, ECS) over `HEALTHCHECK`, which needs a shell that a distroless image does not have.
9. Add a `.dockerignore` that excludes `.git`, `node_modules`, build caches, `.env*` and CI configs. Context bloat slows builds and leaks sources into layers.
10. Verify the result, not the intent: confirm the image does not run as root, that `docker history --no-trunc` shows no secrets, and that the CVE scan is empty or explained.

## Patterns

A multi-stage Node build that ends in distroless and runs as a non-root user:

```dockerfile
# syntax=docker/dockerfile:1.10
ARG NODE_VERSION=22.14.0

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npm run build && npm prune --omit=dev

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build --chown=nonroot:nonroot /app/dist ./dist
COPY --from=build --chown=nonroot:nonroot /app/node_modules ./node_modules
COPY --from=build --chown=nonroot:nonroot /app/package.json ./package.json
EXPOSE 8080
USER nonroot:nonroot
CMD ["dist/server.js"]
```

A static Go binary compiled against `scratch`, with the CA bundle and tzdata added deliberately rather than inherited:

```dockerfile
FROM golang:1.24-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath \
      -ldflags="-s -w" -o /out/server ./cmd/server

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=build /out/server /server
USER 65532:65532
ENTRYPOINT ["/server"]
```

Build, scan and sign in one step with secrets kept out of the layer history:

```bash
docker buildx build \
  --sbom=true --provenance=mode=max \
  --secret id=npmrc,src=/run/secrets/npmrc \
  --tag "$REGISTRY/app:$GIT_SHA" \
  --push .

trivy image --severity HIGH,CRITICAL --ignore-unfixed \
  --exit-code 1 "$REGISTRY/app:$GIT_SHA"

DIGEST=$(crane digest "$REGISTRY/app:$GIT_SHA")
cosign sign --yes "$REGISTRY/app@$DIGEST"
```

`.dockerignore` that keeps the build context honest:

```text
.git
.github
.gitignore
node_modules
**/node_modules
dist
coverage
.next
*.log
.env
.env.*
!.env.example
Dockerfile*
README.md
```

## Checklist

- [ ] Final stage is distroless, `scratch`, or an alpine base with no unnecessary shell
- [ ] Build tools, package managers and test fixtures absent from the runtime stage
- [ ] Image runs as a non-root user with a numeric UID
- [ ] No secrets in `ARG`, `ENV`, `LABEL` or layer history — `docker history` verified
- [ ] Dependencies installed from a lockfile with frozen or hashed resolution
- [ ] `.dockerignore` present and excluding `.git`, `node_modules`, `.env*`
- [ ] SBOM and provenance attestations produced; CVE scan enforced in CI
- [ ] Image pushed by digest and the digest recorded in release metadata

## Anti-patterns

- **`FROM node:latest` with no second stage.** You ship 400 MB of toolchain and a shell that an attacker can use to pivot. Compile in a builder stage and copy the output.
- **`ARG NPM_TOKEN` for build-time auth.** `ARG` values are persisted in image history and surfaced in build provenance. Use `RUN --mount=type=secret`.
- **Running as root with a `chmod` fix-up afterwards.** A root process turns any RCE into host compromise. Set `USER` in the final stage and verify with a `docker run` identity check.
- **`apt-get upgrade` in the runtime stage.** It permanently enlarges the CVE surface and layers that are almost always cache-stale. Rebuild on a pinned base digest instead.
- **Suppressing scans with `--ignore-unfixed` everywhere.** Ignoring unfixed findings is reasonable; ignoring everything turns the scan into decoration. Keep a reviewed ignore file with a CVE and an expiry date per entry.