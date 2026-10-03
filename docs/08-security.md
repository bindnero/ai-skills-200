# 08 · Security

Finding what can go wrong before someone else finds it, and building the defences that hold when they try anyway.

25 skills. Each row links to the bundle — read it before doing the work it describes.

## Finding threats

Reasoning about an architecture before writing it.

| Skill | Use it when |
| --- | --- |
| [`threat-modeling`](../skills/security/threat-modeling/SKILL.md) | Produces a STRIDE-based threat model for a component, service, or architecture, covering trust boundaries, assets, abuse cases, and mitigations. Use when designing a new feature or service, reviewing a pull request that adds an endpoint or trust boundary, or answering "what can go wrong here" before implementation starts. |
| [`penetration-test-planning`](../skills/security/penetration-test-planning/SKILL.md) | Scopes, plans, and executes authorized security testing with a written rules of engagement, realistic threat scenarios, and safe verification, producing prioritized remediation. Use when commissioning a penetration test, defining scope and authorization, or converting findings into retest-ready fixes. |

## The classic classes

The attacks that keep working because they keep being reinvented.

| Skill | Use it when |
| --- | --- |
| [`owasp-top-ten`](../skills/security/owasp-top-ten/SKILL.md) | Maps a codebase or design against the OWASP Top Ten 2021 and its API Security Top Ten, producing a prioritized gap list with concrete remediations. Use when running a general application security review, preparing for a penetration test or audit, or checking which OWASP categories a service is exposed to. |
| [`xss-prevention`](../skills/security/xss-prevention/SKILL.md) | Eliminates cross-site scripting by auditing HTML sinks, URL and attribute sinks, and DOM injection points, then applying context-aware output encoding. Use when rendering user-supplied HTML or Markdown, reviewing innerHTML/dangerouslySetInnerHTML, sanitizing rich text, or hardening templating against reflected and stored XSS. |
| [`csrf-prevention`](../skills/security/csrf-prevention/SKILL.md) | Defends state-changing HTTP endpoints against cross-site request forgery using anti-CSRF tokens, SameSite cookies, Origin/Referer validation, and method gating. Use when adding POST/PUT/PATCH/DELETE routes, working with cookie-based sessions, or reviewing forms and AJAX mutations for CSRF exposure. |
| [`sql-injection-defense`](../skills/security/sql-injection-defense/SKILL.md) | Removes SQL injection risk by replacing string-built queries with parameterized statements, allowlisted identifiers, and least-privilege database roles. Use when writing or reviewing ORM raw queries, dynamic ORDER BY or table selection, migrations, or any query assembled with concatenation or f-strings. |
| [`ssrf-prevention`](../skills/security/ssrf-prevention/SKILL.md) | Blocks server-side request forgery by validating outbound URLs against scheme, host, port, and resolved-IP allowlists before any HTTP call. Use when the server fetches user-supplied URLs (webhooks, image/avatar proxies, PDF renderers, link previews, import-from-URL features), or reviewing outbound HTTP client code. |
| [`input-sanitization`](../skills/security/input-sanitization/SKILL.md) | Validates untrusted input at the system boundary with typed schemas, explicit allowlists, canonicalization, and size limits, rejecting malformed data before it reaches business logic. Use when adding or reviewing request bodies, query parameters, headers, file uploads, and API input validation. |

## Identity & access

Proving who, then deciding what.

| Skill | Use it when |
| --- | --- |
| [`authz-authorization`](../skills/security/authz-authorization/SKILL.md) | Enforces authorization on every request with server-side policy checks, default-deny object ownership, and centralized middleware, preventing broken function-level and object-level access control. Use when adding or reviewing endpoints that act on a specific record, introducing roles or tenancy, or fixing "user can see other users' data" reports. |
| [`multi-factor-auth`](../skills/security/multi-factor-auth/SKILL.md) | Implements phishing-resistant second factors using WebAuthn passkeys and TOTP with verified enrollment, backup codes, and step-up verification for sensitive actions. Use when adding MFA to a login flow, requiring re-verification for privileged actions, or migrating accounts to passkeys. |
| [`password-handling`](../skills/security/password-handling/SKILL.md) | Stores and verifies user passwords with Argon2id, resists enumeration and offline cracking, and enforces reset flows that do not leak account existence. Use when implementing signup, login, or password reset, migrating legacy hashes, or responding to a suspected credential-stuffing attack. |
| [`session-hijacking-defense`](../skills/security/session-hijacking-defense/SKILL.md) | Secures session lifecycle with unpredictable rotated identifiers, fixation defenses, idle and absolute expiry, and revocation on risk events. Use when implementing session creation or logout, adding cookie session settings, mitigating session fixation or replay, or responding to a suspected stolen token. |

