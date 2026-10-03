---
name: multi-factor-auth
description: Implements phishing-resistant second factors using WebAuthn passkeys and TOTP with verified enrollment, backup codes, and step-up verification for sensitive actions. Use when adding MFA to a login flow, requiring re-verification for privileged actions, or migrating accounts to passkeys.
---

# Multi-Factor Authentication

**Use when:** adding a second factor to an authentication flow, requiring step-up verification before a sensitive action, designing enrollment and recovery, or replacing SMS-based verification.
**Do not use when:** the vulnerability is password storage or account enumeration in the primary factor — use `password-handling`.

## Instructions

1. Offer WebAuthn passkeys as the default second factor and treat them as phishing-resistant by origin binding. Keep TOTP as an option; do not offer SMS or voice call as a new enrollment factor.
2. Bind the WebAuthn ceremony to the account and the origin: store the credential ID, public key, sign count, and the RP ID, and verify every assertion against the expected `rpIdHash`, `origin`, and challenge.
3. Generate challenges with a CSPRNG, store them server side with a short expiry (about 5 minutes) and single use, and reject replays. A predictable or reusable challenge defeats the entire mechanism.
4. Verify the challenge is bound to the initiating session and the intended action. Use the challenge itself as the state parameter for an OAuth-style flow so the ceremony cannot be started in one session and completed in another.
5. Enforce step-up verification for sensitive operations: password change, email change, MFA enrollment or removal, key and API-key creation, payout and transfer, and data export. Issue a short-lived, action-scoped assertion from the second factor rather than a general "recently authenticated" flag.
6. Design recovery before launch: single-use hashed backup codes shown exactly once, a documented device-loss path, and a verification level per session so a password-only login cannot remove MFA.
7. Require step-up for MFA enrollment and removal with the existing factor plus a fresh second-factor challenge, and notify the account's existing channels of every enrollment, removal, and recovery use.
8. Prevent downgrade: once a factor is enrolled the login flow must not offer a path that skips it, and recovery flows must not be reachable by manipulating a parameter or a deep link.
9. Rate-limit verification attempts per account, per factor, and per device, and alert on repeated failures, factor removal attempts, and new-device enrollments from unusual locations.
10. Emit audit events with the factor type, outcome, device or credential identifier, and originating IP for every challenge issued and every enrollment changed.

## Patterns

WebAuthn registration, then assertion for login and step-up (server side):

```python
import base64
from webauthn import (generate_registration_options, verify_registration_response,
                      generate_authentication_options, verify_authentication_response)

def start_registration(user, session):
    options = generate_registration_options(
        rp_id="example.com", rp_name="Example",
        user_id=str(user.id).encode(), user_name=user.email,
        user_display_name=user.email,
        attestation="none",          # privacy-preserving; server-side attestation rarely needed
    )
    session["webauthn_challenge"] = base64.b64encode(options.challenge).decode()
    return options

def finish_registration(user, session, response):
    expected = base64.b64decode(session.pop("webauthn_challenge"))
    verification = verify_registration_response(
        credential=response,
        expected_challenge=expected,
        expected_origin="https://example.com",
        expected_rp_id="example.com",
        require_user_verification=True,   # PIN or biometric, not just possession
    )
    Credential.objects.create(
        user=user,
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        aaguid=verification.aaguid,
    )

def start_assertion(user, session, action: str):
    options = generate_authentication_options(
        rp_id="example.com", user_verification="required",
        allow_credentials=[c.credential_id for c in user.credentials.all()],
    )
    session["webauthn_challenge"] = base64.b64encode(options.challenge).decode()
    session["webauthn_action"] = action         # bind the ceremony to the action
    return options

def finish_assertion(user, session, response):
    expected = base64.b64decode(session.pop("webauthn_challenge"))
    credential = Credential.objects.get(credential_id=response.id, user=user)
    verification = verify_authentication_response(
        credential=response,
        expected_challenge=expected,
        expected_origin="https://example.com",
        expected_rp_id="example.com",
        credential_public_key=credential.public_key,
        credential_current_sign_count=credential.sign_count,
        require_user_verification=True,
    )
    credential.sign_count = verification.new_sign_count
    credential.save(update_fields=["sign_count"])
    return session["webauthn_action"]           # caller must match the requested action
```

TOTP as the compatibility factor (passkeys remain the target):

```python
import pyotp

def enroll_totp(user):
    secret = pyotp.random_base32()             # 160 bits, server-side only
    TOTPDevice.objects.create(user=user, secret=secret, confirmed=False)  # confirm on first use
    return pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="Example")

def verify_totp(device, code: str) -> bool:
    if code in recent_codes(device):            # replay protection within the window
        return False
    return device.confirmed and pyotp.TOTP(device.secret).verify(
        code, valid_window=1,      # +/- 30s only, not a wide tolerance
    )
```

Step-up assertions are scoped to a single action, not a general "recently verified" flag:

```text
POST /account/mfa/challenge {"action":"keys.create"} -> WebAuthn/TOTP ceremony
POST /account/keys          X-Step-Up: <signed JWT, exp 300>
     claims: { sub, act:"keys.create", amr:["webauthn","hwk"] }
Server rejects the request unless `act` matches the operation being performed.
```

## Checklist

- [ ] WebAuthn is the default option; SMS and voice are not offered for new enrollments.
- [ ] Every WebAuthn ceremony verifies `rpIdHash`, expected origin, single-use challenge with a short expiry, and required user verification.
- [ ] Challenges are CSPRNG-generated, bound to the initiating session, and consumed on use to prevent replay.
- [ ] Sign counts are persisted and clone-detection increases trigger re-verification or revocation.
- [ ] Step-up assertions are action-scoped, short-lived, and required for MFA changes, key creation, payouts, and exports.
- [ ] MFA removal and recovery require a fresh second factor and notify existing contact channels.
- [ ] Backup codes are single-use, stored hashed, displayed once, and regenerable only behind step-up.
- [ ] Verification attempts are rate-limited per account, factor, and device, with audit events emitted for every ceremony and enrollment change.

## Anti-patterns

- **SMS as the primary second factor.** SIM swaps, port-out fraud, and SS7 interception defeat SMS routinely. Offer passkeys; treat TOTP as a compatibility option, not the target state.
- **Static or reusable challenge.** An attacker who observes one signed assertion can replay it if the challenge is not single-use. Challenges must be random, stored, expiring, and consumed.
- **"Is this device trusted?" cookie.** Remembering a device and skipping the factor turns one stolen cookie into permanent account access. Use short trust windows, and require step-up for sensitive operations regardless of trust.
- **Removing MFA without verifying the existing factor.** A password-only flow that reaches the unlink endpoint lets a session thief dismantle the account's defenses permanently. Require both factors plus notification.
- **Widening the TOTP tolerance.** `valid_window=5` accepts a code valid for five minutes and multiplies the guess space. Keep it to ±1 step and add replay protection on the accepted code.