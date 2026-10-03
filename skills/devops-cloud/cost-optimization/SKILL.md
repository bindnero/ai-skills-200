---
name: cost-optimization
description: Reduces infrastructure spend through Kubernetes rightsizing, spot capacity, savings plans, storage tiering, NAT and logging controls, and tag-based attribution. Use when a cloud bill is growing unexpectedly, rightsizing containers, or adding cost tags and unit-economics reporting.
---

# Cost Optimization

**Use when:** A cloud bill is growing unexpectedly, containers need rightsizing, or you are adding cost attribution and unit-economics reporting.
**Do not use when:** The spend is a one-off spike from a deliberate scaling event; measure first, then decide whether the optimisation is worth the reliability cost.

## Instructions

1. Attribute before you optimise. Enforce `CostCenter`, `Service` and `Owner` tags, then look at daily cost per tag. An untagged bill has no addressable line items.
2. Establish a baseline from the last 90 days, normalised for traffic, so you optimise unit cost (cost per request) rather than total spend that tracks growth.
3. Rightsize Kubernetes requests from real observed usage, not initial guesses. Set requests near p95 of actual CPU and memory, and set memory limits above p99.
4. Enable the vertical pod autoscaler in `Auto` mode with min/max boundaries, so requests converge on real usage without thrashing on every deploy.
5. Move fault-tolerant and batch workloads to spot capacity with interruption handling: checkpoint frequently and handle the SIGTERM that spot preemption sends.
6. Commit to savings plans or reservations only for the baseline of steady usage. Cover the floor with commitments and leave the variable layer flexible.
7. Tier storage: move cold objects to infrequent-access or archive classes, set lifecycle rules on old logs and snapshots, and cap retention rather than deleting nothing.
8. Audit the network path: NAT gateway hourly charges, inter-AZ data transfer and cross-region egress are frequently larger than compute for spiky services.
9. Trim telemetry volume deliberately — reduce log level, sample success-path logs, set scrape intervals — since observability pipelines are now a top-three line item.
10. Delete idle resources on a schedule: unattached EBS volumes, unused load balancers, orphaned snapshots, stopped non-production environments over the weekend.

## Patterns

VPA in auto mode with bounds, paired with explicit requests as the starting point:

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata: { name: api, namespace: prod }
spec:
  targetRef: { apiVersion: apps/v1, kind: Deployment, name: api }
  updatePolicy: { updateMode: "Auto" }
  resourcePolicy:
    containerPolicies:
      - containerName: api
        minAllowed: { cpu: 100m, memory: 192Mi }
        maxAllowed: { cpu: "2", memory: 1Gi }
        controlledResources: [cpu, memory]
```

Karpenter consolidating idle capacity into the cheapest viable node and Spot pool:

```yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata: { name: default }
spec:
  weight: 50
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 5m
    budgets: [{ nodes: "10%" }]
  template:
    metadata:
      labels: { workload: general }
    spec:
      requirements:
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: [c6i.large, c6i.xlarge, m6i.large, m7i.large]
        - key: karpenter.sh/capacity-type
          operator: In
          values: [on-demand, spot]
      nodeClassRef: { group: karpenter.k8s.aws, kind: EC2NodeClass, name: default }
      limits: { cpu: 2000 }
  limits: { cpu: 4000 }
```

Storage lifecycle tiers and log retention that actually cap spend:

```terraform
resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "tier-and-expire"
    status = "Enabled"

    transition { days = 30, storage_class = "STANDARD_IA" }
    transition { days = 90, storage_class = "GLACIER_IR" }
    transition { days = 365, storage_class = "GLACIER" }

    noncurrent_version_transition { noncurrent_days = 30, storage_class = "STANDARD_IA" }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
    expiration { days = 2555 } # 7-year regulatory retention, then gone
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/api"
  retention_in_days = 14 # not never, not indefinite
}
```

Unit economics that correlate cost to product value rather than to growth:

```promql
# Cost per 1000 requests: the number that moves with efficiency, not volume.
(
  sum by (service) (increase(http_server_requests_total[7d])) / 1000
)
and on(service)
(
  label_replace(
    sum by (service) (kube_pod_container_resource_requests{resource="cpu",unit="core"}),
    "service", "$1", "pod", "(.+)-.*"
  ) * 0.042
)
```

## Checklist

- [ ] `CostCenter`, `Service` and `Owner` tags enforced at resource creation
- [ ] Unit cost per request tracked, not just total spend
- [ ] Container requests near p95 usage; memory limits above p99
- [ ] VPA configured with min/max bounds, not left unbounded
- [ ] Baseline steady-state usage covered by savings plans; variable layer left flexible
- [ ] Storage lifecycle transitions and log retention periods set with caps
- [ ] NAT, inter-AZ and cross-region egress paths audited
- [ ] Idle resource reaper scheduled for unattached volumes and stopped non-prod

## Anti-patterns

- **Cutting memory limits to reduce cost.** Limits drive scheduling; lowering them below real usage causes OOM kills and restarts, which cost more than the memory saved. Right-size from p99 with headroom.
- **Committing 100 percent of usage to savings plans.** Usage is never fully steady; over-committing creates a large unused bill when demand drops. Commit to the measured baseline floor only.
- **Spot for latency-sensitive, non-retryable work.** An interruption mid-request causes user-visible failure. Use spot only for checkpointable, retryable batch work.
- **Right-sizing from a single day of metrics.** Deploys, cron jobs and batch windows make any single day unrepresentative. Use at least a week covering a full business cycle.
- **Optimising total spend while traffic is growing.** Total cost rises with volume even while you optimise. Track cost per request so efficiency gains are visible against growth.