## Browser hardening

Response headers that cost nothing and remove whole categories of attack.

| Skill | Use it when |
| --- | --- |
| [`secure-headers`](../skills/security/secure-headers/SKILL.md) | Applies and verifies browser-facing security response headers such as Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, and frame restrictions on every response path. Use when configuring an HTTP server, reverse proxy, CDN, or framework middleware, and when verifying headers in CI. |
| [`csp-configuration`](../skills/security/csp-configuration/SKILL.md) | Authors and rolls out a Content Security Policy using nonces or hashes, strict-dash directives, and reporting, so injected script cannot execute. Use when writing or tightening a CSP, eliminating unsafe-inline and unsafe-eval, or triaging CSP violation reports. |

## Supply chain

Everything that happens between `npm install` and production.

| Skill | Use it when |
| --- | --- |
| [`secrets-scanning`](../skills/security/secrets-scanning/SKILL.md) | Finds and removes leaked credentials, API keys, and tokens from repositories and history using entropy and pattern detection, then rotates and verifies each exposed secret. Use when auditing a repo for committed secrets, before open-sourcing a project, during pre-commit setup, or when investigating a suspected credential exposure. |
| [`dependency-vulnerability-audit`](../skills/security/dependency-vulnerability-audit/SKILL.md) | Audits direct and transitive dependencies for known CVEs, license risk, and unmaintained packages, then drives remediation through pinning, overrides, and reachability analysis. Use when reviewing a lockfile, updating dependencies, gating a release on dependency risk, or triaging a dependency scanner report for real exploitability. |
| [`supply-chain-security`](../skills/security/supply-chain-security/SKILL.md) | Secures the build and delivery path with pinned dependencies, provenance attestation, isolated CI, and signed artifacts to prevent compromised packages and poisoned releases. Use when hardening a build pipeline, adding dependency pinning or SBOMs, or reviewing a release process for tampering risk. |
| [`code-signing`](../skills/security/code-signing/SKILL.md) | Signs and verifies software artifacts, containers, commits, and packages with isolated keys, short-lived certificates, and enforced verification gates. Use when setting up release signing, verifying a downloaded binary before execution, signing container images, or requiring signature checks in a deployment pipeline. |
| [`sast-dawg`](../skills/security/sast-dawg/SKILL.md) | Runs static application security testing with dataflow-aware taint analysis, triages results by reachability, and gates merges on high-confidence findings. Use when setting up SAST in CI, tuning rules, triaging a scanner report, or explaining a taint-tracking finding. |
| [`secure-coding-review`](../skills/security/secure-coding-review/SKILL.md) | Reviews changed code for exploitable defects, missing authorization, unsafe defaults, and secret leakage, reporting findings with evidence and fixes. Use when reviewing a pull request or a diff for security impact, performing a pre-merge security gate, or assessing whether a change introduces risk. |

## Data & compliance

Protecting stored data and proving you handled it properly.

| Skill | Use it when |
| --- | --- |
| [`encryption-at-rest`](../skills/security/encryption-at-rest/SKILL.md) | Encrypts stored data with managed keys, enforces TLS in transit, and prevents sensitive fields from leaking into backups and logs. Use when storing PII or credentials at rest, choosing KMS or envelope encryption, encrypting database volumes or object storage, or handling field-level encryption and key rotation. |
| [`api-key-management`](../skills/security/api-key-management/SKILL.md) | Issues, scopes, stores, and revokes machine credentials using hashed tokens with environment separation and automated rotation. Use when designing API authentication for clients or services, adding key creation and rotation, reviewing key handling in code, or responding to a leaked key. |
| [`privacy-by-design`](../skills/security/privacy-by-design/SKILL.md) | Builds privacy into data flows at the design stage with data minimization, purpose limitation, pseudonymization, retention limits, and privacy reviews. Use when designing a feature that collects or processes personal data, adding analytics or logging of user activity, or reducing existing data exposure. |
| [`gdpr-compliance`](../skills/security/gdpr-compliance/SKILL.md) | Implements GDPR data-subject rights, lawful basis, records of processing, breach notification timelines, and controller/processor obligations in code and process. Use when handling access, deletion, or portability requests, responding to a personal data breach, or documenting processing activities for a controller or processor. |
| [`incident-forensics`](../skills/security/incident-forensics/SKILL.md) | Investigates security incidents by preserving volatile evidence, establishing timeline and blast radius, containing spread, and producing defensible findings. Use when responding to suspected account takeover, unauthorized access, data exfiltration, or a breach requiring root cause analysis. |

---

[Full index](../CATALOG.md) · [Install targets](10-install-targets.md) · [Authoring](11-authoring.md)
