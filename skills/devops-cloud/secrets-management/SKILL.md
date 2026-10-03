---
name: secrets-management
description: Manages secrets with Vault or cloud secret managers, SOPS encryption for Git, External Secrets Operator, KMS envelope encryption and automated rotation. Use when moving credentials out of environment files, rotating leaked keys, or wiring Vault into a cluster.
---

# Secrets Management

**Use when:** Moving credentials out of source control or environment files, rotating a leaked key, or wiring a secret manager into a cluster or CI pipeline.
**Do not use when:** You are defining which values are confidential versus ordinary configuration; that classification is step one here, not a separate skill.

## Instructions

1. Classify every value first. Secrets are credentials, keys and tokens; configuration such as feature flags belongs in normal config files. Marking everything secret hides the values that actually matter.
2. Inventory where each secret lives today, including CI variables, developer machines, chat messages and container images. Rotation is only complete when old copies are gone.
3. Store secrets in a managed store — AWS Secrets Manager, GCP Secret Manager, Azure Key Vault or HashiCorp Vault — with versioning enabled.
4. Grant access by identity, not by static credentials. Use workload identity so a pod authenticates with its own service account and no long-lived key exists.
5. Encrypt secrets before they enter Git. With SOPS, use KMS or age so only authorised identities can decrypt, and never commit a plaintext copy first and "encrypt it later".
6. Rotate on a schedule and immediately after any suspected exposure. Rotation is a routine operation with runbooks, not an incident-time scramble.
7. Detect leaks automatically: push-protection style secret scanning in CI, repository scanning, and CloudTrail or audit-log alerts on secret reads by unexpected identities.
8. Keep a break-glass path: documented, audited, time-boxed, and tested. Locking everyone out during an incident is a worse outcome than a slightly weaker control.
9. Audit every read. You need to know who accessed what and when before the incident, not after.

## Patterns

A Vault policy that grants read to one path and nothing else:

```hcl
# policies/api-read.hcl
path "secret/data/prod/api" {
  capabilities = ["read"]
}

# Never allow list on secret/ - it turns every path into an existence oracle.
path "secret/metadata/prod/api" {
  capabilities = ["list"]
}

path "auth/kubernetes/login" {
  capabilities = ["create"]
}

path "sys/leases/renew" {
  capabilities = ["update"]
}
```

```hcl
# VECI login: the pod authenticates as itself, no static token in the manifest.
resource "kubernetes_service_account" "api" {
  metadata { name = "api", namespace = "prod" }
}

resource "kubernetes_secret" "api_vault" {
  metadata {
    name      = "api-vault"
    namespace = kubernetes_service_account.api.metadata[0].namespace
    annotations = {
      "vault.hashicorp.com/agent-inject"    = "true"
      "vault.hashicorp.com/role"           = "api"
      "vault.hashicorp.com/agent-run-as-user" = "10001"
    }
  }
  type = "kubernetes.io/tls"
  data = { "ca.crt" = base64decode(var.vault_ca) }
}

resource "kubernetes_secret_vault_jwt_authenticator_binding" "api" {
  role                    = "api"
  service_account_names   = [kubernetes_service_account.api.metadata[0].name]
  service_account_namespaces = [kubernetes_service_account.api.metadata[0].namespace]
}
```

SOPS encryption bound to KMS keys so only specific identities can decrypt:

```yaml
# .sops.yaml
creation_rules:
  - path_regex: environments/prod/.*\.secrets\.yaml
    encrypted_regex: ^(data|.*_password|.*_token|api_key)$
    kms:
      - arn: arn:aws:kms:us-east-1:111122223333:key/8f14e45f-ceea-167a-5a36-dedd4bea2543
          context: "sops:prod:arn:aws:iam::111122223333:role/platform-deploy"
          created_at: "2026-01-14T09:31:00Z"
          enc: aws:kms
      - arn: arn:aws:kms:us-east-1:111122223333:key/1c2d3e4f-5a6b-7c8d-9e0f-1a2b3c4d5e6f
          created_at: "2026-01-14T09:31:00Z"
          enc: aws:kms
```

