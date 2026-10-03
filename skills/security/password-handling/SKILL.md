---
name: password-handling
description: Stores and verifies user passwords with Argon2id, resists enumeration and offline cracking, and enforces reset flows that do not leak account existence. Use when implementing signup, login, or password reset, migrating legacy hashes, or responding to a suspected credential-stuffing attack.
---

# Password Handling

**Use when:** implementing or reviewing password registration, verification, reset, and migration code, including choosing a KDF, setting cost parameters, and designing the reset and lockout flow.
**Do not use when:** protecting server-to-server or machine credentials — use `api-key-management`; step-up verification with a second factor belongs to `multi-factor-auth`.

## Instructions

1. Never store, log, or transmit a password in plaintext or with a reversible cipher. The only stored representation is a salted slow KDF output from Argon2id, scrypt, or bcrypt, plus the parameters needed to re-verify.
2. Hash with Argon2id using an established library default, or set parameters explicitly: at least 19 MiB of memory, 2 iterations, and 1 parallelism, tuned upward until verification takes roughly 100 ms on production hardware. Re-measure when hardware changes.
3. Verify with the library's constant-time verification function, never by building a comparison or comparing digests directly. The library also handles parsing of the parameters embedded in the stored hash, which is required for future rehash-on-login.
4. Rehash on successful login whenever the stored parameters are weaker than the current policy, so cost increases apply gradually to the whole user base without a forced reset.
5. Return identical responses and comparable timing for "user not found" and "wrong password" — same status code, same body shape, same work. Perform a dummy verification against a fixed hash when the user does not exist.
6. Never reveal whether an account exists: the login form, the reset form, and the change-password flow all return the same neutral message regardless of the address supplied.
7. Implement reset with a single-use, high-entropy token stored hashed, with a short expiry (15 minutes), invalidated on use and on any new issuance, and consumed only after the token is verified. Invalidate existing sessions on successful reset.
8. Enforce a minimum length of at least 12 characters with no composition rules, no forced rotation on a schedule, and no reuse of the last few passwords beyond a short history. Check against a breach corpus of common and leaked passwords at registration and reset, and rate-limit guesses.
9. Rate-limit and monitor authentication attempts per account and per source, alerting on distributed low-and-slow credential stuffing that never trips a single-account lockout.
10. Support passkeys and WebAuthn for new accounts, and require an MFA-capable path, so the password remains a recovery factor rather than the only factor.

## Patterns

Argon2id hashing and verification:

```python
import argon2, secrets

# Tuned so a verification costs ~100ms on production hardware.
_hasher = argon2.PasswordHasher(time_cost=2, memory_cost=19 * 1024,   # 19 MiB
                                parallelism=1, hash_len=32, salt_len=16)

def hash_password(plain: str) -> str:
    return _hasher.hash(plain)          # phrases allowed; no composition rules

def verify_password(stored: str | None, plain: str) -> bool:
    if stored is None:
        _hasher.verify(_DUMMY_HASH, plain)    # constant-ish work for unknown accounts
        return False
    try:
        _hasher.verify(stored, plain)         # library constant-time compare
    except argon2.exceptions.VerifyMismatchError:
        return False
    except argon2.exceptions.InvalidHashError:
        return False                         # corrupt/legacy hash -> force a reset
    if _hasher.check_needs_rehash(stored):
        update_password_hash_for_user(current_user_id, _hasher.hash(plain))
    return True

_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(32))
```

Neutral failure on login and reset:

```python
# Both branches produce the same status, body, and log shape.
def login(email: str, password: str):
    user = users.get_by_email(email.strip().lower())   # normalize before lookup
    ok = verify_password(user.password_hash if user else None, password)
    if not (ok and user and user.is_active):
        return JsonResponse({"error": "invalid credentials"}, status=401)
    start_session(user)
    return JsonResponse({"ok": True})

def request_reset(email: str):
    user = users.get_by_email(email.strip().lower())
    if user:
        issue_reset_token(user)          # token stored hashed, TTL 15 minutes
        send_reset_email(user, token)    # never reveal that the address exists
    return JsonResponse({"message": "if that account exists, we sent a link"})
```

Single-use reset token:

```python
import hashlib, secrets

def issue_reset_token(user) -> None:
    raw = secrets.token_urlsafe(32)             # sent to the user in the link
    ResetToken.objects.create(
        user=user,
        token_hash=hashlib.sha256(raw.encode()).hexdigest(),   # stored, not the token
        expires_at=now() + timedelta(minutes=15), used_at=None)

def consume_reset_token(raw: str, new_password: str) -> bool:
    digest = hashlib.sha256(raw.encode()).hexdigest()
    with transaction.atomic():
        token = (ResetToken.objects.select_for_update()
                 .filter(token_hash=digest, used_at=None, expires_at__gt=now()).first())
        if token is None:
            return False
        token.used_at = now()                     # single use
        token.user.set_password(hash_password(new_password))
        token.user.save(update_fields=["password_hash"])
        sessions.revoke_all_for_user(token.user)  # existing sessions must not survive
        return True
```

Breach-corpus check at registration (k-anonymity range query):

```python
async def check_password_breach(plain: str) -> bool:
    digest = hashlib.sha1(plain.encode(), usedforsecurity=False).hexdigest().upper()
    resp = await client.get(f"https://api.pwnedpasswords.com/range/{digest[:5]}",
                            headers={"Add-Padding": "true"})
    return any(digest in line and int(line.partition(":")[2]) < 100_000
               for line in resp.text.splitlines())
```

## Checklist

- [ ] Passwords are stored only as Argon2id (or scrypt/bcrypt) hashes with per-password salts and recorded parameters.
- [ ] Cost parameters produce roughly 100 ms per verification on production hardware and are documented.
- [ ] Verification uses the library's constant-time function; no digest comparison is written by hand.
- [ ] Weaker stored hashes are upgraded on next successful login.
- [ ] Login, reset, and change-password responses are indistinguishable for existing and nonexistent accounts, including timing.
- [ ] Reset tokens are single-use, stored hashed, expire in about 15 minutes, and invalidate existing sessions on use.
- [ ] Minimum length is enforced with no composition rules or scheduled forced rotation, and breached passwords are rejected.
- [ ] Attempts are rate-limited per account and per source, with alerting on distributed credential stuffing.

## Anti-patterns

- **Fast or unsalted hashing.** SHA-256, MD5, and unsalted SHA-1 are cracked at billions of guesses per second on commodity GPUs; unsalted hashes let one rainbow table crack every user at once. Use a memory-hard KDF with a unique salt per password.
- **Comparing hashes with `==`.** Custom comparisons and hand-rolled schemes invite timing attacks and subtle bugs. Use `argon2.verify()` or the library equivalent.
- **"Invalid email" on reset.** Telling a caller that an address is not registered turns the reset form into an account-enumeration oracle that supports credential stuffing and targeted phishing.
- **Scheduled forced rotation.** Expiring passwords every 60 or 90 days pushes users to predictable variants and is discouraged by NIST SP 800-63B. Rotate on compromise, not on a calendar.
- **Sending the password by email or logging it.** Any copy of a plaintext password outside the verification step multiplies the places it must later be rotated. Never log, even at debug level.