---
name: csp-configuration
description: Authors and rolls out a Content Security Policy using nonces or hashes, strict-dash directives, and reporting, so injected script cannot execute. Use when writing or tightening a CSP, eliminating unsafe-inline and unsafe-eval, or triaging CSP violation reports.
---

# CSP Configuration

**Use when:** writing a Content Security Policy, replacing `unsafe-inline` or `unsafe-eval` with nonces or hashes, scoping policies per route, or acting on `securitypolicyviolation` reports.
**Do not use when:** only generic response headers are needed and no script policy exists yet — use `secure-headers` to establish the baseline set first.

## Instructions

1. Start in report-only with a policy that mirrors the intended final rules and a `report-to`/`report-uri` endpoint. Never ship an enforcing policy in report-only mode as the finished state.
2. Inventory what the application actually loads: script origins, inline script blocks, style sources, font hosts, API and websocket endpoints, frame sources, media, and worker scripts. The policy must fit the application or it will break the product.
3. Remove `unsafe-inline` and `unsafe-eval` from `script-src`. Generate a fresh random nonce per response at the outermost rendering layer and attach it to every legitimate script element.
4. If inline scripts cannot be templated, use SHA-256 hashes of the inline content. Note that hashes require the exact bytes, so any whitespace change breaks the entry and keeps the old hash active.
5. Prefer strict keywords: `strict-dynamic` with a nonce so trusted scripts may load further scripts while the allowlist stays short; `'self'` for first-party; `object-src 'none'`; `base-uri 'none'`; `frame-ancestors 'none'`; and `frame-src` limited to explicit hosts.
6. Use `default-src` as a floor but keep it narrow, and treat `data:` and `blob:` as unnecessary exceptions to be removed rather than allowed by default, especially in `script-src`.
7. Roll out in stages: `default-src 'self'`, then block style and font sources, then add `frame-ancestors`, then move `script-src` from allowlist to nonce plus `strict-dynamic`. Enforce only after the violation report rate has been driven to baseline.
8. Separate policies per route when a section legitimately needs more privilege (a rich editor or an embedded payment frame), using a more specific header for that route rather than weakening the global policy.
9. Send `Reporting-Endpoints` or `report-uri` and monitor the violation endpoint for the enforcing policy, alerting on spikes rather than reviewing individual events manually.
10. Add `report-to` groups so the document can name a reporting group explicitly, and confirm the `Reporting-Endpoints` header itself is not removed by a proxy.

## Patterns

Nonce-based policy with a per-response nonce:

```
Content-Security-Policy:
  default-src 'none';
  script-src 'nonce-r4nd0mP3rR3sp0ns3' 'strict-dynamic' https:;
  style-src 'self' 'nonce-r4nd0mP3rR3sp0ns3';
  img-src 'self' data: https://cdn.example.com;
  font-src 'self' https://fonts.example.com;
  connect-src 'self' https://api.example.com wss://realtime.example.com;
  frame-src https://js.stripe.com;
  frame-ancestors 'none';
  base-uri 'none';
  object-src 'none';
  form-action 'self';
  upgrade-insecure-requests;
  report-uri /csp-report
```

```python
import base64, secrets

def csp_nonce() -> str:
    return base64.b64encode(secrets.token_bytes(16)).decode("ascii")
```

```html
<script nonce="r4nd0mP3rR3sp0ns3" src="/assets/app.js"></script>
<!-- every inline block carries the same per-response nonce -->
<script nonce="r4nd0mP3rR3sp0ns3">
  window.APP_BOOT = { tenantId: "t_123" };
</script>
```

Hash-based alternative when templates cannot inject a nonce:

```
Content-Security-Policy: script-src 'sha256-B2yPHKaXnvFWtRChIbabYmUBFZdVfKKXHbWtWidDVF8='
```

```
# regenerate the hash whenever the inline block changes
cat inline.html | openssl dgst -sha256 -binary | openssl base64
```

Rollout phases to enforce, in order:

```
Phase 1  report-only, full allowlist, collect violations
Phase 2  enforce: default-src 'self'; script-src 'self' 'unsafe-inline' https:  (measure breakage)
Phase 3  enforce: script-src 'nonce-<x>' 'strict-dynamic' https:                (no unsafe-inline)
Phase 4  enforce: drop 'https:' from script-src once all script is nonced
Phase 5  enforce: style-src nonces or hashes; add base-uri 'none'; frame-ancestors 'none'
```

Reporting headers:

```
Reporting-Endpoints: csp="https://csp.example.com/reports"
Content-Security-Policy: ...; report-uri /csp-report; report-to csp
```

## Checklist

- [ ] Policy was rolled out report-only first, with a working collection endpoint, before enforcement.
- [ ] `script-src` contains neither `unsafe-inline` nor `unsafe-eval` in the enforced policy.
- [ ] A cryptographically random nonce is generated per response and applied to every legitimate script element.
- [ ] `strict-dynamic` is used with the nonce so the host allowlist can stay short and accurate.
- [ ] `object-src 'none'`, `base-uri 'none'`, and `frame-ancestors 'none'` are set.
- [ ] `data:` and `blob:` are absent from `script-src`, and `frame-src` lists only specific required origins.
- [ ] `form-action` is set to prevent form hijacking into an attacker-controlled origin.
- [ ] Violation reports are monitored with alerting on spikes, and `Reporting-Endpoints` is verified as not stripped by the proxy.

## Anti-patterns

- **`'unsafe-inline'` in an enforcing policy.** It permits exactly the injection CSP is meant to stop, while giving the appearance of protection. A nonce or hash achieves the same goal without the bypass.
- **`'unsafe-eval'` left "temporarily."** It is required by older template engines and dynamic evaluators, and it is a permanent XSS primitive. Migrate the specific call sites to explicit parsers or hash-based allowlisting instead.
- **Copy-pasting someone else's policy.** Policies copied from blogs include `data:`, `blob:`, `https:`, and wildcard ports that disable the protection you are adding. Derive directives from your application's actual resource list.
- **Enforcing on day one.** A strict policy without a measurement phase breaks third-party widgets and login flows, and the team reverts it under deadline pressure. Enforce after the violation rate reaches baseline.
- **Nonce reused across responses.** A static or per-session nonce is extractable by any injection point and provides no protection. It must be unpredictable and unique per response.