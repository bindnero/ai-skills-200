# 06 · DevOps & Cloud

Getting code into production repeatedly and safely, and then knowing what your systems are doing once they are there.

25 skills. Each row links to the bundle — read it before doing the work it describes.

## Delivery

The path from commit to running process.

| Skill | Use it when |
| --- | --- |
| [`ci-cd-pipelines`](../skills/devops-cloud/ci-cd-pipelines/SKILL.md) | Authors GitHub Actions workflows and GitLab CI pipelines with lockfile caching, matrix builds, OIDC cloud auth, concurrency gates and post-deploy smoke tests. Use when creating or repairing a CI/CD pipeline, adding a deploy stage, or when builds are slow, flaky, or leaking credentials. |
| [`release-management`](../skills/devops-cloud/release-management/SKILL.md) | Runs a release process with semantic versioning, conventional commits, automated changelog and tag generation, SBOM-attested artifacts and staged promotion. Use when cutting a release, structuring a changelog, or making release metadata traceable to a commit. |
| [`blue-green-deploy`](../skills/devops-cloud/blue-green-deploy/SKILL.md) | Performs zero-downtime blue/green releases on Kubernetes or AWS with weighted traffic shifting, health gates and automated rollback. Use when a change cannot tolerate downtime or when cutover must be instant and reversible. |
| [`rollback-strategy`](../skills/devops-cloud/rollback-strategy/SKILL.md) | Designs and executes rollbacks with digest pinning, database expand-contract migrations, feature flags, defined triggers and rehearsed automation. Use when a release must be reverted, planning a deploy that can be undone, or deciding whether a rollback is safe. |
| [`gitops-workflow`](../skills/devops-cloud/gitops-workflow/SKILL.md) | Implements GitOps with Argo CD or Flux, ApplicationSets, Kustomize overlays, sync waves, health checks and progressive sync. Use when adopting pull-based deployment, fixing drift between Git and cluster state, or structuring multi-environment promotion. |

## Containers & orchestration

Packaging, scheduling, and packaging-at-scale.

| Skill | Use it when |
| --- | --- |
| [`docker-image-hardening`](../skills/devops-cloud/docker-image-hardening/SKILL.md) | Hardens container images with multi-stage builds, non-root users, distroless or scratch bases, BuildKit secret mounts and SBOM/CVE scanning. Use when writing or shrinking a Dockerfile, fixing a failing image build, or clearing Trivy/Grype CVE findings on a pushed image. |
| [`kubernetes-manifests`](../skills/devops-cloud/kubernetes-manifests/SKILL.md) | Authors raw Kubernetes Deployments, Services, probes, resource limits, PodDisruptionBudgets and topology spread constraints, plus kustomize overlays. Use when writing or debugging YAML for kubectl apply, when a pod is CrashLoopBackOff or Pending, or when replacing a Helm chart with plain manifests. |
| [`helm-chart-authoring`](../skills/devops-cloud/helm-chart-authoring/SKILL.md) | Builds and debugs Helm 3 charts including Chart.yaml, typed values.schema.json, named templates in _helpers.tpl, subchart dependencies, hooks and helm-unittest suites. Use when packaging a service for helm install or helm upgrade, templating values, or fixing a chart that fails helm lint or renders empty manifests. |

## Infrastructure as code

Declarative resources and how to trust them.

| Skill | Use it when |
| --- | --- |
| [`terraform-modules`](../skills/devops-cloud/terraform-modules/SKILL.md) | Authors reusable Terraform 1.9+ modules with typed variables, count and for_each, moved blocks, check blocks and Terratest suites. Use when extracting infrastructure into a versioned module, fixing state coupling, or passing plan-time assertions. |
| [`infrastructure-testing`](../skills/devops-cloud/infrastructure-testing/SKILL.md) | Tests infrastructure as code with Terratest, Checkov, Trivy, tfsec, kubeconform and OPA policy gates plus per-plan cost assertions. Use when adding automated tests to Terraform or Kubernetes changes, or when preventing insecure infrastructure from merging. |

## Platforms

Where it actually runs.

