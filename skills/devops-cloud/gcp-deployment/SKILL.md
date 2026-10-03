---
name: gcp-deployment
description: Deploys services to Google Cloud with Cloud Run revisions and traffic splitting, GKE, Artifact Registry and Workload Identity Federation. Use when shipping to GCP, tuning Cloud Run concurrency and min-instances, or fixing CI auth and organization-policy errors.
---

# GCP Deployment

**Use when:** Shipping a container or function to Google Cloud — Cloud Run, GKE or Cloud Run functions — with correct identity, IAM and rollout configuration.
**Do not use when:** The Kubernetes workload itself is the deliverable; use `helm-chart-authoring` and keep this skill for the GCP account, registry and identity layer.

## Instructions

1. Choose the runtime deliberately: Cloud Run for request-driven containers with scale-to-zero, Cloud Run functions for event handlers, GKE only when you need Kubernetes features Cloud Run does not offer.
2. Push to Artifact Registry using Workload Identity Federation from CI. Never download a service-account JSON key; key creation is disabled by organization policy on well-run projects and keys leak through build logs.
3. Set `--min-instances` for latency-sensitive services and tune `--concurrency` from measured per-request CPU rather than leaving the default of 80.
4. Deploy a candidate revision with `--no-traffic`, validate it, then shift traffic with `gcloud run services add-traffic`. This is the native canary mechanism.
5. Bound the service with `--max-instances`, set `--timeout` deliberately, and use `--execution-environment gen2` unless you have a reason not to.
6. Keep the service account narrow: `roles/run.invoker` on the caller and `roles/secretmanager.secretAccessor` on named secrets only.
7. Reference secrets through the Cloud Run secrets integration or Secret Manager, never baked into the image or passed as build-time environment values.
8. Restrict ingress with `--ingress internal-and-cloud-load-balancing` unless the service is genuinely public, and put Cloud Armor in front of it when it is.
9. Verify with `gcloud run services describe` checking `status.conditions[Ready]` and `status.traffic`, not with a fixed sleep.
10. Enforce folder-level organization policies: disable service-account key creation, require Shielded VM, and enforce resource locations so a misconfigured deploy cannot land in an unmonitored region.

## Patterns

A Cloud Run service deployed by digest with a validated candidate revision:

```bash
gcloud run deploy api \
  --image "${REGION}-docker.pkg.dev/${PROJECT}/api@sha256:8f14e45fceea167a5a36dedd4bea2543f2d3b9c11" \
  --region europe-west1 \
  --platform managed \
  --service-account "api@${PROJECT}.iam.gserviceaccount.com" \
  --allow-unauthenticated=false \
  --ingress internal-and-cloud-load-balancing \
  --concurrency 40 \
  --min-instances 2 \
  --max-instances 200 \
  --timeout 30s \
  --cpu-boost \
  --execution-environment gen2 \
  --set-secrets "DATABASE_URL=api-db-url:latest" \
  --no-traffic \
  --tag candidate \
  --quiet

gcloud run services describe api \
  --region europe-west1 \
  --format='value(status.conditions[0].status)'

gcloud run services add-traffic api \
  --region europe-west1 \
  --to-tags candidate=5,latest=95 \
  --type TRAFFIC_TARGET_ALLOCATION
```

Workload Identity Federation wiring for GitHub Actions, scoped to one repository:

```bash
gcloud iam workload-identity-pools create github \
  --project="${PROJECT}" --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github \
  --project="${PROJECT}" --location=global \
  --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == 'acme/platform'"

gcloud iam service-accounts add-iam-policy-binding \
  "ci-deployer@${PROJECT}.iam.gserviceaccount.com" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT}/locations/global/workloadIdentityPools/github/attribute.repository/acme/platform"
```

Organization policies that make key-based authentication impossible and pin regions:

```yaml
constraints:
  - name: constraints/iam.disableServiceAccountKeyCreation
    inherited: true
    enforcementMode: ENFORCE
  - name: constraints/compute.disableSerialPortAccess
    inherited: true
    enforcementMode: ENFORCE
  - name: constraints/compute.requireShieldedVm
    inherited: true
    enforcementMode: ENFORCE
  - name: constraints/gcp.resourceLocations
    inherited: true
    enforcementMode: ENFORCE
    parameters:
      allowedLocations: [europe-west1, europe-west4, global]
```

A minimal least-privilege service account for the runtime itself:

```bash
gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member="serviceAccount:api@${PROJECT}.iam.gserviceaccount.com" \
  --condition='expression=resource.name.startsWith("projects/acme/secrets/api-"),title=api-secrets-only' \
  --role="roles/secretmanager.secretAccessor"

gcloud run services add-iam-policy-binding api \
  --region europe-west1 \
  --member="serviceAccount:lb@${PROJECT}.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

## Checklist

- [ ] CI authenticates with Workload Identity Federation, not a key file
- [ ] Runtime service account has only `secretAccessor` on named secrets plus what it truly needs
- [ ] `--min-instances` set for latency-sensitive services; `--max-instances` always bounded
- [ ] `--concurrency` derived from measurement, not left at the default
- [ ] Candidate revision deployed with `--no-traffic` and validated before shifting traffic
- [ ] Ingress restricted unless the service is intentionally public
- [ ] Secrets referenced through Secret Manager, never baked into the image
- [ ] Organization policies enforce no key creation and allowed regions

## Anti-patterns

- **Shipping a service-account JSON key as a CI secret.** It is a permanent credential that leaks through build logs and cannot be attributed. Use WIF, and disable key creation by policy so this cannot regress.
- **Deploying straight to 100 percent traffic and watching.** Cloud Run revisions exist precisely so you can validate a candidate. Use `--no-traffic` plus `add-traffic` with a percentage ramp.
- **Leaving `--max-instances` unset.** A traffic spike or a retry storm scales without bound and produces a bill you cannot explain. Cap it and let the platform shed load instead.
- **`--allow-unauthenticated` by default.** That makes the service world-readable; protection then depends entirely on application-level checks. Keep it false and grant `roles/run.invoker` to the specific callers that need it.
- **Single-region deployment with no multi-region policy.** A regional outage is invisible until it starts. Define a multi-region instance distribution or an explicit failover region and test the cutover.