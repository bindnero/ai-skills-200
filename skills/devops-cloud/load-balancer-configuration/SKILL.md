---
name: load-balancer-configuration
description: Configures application and network load balancers with health checks, least-request algorithms, TLS termination, connection draining, and retry limits that avoid amplification. Use when scaling a service past one instance, when rolling deploys drop requests, or when traffic needs distributing across zones or regions.
---

# Load Balancer Configuration

**Use when:** a service runs on more than one instance, when rolling deploys drop in-flight requests, or when traffic must be spread across zones or regions.
**Do not use when:** the container scheduler already distributes pods and the real gap is liveness probes - use `kubernetes-manifests`; the goal is latency and error budgets rather than traffic distribution - use `sre-slos`.

## Instructions

1. Choose layer 4 or layer 7 deliberately. L4 forwards by connection and cannot read a path or a header; L7 terminates TLS, inspects the request, and can route by host or path but costs more CPU per request.
2. Health checks must test the dependency that matters, not just the process. A check that returns 200 while the primary database is unreachable keeps the broken instance in rotation and turns one outage into an outage with extra latency.
3. Make the check cheap and frequent enough to fail fast, with a failure threshold tuned to real recovery time. A 30-second unhealthy window plus a 5-minute drain is downtime you chose.
4. Pick the algorithm from the workload. Round-robin is fine for uniform stateless instances; least-request or least-connections suits mixed instance sizes and long-held connections; least-response-time exposes slow instances faster.
5. Set connection draining explicitly. On shutdown, fail the health check first, keep serving existing connections, then close them after the drain window and only then exit.
6. Bound retries at the balancer and set the budget so an error from the origin cannot be multiplied. Retries plus an application-level retry plus a client retry is three layers of amplification against the same failing dependency.
7. Give every hop a deadline below the caller's remaining budget, and pass the original client timeout down. A balancer with a 60-second default turns a 2-second client timeout into 60 seconds of held connection.
8. Decide what happens at partial capacity: shed load, queue, or return errors. A balancer that forwards beyond capacity converts an overload into a latency collapse affecting every user, including the ones who would have succeeded.
9. Keep the balancer stateless where possible. Session affinity is a last resort, and if you must use it, pin with a cookie or a hash of a stable key rather than the source IP that changes on mobile networks.
10. Make TLS termination a stated decision. Terminating at the balancer enables HTTP/2 and connection reuse, but the hop to the origin needs re-encryption or a trusted private network, and the forwarded scheme must be preserved.

## Patterns

ALB with health checks, draining, and bounded retries:

```yaml
# Application load balancer, HTTP/2 to clients, sticky sessions off.
listeners:
  - port: 443
    protocol: HTTPS
    certificate_arn: arn:aws:acm:eu-west-1:111122223333:certificate/abc
    ssl_policy: ELBSecurityPolicy-TLS13-1-2-2021-06
    default_actions:
      - type: forward
        target_group_arn: arn:aws:elasticloadbalancing:eu-west-1:111122223333:targetgroup/api/abc
        stickiness:
          enabled: false            # stateless app: no session affinity needed

target_groups:
  - name: api
    protocol: HTTP
    port: 8080
    health_check:
      path: /health/ready           # checks the database, not just the process
      healthy_threshold: 2
      unhealthy_threshold: 2       # ~30s to remove a bad instance
      interval: 10
      timeout: 5
      matcher: "200"
    deregistration_delay:
      seconds: 60                   # serve in-flight requests before closing
    load_balancing:
      algorithm: least_requests     # beats round-robin with mixed instance sizes
      slow_start: true              # ramp weight up after a deploy
    stickiness:
      enabled: false

attributes:
  - key: routing.http.dns_tsv2_enabled
    value: true                     # Route 53 health-aware DNS for cross-region
  - key: routing.http.drop_invalid_header_fields.enabled
    value: true
```

Kubernetes equivalent - readiness gate plus pre-stop drain:

```yaml
# Drain order matters: fail readiness, then sleep, then let the proxy notice.
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 15 && kill -TERM 1"]
readinessProbe:
  httpGet: { path: /health/ready, port: 8080 }
  periodSeconds: 5
  failureThreshold: 2
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api
spec:
  minAvailable: 2                   # so a node drain cannot empty the service
  selector:
    matchLabels: { app: api }
---
# Retries bounded in the ingress so a 503 becomes one extra attempt, not six.
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    nginx.ingress.kubernetes.io/proxy-next-upstream: "error timeout http_502 http_503"
    nginx.ingress.kubernetes.io/proxy-next-upstream-tries: "2"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "2"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "30"
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port: { number: 8080 }
```

## Checklist

- [ ] Health check exercises the critical dependency, not just process liveness
- [ ] Check interval and failure threshold give an acceptable time-to-remove
- [ ] Algorithm matches the workload: least-request for mixed instances, round-robin for uniform
- [ ] Deregistration drain configured and long enough for the slowest request
- [ ] Shutdown order is fail-check, serve, drain, exit
- [ ] Retry count bounded at the balancer, with the full retry budget counted across layers
- [ ] Backend timeouts shorter than client timeouts and inside the latency budget
- [ ] Overload behaviour explicit: shed, queue, or fail fast
- [ ] Session affinity avoided, or pinned on a stable key rather than source IP
- [ ] Cross-zone and cross-region distribution measured, not assumed

## Anti-patterns

**Health checks that only prove the process is alive.** A `/health` returning 200 unconditionally keeps instances that cannot reach the database in rotation, so a database blip becomes an application-wide failure with slower responses. The readiness check must verify the dependency the request path needs.

**Retries stacked at three layers.** Client retry plus service retry plus balancer retry turns one dependency error into six requests, and the extra load is exactly what the struggling dependency cannot absorb. One retry budget, owned by the caller, propagated downwards.

**Draining with no drain.** Killing pods the moment a deploy starts drops in-flight requests and any websocket or long-poll connection. Fail readiness, wait for the proxy to notice, then exit.

**Session affinity used to paper over hidden state.** Sticky sessions scale badly, break on failover, and hide the fact that instance-local memory is being treated as durable. Make the service stateless and remove the affinity.

**Forwarding beyond capacity.** No load shedding means 2x the intended traffic still gets forwarded, and every request slows down until the whole service times out. Queue or reject before saturation, not after.
