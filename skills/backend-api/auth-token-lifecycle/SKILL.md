---
name: auth-token-lifecycle
description: Issues, rotates, refreshes, and revokes access and refresh tokens with reuse detection and server-side allowlists. Use when designing login flows, token expiry, or logout that must actually invalidate access.
---

# Auth Token Lifecycle

**Use when:** designing login, refresh, logout, or any flow where a leaked token must stop working.
**Do not use when:** you only validate tokens minted by a third-party IdP — see `oauth2-integration`.

## Instructions

1. Keep access tokens short-lived (5–15 minutes) and stateless. Widening the window to "improve UX" is what turns a small leak into a breach.
2. Give refresh tokens a long life, rotate them on every use, and persist only a SHA-256 hash. Rotation turns theft into detection.
3. Store each refresh token with a `familyId`, device id, and user agent. Reuse of a rotated token revokes the whole family.
4. Deliver refresh tokens in an `HttpOnly; Secure; SameSite=Strict` cookie so page JavaScript cannot read them.
5. Verify a `typ` claim on every token. An access token accepted as a refresh token is a privilege escalation.
6. Revoke in two directions: a `jti` denylist for tokens minted after a logout, plus a `tokenVersion` column checked against the user row for the rest.
7. Rotate signing keys with overlapping `kid`s and publish JWKS, so a rotation does not invalidate tokens issued seconds earlier.
8. Never put secrets, PII, or mutable authorization state in a JWT. The payload is base64, not encrypted.

## Patterns

Refresh with single-use rotation and family-wide reuse detection:

```ts
import { createHash, randomUUID } from "node:crypto";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export async function issueSession(user: User, familyId: string | null, meta: { deviceId: string; userAgent: string }) {
  const family = familyId ?? randomUUID();
  const refreshToken = randomUUID() + "." + randomUUID();
  await db.refreshToken.create({
    data: { tokenHash: sha256(refreshToken), familyId: family, userId: user.id, deviceId: meta.deviceId,
            userAgent: meta.userAgent, expiresAt: new Date(Date.now() + 30 * 864e5), usedAt: null },
  });
  return {
    accessToken: await signAccessToken(user),          // 10 min, contains jti + tokenVersion
    refreshToken,                                       // raw value returned once; only the hash is stored
    familyId: family,
    cookie: { name: "rt", value: refreshToken, httpOnly: true, secure: true, sameSite: "Strict", maxAge: 30 * 864e5, path: "/v1/auth" },
  };
}

export async function rotateSession(rawRefreshToken: string, meta: { deviceId: string; userAgent: string }) {
  const record = await db.refreshToken.findUnique({ where: { tokenHash: sha256(rawRefreshToken) } });
  if (!record) throw new HttpError("unauthorized", "Refresh token not recognised.");

  if (record.usedAt) {
    // A rotated token came back: someone replayed it. Assume theft, drop the family.
    await db.refreshToken.updateMany({ where: { familyId: record.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    await pager.alert({ title: "Refresh token reuse detected", userId: record.userId, familyId: record.familyId });
    throw new HttpError("unauthorized", "Session revoked. Sign in again.");
  }
  if (record.expiresAt < new Date() || record.deviceId !== meta.deviceId) throw new HttpError("unauthorized", "Session expired or moved to a different device.");

  await db.refreshToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  const user = await db.user.findUniqueOrThrow({ where: { id: record.userId } });
  return issueSession(user, record.familyId, meta);
}

export async function logout(rawRefreshToken: string): Promise<void> {
  const record = await db.refreshToken.findUnique({ where: { tokenHash: sha256(rawRefreshToken) } });
  if (!record) return;
  await db.$transaction([
    db.refreshToken.updateMany({ where: { familyId: record.familyId, revokedAt: null }, data: { revokedAt: new Date() } }),
    db.revokedJti.createMany({ data: [{ jti: await currentJtiFor(record.userId), expiresAt: new Date(Date.now() + 900e3) }] }),
  ]);
}
```

Verification that checks `typ`, expiry, version, and denylist in one place:

```ts
export async function verifyAccessToken(token: string): Promise<Claims> {
  const { payload, protectedHeader } = await jwtVerify(token, keyResolver, { algorithms: ["EdDSA"], issuer: ISS, audience: AUD });
  if (payload.typ !== "access") throw new HttpError("unauthorized", "Wrong token type.");
  if (!payload.sub || typeof payload.jti !== "string") throw new HttpError("unauthorized", "Malformed token.");

  const user = await db.user.findUnique({ where: { id: String(payload.sub) }, select: { tokenVersion: true, disabledAt: true } });
  if (!user || user.disabledAt) throw new HttpError("unauthorized", "Account is not active.");
  if (Number(payload.ver) !== user.tokenVersion) throw new HttpError("unauthorized", "Token superseded; refresh required.");
  if (await db.revokedJti.findUnique({ where: { jti: String(payload.jti) } })) throw new HttpError("unauthorized", "Token revoked.");

  void protectedHeader;
  return payload as Claims;
}
```

## Checklist

- [ ] Access token lifetime is minutes, with no refresh-token access token returned to browsers
- [ ] Refresh tokens rotate on every use and only hashes are persisted
- [ ] Reuse of a rotated token revokes the entire family and alerts
- [ ] Refresh token is `HttpOnly; Secure; SameSite=Strict` and scoped to the auth path
- [ ] `typ` is verified so an access token cannot be used to refresh
- [ ] `tokenVersion` bumps on password change and bulk revocation
- [ ] Signing keys rotate with overlapping `kid`s and a published JWKS
- [ ] No secrets or PII sit in the JWT payload

## Anti-patterns

**Refresh tokens that never expire.** A persistent bearer token is a permanent credential sitting in a cookie jar forever; one stolen cookie is indefinite account access. Rotate, expire, and revoke.

**Storing refresh tokens in plaintext.** A database dump then yields directly usable sessions for every account. Store `sha256(token)` and compare digests.

**Logout that only clears the cookie.** The token remains valid until expiry, so a stolen copy keeps working. Revoke server-side and bump `tokenVersion`.

**A seven-day access token "so clients don't refresh."** Every stolen bearer token stays usable for a week with no rotation to detect it. Keep it short and rotate on refresh.