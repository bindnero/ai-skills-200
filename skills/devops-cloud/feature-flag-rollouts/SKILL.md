---
name: feature-flag-rollouts
description: Ships features behind feature flags with typed definitions, percentage and cohort targeting, kill switches, staleness expiry, and a cleanup discipline so no flag outlives its rollout. Use when decoupling deploy from release, when rolling out to a percentage of users, when designing a kill switch for a risky change, or when auditing flags that are still on after a year.
---

# Feature Flag Rollouts

**Use when:** code must reach production dark or partially enabled, a risky change needs a kill switch, or a rollout needs to pause for one cohort without redeploying.
**Do not use when:** you need environment-to-environment promotion of whole releases — that is `release-management`; swapping immutable infrastructure versions is `gitops-workflow`.

## Instructions

1. Separate deploy from release. The flag is the release switch; the deploy still has to be safe with every combination of flags on, because you will be running both code paths in one process during a rollout.
2. Keep flag names typed and centralised in one module, as a `const` object or an enum, not string literals at call sites. `if (FEATURES.newCheckout)` catches renames at build time; `if (flags["new_checkout"])` does not.
3. Write each flag with its owner, creation date, expected removal date, and the kill-switch answer in the definition. A flag nobody can name an owner for is a flag that will outlive the feature.
4. Default every flag to off for a new capability, on for a bug fix that must ship everywhere. Defaulting a risky feature on means the flag protects nothing — a mistaken evaluation still delivers it.
5. Roll out in stages: internal, then 1%, 5%, 25%, 50%, 100%, with a fixed observation window between steps. Move one step per window; advancing on a timer rather than on metrics is how a 5% error rate becomes a 50% one.
6. Define the metric that promotes or halts each stage before you start. "Looks fine" is not a gate; write down the error rate, latency, and support-ticket threshold that stops the rollout.
7. Treat the kill switch as separate from the rollout percentage. Kill switches set a flag false for everyone immediately and must not depend on the evaluation service being reachable — fail to off for kill switches, fail to the cached default for gradual flags.
8. Make evaluation cheap and local. Fetch flag values at startup into memory, evaluate in-process, and re-fetch on an interval. A flag read that makes an HTTP call in a render path is an outage waiting for a slow dependency.
9. Specify the behaviour when evaluation fails, per flag class. A stale value beats a hard failure for a gradual flag; a payment path should fail closed. Encode that per flag rather than picking one global default.
10. Kill the flag when the rollout completes. Deleting the code branch, the config entry, and the analytics instrumentation is the last step of the rollout, in the same epic — not a follow-up ticket nobody owns.
11. Audit for staleness on a schedule. A monthly report of flags older than 90 days with no traffic keeps the count near zero; discovering 60 dead branches during an incident does not.
12. Never branch on a flag inside a hot loop or per-row without hoisting. Evaluate once per request or per render into a local, then use the value, so a mid-render re-evaluation cannot show two versions of the same screen.

## Patterns

Typed definitions with the metadata that forces an owner and an expiry:

```ts
// features.ts — the single source of truth; imports are the only legal access
export const FEATURES = {
  newCheckout: {
    default: false,
    owner: "payments",
    created: "2026-02-10",
    removeBy: "2026-04-15",
    killSwitch: true,
    rollout: { type: "percentage", steps: [1, 5, 25, 50, 100] },
  },
  legacyTaxFix: {
    default: true,          // bug fix that must reach everyone immediately
    owner: "billing",
    created: "2026-01-08",
    removeBy: "2026-02-01",
    killSwitch: false,
  },
} as const

export type FeatureName = keyof typeof FEATURES
```

Evaluation that is local, fail-safe per class, and hoisted out of loops:

