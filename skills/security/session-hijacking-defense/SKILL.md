---
name: session-hijacking-defense
description: Secures session lifecycle with unpredictable rotated identifiers, fixation defenses, idle and absolute expiry, and revocation on risk events. Use when implementing session creation or logout, adding cookie session settings, mitigating session fixation or replay, or responding to a suspected stolen token.
---

# Session Hijacking Defense

**Use when:** creating, storing, rotating, or revoking sessions, setting session cookie attributes, detecting fixation or replay, or handling a reported stolen session token.
**Do not use when:** the compromise is a leaked bearer token for a machine-to-machine client — use `api-key-management`, which covers scoped, revocable API credentials.

## Instructions

1. Generate the session identifier with a CSPRNG providing at least 128 bits of entropy, and store only a hash of it server side. Anyone who obtains the database must not be able to lift live sessions.
2. Bind the session to the user and to its metadata — creation time, last-seen time, source IP, and user agent hash — and record mismatches as risk signals rather than rejecting them outright, since mobile networks change IPs legitimately.
3. Rotate the session identifier at every privilege change: login, password change, MFA completion, role elevation, and sensitive-attribute edits. Invalidate the pre-rotation identifier so a fixated value becomes useless.
4. Set absolute and idle expiry independently — an absolute cap such as 8 to 24 hours for privileged apps, and a shorter idle timeout such as 15 to 30 minutes for sensitive actions. Enforce both server side, since client-side timers are advisory.
5. Set cookie flags correctly: `Secure`, `HttpOnly`, `SameSite=Lax` or `Strict`, and the `__Host-` prefix when possible, which the browser enforces to guarantee `Secure`, no `Domain`, and `Path=/`.
6. Never accept a session identifier from a URL, and do not put session material in localStorage. A token in a query string leaks to logs, `Referer` headers, and shared links.
7. Revoke explicitly on logout, password change, MFA removal, account disablement, and detected risk; revoke all sessions when a password is reset, and revoke sessions by device so a user can end a single stolen session.
8. Detect replay with the sign-out signal: issue a short-lived "still here" token alongside the session and rotate it each response. A stolen token cannot produce it, so the thief's continued use is detectable.
9. Protect supporting stores as carefully as the session itself: the session database is a high-value target, so it is encrypted, network-restricted, and access-logged, and sessions are not stored in localStorage or a shared cache without keying by user.
10. On a suspected compromise, invalidate the token and every session derived from it, force re-authentication, review the account's activity log for what the attacker performed, and rotate any credential they could reach.

## Patterns

Session creation with hashing and fixation defense:

```python
import hashlib, secrets
from datetime import datetime, timedelta, timezone
SESSION_ID_BYTES, ABSOLUTE_TTL, IDLE_TTL = 32, timedelta(hours=12), timedelta(minutes=30)

def create_session(user, request):
    raw = secrets.token_urlsafe(SESSION_ID_BYTES)         # sent to client
    digest = hashlib.sha256(raw.encode()).hexdigest()     # stored, not reversible
    old = getattr(request, "session_digest", None)        # pre-login value: revoke it
    if old:
        Session.objects.filter(digest=old).update(revoked_at=datetime.now(timezone.utc))
    Session.objects.create(
        user=user,
        digest=digest,
        ip=request.META.get("REMOTE_ADDR", ""),
        user_agent_hash=hashlib.sha256(
            request.META.get("HTTP_USER_AGENT", "").encode()).hexdigest()[:32],
        absolute_expires_at=datetime.now(timezone.utc) + ABSOLUTE_TTL,
    )
    return raw
```

Request-time validation, idle timeout, and risk signalling:

```python
def load_session(request):
    raw = request.COOKIES.get("__Host-session")
    if not raw:
        return None
    digest = hashlib.sha256(raw.encode()).hexdigest()
    s = (Session.objects.select_related("user")
         .filter(digest=digest, revoked_at__isnull=True).first())
    if s is None:
        return None
    now = datetime.now(timezone.utc)
    if now > s.absolute_expires_at or now - s.last_seen_at > IDLE_TTL:
        s.revoked_at = now
        s.save(update_fields=["revoked_at"])
        return None
    s.last_seen_at = now
    s.save(update_fields=["last_seen_at"])
    # Risk signal, not a hard reject: mobile IPs rotate legitimately.
    if s.ip and s.ip != request.META.get("REMOTE_ADDR", ""):
        signals.ip_change_on_session.send(sender=s, request=request)
    return s
```

Cookie flags and server-side logout:

```python
from django.conf import settings

SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_NAME = "__Host-session"     # browser enforces Secure + Path=/ + no Domain
SESSION_COOKIE_AGE = 43200                  # seconds; absolute cap also enforced server-side

def logout(request):
    raw = request.COOKIES.get("__Host-session")
    if raw:
        Session.objects.filter(
            digest=hashlib.sha256(raw.encode()).hexdigest()
        ).update(revoked_at=datetime.now(timezone.utc))  # revoke, do not just clear
    response = JsonResponse({"ok": True})
    response.delete_cookie("__Host-session", path="/")
    return response
```

Rotate the identifier on privilege change, dropping every other session:

```python
@login_required
def change_password(request, new_password):
    if not verify_password(request.user.password_hash, new_password):
        return JsonResponse({"error": "invalid credentials"}, status=401)
    request.user.set_password(hash_password(new_password))
    request.user.save(update_fields=["password_hash"])
    rotate_session(request)              # new identifier, old one revoked
    Session.objects.filter(user=request.user).exclude(
        digest=current_digest(request)
    ).update(revoked_at=datetime.now(timezone.utc))
```

## Checklist

- [ ] Session identifiers use at least 128 bits of CSPRNG entropy and only a hash is stored server side.
- [ ] The identifier is rotated on login, password change, MFA completion, and privilege change, invalidating the previous value.
- [ ] Absolute and idle expiries are both enforced server side with documented values.
- [ ] Cookies set `Secure`, `HttpOnly`, `SameSite`, and use the `__Host-` prefix where possible.
- [ ] No session identifier appears in a URL, a query string, a log line, or an error message.
- [ ] Logout and password reset revoke the relevant sessions server side rather than only clearing the cookie.
- [ ] Per-device session listing and single-session revocation are available to the user.
- [ ] IP and user-agent changes are logged as risk signals, with alerts on implausible changes such as simultaneous distant geographies.

## Anti-patterns

- **No rotation on login.** Keeping the pre-login identifier means a value an attacker planted before authentication becomes a fully privileged session. Session fixation is entirely this bug.
- **Base64-encoding an identifier instead of generating randomness.** `base64(user_id:timestamp)` is predictable and enumerable. Use a CSPRNG and store only a hash.
- **Unbounded session lifetime.** Sessions with no absolute expiry are permanent credentials that outlive any device compromise. Cap both idle and absolute duration.
- **Session ID in localStorage.** It is readable by any XSS payload and survives browser restarts. Use an `HttpOnly` cookie the page cannot read.
- **Clearing the cookie and calling it logout.** Without server-side revocation the token stays valid for its full lifetime, and a copy taken beforehand still works. Revoke the stored record.