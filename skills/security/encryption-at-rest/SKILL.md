---
name: encryption-at-rest
description: Encrypts stored data with managed keys, enforces TLS in transit, and prevents sensitive fields from leaking into backups and logs. Use when storing PII or credentials at rest, choosing KMS or envelope encryption, encrypting database volumes or object storage, or handling field-level encryption and key rotation.
---

# Encryption At Rest

**Use when:** persisting personally identifiable data, credentials, payment data, or tenant data in a database, object store, queue, or backup, and when selecting keys, tenants, or rotation strategy.
**Do not use when:** protecting data in transit between services — use TLS configuration with certificate pinning and validation, or `session-hijacking-defense` for session tokens specifically.

## Instructions

1. Classify the data before choosing a control. Identify what is regulated (PII, cardholder data, health data), what is merely internal, and what is a credential; the required strength and key-management rigor differ by class.
2. Encrypt storage volumes, databases, object stores, queue payloads, and backups with provider-managed keys where the threat model does not require application-level control of the key material.
3. Use a managed KMS or HSM for sensitive data when application-level control is needed, and always prefer envelope encryption: generate a data key with the KMS, encrypt the payload with the data key, store only the wrapped data key alongside the ciphertext.
4. Enforce encryption in transit as well, with TLS 1.2 or later, certificate validation enabled, and no fallback that permits plaintext. Verify with `verify=False` absent from the codebase, not merely disabled in production config.
5. Use field-level encryption for the specific columns holding identifiers or secrets, with deterministic encryption only where exact-match search on ciphertext is a genuine requirement; prefer randomized encryption plus a separate keyed index otherwise.
6. Never place keys in the same store as the data. Keys belong in a KMS with a restricted key policy, separate credentials from the application principal, and an approval path documented.
7. Design key rotation: enable automatic rotation in KMS, or wrap each new data key with the current KMS key version so ciphertext remains decryptable across rotations. Test an actual rotation before needing it.
8. Disable plaintext endpoints and unencrypted bucket or table options explicitly. For S3, require TLS-only bucket policies and deny requests that do not use TLS rather than relying on defaults.
9. Protect the paths that bypass the main store: backups, snapshots, replicas, exports, data warehouse copies, and debug dumps. Confirm each is encrypted, access-logged, and covered by a shorter retention.
10. Ensure plaintext never reaches observability: scrub decrypted values from application logs, error trackers, APM traces, and crash reports, and define a redaction policy applied at the logging library level.

## Patterns

Envelope encryption with a managed KMS:

```python
from google.cloud import kms

def encrypt_field(plaintext: bytes, key_version: str) -> tuple[bytes, bytes]:
    client = kms.KeyManagementServiceClient()
    response = client.encrypt(
        request={
            "name": key_version,        # cryptoKeyVersions/.../versions/7
            "plaintext": plaintext,
            "additional_authenticated_data": b"users.ssn.v1",   # binds to field + version
        }
    )
    # Returns ciphertext + an encrypted data key; never returns or logs plaintext.
    return response.ciphertext, response.encrypted_key

def decrypt_field(ciphertext: bytes, encrypted_key: bytes, key_name: str) -> bytes:
    client = kms.KeyManagementServiceClient()
    response = client.decrypt(
        request={"name": key_name, "ciphertext": ciphertext, "encrypted_key": encrypted_key}
    )
    return response.plaintext
```

Storage enforcement at the cloud layer:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::app-data-prod", "arn:aws:s3:::app-data-prod/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    },
    {
      "Sid": "DenyUnencryptedObjectUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::app-data-prod/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption": "aws:kms",
          "s3:x-amz-server-side-encryption-aws-kms-key-id": "arn:aws:kms:eu-west-1:111122223333:key/abcd"
        }
      }
    }
  ]
}
```

Kubernetes volume encryption at rest:

```yaml
apiVersion: v1
kind: EncryptedSecret
metadata:
  name: db-master-key
spec:
  # ciphertext is written by a KMS-backed `sealed-secrets` controller;
  # the plaintext key never appears in git or in the Pod spec source
  encryptedData:
    master.key: AgBy3fi4...==
```

Rotation-safe data key layout:

```
Record:
  ciphertext        bytes     # payload encrypted with data_key
  encrypted_data_key bytes     # data_key wrapped by KMS key version 7
  kms_key_version    str       # "7" — needed to rewrap on rotation
Rotation:
  1. KMS key 7 rotates internally, or version 8 becomes current
  2. New writes wrap with version 8
  3. Old records remain decryptable: still wrapped by version 7
  4. Optional: lazy re-encrypt on read, or a batched background rewrap job
```

## Checklist

- [ ] Every store holding regulated or credential data enforces encryption at rest, including backups, snapshots, and exports.
- [ ] Plaintext endpoints and unencrypted bucket or table options are explicitly denied, not left to provider defaults.
- [ ] KMS keys use a restricted key policy, are not co-located with the data, and are accessed by a distinct principal.
- [ ] Field-level encryption uses envelope encryption with AAD binding the ciphertext to its field and schema version.
- [ ] TLS 1.2+ is enforced in transit with certificate validation on, and no `verify=False` exists anywhere in the codebase.
- [ ] Key rotation is enabled and an actual rotation has been exercised successfully in a non-production account.
- [ ] Search over encrypted fields uses a deterministic key or a separate keyed index where required, and randomness is used elsewhere.
- [ ] Logs, traces, error trackers, and crash dumps are verified to contain no decrypted plaintext.

## Anti-patterns

- **Keys stored beside the data.** An encryption key in the same database, image, or environment as the ciphertext provides no protection against the most common compromise. Keys belong in a KMS with a separate principal.
- **Static environment-variable keys rotated by hand.** Shared static keys cannot be rotated without downtime or coordination, and rotation is exactly what you need after suspected exposure. Use envelope encryption with managed key versioning.
- **Encrypting at rest while plaintext flows in transit or into logs.** Database encryption does nothing for a plaintext replica, an unencrypted export, or an APM trace recording a decrypted field. Audit every path, not just the primary store.
- **Log-only coverage.** `pg_dump`, `SELECT *` to CSV, a debug endpoint, and an analytics warehouse copy all leak plaintext. Each needs its own control and a shorter retention.
- **Hand-rolled cryptography.** Custom ciphers, non-standard modes, homegrown key derivation, and reused IVs fail silently and are unreviewable. Use reviewed primitives: AES-GCM or ChaCha20-Poly1305, HKDF or Argon2id, and library-managed randomness.