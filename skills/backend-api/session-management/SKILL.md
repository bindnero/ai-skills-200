---
name: session-management
description: Manages server-side browser sessions with secure cookies, idle and absolute timeouts, and fixation-safe rotation. Use when implementing login and logout, cookie policy, concurrent session limits, or per-request session lookup.
---

# Session Management

**Use when:** you are authenticating browsers with cookies, storing login state server-side, or enforcing session expiry and logout.
**Do not use when:** clients are non-browser APIs using bearer tokens — use `auth-token-lifecycle`; or third-party identity — see `oauth2-integration`.

## Instructions

1. Generate the session identifier server-side with at least 128 bits of entropy. Never derive it from anything the client controls, and never accept a client-supplied identifier.
2. Store only an opaque identifier in the cookie; keep the record server-side. Signed stateless cookies leak the whole payload to the client and cannot be revoked before expiry.
3. Set `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict` where OAuth callbacks allow), and the narrowest `Path`/`Domain`. Use the `__Host-` prefix where possible so the browser enforces the rules.
4. Rotate the identifier on every privilege change: login, password change, MFA completion, and step-up. Session fixation works precisely because the identifier survives authentication.
5. Enforce idle (15-30 minutes) and absolute (8-12 hours) timeouts independently. Without the absolute cap, a continuously used stolen session never expires.
6. Cap concurrent sessions per user (3-5), list them with device and IP metadata, and allow individual revocation.
7. Validate `Origin` (falling back to `Referer`) against an allowlist on every state-changing request. `SameSite=Lax` still permits top-level GET navigations from other sites.
8. Expire sessions server-side with a TTL so logout revokes immediately rather than waiting for the client's cookie to lapse.
9. Alert on anomalies: one session id used from two ASNs within minutes, or a destroyed session id reused.

## Patterns

Session store with rotation, dual timeouts, and revocation:

```ts
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "redis";

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const IDLE_TTL_SEC = 30 * 60;
const ABSOLUTE_TTL_SEC = 12 * 3600;
const MAX_SESSIONS_PER_USER = 5;
const COOKIE = "__Host-acme_sess"; // __Host- forces Secure, no Domain, Path=/

const hashId = (id: string) => createHash("sha256").update(id).digest("hex");
const keyFor = (id: string) => `sess:${hashId(id)}`;
const userKey = (userId: string) => `sess-user:${userId}`;

export function sessionCookie(id: string, maxAgeSec: number): string {
  // Clearing requires the SAME attributes, including Max-Age=0.
  return [`${COOKIE}=${id}`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax", `Max-Age=${maxAgeSec}`].join("; ");
}

export async function createSession(userId: string, meta: { ip: string; userAgent: string }): Promise<Session> {
  const id = randomBytes(32).toString("base64url"); // 256 bits, server-generated
  const now = Date.now();
  const record = { userId, createdAt: now, lastSeenAt: now, absoluteExpiresAt: now + ABSOLUTE_TTL_SEC * 1000, ip: meta.ip, userAgent: meta.userAgent.slice(0, 300) };

  await redis
    .multi()
    .set(keyFor(id), JSON.stringify(record), { EX: IDLE_TTL_SEC, NX: true })
    .sAdd(userKey(userId), hashId(id))
    .expire(userKey(userId), ABSOLUTE_TTL_SEC)
    .exec();

  await enforceConcurrencyCap(userId);
  return { id, ...record };
}

export async function lookupSession(cookieHeader: string | undefined): Promise<SessionLookup> {
  const id = readCookie(cookieHeader, COOKIE);
  if (!id) return { kind: "anonymous" };

  const raw = await redis.get(keyFor(id));
  if (!raw) return { kind: "expired", reason: "revoked" }; // logged out or evicted
  const record = JSON.parse(raw) as Omit<Session, "id">;

  // Absolute lifetime is never extended by activity.
  if (Date.now() >= record.absoluteExpiresAt) {
    await destroySession(id);
    return { kind: "expired", reason: "absolute" };
  }

  // Only the idle window slides.
  await redis.set(keyFor(id), JSON.stringify({ ...record, lastSeenAt: Date.now() }), { EX: IDLE_TTL_SEC, XX: true });
  return { kind: "ok", session: { ...record, id } };
}

export async function rotateSessionId(oldId: string, userId: string, meta: { ip: string; userAgent: string }): Promise<Session> {
  // Destroy the pre-auth identifier so a fixation attempt cannot be reused.
  await destroySession(oldId);
  const session = await createSession(userId, meta);
  metrics.increment("auth.session_rotated");
  return session;
}

async function destroySession(id: string): Promise<void> {
  const raw = await redis.get(keyFor(id));
  if (!raw) return;
  const { userId } = JSON.parse(raw) as Session;
  await redis.multi().del(keyFor(id)).sRem(userKey(userId), hashId(id)).exec();
}

async function enforceConcurrencyCap(userId: string): Promise<void> {
  const members = await redis.sMembers(userKey(userId));
  if (members.length <= MAX_SESSIONS_PER_USER) return;

  const withAges = await Promise.all(members.map(async (h) => ({ h, lastSeenAt: Number((await redis.get(`sess:${h}`)) ? JSON.parse((await redis.get(`sess:${h}`))!).lastSeenAt : 0) })));
  const excess = withAges.sort((a, b) => a.lastSeenAt - b.lastSeenAt).slice(0, withAges.length - MAX_SESSIONS_PER_USER);
  await Promise.all(excess.map((e) => redis.del(`sess:${e.h}`))); // evict least recently active
  await redis.sRem(userKey(userId), ...excess.map((e) => e.h));
  metrics.increment("auth.sessions_evicted", { reason: "concurrency_cap" });
}

function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}
```

