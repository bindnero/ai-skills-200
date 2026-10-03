---
name: idempotency-keys
description: Makes HTTP writes safely retryable using an `Idempotency-Key` header, request fingerprinting, and atomic replay storage. Use when implementing POST handlers for payments, orders, or any endpoint clients will retry after a timeout.
---

# Idempotency Keys

**Use when:** a client can retry a non-idempotent write — after a timeout, a proxy 502, or a double-click — and a duplicate charge or order is unacceptable.
**Do not use when:** the operation is naturally idempotent, such as a `PUT` replace — see `rest-api-design`.

## Instructions

1. Require the key on every non-idempotent write. Make it optional at the transport layer but mandatory wherever a duplicate causes money movement or a duplicate notification.
2. Store the key with a request fingerprint, not alone. Hash method, path, and canonicalized body; the same key with a different fingerprint must return `422`, never a replay.
3. Insert the key before doing the work, atomically. `INSERT ... ON CONFLICT DO NOTHING` on a unique primary key is the claim; check-then-act lets two concurrent retries both proceed.
4. Make concurrent duplicates wait rather than fail. When a second request finds the key claimed with no stored response, block briefly or return `409` with `Retry-After` instead of double-processing.
5. Persist the completed response verbatim — status, body, and selected headers — so the retry is transparent to the client.
6. Set a TTL longer than the client's maximum retry window: at least 24 hours for payments. Eviction mid-window reopens the duplicate hole.
7. Scope keys per client and endpoint, including `tenant_id` in the primary key so colliding UUIDs cannot read each other's stored responses.
8. Require 128 bits of entropy and reject overlong or control-character keys; a sequential key lets one client probe another's operations.

## Patterns

Schema where the primary key is the atomic claim:

```sql
CREATE TABLE idempotency_keys (
  tenant_id        text        NOT NULL,
  idem_key         text        NOT NULL,
  request_hash     bytea       NOT NULL,  -- SHA-256 of METHOD|PATH|canonical body
  state            text        NOT NULL DEFAULT 'in_progress',
  response_status  smallint,
  response_headers jsonb,
  response_body    bytea,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, idem_key)
);
CREATE INDEX idempotency_keys_created_at_idx ON idempotency_keys (created_at);
```

Claim-or-replay in one transaction, with fingerprint mismatch detection:

```ts
import { createHash } from "node:crypto";

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export async function runIdempotent<T>(
  tenantId: string,
  rawKey: string | undefined,
  req: { method: string; path: string; body: unknown },
  work: (tx: Tx) => Promise<{ status: number; headers: Record<string, string>; body: T }>,
): Promise<{ replayed: boolean; status: number; headers: Record<string, string>; body: unknown }> {
  if (!rawKey) throw new HttpError(400, "idempotency_key_required", "This endpoint requires an Idempotency-Key header");
  if (!KEY_PATTERN.test(rawKey)) throw new HttpError(400, "invalid_idempotency_key", "Key must be 16-128 chars of [A-Za-z0-9_-]");

  const hash = createHash("sha256").update(`${req.method.toUpperCase()}|${req.path}|${canonicalJson(req.body)}`).digest();

  return db.tx(async (tx) => {
    const claim = await tx.idempotencyKey.findUnique({ where: { tenantId_idemKey: { tenantId, idemKey: rawKey } } });

    if (claim) {
      const stored = Buffer.from(claim.requestHash);
      if (stored.length !== hash.length || !stored.equals(hash)) {
        throw new HttpError(422, "idempotency_key_reused", "Key already used with a different payload");
      }
      if (claim.state === "in_progress") {
        throw new HttpError(409, "idempotent_request_in_progress", "An identical request is still processing", { headers: { "Retry-After": "2" } });
      }
      return {
        replayed: true,
        status: claim.responseStatus!,
        headers: (claim.responseHeaders ?? {}) as Record<string, string>,
        body: JSON.parse(Buffer.from(claim.responseBody!).toString("utf8")) as unknown,
      };
    }

    try {
      await tx.idempotencyKey.create({ data: { tenantId, idemKey: rawKey, requestHash: hash, state: "in_progress" } });
    } catch (err) {
      // Lost the race between findUnique and insert: never double-process.
      if (isUniqueViolation(err)) throw new HttpError(409, "idempotent_request_in_progress", "Identical request still processing", { headers: { "Retry-After": "2" } });
      throw err;
    }

    const outcome = await work(tx);

    await tx.idempotencyKey.update({
      where: { tenantId_idemKey: { tenantId, idemKey: rawKey } },
      data: {
        state: "completed",
        responseStatus: outcome.status,
        responseHeaders: outcome.headers,
        responseBody: Buffer.from(JSON.stringify(outcome.body), "utf8"),
      },
    });

    return { replayed: false, status: outcome.status, headers: outcome.headers, body: outcome.body };
  });
}
```

