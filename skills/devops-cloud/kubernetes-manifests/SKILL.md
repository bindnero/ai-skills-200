---
name: kubernetes-manifests
description: Authors raw Kubernetes Deployments, Services, probes, resource limits, PodDisruptionBudgets and topology spread constraints, plus kustomize overlays. Use when writing or debugging YAML for kubectl apply, when a pod is CrashLoopBackOff or Pending, or when replacing a Helm chart with plain manifests.
---

# Kubernetes Manifests

**Use when:** Writing, reviewing or debugging raw Kubernetes YAML applied with `kubectl`, including probes, resources, scheduling and network policy.
**Do not use when:** The release unit is a versioned package with `Chart.yaml` and templated values; use `helm-chart-authoring` instead.

## Instructions

1. Use currently served API versions (`apps/v1`, `networking.k8s.io/v1`, `policy/v1`, `autoscaling/v2`) and always declare `metadata.namespace` rather than relying on ambient kubectl context.
2. Set `resources.requests` and `resources.limits` on every container. Requests drive scheduling; without them the scheduler overcommits and nodes fall into eviction cascades.
3. Implement all three probes with thresholds matched to real traffic: `startupProbe` for slow boots, `readinessProbe` to gate traffic, `livenessProbe` to restart. Liveness must never call a downstream dependency — that turns a dependency blip into a full outage.
4. Set `terminationGracePeriodSeconds` and a `preStop` sleep so in-flight requests drain before SIGTERM, and pair the workload with a `PodDisruptionBudget`.
5. Pin images by digest, set `imagePullPolicy: IfNotPresent`, and tune the rollout as `maxUnavailable: 0` with `maxSurge: 1` so a rolling update never drops capacity.
6. Control placement with `topologySpreadConstraints`, `nodeSelector` or `nodeAffinity`, and `tolerations`. Spread replicas across zones before raising replica counts.
7. Apply a default-deny `NetworkPolicy` plus explicit ingress and egress allow rules. Without them, any compromised pod reaches every other pod and the managed metadata endpoint.
8. Structure it as a kustomize `base/` plus `overlays/{dev,staging,prod}` where overlays patch replicas, resources and image digest only, then validate with `kubectl apply --dry-run=server`, `kubeconform -strict` and a reviewed `kubectl diff`.

## Patterns

A hardened Deployment with real probe semantics, zone spreading and a ClusterIP Service:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: prod
  labels: { app.kubernetes.io/name: api, app.kubernetes.io/version: "2.4.0" }
spec:
  replicas: 6
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  selector:
    matchLabels: { app.kubernetes.io/name: api }
  template:
    metadata:
      labels: { app.kubernetes.io/name: api }
    spec:
      serviceAccountName: api
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: 45
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        seccompProfile: { type: RuntimeDefault }
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels: { app.kubernetes.io/name: api }
      containers:
        - name: api
          image: ghcr.io/acme/api@sha256:8f14e45fceea167a5a36dedd4bea2543f2d3b9c11
          imagePullPolicy: IfNotPresent
          ports: [{ name: http, containerPort: 8080 }]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef: { name: api-db, key: url }
          resources:
            requests: { cpu: 200m, memory: 256Mi }
            limits: { memory: 512Mi, cpu: "2" }
          startupProbe:
            httpGet: { path: /health/startup, port: http }
            failureThreshold: 30, periodSeconds: 2
          readinessProbe:
            httpGet: { path: /health/ready, port: http }
            periodSeconds: 5, timeoutSeconds: 2, failureThreshold: 3
          livenessProbe:
            httpGet: { path: /health/live, port: http }
            periodSeconds: 15, timeoutSeconds: 2, failureThreshold: 3
          lifecycle:
            preStop:
              exec: { command: ["/bin/sh", "-c", "sleep 10"] }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
          volumeMounts: [{ name: tmp, mountPath: /tmp }]
      volumes: [{ name: tmp, emptyDir: {} }]
---
apiVersion: v1
kind: Service
metadata: { name: api, namespace: prod }
spec:
  type: ClusterIP
  selector: { app.kubernetes.io/name: api }
  ports: [{ name: http, port: 80, targetPort: http }]
```

A default-deny policy per namespace plus a tightly scoped exception and a disruption budget:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny, namespace: prod }
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: api-allow, namespace: prod }
spec:
  podSelector: { matchLabels: { app.kubernetes.io/name: api } }
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels: { kubernetes.io/metadata.name: ingress-nginx }
      ports: [{ protocol: TCP, port: 8080 }]
  egress:
    - to: [{ ipBlock: { cidr: 10.32.0.0/16 } }]
      ports: [{ protocol: TCP, port: 5432 }]
    - ports: [{ protocol: UDP, port: 53 }]
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: api, namespace: prod }
spec:
  minAvailable: 4
  selector: { matchLabels: { app.kubernetes.io/name: api } }
```

A kustomize overlay that only patches what differs per environment:

```yaml
# overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: prod
resources: [../../base]
patches:
  - target: { kind: Deployment, name: api }
    patch: |
      - op: replace
        path: /spec/replicas
        value: 12
      - op: replace
        path: /spec/template/spec/containers/0/resources/requests/cpu
        value: 500m
images:
  - name: ghcr.io/acme/api
    digest: sha256:8f14e45fceea167a5a36dedd4bea2543f2d3b9c11
```

## Checklist

- [ ] Every container sets `requests` and `limits`, including a memory limit
- [ ] `startupProbe`, `readinessProbe` and `livenessProbe` all present and tuned
- [ ] Liveness does not call downstream dependencies
- [ ] Images pinned by digest with a deliberate `imagePullPolicy`
- [ ] `PodDisruptionBudget` and `topologySpreadConstraints` across zones present
- [ ] `securityContext` drops all capabilities and blocks privilege escalation
- [ ] Default-deny `NetworkPolicy` in place with explicit, minimal exceptions
- [ ] `kubectl apply --dry-run=server` and `kubeconform -strict` pass in CI

## Anti-patterns

- **Liveness probe that checks the database.** A slow database restarts every replica simultaneously, converting degradation into a total outage. Liveness must only prove the process itself is alive.
- **No resource requests.** The scheduler places pods on already-full nodes and kubelet starts evicting them, producing a crash loop that looks like a bad build. Requests are a scheduling contract, not a suggestion.
- **`imagePullPolicy: Always` with `:latest`.** Every restart pulls a possibly different image and every rollback is guesswork. Pin the digest and use `IfNotPresent`.
- **`hostNetwork: true` to dodge networking.** It bypasses the cluster's DNS and policy model and makes multi-environment installs collide. Use a Service and NetworkPolicy instead.
- **An HPA with no metrics-server or stabilisation window.** Scaling on CPU before pods are ready produces a thundering herd the cluster cannot absorb.