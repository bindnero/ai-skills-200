---
name: oauth2-integration
description: Implements OAuth 2.0 authorization-code-with-PKCE and client-credentials flows against external identity providers. Use when adding sign-in-with-provider, machine-to-machine tokens, or upstream token introspection.
---

# OAuth 2.0 Integration

**Use when:** your service delegates authentication or authorization to an external provider such as Auth0, Okta, Entra ID, Google, or GitHub.
**Do not use when:** you issue your own first-party credentials — use `auth-token-lifecycle`; or the flow is browser-session based — use `session-management`.

## Instructions

1. Use authorization code with PKCE (`S256`) for anything involving a browser or mobile app. Never the implicit flow, which returns tokens in a URL fragment where they land in history and referrer headers.
2. Send `state` for CSRF protection and `nonce` for replay protection, and validate both against server-side records. Never validate `state` against a value echoed from the query string.
3. Keep the client secret confidential and use it only in the back-channel exchange. For public clients, PKCE alone is the protection; never embed a secret in a mobile bundle.
4. Validate the ID token cryptographically: pin algorithms, check `iss` exactly, check `aud` contains your client id, require `azp` when audiences are multiple, and check `exp`/`iat` with small tolerance.
5. Exchange the code with the exact `redirect_uri` used in the authorize request, byte for byte.
6. For machine-to-machine, use client credentials with a scope allowlist and cache until 60 seconds before expiry. Never fetch a token per API call.
7. Resolve provider identities to local accounts by `(provider, subject)`, never by email. Provider email is not verified-consistent and can be reassigned after a domain transfer.
8. Decide and document how long a local session survives provider-side consent revocation.

## Patterns

Authorize request with PKCE, state, and nonce stored server-side:

```ts
import { createHash, randomBytes } from "node:crypto";

export async function beginAuthorization(): Promise<Response> {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url"); // S256, never "plain"
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const redirectUri = `${process.env.PUBLIC_ORIGIN}/oauth/callback`; // exact pre-registered value

  // Hashed server-side and single-use: a replayed callback finds nothing.
  await db.oauthAttempt.create({
    data: {
      stateHash: createHash("sha256").update(state).digest("hex"),
      codeVerifier: encryptAtRest(verifier),
      nonceHash: createHash("sha256").update(nonce).digest("hex"),
      redirectUri,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
    },
  });

  const url = new URL(`https://${process.env.OAUTH_TENANT}.auth0.com/authorize`);
  for (const [k, v] of Object.entries({
    response_type: "code", client_id: process.env.OAUTH_CLIENT_ID!, redirect_uri: redirectUri,
    scope: "openid profile email offline_access", state, nonce,
    code_challenge: challenge, code_challenge_method: "S256",
  })) url.searchParams.set(k, v);

  return Response.redirect(url.toString(), 302);
}
```

Callback: single-use state, back-channel exchange, verified ID token, `(provider, subject)` linking:

```ts
import { jwtVerify } from "jose";

