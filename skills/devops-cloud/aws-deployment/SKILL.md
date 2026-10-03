---
name: aws-deployment
description: Deploys services on AWS using ECS/Fargate, EKS, Lambda and App Runner with least-privilege IAM, OIDC CI auth, multi-AZ ALB targets and long deregistration delays. Use when shipping to AWS, sizing an ECS task, or fixing target health, draining or IAM permission errors.
---

# AWS Deployment

**Use when:** Shipping a container or function to AWS — ECS/Fargate, EKS, Lambda or App Runner — with correct IAM, networking and health-check behaviour.
**Do not use when:** The change is purely Terraform resource authoring with no runtime artifact to place; use `terraform-modules` for that.

## Instructions

1. Pick the compute unit deliberately: Lambda for event-driven bursty work, App Runner for containerised HTTP services with managed scaling, ECS/Fargate when you need VPC placement, EKS when the platform is already Kubernetes.
2. Spread the workload across at least three Availability Zones and register targets in every zone. A single-AZ deployment converts any AZ event into a full outage.
3. Point the ALB health check at the readiness endpoint and set `deregistration_delay.timeout_seconds` longer than the slowest request plus drain time, so in-flight work completes.
4. Grant least privilege through task and execution roles scoped to specific actions and resource ARNs. Never attach managed full-access policies to a runtime role.
5. Authenticate CI with OIDC using a trust policy limited by `repo`, `ref` and workflow filename, not long-lived IAM user keys.
6. Pin task definition container images by digest and commit the task definition revision; unpinned tags make rollback impossible.
7. For Lambda, set a reserved concurrency limit, an alias pointing at a published version, a DLQ, and `on-failure` destinations for asynchronous invocation.
8. Poll service state and fail the deploy on anything other than `COMPLETED` rather than sleeping a fixed interval and declaring success.
9. Enable CloudTrail, Config and GuardDuty in every account, and block public access at the account level rather than per bucket.
10. Tag every resource at creation with `Owner`, `Service` and `CostCenter`, because tags applied later never reach the billing data that matters.

## Patterns

An ECS Fargate task definition with a least-privilege split between execution and task roles:

```json
{
  "family": "api",
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::111122223333:role/api-execution",
  "taskRoleArn": "arn:aws:iam::111122223333:role/api-task",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "111122223333.dkr.ecr.us-east-1.amazonaws.com/api@sha256:8f14e45fceea167a5a36dedd4bea2543f2d3b9c11",
      "essential": true,
      "portMappings": [{ "containerPort": 8080, "protocol": "tcp" }],
      "secrets": [{
        "name": "DATABASE_URL",
        "valueFrom": "arn:aws:secretsmanager:us-east-1:111122223333:secret:api/db-AbCdEf"
      }],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": { "awslogs-group": "/ecs/api", "awslogs-region": "us-east-1", "awslogs-stream-prefix": "ecs" }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/health/ready || exit 1"],
        "interval": 15, "timeout": 5, "retries": 3, "startPeriod": 30
      }
    }
  ]
}
```

An OIDC trust policy scoped to one repository, one branch and one workflow:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:acme/platform:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

A target group whose drain window matches the application's request lifetime:

```yaml
Resources:
  ApiTargetGroup:
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    Properties:
      VpcId: !Ref VpcId
      Port: 8080
      Protocol: HTTP
      TargetType: ip
      HealthCheckPath: /health/ready
      HealthCheckIntervalSeconds: 15
      HealthCheckTimeoutSeconds: 5
      HealthyThresholdCount: 2
      UnhealthyThresholdCount: 3
      Matcher: { HttpCode: "200-299" }
      TargetGroupAttributes:
        - Key: deregistration_delay.timeout_seconds
          Value: "60"
        - Key: slow_start.duration_seconds
          Value: "30"
  ApiListener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties:
      LoadBalancerArn: !Ref LoadBalancerArn
      Port: 443
      Protocol: HTTPS
      SslPolicy: ELBSecurityPolicy-TLS13-1-2-2021-06
      Certificates: [{ CertificateArn: !Ref CertificateArn }]
      DefaultActions: [{ Type: forward, TargetGroupArn: !Ref ApiTargetGroup }]
```

## Checklist

- [ ] Workload spans at least three Availability Zones with targets registered in each
- [ ] Health check path hits readiness; deregistration delay exceeds max request time
- [ ] Container images pinned by digest; task definition revisions tracked
- [ ] Secrets injected via the `secrets` block, never `environment`
- [ ] Task and execution roles scoped to specific actions and resource ARNs
- [ ] CI authenticates with OIDC restricted to one repository, ref and workflow
- [ ] Deploy waits for `rolloutState == COMPLETED` and runs a smoke test
- [ ] `Owner`, `Service` and `CostCenter` tags set at resource creation

## Anti-patterns

- **A single AZ or single-replica service.** One AZ brownout or one bad deploy becomes a full outage. Spread across three AZs and keep a disruption budget in place.
- **Passing secrets as task-definition `environment`.** They are visible in plaintext to anyone who can call `describe-task-definition` and land in the ECS console. Use the `secrets` block backed by Secrets Manager.
- **Long-lived IAM keys for CI or on instances.** Keys are phishable, rotate on an unpredictable schedule, and provide no way to tell which workload used one. Use OIDC for CI and task or instance roles for workloads.
- **Deploying, sleeping 60 seconds, and calling it done.** The deploy usually wins that race. Poll for a terminal rollout state, then run a request against the real endpoint.
- **`AdministratorAccess` on a runtime role.** Any remote code execution becomes immediate account takeover. Scope the policy to the exact API calls the process makes and re-verify with IAM Access Analyzer.