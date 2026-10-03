---
name: webhook-delivery
description: Delivers outbound webhooks with signed payloads, exponential-backoff retries, and replayable delivery logs. Use when notifying external systems of changes, or implementing a webhook receiver.
---

# Webhook Delivery

**Use when:** your service must notify an external HTTP endpoint about a state change — payments, deployments, third-party integrations.
**Do not use when:** both sides are your own services on a broker — use `event-driven-architecture`; or the consumer should pull — use `rest-api-design`.

## Instructions

1. Sign every payload: HMAC-SHA256 over the exact raw body with a per-endpoint secret, in a header, verified with constant-time comparison. Unsigned webhooks give the receiver no way to distinguish you from an attacker.
2. Include a timestamp and delivery id in the signed material and reject anything outside a 5-minute window, or a captured payload replays indefinitely.
3. Return `2xx` fast and do the work asynchronously. Signing, serializing, and retrying belong in a worker, not the request handler.
4. Retry with exponential backoff, full jitter, and a hard ceiling — 8 attempts across roughly 24 hours covers transient outages while still terminating.
5. Treat any non-2xx as failure, including `429` and `5xx`. Honour `Retry-After` when present, but never below your computed backoff floor.
6. Give the receiver a stable `evt_...` id so duplicates are recognizable, and state in your docs that delivery is at-least-once and handlers must be idempotent.
7. Disable SSRF: resolve the target host at delivery time, block private and link-local ranges, and refuse redirects to another host. A webhook URL is attacker-supplied configuration.
8. Expose delivery logs and a manual replay endpoint; most "webhook not working" reports are one failed delivery the customer cannot see.
9. Verify with a signed test ping before enabling an endpoint, and rotate secrets with an overlap window.

## Patterns

Registration with a per-endpoint secret and SSRF-safe URL validation:

```ts
import { lookup } from "node:dns/promises";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

const BLOCKED_V4 = [/^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
const BLOCKED_V6 = [/^::1$/, /^fc/i, /^fd/i, /^fe80/i, /^::ffff:127\./, /^::ffff:10\./];

async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new HttpError(422, "webhook_https_required", "Webhook URLs must use HTTPS");
  if (url.username || url.password) throw new HttpError(422, "webhook_url_invalid", "Credentials in URL are not allowed");

  // Resolve at registration AND at delivery: a hostname can be re-pointed later.
  for (const { address, family } of await lookup(url.hostname, { all: true })) {
    if (family === 4 && BLOCKED_V4.some((re) => re.test(address))) throw new HttpError(422, "webhook_url_private", "Private IPv4 is not allowed");
    if (family === 6 && BLOCKED_V6.some((re) => re.test(address))) throw new HttpError(422, "webhook_url_private", "Private IPv6 is not allowed");
  }
  return url;
}

export async function registerEndpoint(tenantId: string, input: { url: string; events: string[] }): Promise<{ id: string; secret: string }> {
  const url = await assertPublicUrl(input.url);
  const events = input.events.filter((e) => KNOWN_EVENTS.has(e));
  if (events.length === 0) throw new HttpError(422, "no_valid_events", "At least one supported event type is required");

  const secret = `whsec_${randomBytes(32).toString("base64url")}`;
  const endpoint = await db.webhookEndpoint.create({
    data: { tenantId, url: url.toString(), events, secretEnc: encryptAtRest(secret), status: "active", consecutiveFailures: 0 },
  });

  // Verify now: an unreachable URL should fail at setup, not silently later.
  const probe = await deliverOne(endpoint, { id: `evt_probe_${randomUUID()}`, type: "endpoint.test", createdAt: new Date().toISOString(), data: { endpointId: endpoint.id } });
  if (!probe.ok) {
    await db.webhookEndpoint.update({ where: { id: endpoint.id }, data: { status: "unverified" } });
    throw new HttpError(422, "webhook_unreachable", `Verification failed: HTTP ${probe.status}`);
  }

  return { id: endpoint.id, secret }; // shown exactly once
}
```

Signing scheme and delivery worker with backoff and terminal disable:

```ts
type WebhookEnvelope = { id: string; type: string; createdAt: string; data: Record<string, unknown> };

const MAX_ATTEMPTS = 8;

// v1: HMAC over "{timestamp}.{body}", so a captured body cannot be replayed later.
const sign = (secret: string, timestamp: number, body: string) =>
  `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

