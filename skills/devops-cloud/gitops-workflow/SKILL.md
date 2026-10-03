---
name: gitops-workflow
description: Implements GitOps with Argo CD or Flux, ApplicationSets, Kustomize overlays, sync waves, health checks and progressive sync. Use when adopting pull-based deployment, fixing drift between Git and cluster state, or structuring multi-environment promotion.
---

# GitOps Workflow

**Use when:** Adopting pull-based deployment with Argo CD or Flux, eliminating drift between Git and cluster state, or structuring environment promotion through Applications.
**Do not use when:** The team still needs push-based deployment from a CI runner with its own credentials; use `ci-cd-pipelines` as an intermediate step.

## Instructions

1. Ensure the cluster's desired state lives in Git and the Git history is the audit log. Nothing mutates cluster state outside the reconciler.
2. Install Argo CD or Flux with Helm or Kustomize, pinned to a version, and give it a service account with RBAC limited to the namespaces it manages.
3. Model one Application per environment so promotion is a value change in Git, not a `kubectl set image` in a terminal.
4. Use sync waves for ordered dependencies: namespace and quotas first, then configuration and secrets, then workloads, then ingress.
5. Enable automated sync with self-heal, combined with `prune: true` and server-side apply so objects deleted from Git are removed from the cluster.
6. Add health checks for custom resources (ExternalSecret, sealed secrets, nested Argo CD apps) so dependents are not marked healthy before their inputs exist.
7. Use Kustomize overlays with pinned image digests, and set `imagePullPolicy` deliberately rather than accepting the default per tag.
8. Keep secrets out of Git: reference an external secret store and let the controller materialise them, so sync order is correct.
9. Gate production sync with a real human approval: the repository must be a protected branch, and sync must require an approval annotation or an explicit promotion commit.
10. Monitor the reconciler itself: alert on `SyncOutOfSync` duration and `Degraded` health, because a silently failing controller looks exactly like a healthy cluster.

## Patterns

An Argo CD ApplicationSet with per-environment auto-sync, pruning and self-healing:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata: { name: acme-platform, namespace: argocd }
spec:
  goTemplate: true
  goTemplateOptions: ["missingkey=error"]
  generators:
    - list:
        elements:
          - { env: dev, autoSync: "false" }
          - { env: staging, autoSync: "true" }
          - { env: prod, autoSync: "false" }
  template:
    metadata:
      name: '{{.env}}'
    spec:
      project: platform
      source:
        repoURL: https://github.com/acme/platform.git
        targetRevision: main
        path: 'envs/{{.env}}'
      destination:
        server: https://kubernetes.default.svc
        namespace: '{{.env}}'
      syncPolicy:
        automated:
          enabled: '{{.autoSync}}'
          prune: true
          selfHeal: true
          allowEmpty: false
        syncOptions:
          - CreateNamespace=true
          - ServerSideApply=true
          - RespectIgnoreDifferences=true
          - ApplyOutOfSyncOnly=true
        retry:
          limit: 5
          backoff: { duration: 15s, factor: 2, maxDuration: 5m }
```

Sync waves in the base so dependencies resolve in order before anything depends on them:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: prod
  annotations: { argocd.argoproj.io/sync-wave: "-2" }
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: prod-quota
  namespace: prod
  annotations: { argocd.argoproj.io/sync-wave: "-1" }
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: api-db
  namespace: prod
  annotations: { argocd.argoproj.io/sync-wave: "0" }
spec:
  refreshInterval: 1h
  secretStoreRef: { name: vault-backend, kind: ClusterSecretStore }
  target: { name: api-db, creationPolicy: Owner }
  data:
    - secretKey: url
      remoteRef: { key: prod/api, property: DATABASE_URL }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: prod
  annotations: { argocd.argoproj.io/sync-wave: "1" }
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api
  namespace: prod
  annotations: { argocd.argoproj.io/sync-wave: "2" }
```

## Checklist

- [ ] Cluster state changed only by the reconciler; no manual `kubectl apply`
- [ ] One Application per environment; promotion is a Git change
- [ ] Sync waves order namespace, secrets, workloads, ingress
- [ ] `selfHeal: true` and `prune: true` both enabled
- [ ] Server-side apply enabled; images pinned by digest in overlays
- [ ] Custom health checks in place for CRDs that report readiness asynchronously
- [ ] Secrets referenced from an external store, never committed
- [ ] Production sync gated by a protected branch and an explicit approval

## Anti-patterns

- **Leaving a terminal open and running `kubectl edit` on production.** It works until the next sync silently reverts it. Change Git, and use self-heal so drift is corrected and visible.
- **`automated.enabled: true` on production with no approval gate.** One merge to `main` becomes an unreviewed production deploy. Require a protected branch plus explicit promotion.
- **Sync waves left at the default everywhere.** Every object syncs simultaneously, so a Deployment starts against secrets and config that do not exist yet and crash-loops before the wave that would have fixed it.
- **Storing secrets in the GitOps repository.** Git history is permanent and widely cloned; a committed secret is compromised forever even after deletion. Use an external secret operator.
- **Not monitoring Argo CD itself.** A controller whose RBAC broke reports `OutOfSync` forever while the cluster runs unchanged, so nothing tells you deployment has stopped working.
