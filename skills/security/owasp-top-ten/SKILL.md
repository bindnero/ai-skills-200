---
name: owasp-top-ten
description: Maps a codebase or design against the OWASP Top Ten 2021 and its API Security Top Ten, producing a prioritized gap list with concrete remediations. Use when running a general application security review, preparing for a penetration test or audit, or checking which OWASP categories a service is exposed to.
---

# OWASP Top Ten Review

**Use when:** performing a broad application security assessment of a service or a release candidate, and you need a ranked, traceable gap list rather than a single deep finding.
**Do not use when:** you already know the specific defect class and need the full defensive implementation — use the dedicated skill such as `sql-injection-defense` or `xss-prevention`.

## Instructions

1. Establish scope explicitly: the applications, versions, environments, and identities in the assessment. Record what is out of scope so absence of a finding is not mistaken for absence of a risk.
2. Read the architecture before the code. Identify the trust boundaries, authentication mechanism, session store, privileged operations, and third-party integrations. OWASP findings are mostly architectural, not line-level.
3. Walk the ten categories in order and for each, write the concrete question you are answering for this specific system. Vague passes over category names produce generic reports.
4. For each category, cite file:line evidence for both the vulnerable and the mitigated case. Absence of evidence is recorded as "not applicable with justification", never silently omitted.
5. Trace data flows backward from every sink: database query construction, template rendering, shell invocation, deserialization, redirect targets, file path joins, and outbound HTTP calls.
6. Extend the review to the API Security Top Ten: BOLA, broken authentication, excessive data exposure, resource consumption, SSRF, and unrestricted function calls. Modern web apps are primarily APIs.
7. Rank each gap by exploitability x business impact and state the realistic attacker: unauthenticated internet, authenticated low-privilege user, insider, or supply-chain partner. Access level changes priority sharply.
8. Write a remediation for every ranked gap that names the exact control, the owner, and the verification step (a test, a header value, a query log line).
9. Note the detection gap: for each exploited class, state whether logs or alerts would reveal exploitation today. Silent compromise is a separate, higher-priority finding.
10. Deliver the output as a table of findings plus a short executive summary limited to the top five risks, so the engineering team can act without reading the full appendix.

## Patterns

Scored finding table:

| ID | Category | Evidence | Attacker | L | I | Score | Remediation | Verify by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A3 | Injection | `order/search.py:88` | unauth. | 5 | 4 | 20 | Parameterize via SQLAlchemy `text()` binds | request with `'` returns 200 + no error |
| A1 | Broken Auth | `api/session.py:41` no rotation | any user | 3 | 4 | 12 | Rotate session ID on privilege change | integration test asserts ID differs |

Authentication sanity queries — run before writing any finding:

```sql
-- Password verification must use a slow KDF, not a bare equality check
SELECT id FROM users WHERE password_hash = $1;
-- If this shape is found in application code, the comparison is fast and
-- timing-attackable. Replace with argon2.verify() in the service layer.
```

Privilege escalation probe against an authenticated session:

```
GET /api/v1/orders/1042        -> 200 (own order)
GET /api/v1/orders/1043        -> 200  VULNERABLE: BOLA, no ownership check
GET /api/v1/admin/users        -> 403  correct
```

Sensitive-data exposure sweep:

```bash
rg -n --hidden -g '!**/node_modules/**' -e 'ssn|date_of_birth|credit_card' src/
rg -n -e 'select\(\*\)' -e 'SELECT \*' src/ -g '*.py' -g '*.ts' -g '*.go'
```

## Checklist

- [ ] Scope, versions, and excluded systems are documented in the report header.
- [ ] All ten OWASP 2021 categories have an explicit verdict with file:line evidence or a justified N/A.
- [ ] API Security Top Ten categories were reviewed separately from the web-app categories.
- [ ] Every finding states the attacker's access level and a working, non-destructive reproduction.
- [ ] Remediations are specific controls with named owners, not "improve validation".
- [ ] Sensitive data flows were checked end to end, including what is serialized into responses and logs.
- [ ] Detection was assessed for each exploited class: does current logging or alerting surface the attack?
- [ ] Findings are ranked by exploitability and impact, and the top five are summarized for non-specialist readers.

## Anti-patterns

- **Report-as-checklist.** Listing the ten categories with a status word and no code evidence produces a document nobody can act on or falsify. Every verdict needs a location a reviewer can open.
- **Testing only the happy path.** Confirming that authentication "works" for a valid user proves nothing about session fixation, enumeration, or privilege escalation. Probe each flow with a low-privilege identity and a foreign object's identifier.
- **Ignoring the API surface.** BOLA and excessive data exposure are the dominant findings in modern apps and appear nowhere in the classic top ten. Review object-level authorization on every `:id` route explicitly.
- **No verification step.** A remediation without a way to confirm it works will be closed without being fixed. Attach a test or an observable signal to every action item.
- **Finding-only reporting.** A report that omits the detection gap leaves the team blind to a compromise that may already have occurred. State per finding whether an attacker would have been noticed.