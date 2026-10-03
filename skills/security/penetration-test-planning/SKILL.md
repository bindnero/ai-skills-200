---
name: penetration-test-planning
description: Scopes, plans, and executes authorized security testing with a written rules of engagement, realistic threat scenarios, and safe verification, producing prioritized remediation. Use when commissioning a penetration test, defining scope and authorization, or converting findings into retest-ready fixes.
---

# Penetration Test Planning

**Use when:** commissioning or running an authorized security assessment and you need the scope, rules of engagement, threat scenarios, severity model, and reporting format defined before testing starts.
**Do not use when:** investigating a specific production incident or breach — use `incident-forensics`, which is scoped by evidence rather than by an assessment objective.

## Instructions

1. Obtain explicit written authorization before any testing: named systems, IP ranges and domains, account and tenant identifiers to use, testing window with time zone, and the legal entity that has approved it. Never infer permission from a bug bounty scope or a public site's reachability.
2. Write the rules of engagement and have the client countersign it: permitted techniques, explicitly excluded techniques, safe-harbor and escalation contacts, data handling rules, and the stop condition. State that production testing may cause outage and how the client accepts that risk.
3. Scope by threat hypothesis rather than by page count. Derive scenarios from the threat model — account takeover, tenant escape, payment manipulation, PII exfiltration, admin compromise — and decide which are in scope for this engagement.
4. Define the test accounts and their privilege levels in advance: an anonymous user, a standard user, an admin, a cross-tenant identity where multi-tenancy exists, and any role the client considers sensitive.
5. Establish severity with an agreed matrix: impact, likelihood, business context, and data touched. Require a written exploitability narrative for Critical and High so severity is not argued by adjectives.
6. Agree on data handling: what evidence may be retained, how personal data found during testing is minimized and deleted, and whether production records may be modified. Prefer read-only verification, replicas, or a dedicated tenant.
7. Choose verification methods appropriate to the target: prefer proving reachability with a benign marker or a canary record over extracting real customer data, and never test destructive payloads, denial-of-service, or social engineering of employees unless explicitly and separately authorized.
8. Define communication channels and a triage contact who can pause the test, plus a daily checkpoint for multi-day engagements so scope drift and accidental findings are surfaced immediately.
9. Require raw evidence with every finding — request and response pairs, screenshots with timestamps, and reproduction steps — and require findings to be deduplicated against existing issues so the report contains genuinely new risk.
10. Agree on the remediation and retest terms before starting: who receives the report, the severity-based remediation deadlines, what constitutes a retest, and the confirmation format for each finding.

## Patterns

Rules of engagement skeleton:

```md
# Authorization
- Client: Example Corp; approver: <name, role>; signed <date>
- In scope: app.example.com, api.example.com, 203.0.113.0/24
- Accounts: anon, standard_user, tenant_admin, platform_admin
- Window: 2026-02-02 22:00Z to 2026-02-04 04:00Z (UTC), no testing outside it
- Excluded: third-party SaaS, payments provider internals, DoS/load, physical, social engineering
- Out-of-band: no data exfiltration; stop at proof of access (canary record only)
- Stop condition: any production instability or PII exposure -> halt, notify +44 20 0000 0000
- Evidence: no production customer data retained; all artifacts deleted within 14 days
```

Severity matrix:

| Severity | Definition | Example | Remediation SLA |
| --- | --- | --- | --- |
| Critical | Full compromise of many tenants or the auth path, no user interaction needed | Unauthenticated RCE; auth bypass; mass PII export | 24 hours |
| High | Single-tenant compromise or privilege escalation, limited interaction | Cross-tenant object access; admin escalation via parameter | 7 days |
| Medium | Requires chained conditions or user interaction; limited blast radius | Stored XSS reaching an authenticated user | 30 days |
| Low | Hardening gap with limited direct impact | Missing security headers, verbose errors | 90 days |

Scenario matrix:

| ID | Threat hypothesis | Technique class | Account | Expected evidence | Success = |
| --- | --- | --- | --- | --- | --- |
| SC-01 | Account takeover via password reset | Session/token logic | anon | distinct responses for known vs unknown email | 403/404 with no enumeration |
| SC-02 | Tenant escape via object reference | IDOR/BOLA | tenant A user | canary record in tenant B | 403 and no record created |
| SC-03 | Admin escalation via mass assignment | Input handling | standard user | role change accepted | role unchanged after request |

Finding template:

```md
FINDING H-02  Cross-tenant invoice read via invoice_id  (Severity: High)

Hypothesis: SC-02 — an authenticated user may read another tenant's invoice.
Precondition: standard_user (tenant A) session.
Steps (reproduction):
  1. Authenticate as standard_user.
  2. GET /api/v1/invoices/<canary-id-from-tenant-B> with the session cookie.
  Observed: 200 with tenant B invoice body (PII fields present).
  Expected: 403, and no body indicating existence.
Impact: 1 confirmed read path; same pattern expected on all /invoices endpoints.
Evidence: request/response pair, screenshot with timestamp, canary invoice ID.
Fix: scope the lookup to the session tenant
     (Invoice.objects.filter(tenant_id=request.user.tenant_id)).
Retest: same request returns 403; foreign ID returns 404.
```

Retest tracking:

```bash
# findings tracked to closure with an owner and evidence per finding
| ID | Severity | Owner | Fix PR | Fix merged | Retested | Status |
| H-01 | High    | @ana  | #4821  | yes        | pending   | open   |
| M-04 | Medium  | @sam  | #4830  | yes        | pass      | closed |
```

## Checklist

- [ ] Written, countersigned authorization names systems, ranges, accounts, and the exact testing window.
- [ ] Rules of engagement list permitted and excluded techniques, data-handling rules, and a stop condition.
- [ ] Scope is expressed as threat hypotheses tied to the threat model, not a page count.
- [ ] Test accounts of each privilege level, including a cross-tenant identity, are provisioned and confirmed working.
- [ ] Severity matrix and remediation SLAs are agreed before testing, not after the report arrives.
- [ ] Verification uses read-only techniques and canary records; no real customer data is exfiltrated or retained.
- [ ] A named triage contact, escalation path, and daily checkpoint are established.
- [ ] Every finding carries reproduction steps and evidence, and retest terms are defined up front.

## Anti-patterns

- **Testing without written authorization.** Even a benign probe against production can breach contract and, in some jurisdictions, law. Written, countersigned authorization is the first deliverable, not a formality.
- **Scope by page or endpoint count.** Volume-driven scoping produces shallow testing of the login flow and no coverage of the payment or admin path. Scope by the threats that would actually hurt the business.
- **Exfiltrating real data as proof.** Downloading customer records to demonstrate impact converts a controlled test into a reportable breach with regulatory obligations. Prove access with a canary record and delete everything afterward.
- **Severity by adjectives.** "Critical, very dangerous" is not a severity model. Require impact, likelihood, and data touched so remediation deadlines can be derived and negotiated once.
- **Findings without reproduction steps.** A report the engineering team cannot verify becomes a ticket that is closed as "not reproducible". Require request/response evidence and exact steps up front.