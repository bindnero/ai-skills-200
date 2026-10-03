---
name: threat-modeling
description: Produces a STRIDE-based threat model for a component, service, or architecture, covering trust boundaries, assets, abuse cases, and mitigations. Use when designing a new feature or service, reviewing a pull request that adds an endpoint or trust boundary, or answering "what can go wrong here" before implementation starts.
---

# Threat Modeling

**Use when:** a new endpoint, service, or trust boundary is designed or materially changed, and you need a written record of who attacks it, what they want, and what stops them.
**Do not use when:** auditing existing code for known vulnerability classes with no architecture in scope — use `secure-coding-review` instead.

## Instructions

1. Inventory the system: entry points (routes, message consumers, webhooks, CLI, file uploads, scheduled jobs), data stores, external dependencies, and third-party SDKs. Record what each accepts and who can reach it.
2. Draw the trust boundaries. Write one line per boundary stating which side is trusted and why (authentication, network isolation, contractual guarantee, or nothing). Assume anonymous network clients are hostile by default.
3. Enumerate assets ranked by damage if leaked or tampered: PII, credentials, payment data, signing keys, audit logs, internal identifiers, availability of the auth path itself.
4. Apply STRIDE to every element crossing a boundary. For each entry point, ask: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege. Record findings as `T1`, `T2`, ... with the element and the STRIDE letter.
5. Write abuse cases in attacker voice. For each finding: attacker capability, goal, concrete path through the system, and the blast radius if successful. Reject entries with no plausible attacker.
6. Rank each finding with likelihood x impact on a 1-5 scale, plus a short justification. Explicitly state the assumptions that drive the ranking.
7. Specify mitigations by control type — preventive (validation, authz check, encoding), detective (audit log, alert, rate limit), and compensating (WAF, manual review) — and assign each mitigation to a specific finding ID.
8. Record residual risk and a decision owner for anything not fully mitigated, including the date it was accepted. A threat model without accepted risk is not finished.
9. Store the model next to the design doc and link each mitigation to a tracking issue so it survives beyond the review meeting.

## Patterns

Data-flow row for a document-upload API:

| From | To | Data | Trust boundary | Controls |
| --- | --- | --- | --- | --- |
| Anonymous client | Upload handler | PDF bytes | Untrusted -> app | size cap, MIME sniff, AV scan |
| Upload handler | Object store | file blob | App -> cloud | per-tenant prefix, SSE-KMS key |
| Async worker | DB | extracted text | App -> DB | parameterized INSERT |

STRIDE finding format:

```
T1 (Spoofing, High): Upload handler accepts an X-Tenant-Id header as tenant identity.
    Attacker: any authenticated user. Goal: write into another tenant's prefix.
    Blast radius: cross-tenant data corruption.
    Mitigation: derive tenant_id server-side from the session, reject client-supplied tenant headers.
    Residual: none once session-derived.
```

Abuse case, written as a sequence:

```
T3 (Tampering, High): Object-store key is derived from a user-supplied filename.
    1. Attacker uploads `../../other-tenant/report.pdf`.
    2. Handler joins prefix + filename without normalizing.
    3. Key escapes the prefix and overwrites an existing object.
    Fix: server-generated key (UUIDv4), never client-controlled path segments.
```

## Checklist

- [ ] Every external entry point appears in the data-flow table with its trust boundary named.
- [ ] All six STRIDE categories were considered for each boundary, not just the obvious ones.
- [ ] Each finding has attacker capability, goal, path, and blast radius — no hypothetical-only entries.
- [ ] Every finding above the agreed threshold has a preventive control or a dated, owner-attributed risk acceptance.
- [ ] Assets are ranked and PII is explicitly identified, so privacy impact is not lost.
- [ ] Denial of service is modeled (rate limits, expensive operations, resource exhaustion), not only confidentiality.
- [ ] Mitigations name the specific code, config, or infrastructure change, not "add validation".
- [ ] The model is version-controlled with the design and referenced by the implementing issues.

## Anti-patterns

- **Checklist-only STRIDE.** Walking the six letters per component and writing "Spoofing: use authentication" produces theater. A finding is only real if it names an attacker path that the current code does not block.
- **Threat model as a one-time ceremony.** Models that live only in a slide deck go stale the moment the first route changes. Re-run the data-flow step on every architectural diff and diff the two tables in review.
- **Controls named without an owner.** "Mitigate with rate limiting" is not actionable until it points at a gateway rule or middleware function. Unowned controls ship never.
- **Ignoring repudiation and availability.** Most models cover injection and authz and stop. Repudiation (can the user deny the action?) is where billing and admin audits fail; availability is where a single unbounded query takes down production.
- **Assuming the network is the boundary.** Internal service-to-service traffic is treated as trusted in most breach post-mortems. Model service identity and per-service authorization explicitly instead of "it's on the VPC".

## Notes

- Keep the model as plain Markdown next to the code. Diagrams that only exist in a binary image format become unreviewable and ungreppable.
- Reuse the finding IDs (`T1`, `T2`) as prefixes in the implementing issues and in the security review checklist so traceability survives the sprint.