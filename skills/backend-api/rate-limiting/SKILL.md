---
name: rate-limiting
description: Enforces request quotas with token-bucket and sliding-window limiters, tiering, and standards-compliant headers. Use when protecting an endpoint from abuse, adding per-tenant quotas, or diagnosing unexpected 429 responses.
---

# Rate Limiting

**Use when:** you need to bound request volume per client, tenant, IP, or API key before one caller degrades everyone else.
**Do not use when:** the constraint is internal capacity planning rather than per-caller fairness — see `connection-pooling` for the database-side bound.

## Instructions

1. Choose by burst shape. Token bucket permits bursts up to bucket size and refills steadily; sliding window enforces a smooth average. Never a fixed window — its boundary lets a client send 2x the limit across the seam.
2. Key on an authenticated identity, not IP, behind a proxy. Prefer `tenant_id`, then `api_key`, then user id, IP last; `X-Forwarded-For` is attacker-controlled unless your edge strips and re-appends it.
3. Keep state in a shared atomic store (Redis `EVAL`, or equivalent) whenever more than one node serves traffic. Per-process counters multiply the effective limit by replica count.
4. Fail open with a metric when the store is unreachable. Serving traffic beats serving nothing, but count and alert every open decision.
5. Return `429` with `Retry-After` in whole seconds plus limit/remaining/reset headers. Clients cannot back off correctly without `Retry-After`.
6. Charge expensive operations by cost, not by 1. A search that fans out to twenty services should decrement the same bucket more heavily.
7. Reject after authentication (so you can key by identity) but before body parsing, database access, or upstream fan-out.
8. Separate credential-stuffing throttling at the auth layer from business-endpoint quotas so failed logins do not consume legitimate quota.

## Patterns

Atomic token bucket in Redis with tiered operation costs:

```ts
import { createClient } from "redis";

type Tier = { limit: number; windowSec: number; burst: number; opCost: Record<string, number> };

const TIERS: Record<string, Tier> = {
  free: { limit: 60, windowSec: 60, burst: 20, opCost: { search: 10, read: 1, write: 2 } },
  pro: { limit: 6_000, windowSec: 60, burst: 500, opCost: { search: 10, read: 1, write: 2 } },
};

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const BUCKET_LUA = `
local key, now, refill_rate, burst, cost, ttl = KEYS[1], tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5])
local state = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts = tonumber(state[2])
if tokens == nil then tokens, ts = burst, now end

tokens = math.min(burst, tokens + (math.max(0, now - ts) / 1000) * refill_rate)

local allowed, retry_after = 0, 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retry_after = math.ceil(((cost - tokens) / refill_rate) * 1000)
end

redis.call('HSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, ttl)
return { allowed, tokens, retry_after }
`;

export async function consume(key: string, tierName: string, op: string): Promise<Decision> {
  const tier = TIERS[tierName] ?? TIERS.free;
  const cost = tier.opCost[op] ?? 1;
  const now = Date.now();
  const refillRate = tier.limit / tier.windowSec;

  try {
    const result = await redis.eval(BUCKET_LUA, {
      keys: [`rl:{${key}}:${tierName}`], // hash tag keeps one tenant on one slot
      arguments: [String(now), String(refillRate), String(tier.burst), String(cost), String(Math.ceil((tier.burst / refillRate) * 1000) + 1000)],
    });
    const [allowed, tokens, retryAfterMs] = result as [number, number, number];
    return {
      allowed: allowed === 1,
      limit: Math.floor(tier.limit),
      remaining: Math.max(0, Math.floor(tokens)),
      resetAt: now + retryAfterMs,
      retryAfterSec: allowed === 1 ? 0 : Math.max(1, Math.ceil(retryAfterMs / 1000)),
      degraded: false,
    };
  } catch (err) {
    metrics.increment("ratelimit.store_error", { tier: tierName }); // fail open, and alert on this
    return { allowed: true, limit: tier.limit, remaining: -1, resetAt: now, retryAfterSec: 0, degraded: true };
  }
}
```

Middleware that resolves identity first and emits standards-compliant headers:

```ts
export async function rateLimitMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const key = req.headers["x-tenant-id"]?.toString() ?? req.headers["x-api-key"]?.toString() ?? clientIp(req);
  const tier = req.headers["x-plan"]?.toString() === "pro" ? "pro" : "free";
  const op = req.routeOptions.config?.rateOp ?? (req.method === "GET" ? "read" : "write");

  const d = await consume(key, tier, op);

  reply.header("RateLimit-Limit", String(d.limit));
  reply.header("RateLimit-Remaining", String(d.remaining));
  reply.header("RateLimit-Reset", String(Math.ceil(d.resetAt / 1000)));

  if (!d.allowed) {
    reply.header("Retry-After", String(d.retryAfterSec));
    metrics.increment("ratelimit.throttled", { tier, op });
    await reply.code(429).send({
      error: { code: "rate_limit_exceeded", message: `Limit of ${d.limit} requests per 60s exceeded.`, retryAfterSeconds: d.retryAfterSec },
    });
  }
}
```

Client backoff that honours the server's stated budget:

```ts
export async function withBackoff<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof HttpError) || err.status !== 429 || attempt >= maxAttempts) throw err;
      const retryAfterMs = Number(err.headers["retry-after"] ?? "1") * 1000;
      await new Promise((r) => setTimeout(r, Math.min(30_000, retryAfterMs * 2 ** attempt) + Math.random() * 250));
    }
  }
}
```

## Checklist

- [ ] Algorithm is token bucket or sliding window, never a naive fixed window
- [ ] Key is an authenticated identity, with IP only as a fallback
- [ ] Counter state lives in a shared atomic store on multi-node deployments
- [ ] `429` responses include `Retry-After` plus limit/remaining/reset headers
- [ ] Expensive operations decrement by cost rather than counting as 1
- [ ] The limiter runs after auth and before body parsing, database access, and fan-out
- [ ] Store failures fail open and increment an alertable metric
- [ ] Per-tier quotas are documented and exposed to authenticated clients

## Anti-patterns

**Fixed window counters.** `INCR` on `rl:{ip}:{minute}` lets a client send the full quota at 12:00:59 and again at 12:01:00 — double the intended rate at the boundary. Use a sliding window or token bucket.

**IP-only keying behind a CDN.** Every request appears to come from a few proxy IPs, so one abusive tenant throttles everyone and legitimate tenants see unexplained 429s. Key by authenticated identity.

**In-memory counters with replicas.** The effective limit silently scales with pod count, so 4 pods means 4x the configured quota and autoscaling makes it unpredictable. Move state to Redis or equivalent.

**Retrying 429 without jitter.** Workers backing off for exactly one second re-create the spike the limiter just prevented. Exponential backoff with full jitter, `Retry-After` as a floor.