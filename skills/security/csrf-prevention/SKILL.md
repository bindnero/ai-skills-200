---
name: csrf-prevention
description: Defends state-changing HTTP endpoints against cross-site request forgery using anti-CSRF tokens, SameSite cookies, Origin/Referer validation, and method gating. Use when adding POST/PUT/PATCH/DELETE routes, working with cookie-based sessions, or reviewing forms and AJAX mutations for CSRF exposure.
---

# CSRF Prevention

**Use when:** an endpoint authenticates the request via an ambient credential (session cookie, HTTP Basic, client certificate) and performs a state change on GET-adjacent verbs like POST, PUT, PATCH, or DELETE.
**Do not use when:** the endpoint is authenticated solely by a non-ambient credential such as an Authorization bearer token, where a cross-origin page cannot attach it.

## Instructions

1. Classify every state-changing endpoint by how the browser authenticates it. Cookie- or TLS-client-cert-based endpoints are CSRF-reachable; requests authenticated only by a header token are not, because the browser will not attach that header cross-site.
2. Enforce the verb rule: any operation with side effects must require a non-simple method. Never mutate state on GET, HEAD, or OPTIONS — this also prevents prefetch and crawler-triggered changes.
3. Issue a per-session anti-CSRF token using a cryptographically random generator, stored server-side keyed to the session. Use at least 128 bits of entropy and never derive it from the session ID.
4. Send the token to the client in a way a cross-origin attacker cannot read: a readable cookie plus a matching value in a form field, or a `meta` tag consumed by the JS client for fetch headers.
5. Validate the token on every state-changing request using a constant-time comparison. Reject on mismatch before any business logic, database write, or side-effecting call executes.
6. Set `SameSite=Lax` as the baseline on session cookies, and `Strict` where the flow tolerates it. Treat SameSite as a second layer — it is not a substitute for tokens because older clients and some flows (top-level POST navigation) still send the cookie.
7. Validate `Origin`, and `Referer` as a fallback for older clients, against an explicit allowlist of application origins. Reject or require a token when neither header is present.
8. Never combine "verify then execute" with a state-changing side channel such as emitting a response body that a cross-origin page can read — a successful CORS response on a mutation is a second vulnerability.
9. Test each route: with a valid token, with a missing token, with a token from another session, and with a request carrying a foreign `Origin`. All three failure cases must return 403 and produce no state change.
10. Exempt webhook receivers and OAuth callbacks explicitly, and authenticate those by signature or client secret rather than by relaxing the framework's global CSRF policy.

## Patterns

Server-side token issue and verify (Python, framework-agnostic shape):

```python
import hmac, secrets

CSRF_BYTES = 32

def issue_csrf(session) -> str:
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(CSRF_BYTES)
        session["csrf_token"] = token
    return token

def verify_csrf(session, submitted: str | None) -> bool:
    expected = session.get("csrf_token")
    if not expected or not submitted:
        return False
    return hmac.compare_digest(expected, submitted)
```

Framework-native decorators, preferred where they exist:

```python
# Django: CSRF middleware enabled, exempt only deliberate exceptions
@csrf_protect
def change_email(request):
    if request.method != "POST":
        return HttpResponseNotAllowed(["GET"])
    ...

# Flask-WTF
@app.post("/account/email")
@csrf_protect
def change_email():
    ...
```

Double-submit cookie pattern for stateless-ish services:

```typescript
import { cookies } from "next/headers";

export async function setCsrfCookie() {
  const token = crypto.randomUUID() + crypto.randomUUID();
  cookies().set("csrf_token", token, {
    httpOnly: false,          // client must read it to echo it in a header
    sameSite: "lax",
    secure: true,
    path: "/",
  });
}

export async function POST(request: Request) {
  const cookie = cookies().get("csrf_token")?.value ?? "";
  const header = request.headers.get("x-csrf-token") ?? "";
  if (!timingSafeEqualStrings(cookie, header)) {
    return new Response("Forbidden", { status: 403 });
  }
  // proceed
}
```

Cookie configuration for a session:

```
Set-Cookie: session=REDACTED; Path=/; Secure; HttpOnly; SameSite=Lax; __Host- prefix
Origin allowlist check (middleware):
    ALLOWED = {"https://app.example.com", "https://app.staging.example.com"}
    origin = req.headers.get("origin")
    if origin and origin not in ALLOWED -> 403
```

## Checklist

- [ ] No state change occurs on GET, HEAD, or OPTIONS.
- [ ] Every state-changing cookie-authenticated route validates a per-session anti-CSRF token before side effects.
- [ ] Tokens use a CSPRNG with at least 128 bits of entropy and are compared in constant time.
- [ ] Token is delivered in a readable form and never echoed into a URL query parameter.
- [ ] Session cookies set `Secure`, `HttpOnly`, and `SameSite=Lax` or stricter.
- [ ] `Origin` is validated against an explicit allowlist; `Referer` is the documented fallback.
- [ ] Missing token, mismatched token, and foreign-origin requests each return 403 with zero state change.
- [ ] Any CSRF exemption is documented, scoped to a single route, and authenticated by signature or secret instead.

## Anti-patterns

- **Relying on SameSite alone.** `SameSite=Lax` still sends the cookie on top-level cross-site navigations, and legacy clients plus some redirect chains bypass it. Treat SameSite as defense in depth under a token, never as the only control.
- **Token derived from the session ID.** A predictable or directly related token is obtainable by an attacker who can read the session ID, and breaks under token rotation. Generate an independent random value.
- **Verifying after the side effect.** Checking the token in a `finally` block, a response interceptor, or after the database write means the action has already happened. Verify at the top of the handler.
- **Global CSRF disable to make one integration work.** Turning the framework's CSRF middleware off globally converts one protected webhook into an unprotected application. Scope exemptions to single routes and authenticate those with a signature.
- **Token in the URL query string.** Tokens placed in query strings leak into logs, browser history, and `Referer` headers, and break on redirect. Use a header or a form field.