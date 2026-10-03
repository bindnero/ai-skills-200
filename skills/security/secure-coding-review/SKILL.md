---
name: secure-coding-review
description: Reviews changed code for exploitable defects, missing authorization, unsafe defaults, and secret leakage, reporting findings with evidence and fixes. Use when reviewing a pull request or a diff for security impact, performing a pre-merge security gate, or assessing whether a change introduces risk.
---

# Secure Coding Review

**Use when:** reviewing a pull request or uncommitted diff where the change touches input handling, authentication, authorization, serialization, file and network I/O, or cryptographic code.
**Do not use when:** performing a full-scope architectural risk analysis across the whole system — use `threat-modeling`, or the dedicated class skill when one vulnerability type is already known.

## Instructions

1. Read the diff first, then open the surrounding code. Understand what the change is for before evaluating how it fails; most real findings are missing context visible only near the call site.
2. Classify the change by risk surface: new entry point, new data flow from untrusted input, new privileged operation, new dependency, new serialization boundary, or configuration change. Unreviewed cosmetic changes need no security pass.
3. Trace each new input forward from its origin to every sink it reaches. Record the validation applied at the boundary and confirm the value is not trusted again downstream merely because it passed a check.
4. Verify authorization on the new operation at the object level, not only the route level. Confirm the identifier used for lookup comes from the authenticated session rather than a request parameter used directly as a filter.
5. Check the negative path explicitly: what happens on validation failure, on permission denial, and on a downstream error? Confirm the failure is a clean rejection with no partial state written and no sensitive detail in the response.
6. Confirm no new secret, token, internal hostname, personal data, or stack trace can reach the repository, logs, error trackers, or the client response.
7. Check that the change did not silently widen a control: a broadened CORS origin, a relaxed TLS setting, a new cookie without flags, `verify=False`, a wider IAM policy, or a public bucket default.
8. Evaluate the resource cost of the new path: unbounded input size, unbounded loops, unbounded result sets, synchronous work on the request path, and retry behavior without backoff. Availability is part of the review.
9. Rate each finding by exploitability and impact, cite `file:line`, describe the concrete path an attacker would take, and give the specific fix rather than a general principle.
10. Separate blocking findings from advisory notes in the review comment so the author knows what must change before merge, and confirm with the security tests you asked for.

## Patterns

Reviewer comment format:

```
BLOCKER — authz (src/api/invoices.py:74)
Owner check is missing. `GET /api/invoices/{invoice_id}` looks the invoice up by a
path parameter with no `tenant_id` comparison, so any authenticated user can
enumerate other tenants' invoices.
Fix: filter on the session tenant, e.g.
    Invoice.get(invoice_id=invoice_id, tenant_id=request.user.tenant_id)
Verify: integration test asserting a 403 for a foreign invoice_id.
```

Diff sweep commands:

```bash
# dangerous sinks introduced by this change only
git diff -U0 origin/main...HEAD | rg -n '^\+' \
  -e 'eval\(' -e 'exec\(' -e 'innerHTML' -e 'dangerouslySetInnerHTML' \
  -e 'subprocess' -e 'shell=True' -e 'yaml\.load\(' -e 'pickle\.loads' \
  -e 'verify=False' -e 'http://' -e 'random\.' -e 'md5|sha1'

# new secret-bearing assignments
git diff -U0 origin/main...HEAD | rg -ni '^\+.*(password|secret|token|api[_-]?key)\s*[:=]'

# missing authorization on newly added routes
git diff -U0 origin/main...HEAD | rg -n '^\+.*@(app|router|get|post|put|patch|delete)\.'
```

Positive and negative path review:

```python
# Positive path is usually fine; the negative path is where the bug lives.
def withdraw(account_id: int, amount: Decimal):
    account = Account.objects.get(id=account_id)      # no ownership filter -> BOLA
    if amount <= 0:
        raise ValidationError()                       # rejects, good
    if account.balance < amount:
        raise ValidationError()                       # rejects, good
    account.balance -= amount
    account.save()                                    # partial write if save() fails below
    Ledger.objects.create(...)                        # NOT atomic with the debit
    return account
```

Atomic, authorization-checked version:

```python
from django.db import transaction

@transaction.atomic
def withdraw(account_id: int, amount: Decimal):
    account = Account.objects.select_for_update().get(
        id=account_id, tenant_id=request.user.tenant_id   # ownership enforced server-side
    )
    if amount <= 0 or account.balance < amount:
        raise ValidationError("insufficient funds")
    account.balance -= amount
    account.save(update_fields=["balance"])
    Ledger.objects.create(account=account, delta=-amount, reason="withdrawal")
    return account
```

## Checklist

- [ ] The diff's risk surface is classified and every new entry point and data flow is traced to its sinks.
- [ ] Validation happens at the boundary and trusted values are not re-trusted downstream.
- [ ] Every new privileged operation enforces object-level authorization using a session-derived identity.
- [ ] Failure paths are clean: no partial state, no sensitive detail in responses, no swallowed security exceptions.
- [ ] No new secrets, personal data, internal hostnames, or stack traces reach code, logs, or telemetry.
- [ ] No control was silently widened: CORS, TLS verification, cookie flags, IAM policy, storage visibility.
- [ ] Untrusted deserialization, dynamic evaluation, and shell invocation were checked and are absent or justified.
- [ ] Findings are rated, cited by `file:line`, given a concrete attacker path, a specific fix, and a verification step.

## Anti-patterns

- **Reviewing only the added lines.** Insecure code is usually correct in isolation and dangerous because of the surrounding authorization, error handling, or data model. Always open the callers and the failure path.
- **Reporting style issues as security findings.** Padding a review with naming and formatting notes buries the one blocking vulnerability. Keep the security section exclusively exploitable issues.
- **Trusting the author's tests.** A test asserting a 200 on the happy path says nothing about a foreign object ID, a missing field, or a rejected role. Ask for a negative test for each finding.
- **Approving with "looks fine".** Absence of a finding is not a finding unless the surface was deliberately enumerated. State what you checked; it makes the coverage auditable and the gaps visible.
- **Ignoring resource cost.** New unbounded queries, unpaginated list endpoints, and synchronous heavy work are availability defects and belong in this review, not in a later performance ticket.