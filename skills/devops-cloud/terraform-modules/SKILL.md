---
name: terraform-modules
description: Authors reusable Terraform 1.9+ modules with typed variables, count and for_each, moved blocks, check blocks and Terratest suites. Use when extracting infrastructure into a versioned module, fixing state coupling, or passing plan-time assertions.
---

# Terraform Modules

**Use when:** Extracting infrastructure into a reusable versioned module, untangling state coupling, or adding plan-time assertions to a configuration.
**Do not use when:** You are managing a single resource set that nobody else will consume; plain configuration is clearer than a premature abstraction.

## Instructions

1. Design the module interface before writing resources. Inputs go in `variables.tf` with explicit types, validations and descriptions; nothing else crosses the boundary.
2. Set defaults to be safe, not convenient. A default that opens a database to `0.0.0.0/0` turns a forgotten argument into a breach.
3. Use `count` only when the resource is genuinely optional and the index is not referenced elsewhere; use `for_each` whenever instances need stable identity.
4. Never use the bare provider alias in child modules. Declare `configuration_aliases` so the caller decides which provider each module instance uses.
5. Replace path renames with `moved` blocks so Terraform migrates state instead of destroying and recreating resources.
6. Use `check` blocks for assertions that must fail the plan, such as an S3 bucket expected to have versioning enabled.
7. Pin provider and module versions in `required_providers` and commit `.terraform.lock.hcl`, so plans are reproducible.
8. Set `prevent_destroy` on stateful resources such as databases and buckets, making accidental deletion a plan-time error.
9. Structure the module as `main.tf`, `variables.tf`, `outputs.tf` and `versions.tf` with no provider blocks, keeping it independently testable.
10. Test with Terratest in plan-only mode by default, adding an apply test only where creation behaviour genuinely needs verifying.

## Patterns

A module body using for_each over a map and a check block, with no provider block:

```hcl
terraform {
  required_version = ">= 1.9.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.60" }
  }
}

locals {
  # subnet_index is derived once and referenced everywhere, so the CIDR maths lives in one place.
  subnet_index = { for k, v in var.subnets : k => cidrsubnet(v.cidr, 8, tonumber(k)) }
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = [for k in sort(keys(local.subnet_index)) : aws_subnet.private[k].id]
  tags       = var.tags
}

resource "aws_db_instance" "this" {
  identifier             = var.name
  engine                 = "postgres"
  engine_version         = var.engine_version
  instance_class         = var.instance_class
  allocated_storage      = var.allocated_storage
  db_subnet_group_name   = aws_db_subnet_group.this.name
  multi_az               = var.multi_az
  backup_retention_period = var.backup_retention_days
  deletion_protection    = true
  skip_final_snapshot    = false
  final_snapshot_identifier = "${var.name}-final"
  storage_encrypted      = true
  copy_tags_to_snapshot  = true
  username               = var.master_username
  password               = var.master_password
  tags                   = var.tags

  lifecycle {
    prevent_destroy = true
  }
}

check "encryption_and_deletion_protection" {
  assert {
    condition     = aws_db_instance.this.storage_encrypted && aws_db_instance.this.deletion_protection
    error_message = "The database must be encrypted with deletion protection enabled."
  }
}
```

Terratest in plan-only mode, which is fast and does not create billable resources:

```go
func TestPostgresModule_RejectsShortBackupRetention(t *testing.T) {
    terraform.InitAndPlan(t, &terraform.Options{
        TerraformDir: "../examples/postgres",
        Vars: map[string]interface{}{
            "name":                "orders-primary",
            "backup_retention_days": 3, // must fail validation at plan time
        },
    })
}

func TestPostgresModule_PlanSucceeds(t *testing.T) {
    terraform.InitAndPlan(t, &terraform.Options{
        TerraformDir: "../modules/postgres",
        Vars: map[string]interface{}{
            "name":                 "orders-primary",
            "engine_version":       "16.4",
            "instance_class":       "db.r6g.xlarge",
            "allocated_storage":    500,
            "backup_retention_days": 30,
            "multi_az":             true,
            "master_username":      "admin",
            "master_password":      "s3cret-not-a-real-credential",
            "db_subnet_group_name": "sg-0a1b2c3d4e5f60718",
            "subnets":              map[string]interface{}{"0": map[string]string{"cidr": "10.32.0.0/20"}},
        },
    })
}
```

## Checklist

- [ ] Every variable typed, described, `nullable = false` where relevant
- [ ] Dangerous defaults replaced by validation rules that fail the plan
- [ ] `for_each` used for anything with stable identity; `count` only for truly optional resources
- [ ] Provider aliases declared via `configuration_aliases`, never hard-coded
- [ ] Renames use `moved` blocks, with state verified before apply
- [ ] `check` blocks assert properties that must never regress
- [ ] `prevent_destroy` set on databases, buckets and volumes
- [ ] `.terraform.lock.hcl` committed; plan output stored as an artifact
- [ ] Terratest defaults to plan-only

## Anti-patterns

- **`count` for a list of resources.** Inserting an element in the middle renumbers every index, so Terraform destroys and recreates your databases. Use `for_each` with a stable key.
- **A bare provider in a module.** The module silently inherits the root's credentials and region, so the same module cannot serve two accounts or an aliased provider. Declare `configuration_aliases` and let the caller choose.
- **No `prevent_destroy` on stateful resources.** A renamed variable turns into a destroy plan that passes CI. `prevent_destroy` makes it fail instead.
- **Terraform state as a backup strategy.** State is not versioned, not encrypted at rest by default, and nobody has rehearsed restoring it. Use the actual backup tooling.
- **Writing the module and its example in one shot.** The first version always has the interface slightly wrong; write the calling code first and let it drive the variables.