export function verifyReceived(secret: string, header: string | undefined, rawBody: string): boolean {
  if (!header?.startsWith("v1=")) return false;
  const expected = Buffer.from(sign(secret, Math.floor(Date.now() / 1000), rawBody));
  const provided = Buffer.from(header);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export async function processDelivery(delivery: Delivery): Promise<void> {
  const endpoint = await db.webhookEndpoint.findUniqueOrThrow({ where: { id: delivery.endpointId } });
  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const attempts = delivery.attempts + 1;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), endpoint.timeoutMs ?? 10_000);

  try {
    await assertPublicUrl(endpoint.url); // re-validate: DNS can now point at a private address

    const res = await fetch(endpoint.url, {
      method: "POST",
      redirect: "error", // never follow a redirect to another host
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-acme-event-id": delivery.eventId,      // stable across retries: receiver dedupes on this
        "x-acme-event-type": delivery.eventType,
        "x-acme-delivery-attempt": String(attempts),
        "x-acme-timestamp": String(timestamp),
        "x-acme-signature": sign(decryptAtRest(endpoint.secretEnc), timestamp, body),
      },
      body,
    });

    if (res.ok) {
      await db.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "delivered", attempts, deliveredAt: new Date(), responseStatus: res.status } });
      await db.webhookEndpoint.update({ where: { id: endpoint.id }, data: { consecutiveFailures: 0 } });
      return;
    }
    throw new DeliveryError(`HTTP ${res.status}`);
  } catch (err) {
    const dead = attempts >= MAX_ATTEMPTS;
    // Full jitter: synchronized retries re-create the receiver's overload.
    const jittered = Math.min(24 * 3600_000, 1_000 * 2 ** attempts * (0.5 + Math.random()));
    const nextDelayMs = Math.max(jittered, parseRetryAfterSeconds(res.headers.get("retry-after")) * 1000);

    await db.webhookDelivery.update({
      where: { id: delivery.id },
      data: dead
        ? { status: "dead", attempts, nextAttemptAt: null, lastError: String(err).slice(0, 2000) }
        : { attempts, nextAttemptAt: new Date(Date.now() + nextDelayMs), lastError: String(err).slice(0, 2000) },
    });
    await db.webhookEndpoint.update({ where: { id: endpoint.id }, data: { consecutiveFailures: { increment: 1 } } });

    // Disable after sustained failure: retries against a dead endpoint waste capacity.
    if (dead) {
      await db.webhookEndpoint.update({ where: { id: endpoint.id }, data: { status: "disabled", disabledReason: "retries_exhausted" } });
      await pager.alert({ title: "Webhook endpoint disabled", endpointId: endpoint.id, url: endpoint.url });
    }
  } finally {
    clearTimeout(timeout);
  }
}
```

Receiver that verifies the signature, tolerates duplicates, and returns fast:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export const POST = async (req: Request): Promise<Response> => {
  // Signature covers the RAW body; re-serializing parsed JSON changes the bytes.
  const rawBody = await req.text();
  const signature = req.headers.get("x-acme-signature");
  const timestamp = Number(req.headers.get("x-acme-timestamp") ?? "0");
  const eventId = req.headers.get("x-acme-event-id");
  const eventType = req.headers.get("x-acme-event-type");

  if (!signature || !eventId || !eventType) return json(400, { error: "missing_signature_headers" });
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return json(400, { error: "timestamp_out_of_tolerance" });

  const expected = Buffer.from(`v1=${createHmac("sha256", process.env.WEBHOOK_SECRET!).update(`${timestamp}.${rawBody}`).digest("hex")}`);
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return json(401, { error: "signature_mismatch" });

  // Our delivery is at-least-once, so dedupe on the stable event id.
  const inserted = await db.processedWebhook.createMany({
    data: [{ eventId: eventId!, type: eventType!, receivedAt: new Date() }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return json(200, { received: true, duplicate: true });

  await handleEvent(eventType!, JSON.parse(rawBody));
  return json(200, { received: true });
};
```

## Checklist

- [ ] Every payload is HMAC-signed over the raw body with a per-endpoint secret
- [ ] Timestamp is inside the signed material and out-of-window deliveries are rejected
- [ ] Signatures are compared with constant-time equality
- [ ] Registration requires HTTPS and rejects private, loopback, and link-local hosts
- [ ] Hostnames are re-resolved at delivery time and redirects are refused
- [ ] Retries use exponential backoff with full jitter, `Retry-After` as a floor, and a ceiling
- [ ] Endpoints are disabled and alerted on after sustained failure
- [ ] Each delivery has a stable `evt_` id and is inspectable and replayable

## Anti-patterns

**Signing a re-serialized payload.** Signing `JSON.stringify(JSON.parse(body))` produces different bytes from what you sent when key order or whitespace differs, and every check fails. Sign the exact buffer written to the socket.

**No timestamp in the signed material.** A signature-only scheme proves origin but not time, so a captured payload replays forever — for a payment webhook, indefinitely. Sign `{timestamp}.{body}` with a tolerance window.

**Retrying forever against a dead endpoint.** An endpoint that returned `410` for six months still receives every attempt, burning worker capacity and connections. Disable after the ceiling, alert, require manual re-enable.

**Following redirects during delivery.** A `302` to `169.254.169.254` turns webhook delivery into an SSRF primitive against cloud metadata. Use `redirect: "error"` and validate the resolved address.