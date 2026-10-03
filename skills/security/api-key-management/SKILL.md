---
name: api-key-management
description: Issues, scopes, stores, and revokes machine credentials using hashed tokens with environment separation and automated rotation. Use when designing API authentication for clients or services, adding key creation and rotation, reviewing key handling in code, or responding to a leaked key.
---

# API Key Management

**Use when:** a service, script, mobile app, or partner needs a machine credential, and you are designing key issuance, storage, scoping, rotation, or revocation, or reacting to a leaked key.
**Do not use when:** the credential authenticates a human, where a session and a second factor are required — use `password-handling` and `multi-factor-auth`.

## Instructions

1. Issue a high-entropy credential: at least 32 bytes from a CSPRNG, encoded unambiguously. The key must not be derivable from the account id, a timestamp, or any other guessable value.
2. Show the secret exactly once, at creation, and store only a slow or cryptographic hash plus a short display prefix such as `sk_live_a1b2c3`. Verification uses constant-time comparison, so a database dump never yields usable keys.
3. Scope every key: environment (`live`/`test`), tenant or project, an explicit permission list, and, where possible, allowed IP ranges, a referrer, or a target resource. A leaked unrestricted key must not be able to read all customer data.
4. Keep the key out of code, images, logs, and error output. Read it from a secret manager or an injected environment variable at runtime, and verify CI fails on any committed key.
5. Store keys in a managed secret store with versioning and access logging, not in a shared `.env` committed to the repository. Where an environment variable is unavoidable, inject it from the platform secret manager rather than a file.
6. Implement rotation as a two-key overlap: create the replacement, deploy it, verify traffic against it, then revoke the predecessor. A hard cut causes outages and encourages keys that are never rotated.
7. Support per-key revocation and automated expiry. Provide a creation quota and alerting on bulk key creation, which is the signature of an attacker harvesting credentials.
8. Require the credential on every request via the `Authorization: Bearer` header and never in the URL, where it lands in access logs and `Referer` headers. Treat a URL-embedded key as compromised.
9. Distinguish authentication from authorization: a valid key still must pass object-level authorization for the resource it touches, enforced per `api-key-management`'s companion control `authz-authorization`.
10. On suspected exposure, revoke immediately, identify every call the key made from provider-side logs, determine whether data was read or written, rotate dependent credentials, and notify affected owners.

## Patterns

Generation, hashing, and verification:

```python
import hashlib, hmac, secrets, base64

KEY_BYTES = 32                    # 256 bits
PREFIX = "sk"

def issue_api_key(owner, scopes: list[str], environment: str) -> tuple[str, str]:
    body = base64.urlsafe_b64encode(secrets.token_bytes(KEY_BYTES)).decode().rstrip("=")
    plaintext = f"{PREFIX}_{environment}_{body}"
    stored = hashlib.sha256(plaintext.encode()).hexdigest()
    display = plaintext[:12] + "..."                 # safe to show in the UI later
    ApiKey.objects.create(
        owner=owner,
        scopes=sorted(scopes),
        environment=environment,
        key_hash=stored,
        display_prefix=display,
    )
    return plaintext, display       # plaintext returned ONCE and never stored

def authenticate(authorization_header: str) -> ApiKey | None:
    if not authorization_header.startswith("Bearer "):
        return None
    presented = authorization_header[7:].strip()
    digest = hashlib.sha256(presented.encode()).hexdigest()
    # Look up by a keyed index in production; constant-time compare on the match.
    for candidate in ApiKey.objects.filter(key_hash=digest):
        if hmac.compare_digest(candidate.key_hash, digest):
            if candidate.is_active and candidate.expires_at > now():
                return candidate
    return None
```

Scoped authorization on the request, not just authentication:

```python
from fastapi import Depends, HTTPException, Header

def require_scope(*required: str):
    def dependency(authorization: str = Header(...)):
        key = authenticate(authorization)
        if key is None:
            raise HTTPException(401, "invalid credential")
        missing = set(required) - set(key.scopes)
        if missing:
            raise HTTPException(403, f"missing scope: {sorted(missing)}")
        request.key = key
        return key
    return dependency

@app.post("/v1/invoices", dependencies=[Depends(require_scope("invoices:write"))])
def create_invoice(): ...
```

Rotation with overlap, plus an audit trail:

```python
def rotate_api_key(key: ApiKey) -> str:
    plaintext, _ = issue_api_key(key.owner, scopes=key.scopes,
                                 environment=key.environment)
    key.revoked_at = now()
    key.revocation_reason = "rotated"
    key.save(update_fields=["revoked_at", "revocation_reason"])
    audit.log("apikey.rotated", key_id=key.id, owner=key.owner_id)
    return plaintext        # deploy this, verify traffic, old key is now dead
```

Runtime configuration without a committed secret:

```yaml
# Kubernetes: value sourced from the external secret operator, never literal
env:
  - name: STRIPE_API_KEY
    valueFrom:
      secretKeyRef:
        name: payments-provider      # synced from the cloud secret manager
        key: stripe-api-key
```

Developer machine, read from the manager at runtime with no file in the repo:

```bash
export STRIPE_API_KEY="$(op read 'op://prod/payments/stripe/api-key' --no-newline)"
```

## Checklist

- [ ] Keys carry at least 256 bits of CSPRNG entropy and are not derived from any account or timestamp.
- [ ] The plaintext key is shown once at creation; only a hash and a display prefix are stored.
- [ ] Verification is constant-time and the stored form cannot be reversed into a usable key.
- [ ] Every key has an environment, tenant, explicit scope list, and an expiry date.
- [ ] Keys live in a managed secret store or injected environment, never in source, images, logs, or URLs.
- [ ] Rotation uses an overlap window, and revocation is per key rather than all-or-nothing.
- [ ] Bulk key creation and use from unusual sources are alerted on.
- [ ] A documented runbook exists for revoking an exposed key, auditing its usage, and rotating dependents.

## Anti-patterns

- **Plaintext keys in the database.** A read-only dump, a backup, or a support query then hands over working credentials for every customer. Store a hash; treat the plaintext as unrecoverable by design.
- **One global key for the whole organization.** A single leaked key means a full data breach and a mass rotation. Issue per-application, per-tenant, scoped keys so exposure is bounded.
- **Long-lived, never-rotated keys.** Credentials that outlive several employees and two laptops are permanent. Give every key an expiry and rotate on a schedule and on any personnel or infrastructure change.
- **Keys in query strings or client-side code.** They end up in access logs, browser history, `Referer` headers, and mobile app binaries that can be unpacked. Send them in an `Authorization` header.
- **Authentication mistaken for authorization.** A valid key that bypasses the tenant check still produces a breach. Enforce object-level authorization separately on every request.