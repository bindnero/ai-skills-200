---
name: infrastructure-testing
description: Tests infrastructure as code with Terratest, Checkov, Trivy, tfsec, kubeconform and OPA policy gates plus per-plan cost assertions. Use when adding automated tests to Terraform or Kubernetes changes, or when preventing insecure infrastructure from merging.
---

# Infrastructure Testing

**Use when:** Adding automated tests to Terraform or Kubernetes changes, or preventing insecure or unexpectedly expensive infrastructure from merging.
**Do not use when:** You are writing unit tests for application business logic; that belongs with the application's own test suite.

## Instructions

1. Separate three test layers and be explicit about which one a change needs: static policy, plan-time assertion, and apply-time assertion.
2. Run static analysis on every change: Checkov for Terraform, Trivy for images and IaC, kubeconform plus KICS for manifests.
3. Use Terratest in plan-only mode by default. It is fast, needs no credentials and still validates variables, lifecycle rules and provider behaviour.
4. Add apply-time tests only where creation behaviour genuinely matters, such as security group reachability or a public bucket being blocked. Delete the infrastructure in the same test.
5. Treat a diff of the plan as an assertion. Snapshot expected output so an unnoticed destructive change fails the pipeline.
6. Gate on policy, not on style. OPA or Checkov rules should encode your actual security posture, and each new rule needs a documented exception process.
7. Add cost estimation to the pipeline. A plan that adds 200 unencrypted nodes should fail before merge, not after the invoice.
8. Scan container images at build time and fail on Critical or High findings with a fix version available, using an explicit suppression file for accepted risk.
9. Run tests in a pull request that can create and destroy resources, with credentials scoped to a throwaway account and a hard spend ceiling.
10. Report results in the PR as a comment, so a reviewer sees the plan diff and the policy findings without opening another tool.

## Patterns

A plan-only Terratest suite that asserts the plan succeeds and rejects unsafe inputs:

```go
func TestRdsModule_PlanSucceeds(t *testing.T) {
    terraform.InitAndPlan(t, &terraform.Options{
        TerraformDir: "../examples/rds",
        Vars: map[string]interface{}{
            "name":            "orders-primary",
            "instance_class":  "db.t4g.medium",
            "allocated_storage": 100,
            "multi_az":        true,
            "backup_retention_days": 14,
            "master_username": "admin",
            "master_password": "not-a-real-credential",
            "subnet_ids":      []string{"subnet-0a1b2c3d", "subnet-4e5f6a7b"},
        },
    })
}

func TestRdsModule_RejectsZeroBackupRetention(t *testing.T) {
    _, err := terraform.InitAndPlanE(t, &terraform.Options{
        TerraformDir: "../examples/rds",
        Vars: map[string]interface{}{
            "name": "orders-primary", "instance_class": "db.t4g.medium",
            "allocated_storage": 100, "master_username": "admin",
            "master_password": "not-a-real-credential",
            "subnet_ids": []string{"subnet-0a1b2c3d"},
        },
    })
    require.Error(t, err, "a plan with no backups must be rejected by validation")
    assert.Contains(t, err.Error(), "backup_retention_days")
}
```

Apply-time tests for the properties that only exist once resources are real:

```go
func TestSecurityGroup_IsNotReachableFromTheInternet(t *testing.T) {
    vpcOutput := terraform.Output(t, terraform.Options{TerraformDir: "../examples/vpc"}, "vpc_id")
    sgID := terraform.Output(t, terraform.Options{TerraformDir: "../examples/sg"}, "sg_id")

    // Enumerate every inbound rule and fail if 0.0.0.0/0 reaches a data port.
    ingress := aws.GetResourceAttributes(t, sgID, "aws_security_group", "ingress")
    for _, rule := range ingress {
        if aws.ToString(rule["cidr_blocks"]) == "0.0.0.0/0" && int(aws.ToInt32(rule["from_port"])) == 5432 {
            t.Fatal("database port is open to the internet")
        }
    }
    _ = vpcOutput
}
```

A CI gate that combines policy, plan diff and cost in one job:

```yaml
name: infra-verify
on: pull_request

jobs:
  terraform:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with: { terraform_version: 1.9.8 }
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::111122223333:role/infra-pr-checks
          aws-region: us-east-1
      - run: terraform fmt -check -recursive infra/
      - run: terraform -chdir=infra init -backend=false
      - run: terraform -chdir=infra validate
      - run: terraform -chdir=infra plan -out=tfplan -var-file=envs/pr.tfvars
      - name: Cost gate
        run: |
          terraform show -json tfplan > plan.json
          jq '[.resource_changes[] | select(.change.actions[0] == "create")
               | .change.after | .. | .monthly_cost? // empty] | add // 0' plan.json
      - name: Comment the plan on the PR
        uses: actions/github-script@v7
        with:
          script: |
            const plan = require('fs').readFileSync('plan.txt', 'utf8').slice(0, 60000);
            await github.rest.issues.createComment({
              owner: context.repo.owner, repo: context.repo.repo,
              issue_number: context.issue.number, body: "```diff\n" + plan + "\n```",
            });
```

## Checklist

- [ ] Static analysis runs on every change: Checkov, Trivy, kubeconform, KICS
- [ ] Terratest defaults to plan-only; apply tests limited to behaviour only a real resource proves
- [ ] Apply tests destroy everything they create
- [ ] Plan output snapshotted so an unexpected destructive change fails
- [ ] Policy rules encode real posture and have a documented exception path
- [ ] Cost estimation gates merges, with a hard ceiling on the test account
- [ ] Image scanning fails on Critical and High with a fix available
- [ ] Test credentials scoped to a throwaway account with a spend limit

## Anti-patterns

- **Running only `terraform validate`.** Validate checks syntax and nothing about behaviour. A security group open to the world validates perfectly; only a plan or apply test catches it.
- **No plan saved as an artifact.** Without the diff in the PR, reviewers approve Terraform they have never seen the consequences of, and a destructive replacement is invisible.
- **Secrets in Terratest fixtures.** Hard-coded credentials in test files leak through Git history, even test credentials with wide permissions. Use the PR's OIDC role.
- **Waiting for the nightly pipeline.** Tests that run nightly mean insecure infrastructure reaches production daily. Gate the merge instead.
- **Asserting only that apply succeeds.** A resource can be created perfectly wrong. Assert on the resulting attributes, such as encryption enabled or port closed.