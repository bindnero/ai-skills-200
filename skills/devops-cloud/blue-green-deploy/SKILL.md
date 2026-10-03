---
name: blue-green-deploy
description: Performs zero-downtime blue/green releases on Kubernetes or AWS with weighted traffic shifting, health gates and automated rollback. Use when a change cannot tolerate downtime or when cutover must be instant and reversible.
---

# Blue Green Deploy

**Use when:** A change cannot tolerate downtime, or when moving traffic must be instant and reversible within seconds.
**Do not use when:** A gradual rollout over minutes is acceptable; a standard rolling deployment is simpler and cheaper.

## Instructions

1. Deploy the new version alongside the running one under a distinct name such as `api-green`, with its own Service and pods. Never mutate the live deployment in place.
2. Give the new colour its own database schema or migration path. A shared mutable schema makes rollback impossible regardless of how clean the traffic switch is.
3. Warm the new colour before sending traffic: JIT-compiled code loaded, caches primed, connections established. Cold starts otherwise show up as latency during cutover.
4. Run the full smoke suite against the green environment, using internal routing so the check is real and not a guess.
5. Shift traffic gradually with a weighted target: 5 percent, then 25, then 100, with a soak period at each step measured in your own SLO window.
6. Automate the health gate. Rollback triggers on elevated 5xx rate, p99 latency regression or falling success rate, not on human judgement during the soak.
7. Keep both environments running through the soak window. Deleting blue too early removes your ability to roll back without a redeploy.
8. Once green is proven, roll the schema forward and only then decommission blue, retaining the artefacts needed to rebuild it.
9. Record every deployment, the commit, the traffic weights and the gate results, so the production state is always reconstructible.
10. Rehearse a rollback regularly. An untested cutover path is an assumption, and rollback is the moment you least want to discover one.

## Patterns

A weighted cutover driven by a scripted gate, with automatic rollback on SLO regression:

```bash
#!/usr/bin/env bash
# Blue/green cutover for the API. Run from CI with the kubectl context for prod.
set -euo pipefail

BLUE=orders-api-blue
GREEN=orders-api-green
PUBLIC_VHOST=api.acme.com
GATE_METRICS=https://metrics.internal.acme.com/api/v1/query

wait_healthy() {
  kubectl -n prod rollout status "deployment/$1" --timeout=300s
  for _ in $(seq 1 60); do
    ready=$(kubectl -n prod get deploy "$1" -o jsonpath='{.status.readyReplicas}')
    [[ "${ready:-0}" -ge 3 ]] && return 0
    sleep 5
  done
  echo "FAIL: $1 never reached 3 ready replicas"; exit 1
}

slo_gate() {
  local label="$1" errors latency
  errors=$(curl -sfG "$GATE_METRICS" --data-urlencode \
    "query=sum(rate(http_requests_total{env=\"$label\",status=~\"5..\"}[2m]))" | jq -r .data.result[0].value[1])
  latency=$(curl -sfG "$GATE_METRICS" --data-urlencode \
    "query=histogram_quantile(0.99,sum(rate(http_request_duration_seconds_bucket{env=\"$label\"}[2m])) by (le))" | jq -r .data.result[0].value[1])
  awk -v e="$errors" -v l="$latency" 'BEGIN { exit !(e < 0.005 && l < 0.400) }'
}

echo "Deploying green"
kubectl -n prod apply -f overlays/prod/green.yaml
wait_healthy "$GREEN"

echo "Warming green"
for _ in $(seq 1 30); do
  curl -sf -H "Host: $PUBLIC_VHOST" "http://$GREEN.prod.svc.cluster.local/health/ready" > /dev/null || true
  sleep 2
done

echo "Smoke testing green"
kubectl -n prod run smoke --rm -i --restart=Never --image=ghcr.io/acme/smoke:1.9.0 -- \
  sh -c "smoke --base-url=http://$GREEN.prod.svc.cluster.local --checks=all"

for WEIGHT in 5 25 100; do
  echo "Shifting ${WEIGHT}% of traffic to green"
  kubectl -n prod patch ingress "$BLUE" --type=json -p="[
    {\"op\":\"replace\",\"path\":\"/spec/rules/0/http/paths/0/backend/service/port/name\",\"value\":\"green\"}]" > /dev/null
  sleep 300
  if ! slo_gate green; then
    echo "GATE FAILED at ${WEIGHT}% — rolling back to blue"
    kubectl -n prod patch ingress "$BLUE" --type=json -p="[
      {\"op\":\"replace\",\"path\":\"/spec/ingressClassName\",\"value\":\"nginx-blue\"}]" > /dev/null
    kubectl -n prod scale "deployment/$GREEN" --replicas=0
    exit 1
  fi
done

echo "Cutover complete; green is at 100%"
```

The two-colour layout that makes the switch instant and reversible:

```yaml
# base/api.yaml - identical for both colours; only the name and image differ
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api-blue      # green.yaml is identical with name: orders-api-green
  namespace: prod
  labels: { app.kubernetes.io/name: orders-api, colour: blue }
spec:
  replicas: 6
  selector:
    matchLabels: { app.kubernetes.io/name: orders-api, colour: blue }
  template:
    metadata:
      labels: { app.kubernetes.io/name: orders-api, colour: blue }
    spec:
      containers:
        - name: api
          image: ghcr.io/acme/orders-api@sha256:3f9a1c7e5b2d8046fa1e9c73b5d0e2f4a6c8b1d3e5f7092a4c6e8b0d2f4a6c8e
          ports: [{ name: blue, containerPort: 8080 }]
          resources:
            requests: { cpu: 300m, memory: 384Mi }
            limits: { memory: 768Mi, cpu: "1" }
          readinessProbe:
            httpGet: { path: /health/ready, port: blue }
            periodSeconds: 5, failureThreshold: 3
          startupProbe:
            httpGet: { path: /health/startup, port: blue }
            failureThreshold: 30, periodSeconds: 2
---
apiVersion: v1
kind: Service
metadata: { name: orders-api-blue, namespace: prod }
spec:
  selector: { app.kubernetes.io/name: orders-api, colour: blue }
  ports: [{ name: blue, port: 80, targetPort: blue }]
```

## Checklist

- [ ] Green runs as a separate Deployment and Service from blue
- [ ] Schema changes are backward compatible, or green uses its own schema
- [ ] Green warmed and smoke-tested before any production traffic
- [ ] Traffic shifts in weighted steps with a soak period at each
- [ ] Rollback is automated on 5xx rate or latency regression, not manual
- [ ] Blue stays running and routable through the soak window
- [ ] Schema rolled forward only after green is proven
- [ ] Deployment record stored with commit, weights and gate results

## Anti-patterns

- **Deleting blue immediately after cutover.** The first sign of trouble then requires a redeploy instead of a traffic flip, turning a 30-second rollback into a 20-minute one. Keep blue for the whole soak.
- **In-place image update on the live Deployment.** Once pods are replaced, the old version no longer exists and rollback means rebuilding and re-warming it. Run the new version alongside instead.
- **Switching 100 percent of traffic with no gate.** The first bad deploy takes full customer impact instantly, because nothing measured the new version under real load first.
- **Destructive migrations before cutover.** A schema change that the old version cannot read makes rollback impossible; traffic shifting becomes a one-way door.
- **Judging success by deployment status alone.** `readyReplicas` says the process started, not that it works. Gate on error rate and latency from real traffic.