Middleware with origin enforcement, and login that rotates:

```ts
import type { RequestHandler } from "express";

const ALLOWED_ORIGINS = new Set(["https://app.acme.io", "https://admin.acme.io"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const sessionMiddleware: RequestHandler = async (req, res, next) => {
  // SameSite is defense in depth; verify Origin for every state change.
  if (!SAFE_METHODS.has(req.method)) {
    const origin = req.get("origin") ?? parseRefererOrigin(req.get("referer"));
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      res.status(403).json({ error: { code: "origin_not_allowed", message: "Cross-origin state change rejected" } });
      return;
    }
  }

  const result = await lookupSession(req.headers.cookie);
  if (result.kind === "ok") {
    res.locals.session = result.session;
    res.locals.userId = result.session.userId;
  }
  next();
};

export const loginHandler: RequestHandler = async (req, res) => {
  const user = await userService.verifyPassword(parseCredentials(req.body));
  if (!user) {
    await dummyPasswordHash(); // uniform response, roughly uniform timing
    res.status(401).json({ error: { code: "unauthorized", message: "Invalid email or password" } });
    return;
  }

  const preAuthId = readCookie(req.headers.cookie, "__Host-acme_sess");
  const session = await rotateSessionId(preAuthId!, user.id, { ip: req.ip!, userAgent: req.get("user-agent") ?? "" });
  res.setHeader("set-cookie", sessionCookie(session.id, IDLE_TTL_SEC)).status(200).json({ ok: true });
};
```

## Checklist

- [ ] Session id is at least 128 bits of server-generated entropy
- [ ] Cookie is `HttpOnly`, `Secure`, `SameSite`, and `__Host-` prefixed where possible
- [ ] The session record is server-side; the cookie holds only an opaque id
- [ ] Identifier is rotated on login, password change, and MFA completion
- [ ] Idle and absolute timeouts are both enforced and independent
- [ ] Concurrent sessions per user are capped and individually revocable
- [ ] `Origin` is verified on every state-changing request, not just at login
- [ ] Logout destroys the server record immediately, not when the cookie expires

## Anti-patterns

**No rotation on login.** The pre-authentication id survives authentication, so an attacker who fixes a cookie inherits the logged-in session. Rotate on every privilege change.

**Only a sliding timeout.** Without an absolute cap, a bot making one request an hour keeps a stolen session alive forever. The two limits must be independent and the absolute one never extended.

**Stateless signed session cookies.** Everything in the cookie, including role and user id, is readable by the client and revocation is impossible until expiry. Keep the payload server-side.

**Clearing the cookie with different attributes.** `Set-Cookie: name=; Max-Age=0` without matching `Path`, `HttpOnly`, and `Secure` does not overwrite the original cookie, so the session stays alive in the browser.