export async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return Response.redirect("/login?error=provider_denied", 302);
  if (!code || !state) return Response.redirect("/login?error=invalid_callback", 302);

  const stateHash = createHash("sha256").update(state).digest("hex");
  const attempt = await db.$transaction(async (tx) => {
    const found = await tx.oauthAttempt.findFirst({ where: { stateHash, usedAt: null, expiresAt: { gt: new Date() } } });
    return found ? tx.oauthAttempt.update({ where: { id: found.id }, data: { usedAt: new Date() } }) : null; // claim once
  });
  if (!attempt) return Response.redirect("/login?error=state_mismatch", 302);

  const tokenRes = await fetch(`https://${process.env.OAUTH_TENANT}.auth0.com/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code", client_id: process.env.OAUTH_CLIENT_ID, client_secret: process.env.OAUTH_CLIENT_SECRET,
      code, code_verifier: decryptAtRest(attempt.codeVerifier), redirect_uri: attempt.redirectUri,
    }),
  });
  if (!tokenRes.ok) return Response.redirect("/login?error=exchange_failed", 302);

  const tokens = (await tokenRes.json()) as { access_token: string; id_token: string; expires_in: number };

  const jwks = createRemoteJWKSet(new URL(`https://${process.env.OAUTH_TENANT}.auth0.com/.well-known/jwks.json`));
  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(tokens.id_token, jwks, {
      algorithms: ["RS256"],
      issuer: `https://${process.env.OAUTH_TENANT}.auth0.com/`,
      audience: process.env.OAUTH_CLIENT_ID,
      requiredClaims: ["sub", "iss", "aud", "exp", "iat"],
      clockTolerance: 60,
    }));
  } catch {
    return Response.redirect("/login?error=invalid_id_token", 302);
  }

  // Nonce check: a validly signed but replayed ID token fails here.
  const expected = createHash("sha256").update(readNonceCookie(req)).digest("hex");
  const actual = createHash("sha256").update(String(claims.nonce ?? "")).digest("hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return Response.redirect("/login?error=nonce_mismatch", 302);
  }

  // Link by immutable provider subject. Email matching is unsafe across providers.
  const identity = await db.identity.upsert({
    where: { provider_subject: { provider: "auth0", subject: String(claims.sub) } },
    create: { provider: "auth0", subject: String(claims.sub), email: String(claims.email ?? ""), emailVerified: claims.email_verified === true },
    update: { lastLoginAt: new Date() },
  });

  const local = await linkOrCreateLocalUser(identity, claims);
  const session = await sessionStore.create(local.id);
  return Response.redirect("/app", { headers: { "set-cookie": await sessionStore.cookieFor(session.id) } });
}
```

Machine-to-machine client with a cached, scope-checked token:

```ts
const ALLOWED_SCOPES = new Set(["read:orders", "write:orders", "read:customers"]);
let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<{ token: string; expiresAt: number }> | null = null;

export async function machineToken(audience: string): Promise<string> {
  // Refresh 60s early; never a token request per API call.
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  // Collapse a thundering herd into one in-flight token request.
  inflight ??= (async () => {
    const res = await fetch("https://login.acme.com/oauth2/v1/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.M2M_CLIENT_ID!, client_secret: process.env.M2M_CLIENT_SECRET!,
        audience, scope: "read:orders write:orders",
      }),
    });
    if (!res.ok) throw new HttpError(502, "upstream_unavailable", `Token endpoint returned ${res.status}`);

    const json = (await res.json()) as { access_token: string; expires_in: number; scope: string };
    for (const s of json.scope.split(" ")) {
      if (s && !ALLOWED_SCOPES.has(s)) throw new HttpError(502, "upstream_unavailable", `Provider granted unexpected scope ${s}`);
    }
    return { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  })().finally(() => { inflight = null; });

  return (await inflight).token;
}
```

## Checklist

- [ ] Browser and mobile flows use authorization code with PKCE `S256`
- [ ] Implicit flow is not used anywhere
- [ ] `state` is single-use, server-stored, hashed at rest, and short-lived
- [ ] ID tokens are verified with pinned algorithms and `iss`/`aud`/`exp` checks
- [ ] `nonce` from the ID token is compared against the issued value
- [ ] `redirect_uri` is exactly the pre-registered value, with no wildcards
- [ ] Local accounts are linked by `(provider, subject)`, never by email
- [ ] Machine tokens are cached until near expiry with a scope allowlist

## Anti-patterns

**Implicit flow (`response_type=token`).** Tokens arrive in the URL fragment, land in browser history, and leak through `Referer` headers. Code plus PKCE avoids all of it.

**Linking accounts by email.** A domain change or an unverified provider email lets an attacker take over an account by registering the same address at the provider. Match the immutable `sub`.

**Skipping state validation.** Without a single-use `state`, an attacker completes a login CSRF by getting a victim to visit a callback URL carrying the attacker's code — the victim ends up logged into the attacker's account.

**Fetching a machine token per request.** One token request per API call exhausts the provider's token-endpoint rate limit and adds a round trip to every call. Cache until near expiry and collapse concurrent misses.