```ts
type Snapshot = { values: Partial<Record<FeatureName, boolean>>; fetchedAt: number }

export function decide(snap: Snapshot, name: FeatureName, ctx: { userId: string }): boolean {
  const flag = FEATURES[name]

  // an explicit value is authoritative — this is what a kill switch writes
  if (snap.values[name] === false) return false
  if (snap.values[name] === true) return true

  if (flag.default) return true                       // a bug-fix flag with no rollout
  if (!("rollout" in flag)) return false              // no stage approved yet

  const bucket = hashToBucket(`${name}:${ctx.userId}`)   // 0-9999, stable per user
  return bucket < approvedStep(name) * 100               // the stage currently approved
}

// hoist once per request, then reuse the boolean
const useNewCheckout = decide(snapshot, "newCheckout", { userId })
```

Server-side evaluation with a stable hash so a user does not flip between renders:

```ts
function hashToBucket(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return (h >>> 0) % 10000
}
```

Both branches alive during a rollout, with the flag read once and both paths tested:

```ts
export async function checkout(cart: Cart, ctx: Ctx) {
  const useNew = decide(loadSnapshot(), "newCheckout", { userId: ctx.userId })
  const result = useNew ? await newCheckoutFlow(cart, ctx) : await legacyCheckoutFlow(cart, ctx)
  metrics.increment("checkout.completed", { flow: useNew ? "new" : "legacy" })
  return result
}
```

The cleanup query that makes staleness visible, run monthly:

```sql
SELECT key, owner, created_at, remove_by
FROM   flag_definitions
WHERE  remove_by < current_date
   OR  created_at < current_date - interval '90 days'
ORDER  BY created_at;
```

## Checklist

- [ ] Flag definitions live in one module and are referenced through a typed name, never a raw string.
- [ ] Every definition records an owner, `created`, `removeBy`, and whether it is a kill switch.
- [ ] New capabilities default off; bug-fix flags default on.
- [ ] Rollout stages and the observation window per stage are written down before the first enable.
- [ ] The promoting metric and the abort threshold are named and observable for each stage.
- [ ] Kill switches fail to off when the flag service is unreachable.
- [ ] Flag values are cached in process and evaluated locally; no render path or loop does network I/O.
- [ ] The bucketing hash is stable per user and flag, so nobody flips between variants.
- [ ] Both branches of every active flag are covered by tests and monitored separately.
- [ ] Completed rollouts have had their code branch, config entry, and instrumentation deleted in the same epic.
- [ ] A staleness query runs at least monthly and flags older than 90 days are triaged, not ignored.

## Anti-patterns

**The flag is never deleted.** Six months on, half the codebase is behind flags, nobody remembers which are on, and a new hire reads the branches as the intended design. Fix: `removeBy` in the definition plus a monthly staleness report; make flag cleanup part of the rollout definition of done.

**Kill switch wired to the same service as the rollout.** An outage in the flag service leaves the risky path enabled, which is exactly the moment the switch was needed. Fix: a locally cached, statically shipped kill value for anything that can take money or corrupt data.

**Using a flag as permanent configuration.** Discount rules, tenant settings, and copy variants are not rollouts; they have no removal date because nobody plans one. Fix: store configuration in a settings store the app reads at runtime, and reserve flags for transitions that end.

**Percentage rollout based on `Math.random()` per request.** Every request re-rolls, so the same user sees the new flow on refresh and users report a page that "half works". Fix: hash a stable key — user id, account id, or device id — into a bucket.

**Nested flags, three deep.** `if (a) { if (b) { if (c) } }` creates 8 combinations, none of which were tested, and the flag audit cannot enumerate them. Fix: flags gate one decision each; when two features must ship together, ship them as one flag or as sequential rollouts on the same flag.

**Flag read inside a map over 10,000 rows.** The evaluation is cheap but the configuration lookup is not, and the render becomes the slowest thing on the page. Fix: evaluate once into a local at the top of the request or component and pass the boolean down.

**Advancing the rollout stage on a schedule with no metric gate.** A 50% cohort lands on a Friday with an alert threshold nobody set, and the rollback takes longer than the outage. Fix: name the gate metric before stage one and let the pipeline promote stages, not a calendar.