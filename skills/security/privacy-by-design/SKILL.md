---
name: privacy-by-design
description: Builds privacy into data flows at the design stage with data minimization, purpose limitation, pseudonymization, retention limits, and privacy reviews. Use when designing a feature that collects or processes personal data, adding analytics or logging of user activity, or reducing existing data exposure.
---

# Privacy by Design

**Use when:** designing a feature, schema, event, or logging pipeline that collects, stores, or shares personal data, or when reducing the amount of personal data an existing system retains.
**Do not use when:** the question is legal basis, controller/processor obligations, or data-subject request handling — use `gdpr-compliance`.

## Instructions

1. Write the data inventory before implementation: what is collected, why it is needed, the lawful purpose, the system of record, who can read it, and the retention period. Anything without a stated purpose should not be collected.
2. Apply data minimization. Remove fields no feature consumes, replace identifiers with opaque surrogates, and prefer derived aggregates over raw events. If a field is only "might be useful later", it does not get collected.
3. Separate identity from behavioral data. Keep the user identifier in one store and the activity record keyed by a pseudonymous token, so a compromise of analytics does not directly reveal identity and analytics access is not identity access.
4. Pseudonymize rather than anonymize, and treat pseudonymized data as personal data wherever re-identification is plausible with data you hold. Use keyed hashing or format-preserving encryption only where the relationship must remain computable.
5. Enforce purpose limitation structurally: separate stores and access policies for product, analytics, and support data so each team can only reach what its purpose requires. Re-linking is a query, not an accident, then.
6. Set retention at ingest, with automated deletion jobs, and default to the shortest workable period. Store the schedule alongside the data model so deleting by policy is a query, not a project.
7. Design for the subject's rights from the start: a stable surrogate identifier that makes access, export, correction, and erasure implementable as a query rather than a cross-team reconciliation.
8. Minimize data in telemetry. Logs, traces, and error reports should use surrogate identifiers, exclude request bodies and tokens by default, and pass through a redaction filter at the logging layer.
9. Include a privacy review in the design process: the inventory, the retention period, the access matrix, and the third-party recipients are reviewed and signed off before the code is written.
10. Add a test or check that fails the build when new personal data fields are added without a declared purpose and retention value, so the decision is forced in code review.

## Patterns

Purpose-and-retention record enforced at review time:

```yaml
# data_inventory.yml — reviewed in the privacy gate; CI fails on undeclared fields
datasets:
  - name: user_events
    purpose: product analytics and abuse detection
    lawful_basis: legitimate interests
    fields:
      - { name: user_ref, type: pseudonym, retention_days: 30 }
      - { name: event_name, type: enum, retention_days: 30 }
      - { name: ip_prefix, type: truncated_ipv4, retention_days: 7 }
    recipients: [internal_analytics]
    cross_border: none
  - name: billing_records
    purpose: contractual invoicing and statutory accounting
    lawful_basis: legal obligation
    fields:
      - { name: legal_name, type: text, retention_days: 2557 }   # 7 years, statutory
      - { name: payment_ref, type: tokenized, retention_days: 2557 }
    recipients: [tax_authority]
    cross_border: eu_to_us_standard_contractual_clauses
```

Identity separation and pseudonymous linkage:

```python
import hmac, hashlib

def surrogate(user_id: str, domain: str) -> str:
    """Deterministic per (user, domain) so analytics events join without carrying identity."""
    mac = hmac.new(_key().encode(), f"{domain}:{user_id}".encode(), hashlib.sha256)
    return mac.hexdigest()[:32]

# The identity store holds the mapping; the analytics store never sees user_id.
IdentityLink.objects.create(
    user=user,
    analytics_ref=surrogate(user.id, "analytics"),
    support_ref=surrogate(user.id, "support"),
)
```

Retention enforced by a scheduled job, not by intention:

```sql
-- nightly: delete by policy, in batches, with an explicit audit record
DELETE FROM user_events      WHERE created_at < now() - interval '30 days';
DELETE FROM api_request_logs WHERE created_at < now() - interval '7 days'
                               AND status_code < 400;   -- errors retained longer, still bounded
-- retention is observable: this is the only real evidence the job runs
SELECT 'user_events' AS dataset, MIN(created_at) AS oldest, COUNT(*) AS rows
FROM   user_events
UNION ALL
SELECT 'api_request_logs', MIN(created_at), COUNT(*) FROM api_request_logs;
```

Telemetry redaction at the logging layer:

```python
import logging

class RedactingFilter(logging.Filter):
    BLOCKED = {"authorization", "cookie", "password", "token", "ssn",
               "date_of_birth", "email", "phone", "address", "body", "raw_query"}

    def filter(self, record: logging.LogRecord) -> bool:
        for field in self.BLOCKED:
            if field in record.__dict__:
                record.__dict__[field] = "[redacted]"
        return True

logging.getLogger("app").addFilter(RedactingFilter())
logging.getLogger("app.request").setLevel(logging.INFO)   # never DEBUG in production
```

Build gate for undeclared data:

```python
# tests/test_privacy_inventory.py
def test_no_undeclared_personal_fields():
    declared = {f["name"] for d in load_inventory() for f in d["fields"]}
    internal = {"id", "created_at"}
    undeclared = {f.name for f in UserEvent._meta.get_fields()
                  if not f.name.startswith("_")} - declared - internal
    assert not undeclared, f"undeclared personal data fields: {sorted(undeclared)}"
```

## Checklist

- [ ] A purpose and retention value exists for every field in every dataset, reviewed before implementation.
- [ ] No field is collected without a named consumer; speculative fields were removed.
- [ ] Behavioral data references the user only through a per-domain surrogate key.
- [ ] Pseudonymized data is classified and handled as personal data wherever re-identification is plausible.
- [ ] Retention is enforced by an automated, batched deletion job with an observable oldest-row check.
- [ ] Data-subject access, export, correction, and erasure are implementable from a stable surrogate identifier.
- [ ] Logs, traces, and error reports carry surrogate identifiers with bodies, tokens, and PII redacted at the logging layer.
- [ ] A build or test check fails when a personal data field is added without a declared purpose and retention.

## Anti-patterns

- **Collecting now, deciding purpose later.** Data gathered before a purpose exists is hard to delete and hard to defend. Refusing collection is the only reliable minimization, and it must happen at design time.
- **Calling pseudonymization "anonymization."** Tokenized or hashed identifiers remain personal data when you hold the mapping, so the access, breach, and deletion obligations still apply. Mislabeling it produces false assurance in the risk assessment.
- **Retention as a policy document.** A stated 90-day retention with no deletion job means indefinite retention. Automate deletion and monitor the oldest row, since that is the only real evidence.
- **Copying raw data into analytics and support.** Every copy is a new copy to protect, retain, and delete. Emit purpose-built aggregates and field subsets instead of replicating the production row.
- **Redaction left to developers.** Field-level discipline erodes as the codebase grows. Enforce a redaction filter centrally and add it to the logging pipeline configuration, not to each call site.