---
name: rollback-strategy
description: Designs and executes rollbacks with digest pinning, database expand-contract migrations, feature flags, defined triggers and rehearsed automation. Use when a release must be reverted, planning a deploy that can be undone, or deciding whether a rollback is safe.
---

# Rollback Strategy

**Use when:** A release must be reverted, or you are planning a deploy whose failure mode needs a documented, rehearsed reversal path.
**Do not use when:** Designing the deployment topology itself; use `blue-green-deploy` for the routing mechanics of a reversible cutover.

## Instructions

1. Decide reversibility before you deploy. If a change cannot be undone, ship it behind a flag, split it, or do not ship it on a Friday.
2. Define rollback triggers as objective thresholds before the release: error rate, latency, a specific failed check, or a fixed observation window. Debating during an incident wastes the only minutes you have.
3. Roll back to a pinned digest or immutable artifact, never to a floating tag. `latest` may already be the broken version.
4. Set a time budget: if the trigger fires and mitigation is not confirmed within N minutes, escalate. A rollback that hangs is an outage with extra steps.
5. Make database changes backward compatible using expand-contract: add the new column or table, deploy code that reads both, backfill, switch reads, then remove the old in a later release.
6. Never pair a destructive migration with the code change that stops using the schema. Contract and expand must be separate deploys, days apart.
7. Provide an automated rollback triggered by the deployment tool, and test it. A rollback button nobody has pressed is an untested code path.
8. Disable the feature flag as the first mitigation where one exists; it is faster and safer than moving artifacts.
9. Record every rollback with the trigger, elapsed time and outcome. Rollback frequency is a primary reliability metric.
10. Rehearse rollbacks on a schedule, including a destructive-migration dry run against a restored snapshot, so the runbook matches reality.

## Patterns

Expand-contract database migrations spread across four separate deploys:

```text
DEPLOY 1 - expand (fully backward compatible)
  ALTER TABLE orders ADD COLUMN total_cents BIGINT;
  ALTER TABLE orders ADD COLUMN currency TEXT;
  CREATE INDEX CONCURRENTLY idx_orders_currency ON orders (currency);
  Old code ignores the new columns; rollback is a plain image revert.

DEPLOY 2 - backfill and dual-write (still backward compatible)
  UPDATE orders SET total_cents = (amount * 100)::bigint, currency = 'GBP'
    WHERE total_cents IS NULL AND created_at < now() - interval '1 day';
  App writes both columns and reads total_cents with a fallback to amount.

DEPLOY 3 - switch reads (still backward compatible)
  App reads total_cents only; all old rows are backfilled. Rolling back
  here still works because dual-write keeps amount current.

DEPLOY 4 - contract (a later week, after the rollback window has closed)
  ALTER TABLE orders DROP COLUMN amount;
  IRREVERSIBLE. Only after no release can reach pre-DEPLOY-2 code.
```

A deploy script with objective triggers, a time budget and automated reversal:

```bash
#!/usr/bin/env bash
set -euo pipefail

CONTEXT="acme-${1:-staging}"
OBSERVE_SECONDS=300
HEALTH="${SERVICE_URL:-https://api.acme.com}/health/ready"

helm upgrade --install api ./charts/api \
  --kube-context "${CONTEXT}" \
  --set image.digest="${IMAGE_DIGEST}" \
  --atomic --timeout 5m --wait

observe() {
  local started=$SECONDS
  while (( SECONDS - started < OBSERVE_SECONDS )); do
    if ! curl -fsS --max-time 5 "${HEALTH}" >/dev/null; then return 1; fi
    sleep 15
  done
}

if ! observe; then
  echo "health check failed after deploy; rolling back to ${PREVIOUS_DIGEST}"
  helm upgrade --install api ./charts/api \
    --kube-context "${CONTEXT}" \
    --set image.digest="${PREVIOUS_DIGEST}" \
    --atomic --timeout 5m --wait
  exit 1
fi

echo "release confirmed healthy for ${OBSERVE_SECONDS}s"
```

Feature flags as the fastest, safest mitigation when one exists:

```typescript
export async function priceBasket(basket: Basket) {
  const newPricing = await flags.isEnabled("pricing-v2", {
    customerId: basket.customerId,
    rolloutPercent: 25,
  });
  return newPricing ? priceBasketV2(basket) : priceBasketV1(basket);
}
```

```yaml
# Mitigation via config change only; no image move required.
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-flags
  namespace: prod
data:
  pricing-v2.json: '{"enabled": false, "rolloutPercent": 0, "killSwitch": true}'
```

## Checklist

- [ ] Rollback triggers defined as objective thresholds before deploy
- [ ] Previous artifact referenced by digest, never a floating tag
- [ ] Time budget set with an escalation path when exceeded
- [ ] All migrations backward compatible for the whole rollback window
- [ ] Destructive migration is a separate deploy, weeks after the code change
- [ ] Automated rollback exists and has been rehearsed, not just written
- [ ] Feature flag available as the fastest mitigation where applicable
- [ ] Every rollback recorded with trigger, elapsed time and outcome

## Anti-patterns

- **Rolling back to `:latest`.** By the time you notice, the tag may point at the broken build or a newer one. Pin the previous digest explicitly and keep it recorded.
- **Migrating and deploying in the same step.** The moment the destructive migration lands, the old code cannot run, so the rollback is no longer available. Separate expand from contract.
- **Deciding when to roll back during the incident.** That conversation costs ten minutes of user impact. Agree the thresholds in advance so the decision is pre-authorised.
- **A rollback runbook that was never executed.** The first real attempt discovers undocumented prerequisites, expired credentials and missing permissions. Rehearse it on a schedule.
- **Treating rollback as a failure to hide.** If rollbacks are hidden, nobody learns the trigger was too loose. Track the rate as a leading indicator of release quality.