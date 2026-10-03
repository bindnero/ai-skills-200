---
name: gdpr-compliance
description: Implements GDPR data-subject rights, lawful basis, records of processing, breach notification timelines, and controller/processor obligations in code and process. Use when handling access, deletion, or portability requests, responding to a personal data breach, or documenting processing activities for a controller or processor.
---

# GDPR Compliance

**Use when:** implementing or evidencing data-subject rights, documenting processing activities, managing processors and cross-border transfers, or handling a personal data breach notification within 72 hours.
**Do not use when:** the task is reducing the personal data a system collects or stores — use `privacy-by-design`, which is the design-stage control.

## Instructions

1. Identify whether you act as controller, joint controller, or processor for each dataset, and record the lawful basis per processing purpose. Basis is per purpose, not per organization, and legitimate interest requires a documented balancing assessment.
2. Maintain a record of processing activities: purposes, data categories, data subjects, recipients, third-country transfers, retention periods, and security measures. Keep it versioned and tied to actual code, not to a stale spreadsheet.
3. Build a data-subject request pipeline that authenticates the requester, verifies proportionality, locates all stores holding that person's data including backups and processors, and completes export, correction, and erasure within the statutory window.
4. Design erasure to be complete but honest: delete live systems, expire downstream caches, propagate to processors, and record what could not be deleted (legally retained billing records) with the legal basis for the exception.
5. Handle the right to data portability as a machine-readable export of only the data the subject provided or observed, in a structured, commonly used format, transmitted securely and without including third parties' personal data.
6. Enforce privacy defaults and transparency: the notice must reflect what the system actually collects, and any new collection requires updating the notice and the record before release.
7. Operate a processor register with a signed data processing agreement covering purpose limits, sub-processors, security, deletion, and audit rights, and flow the obligations down to sub-processors.
8. Establish lawful transfer mechanisms for any non-adequate-country transfer — adequacy decision or standard contractual clauses plus a transfer impact assessment and supplementary measures such as encryption.
9. Run the breach response to the statutory clock: assess within 24 hours, notify the supervisory authority within 72 hours of awareness with required content, and notify data subjects without undue delay when high risk applies.
10. Verify control operation rather than asserting it: test an export and an erasure end to end, rehearse the 72-hour notification, and review processor compliance on a schedule.

## Patterns

Data-subject erasure orchestrated across stores:

```python
from dataclasses import dataclass

@dataclass
class ErasureResult:
    store: str
    deleted_rows: int
    deferred: str | None          # reason and legal basis, recorded for the response

def erase_data_subject(subject_ref: str) -> list[ErasureResult]:
    results = [
        ErasureResult("primary_db", User.objects.filter(
            surrogate_ref=subject_ref).delete()[0], None),
        ErasureResult("search_index", search_client.delete_by_query(
            subject_ref), None),
        ErasureResult("analytics", AnalyticsEvent.objects.filter(
            surrogate_ref=subject_ref).delete()[0], None),
        # backups: rotate and expire; deletion cannot be selective
        ErasureResult("backups", 0, "expires with backup rotation in <=35 days"),
        # statutory retention is a lawful exception, not a failure
        ErasureResult("billing_ledger", LedgerEntry.objects.filter(
            subject_ref=subject_ref).update(subject_ref="ERASED").count(),
            "Art. 17(3)(b) legal obligation — 7-year accounting retention"),
    ]
    audit.log("gdpr.erasure", subject_ref=subject_ref,
              results=[r.__dict__ for r in results])
    return results
```

Structured portability export:

```python
import json
from django.http import HttpResponse

def export_portable_data(request):
    verify_identity_and_proportionality(request)          # step-up auth
    user = request.user
    payload = {
        "controller": "Example Ltd",
        "exported_at": timezone.now().isoformat(),
        "format_version": "1.0",
        "data": {
            "account": serialize(account_fields(user)),
            "orders": list(orders_for(user).values(
                "order_ref", "placed_at", "items", "total", "currency")),
            "consents": list(ConsentEvent.objects.filter(
                user=user).values("purpose", "granted_at", "withdrawn_at")),
            # excluded: fields about OTHER people (seller names, reviewer notes)
        },
    }
    response = HttpResponse(
        json.dumps(payload, indent=2, default=str),
        content_type="application/json",
    )
    response["Content-Disposition"] = 'attachment; filename="portable-data.json"'
    response["Cache-Control"] = "no-store"
    return response
```

Breach assessment and 72-hour decision record:

```md
Breach BRE-2026-003 | Detected 2026-02-02T09:14Z | Awareness timestamp: 2026-02-02T11:40Z
Categories of data: email, order history, partial card reference
Subjects: approx 18,400   Records: approx 18,400   Special category: none
Likely consequences: phishing and account targeting; no credential exposure
72-hour deadline (from awareness): 2026-02-05T11:40Z
Risk to rights and freedoms: HIGH -> notify data subjects, no undue delay
Supervisory authority notified: 2026-02-02T16:05Z (webform + reference recorded)
Notification content: nature, categories/counts, contact, likely consequences, measures
Processor notification obligation: customer controller notified within 24h
Remediation: key rotation, input validation fix, authz check on export route
```

Record of processing activities (extract):

```csv
activity,purpose,data_categories,data_subjects,recipients,third_country,retention,security
order_fulfilment,contract performance,name+address+order,customers,fulfilment_vendor,none,7y,TLS+at-rest+AES-GCM
product_analytics,legitimate interests,pseudonymous_event_ref,users,internal_analytics,US(none),30d,pseudonymisation+RBAC
marketing_email,consent,email+name,subscribers,email_provider,US(SCC+TIAS),2y,tls+consent_record
```

## Checklist

- [ ] Controller, joint controller, or processor role is documented per dataset, with a lawful basis per purpose and a balancing assessment where legitimate interest is used.
- [ ] A versioned record of processing activities exists and matches the systems actually deployed.
- [ ] Access, portability, correction, and erasure are implemented, tested end to end, and complete within the statutory window.
- [ ] Erasure propagates to all stores and processors, and lawful retention exceptions are recorded with their legal basis.
- [ ] Exports are machine-readable, limited to the subject's own data, delivered securely, and exclude third-party personal data.
- [ ] A processor register and signed data processing agreements exist, with sub-processor obligations flowed down.
- [ ] International transfers rely on adequacy or standard contractual clauses plus a transfer impact assessment.
- [ ] Breach response can assess within 24 hours and notify the supervisory authority within 72 hours, and this has been rehearsed.

## Anti-patterns

- **Erasure that only touches the primary database.** Replicated snapshots, search indexes, analytics warehouses, third-party processors, and caches all retain the record, so the deletion is incomplete and the deletion obligation is unmet. Map every store before claiming erasure.
- **"We delete it after the backup cycle" with no evidence.** Backups are the most commonly forgotten copy. Rotate and expire them on a schedule, and confirm the expiry actually occurs.
- **One lawful basis for everything.** Legitimate interest does not justify processing special category data, and consent cannot be bundled with contract performance. Record the basis per purpose and re-evaluate when the purpose changes.
- **Treating the 72-hour clock as flexible.** The deadline runs from awareness of the breach, not from when the assessment finishes. Start the clock, record the awareness timestamp, and notify on time with what is known.
- **Fabricated or generic privacy notices.** A notice that does not match actual processing is both a transparency failure and a compliance failure, and it invalidates any consent-based basis claimed for that data.