Handler and client that reuse one key across every retry:

```ts
app.post("/v1/payments", async (req, reply) => {
  const key = req.headers["idempotency-key"] as string | undefined;

  const { replayed, status, headers, body } = await runIdempotent(req.tenant.id, key, req, async (tx) => {
    const payment = await tx.payment.create({ data: { amountCents: req.body.amountCents, currency: req.body.currency } });
    await ledger.append(tx, { kind: "payment.captured", paymentId: payment.id, amountCents: payment.amountCents });
    return { status: 201, headers: { Location: `/v1/payments/${payment.id}` }, body: { id: payment.id, status: "captured" } };
  });

  return reply.code(status).headers({ ...headers, "Idempotency-Key": key!, "Idempotent-Replay": String(replayed) }).send(body);
});
```

```ts
// Client: one key per logical operation, reused across every retry attempt.
export async function capturePayment(input: CaptureInput): Promise<Payment> {
  const idemKey = randomUUID();

  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(`${base}/v1/payments`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idemKey },
        body: JSON.stringify(input),
      });
      if (res.ok) return res.json() as Promise<Payment>;
      if (res.status === 409 || res.status === 429) {
        await sleep(Number(res.headers.get("retry-after") ?? 1) * 1000);
        continue;
      }
      throw new ApiError(res.status, await res.json());
    } catch (err) {
      if (attempt >= 4) throw err;
      // Network error or 5xx: retry with the SAME key so the server replays.
      await sleep(Math.min(10_000, 250 * 2 ** attempt) * (0.5 + Math.random()));
    }
  }
}
```

## Checklist

- [ ] `Idempotency-Key` is required on every non-idempotent write that moves money or creates duplicates
- [ ] Key uniqueness is enforced by a database primary key, not an application check
- [ ] The stored fingerprint covers method, path, and canonicalized body
- [ ] Same key with a different fingerprint returns `422`, never a replay
- [ ] Concurrent duplicates get `409` with `Retry-After` instead of double-processing
- [ ] Completed responses are replayed verbatim with the original status and body
- [ ] TTL exceeds the client's documented maximum retry window
- [ ] Keys are scoped per tenant so stored responses are not cross-readable

## Anti-patterns

**Check-then-act dedupe.** `if (!await keys.exists(k)) { await doWork(); await keys.set(k) }` has a window where two simultaneous retries both execute. The unique-key insert in the same transaction is the only atomic claim.

**Storing only a boolean.** Remembering that a key was used and re-running the handler still charges the card twice. Persist the original response and replay it.

**Ignoring the request fingerprint.** Reusing `payment-1234` for a different amount and replaying the first response tells the client a $10 charge succeeded when they asked for $1000. Hash the payload and reject mismatches.

**TTL shorter than the retry window.** Expiring keys after an hour while clients retry for 24 hours reopens the duplicate-charge hole exactly when a flaky mobile network is flapping. Store for the full documented window.