| Skill | Use it when |
| --- | --- |
| [`aws-deployment`](../skills/devops-cloud/aws-deployment/SKILL.md) | Deploys services on AWS using ECS/Fargate, EKS, Lambda and App Runner with least-privilege IAM, OIDC CI auth, multi-AZ ALB targets and long deregistration delays. Use when shipping to AWS, sizing an ECS task, or fixing target health, draining or IAM permission errors. |
| [`gcp-deployment`](../skills/devops-cloud/gcp-deployment/SKILL.md) | Deploys services to Google Cloud with Cloud Run revisions and traffic splitting, GKE, Artifact Registry and Workload Identity Federation. Use when shipping to GCP, tuning Cloud Run concurrency and min-instances, or fixing CI auth and organization-policy errors. |
| [`vercel-deployment`](../skills/devops-cloud/vercel-deployment/SKILL.md) | Configures Vercel projects with vercel.json, monorepo root directories, function memory and regions, preview environments, cron jobs and security headers. Use when setting up or debugging a Vercel build, fixing a no-Output-Directory error, or cutting edge cold starts. |
| [`cloudflare-edge`](../skills/devops-cloud/cloudflare-edge/SKILL.md) | Configures Cloudflare Workers, KV, R2, D1 and Pages with wrangler.jsonc, Cache Rules and WAF rules tuned at the edge. Use when moving a service onto Cloudflare, adding edge compute or storage bindings, or fixing cache and WAF behaviour at the CDN layer. |
| [`serverless-functions`](../skills/devops-cloud/serverless-functions/SKILL.md) | Designs and hardens AWS Lambda and Cloud Run functions with idempotency keys, SQS partial batch failure handling, reserved concurrency, DLQs and cold-start mitigation. Use when writing a serverless handler, processing an event stream, or debugging timeouts and duplicate invocations. |
| [`edge-caching-strategy`](../skills/devops-cloud/edge-caching-strategy/SKILL.md) | Designs HTTP caching with Cache-Control, Vary, CDN stale-while-revalidate, surrogate keys and cache invalidation webhooks. Use when tuning CDN or browser cache headers, reducing origin load, or fixing stale or leaking content at the edge. |

## Observability

Turning runtime behaviour into something you can act on.

| Skill | Use it when |
| --- | --- |
| [`observability-setup`](../skills/devops-cloud/observability-setup/SKILL.md) | Wires end-to-end observability with OpenTelemetry auto-instrumentation, a Collector, Prometheus, Grafana, Loki and Tempo plus real health endpoints. Use when adding telemetry to a service, standing up a metrics/log/trace pipeline, or turning on readiness and liveness probes. |
| [`structured-logging`](../skills/devops-cloud/structured-logging/SKILL.md) | Emits machine-parseable JSON logs conforming to the OpenTelemetry log data model with correlation IDs, level discipline, redaction and sampling. Use when replacing print statements with real logs, correlating logs with traces, or a log pipeline is failing to ingest or leak secrets. |
| [`metrics-and-alerting`](../skills/devops-cloud/metrics-and-alerting/SKILL.md) | Defines Prometheus metrics with the RED method, controls cardinality, and writes recording and multi-window multi-burn-rate alerting rules. Use when adding a metric, tuning an SLO alert, or when Prometheus is high-cardinality, expensive, or paging on noise. |
| [`distributed-tracing`](../skills/devops-cloud/distributed-tracing/SKILL.md) | Instruments distributed traces with OpenTelemetry spans, W3C trace context propagation, span links for asynchronous work and controlled sampling. Use when adding tracing to a service, debugging latency across service or queue boundaries, or when traces are missing hops. |

## Operating it

The job after deploy: reliability targets, incidents, cost, and data safety.

| Skill | Use it when |
| --- | --- |
| [`sre-slos`](../skills/devops-cloud/sre-slos/SKILL.md) | Defines service-level indicators and objectives as code, derives error budgets and burn-rate policies, and wires budget exhaustion into release decisions. Use when writing an SLO, agreeing a reliability target, or connecting error budgets to deploy gates. |
| [`incident-response`](../skills/devops-cloud/incident-response/SKILL.md) | Runs production incident response with severity definitions, incident commander roles, runbook-driven mitigation, stakeholder comms and blameless postmortems. Use when responding to an outage, defining an on-call process, or writing a post-incident review. |
| [`cost-optimization`](../skills/devops-cloud/cost-optimization/SKILL.md) | Reduces infrastructure spend through Kubernetes rightsizing, spot capacity, savings plans, storage tiering, NAT and logging controls, and tag-based attribution. Use when a cloud bill is growing unexpectedly, rightsizing containers, or adding cost tags and unit-economics reporting. |
| [`secrets-management`](../skills/devops-cloud/secrets-management/SKILL.md) | Manages secrets with Vault or cloud secret managers, SOPS encryption for Git, External Secrets Operator, KMS envelope encryption and automated rotation. Use when moving credentials out of environment files, rotating leaked keys, or wiring Vault into a cluster. |
| [`backup-and-restore`](../skills/devops-cloud/backup-and-restore/SKILL.md) | Designs backups with RPO/RTO targets, point-in-time database recovery, object versioning with lock, cross-account copies and rehearsed restore drills. Use when defining a backup strategy, enabling point-in-time recovery, or proving a restore actually works. |

---

[Full index](../CATALOG.md) · [Install targets](10-install-targets.md) · [Authoring](11-authoring.md)
