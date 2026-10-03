---
name: secure-headers
description: Applies and verifies browser-facing security response headers such as Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, and frame restrictions on every response path. Use when configuring an HTTP server, reverse proxy, CDN, or framework middleware, and when verifying headers in CI.
---

# Security Headers

**Use when:** configuring HTTP response headers at the edge, proxy, or application tier, and when auditing which headers a given route actually returns including error and static responses.
**Do not use when:** designing a Content Security Policy directive by directive — use `csp-configuration`, which covers nonce and hash strategy and report-only rollout.

## Instructions

1. Set headers at the outermost layer that covers every response, ideally the CDN or reverse proxy, so application exceptions, framework error pages, and static file handlers cannot omit them.
2. Enable HTTP Strict Transport Security with a long `max-age` and `includeSubDomains`. Start from `max-age=300` plus `preload` on a staging origin, confirm nothing depends on plain HTTP, then extend to one year.
3. Serve everything over HTTPS only, redirect port 80 to 443, and enable HSTS preload submission only after verifying certificate coverage for every subdomain so a single unencrypted subdomain becomes unusable.
4. Set `X-Content-Type-Options: nosniff` globally, and additionally send `Content-Type` explicitly on every response. `nosniff` is what stops a user-uploaded "image" from being interpreted as script.
5. Set a strict `Referrer-Policy` (`strict-origin-when-cross-origin` or `no-referrer`) so URLs containing identifiers or search terms do not leak to third parties through the `Referer` header.
6. Apply frame restriction with `Content-Security-Policy: frame-ancestors 'none'` (preferred, since it composes with the rest of the policy) or `X-Frame-Options: DENY` where CSP is unavailable. Use `SAMEORIGIN` only if the app genuinely embeds itself.
7. Enable the remaining cross-origin isolation headers together — `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, and `Cross-Origin-Resource-Policy: same-site` — and verify they do not break third-party embeds, fonts, or payment iframes before enforcing.
8. Restrict powerful browser features with `Permissions-Policy` and disable unused ones (camera, microphone, geolocation, payment, usb) rather than leaving them implicitly allowed.
9. Avoid deprecated and header-adjacent mistakes: no `X-XSS-Protection`, no `X-Content-Security-Policy` mirror left in place, no `Access-Control-Allow-Origin: *` on credentialed responses.
10. Add a CI check that requests a representative set of routes — including a 404, a 500, a redirect, and a static asset — and asserts each required header. Header regressions are silent, so they must be asserted mechanically.

## Patterns

Baseline header set:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: frame-ancestors 'none'; base-uri 'none'; object-src 'none'
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-site
X-Frame-Options: DENY
```

Edge configuration (nginx), applied in a server block so error pages are covered:

```nginx
server {
    listen 80;
    server_name app.example.com;
    return 308 https://$host$request_uri;    # permanent, preserves method and body
}

server {
    listen 443 ssl http2;
    server_name app.example.com;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "frame-ancestors 'none'; base-uri 'none'; object-src 'none'" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # `always` is required; without it nginx omits headers on 4xx/5xx responses.
    root /srv/app;
    location / { try_files $uri $uri/ /index.html; }
}
```

Application middleware (Express):

```javascript
import helmet from "helmet";

app.use(helmet({
  strictTransportSecurity: {
    maxAge: 31_536_000, includeSubDomains: true, preload: true,
  },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: { "default-src": ["'self'"], "object-src": ["'none'"] },
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  frameguard: { action: "deny" },
  crossOriginEmbedderPolicy: false,   // enable only after verifying third-party embeds
}));
```

CI assertion across response types:

```bash
for path in / /login /assets/app.js /does-not-exist; do
  echo "== $path"
  curl -sSI "https://app.example.com$path" | tr -d '\r' | grep -Ei \
    '^(strict-transport-security|x-content-type-options|referrer-policy|content-security-policy|x-frame-options|permissions-policy):'
done
```

## Checklist

- [ ] Headers are set at the outermost layer with a mechanism that also applies them to error and static responses.
- [ ] HSTS uses a long `max-age` with `includeSubDomains`, preceded by a short-value staging verification.
- [ ] HTTP redirects permanently to HTTPS with 308, preserving method and body.
- [ ] `X-Content-Type-Options: nosniff` is present globally and every response declares an explicit `Content-Type`.
- [ ] `Referrer-Policy` is set and does not leak sensitive paths to third parties.
- [ ] Framing is denied via `frame-ancestors` in CSP or `X-Frame-Options`, chosen deliberately rather than by default.
- [ ] Unused powerful browser features are disabled via `Permissions-Policy` and cross-origin headers were verified against real embeds.
- [ ] CI asserts the required headers on success, redirect, 404, 500, and static-asset responses.

## Anti-patterns

- **Setting headers only in application code.** Framework middleware is bypassed by static file servers, proxy error pages, health endpoints, and unhandled exceptions. Set them at the edge, or confirm the middleware is guaranteed to run.
- **Forgetting `always` / the equivalent.** nginx's `add_header` skips 4xx and 5xx responses by default, so the exact responses an attacker triggers are the ones without headers. Test error paths explicitly.
- **HSTS too aggressive on day one.** A multi-year `max-age` with `preload` locks out every client if any subdomain still needs plain HTTP. Ramp from a short `max-age` and verify coverage before preloading.
- **Relying on `X-XSS-Protection`.** The legacy auditor was itself exploitable and is removed from modern browsers. Delete it; rely on CSP and output encoding instead.
- **CSP `frame-ancestors` omitted from the edge header.** Clickjacking protection duplicated only in a middleware that some routes skip leaves the app framable. Pick one layer and enforce it there.