```yaml
sops:
  age: []
  kms:
    - arn: arn:aws:kms:us-east-1:111122223333:key/8f14e45f-ceea-167a-5a36-dedd4bea2543
      created_at: "2026-01-14T09:31:00Z"
      enc: aws:kms
  lastmodified: "2026-02-14T11:04:52Z"
  mac: ENC[AES256_GCM,data:7Qm2wP1c,X9bT4nY2sVz8Kd3FhL6gRj0uA5iWxN1cVbEo=,tag:8sYt3Q1p,type:str]
  version: 3.9.4
data:
  DATABASE_URL: ENC[AES256_GCM,data:Vz2qQm9tR1c=,iv:0kP3mN8vXa2Q7bW1sZc5Jf0=,tag:nR7yV2qM,type:str]
  STRIPE_API_KEY: ENC[AES256_GCM,data:Lm4pXc8TbnZ1Wq0=,iv:6yH3sDf9KjL2rVb7Xc1ZmQ4=,tag:wT8nB5jK,type:str]
```

A rotation runbook that can be executed on a schedule and during an incident:

```bash
#!/usr/bin/env bash
# Rotates the Stripe live key without downtime: create, cut over, then revoke.
set -euo pipefail

NEW_KEY=$(stripe api_keys create --label "rotate-$(date +%Y%m%d)" -o json | jq -r .secret)

# 1. Create only. Do not revoke the old key yet.
aws secretsmanager put-secret-value \
  --secret-id prod/stripe --secret-string "{\"key\":\"${NEW_KEY}\"}" \
  --version-stages AWSCURRENT

# 2. Wait for consumers to pick it up.
kubectl rollout restart deployment/api -n prod
kubectl rollout status deployment/api -n prod --timeout=180s

# 3. Confirm traffic on the new key before removing the old one.
sleep 600
stripe api_keys list -o json \
  | jq -r '.data[] | select(.label == "rotate-'"$(date +%Y%m%d)"'") | .id' > /tmp/new_key_id
[[ -s /tmp/new_key_id ]] || { echo "ABORT: new key not in use"; exit 1; }

# 4. Only now revoke the previous key.
OLD_KEY_ID=$(stripe api_keys list -o json | jq -r '.data[].id' | tail -n 2 | head -n 1)
stripe api_keys rm "$OLD_KEY_ID"

aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=prod/stripe \
  --max-results 20 --query 'Events[].CloudTrailEvent' --output text | jq -r '.[] | .userIdentity.arn' | sort -u
```

## Checklist

- [ ] Values classified: secrets separated from ordinary configuration
- [ ] All copies inventoried, including CI, laptops, images and chat
- [ ] Secrets stored in a managed store with versioning enabled
- [ ] Access granted by identity via workload identity, not static keys
- [ ] SOPS with KMS or age for anything committed to Git
- [ ] Rotation scheduled and rehearsed, with revocation as an explicit final step
- [ ] Secret scanning enabled on push and in CI logs
- [ ] Reads audited and alerted on unexpected accessors

## Anti-patterns

- **Rotating before cutting over.** Revoke the old key first and every request fails until the new key propagates. Create, deploy, verify, then revoke — in that order.
- **A `.env` file in the repository.** Even a private repository leaks the secret to everyone with clone access, permanently, because Git history is immutable. Use SOPS or an external secret operator.
- **One shared static credential across all services.** It cannot be rotated independently and a leak in one service compromises all of them. Use per-workload identity.
- **Storing the secret store's own credentials inside the secret store.** The recovery path depends on the thing it protects. Keep a break-glass path with different, offline custody.
- **No scan on push.** Secrets reach Git in logs, test fixtures and default values constantly. Push protection blocks the commit instead of rotating it a week later.