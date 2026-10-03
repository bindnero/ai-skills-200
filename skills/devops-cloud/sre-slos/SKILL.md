---
name: sre-slos
description: Defines service-level indicators and objectives as code, derives error budgets and burn-rate policies, and wires budget exhaustion into release decisions. Use when writing an SLO, agreeing a reliability target, or connecting error budgets to deploy gates.
---

# SRE SLOs

**Use when:** Defining SLIs and SLOs for a service, setting a reliability target with stakeholders, or wiring error budgets into release and staffing decisions.
**Do not use when:** The indicator is already defined and you need the alert expressions; use `metrics-and-alerting` for the Prometheus rules.

## Instructions

1. Start from the user journey, not from the infrastructure. Write the SLI in terms of what a user is trying to do: "get a response for a valid request within 300 ms".
2. Choose SLI types deliberately: availability (good / valid events), latency (proportion under a threshold), correctness, and freshness for data pipelines.
3. Write the SLI as a query over real production traffic only. Synthetic checks belong in separate SLOs so they do not mask real user experience.
4. Set the objective from a product conversation, not from current performance. Use the last three months of data to inform the discussion, then commit to a number with an explicit review date.
5. Choose 99.9%, not 99.99%, unless the business genuinely needs it. Each additional nine costs roughly an order of magnitude more in engineering and redundancy.
6. Express the error budget as a quantity of allowed bad events: at 99.9% on a billion-request day you may fail a million requests. This makes trade-offs concrete.
7. Define multi-window multi-burn-rate alerting so fast burns page and slow burns create work, calibrated to the budget window.
8. Publish SLO definitions in version control as validated code, so they are reviewable, diffable and testable in CI.
9. Set an explicit policy: what happens at 50 percent budget consumed (freeze risky changes), 100 percent (feature freeze), and after exhaustion (reliability work resumes before features).
10. Report budget burn to product and engineering on a fixed cadence, and revisit objectives quarterly rather than renegotiating during an incident.

## Patterns

SLI and SLO definitions as validated code, with a burn-rate alert policy:

```yaml
apiVersion: sre.acme.com/v1alpha1
kind: ServiceLevelObjective
metadata:
  name: api-availability
  labels: { service: api, team: platform }
spec:
  description: Successful, fast responses to valid HTTP requests over a rolling 28 days.
  sli:
    type: availability
    window: 28d
    good:
      expr: |
        sum by (service) (increase(http_server_requests_total{service="api"}[28d]))
        - sum by (service) (increase(http_server_requests_total{service="api",status_class=~"5.."}[28d]))
    total:
      expr: sum by (service) (increase(http_server_requests_total{service="api"}[28d]))
    exclude:
      - expr: http_server_requests_total{service="api",reason="client_cancelled"}
  objective:
    target: 0.999
    window: 28d
  alertPolicy:
    fastBurn:
      - { longWindow: 1h, shortWindow: 5m, burnRate: 14.4, factor: 2, severity: page }
      - { longWindow: 6h, shortWindow: 30m, burnRate: 6, factor: 3, severity: ticket }
    slowBurn:
      - { longWindow: 3d, shortWindow: 6h, burnRate: 1, factor: 5, severity: ticket }
  budgetPolicy:
    on50percentConsumed: freeze_risky_changes
    on100percentConsumed: feature_freeze
    onBudgetRestored: resume_normal_delivery
  reviewDate: 2026-06-01
```

Budget arithmetic that makes the reliability trade-off concrete:

```text
Daily requests ..................... 1,000,000
Availability objective .............. 99.9%  (28-day rolling)
Allowed bad events per 28 days ...... 2,800,000 / 28 = 100,000/day
Allowed bad events per hour ......... ~4,166/hour

Burn rate meaning (28d window):
  14.4x => budget gone in ~1.9 days   -> page
   6.0x => budget gone in ~4.7 days   -> ticket, respond now
   3.0x => budget gone in ~9.3 days   -> ticket
   1.0x => budget gone in 28 days     -> business as usual
```

Enforcing the budget in CI before a release proceeds:

```yaml
- name: Check error budget
  run: |
    BUDGET=$(curl -fsS "https://slo-api.acme.com/v1/slos/api-availability/budget")
    BURN=$(jq -r '.fastestWindow.burnRate' <<< "$BUDGET")
    REMAINING=$(jq -r '.remainingRatio' <<< "$BUDGET")
    echo "burn rate: ${BURN}, budget remaining: ${REMAINING}"

    if [ "${BURN}" -gt 2 ]; then
      echo "::error::Error budget burning ${BURN}x. Release gate closed."
      exit 1
    fi
    if (( $(echo "${REMAINING} < 0.5" | bc -l) )); then
      echo "::warning::Under 50% budget remaining. Non-risky changes only."
    fi
```

## Checklist

- [ ] SLI written from the user journey, in plain language, not infrastructure terms
- [ ] SLI computed from real traffic; synthetic checks kept in a separate SLO
- [ ] Objective agreed with product and recorded with a review date
- [ ] 28-day window used with a multi-window multi-burn-rate alert policy
- [ ] Allowed bad events per day calculated and communicated
- [ ] SLO definitions stored as validated code in version control
- [ ] Budget policy defines freeze thresholds and the restoration condition
- [ ] Release pipeline queries budget state and gates on burn rate

## Anti-patterns

- **Setting the objective from current performance.** You end up promising exactly what the system happens to do today, which is neither reliable nor a target. Use the data as evidence in a conversation about user needs.
- **Promising 99.99% because it looks aspirational.** It means five minutes of downtime a month and demands redundancy, on-call and engineering capacity nobody has budgeted. Choose the number you can sustain.
- **SLO on infrastructure health.** "The API is up because instances are healthy" measures the wrong thing. Measure the user-visible outcome of the HTTP call.
- **No error-budget policy.** Tracking the budget without deciding what it controls turns it into a dashboard nobody acts on. Define the freeze thresholds and the release gate up front.
- **Changing the SLI query mid-window.** The historical record becomes incomparable and any breach or achievement is meaningless. Version the query and record an explicit SLI record explaining the change.