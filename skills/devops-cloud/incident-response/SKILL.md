---
name: incident-response
description: Runs production incident response with severity definitions, incident commander roles, runbook-driven mitigation, stakeholder comms and blameless postmortems. Use when responding to an outage, defining an on-call process, or writing a post-incident review.
---

# Incident Response

**Use when:** Responding to a live production incident, defining an on-call or escalation process, or writing a post-incident review.
**Do not use when:** You are designing the reliability targets that drive escalation thresholds; use `sre-slos` for that first.

## Instructions

1. Classify severity before doing anything else, using observable user impact rather than the technical cause. Declare it out loud, on a channel everyone can read, and re-declare when it changes.
2. Assign roles explicitly: incident commander (decides and delegates, does not debug), operations lead (executes mitigation), communications lead (posts updates). One person, one job.
3. Mitigate first, diagnose second. Rolling back, disabling a flag or shedding load beats understanding the root cause while users are affected.
4. Prefer reversible mitigations. A rollback you can undo in five minutes is strictly better than a forward fix you have never run before under time pressure.
5. Keep a running timeline in the incident channel: time, observation, action, owner. Reconstructing this from memory afterwards produces a postmortem that is wrong.
6. Post a comms update on a fixed cadence even when there is nothing new, and state what is known, what is being tried, and the next update time. Silence generates escalation.
7. Page the owning team through the same routing the alert uses, and record acknowledgement time so you can see whether the paging policy works.
8. Resolve only after user impact has ended and metrics confirm recovery. Confirm with the same dashboard that detected the incident, not by spot-checking one URL.
9. Within a few working days, hold a blameless postmortem focused on contributing system conditions, with actions that have owners and dates.
10. Track remediation to completion in the normal engineering backlog with due dates. A postmortem action list that lives only in a document is never finished.

## Patterns

A severity matrix that keys off user impact rather than technical symptoms:

```yaml
severity:
  - level: SEV1
    name: Critical
    definition: Complete outage or data loss/corruption affecting all users
    response_time: 5m
    update_cadence: 15m
    stakeholders: [exec, support-lead, comms]
  - level: SEV2
    name: Major
    definition: >20% of requests failing, or a core workflow fully unavailable
    response_time: 10m
    update_cadence: 30m
    stakeholders: [support-lead]
  - level: SEV3
    name: Minor
    definition: Degraded performance or a non-core feature broken, <5% impact
    response_time: 1h
    update_cadence: 1h
    stakeholders: []
  - level: SEV4
    name: Low
    definition: Cosmetic issue with no workaround impact
    response_time: next business day
    update_cadence: none
    stakeholders: []
```

An incident channel template with pinned fields and a running timeline:

```text
============================================================
INCIDENT: SEV2 — checkout 5xx at 34% (INC-2026-0142)
STATUS:  MITIGATING
COMMANDER: @dana   OPS: @sam   COMMS: @lee
STARTED:  2026-03-04T14:02Z   IMPACT:  Checkout failures, EU + US
============================================================

14:02Z  ALERT  ApiErrorBudgetFastBurn fired (pager)        [auto]
14:05Z  ACK    @dana acknowledges, declares SEV2            [dana]
14:06Z  NOTE   p99 latency 8s, DB connection pool exhausted [sam]
14:09Z  ACTION Rolling back api to digest sha256:8f14...     [sam]
14:11Z  NOTE   Rollback complete on 8/12 tasks               [sam]
14:13Z  COMMS  Update #1 posted to status page              [lee]
14:19Z  NOTE   Error rate falling: 34% -> 6%                 [sam]
14:27Z  NOTE   Error rate 0.2%, stable for 10m              [sam]
14:40Z  RESOLVED Confirmed on SLO dashboard                  [dana]

--- COMMS UPDATE #1 (14:13Z) ---
Status: Investigating
We are aware of elevated error rates affecting checkout
starting 14:02 UTC. Our team has applied a mitigation and is
monitoring recovery. Next update by 14:43 UTC.
Incident: INC-2026-0142
--------------------------------
```

A rollback-first runbook, structured as detect/mitigate/verify:

```yaml
runbook: api-checkout-5xx
trigger: ApiErrorBudgetFastBurn or ApiHighErrorRate
severity_default: SEV2

steps:
  - id: confirm
    action: Check the http_server_request_error_ratio panel for the last 15m
    verify: Ratio is elevated and correlates with the alert window
  - id: recent-changes
    action: Check deploy history for the api service in the last 60 minutes
    verify: A change exists, or record that none does in the timeline
  - id: mitigate
    action: Roll back to the previous known-good digest
    command: |
      helm upgrade api ./charts/api \
        --set image.digest="$PREVIOUS_DIGEST" --atomic --timeout 5m
    reversible: true
  - id: verify
    action: Watch the error ratio for 10 minutes
    verify: Ratio below 0.1% for 10 consecutive minutes
  - id: escalate
    action: If rollback did not reduce errors within 15m, page database on-call
    verify: On-call acknowledges

unknown_territory:
  - Check connection pool saturation on the db panel
  - If the database is the bottleneck, enable the bulk-order feature flag off
```

## Checklist

- [ ] Severity declared from user impact and pinned in the channel
- [ ] Commander, ops and comms roles named; commander is not debugging
- [ ] Mitigation attempted before root-cause analysis
- [ ] Reversible actions preferred; forward fixes require a second approver
- [ ] Timeline maintained with time, observation, action and owner
- [ ] Comms updates on fixed cadence, including "no change" updates
- [ ] Recovery confirmed on the dashboard that detected the incident
- [ ] Blameless postmortem scheduled with owned, dated actions

## Anti-patterns

- **The incident commander also debugging.** The moment they start reading stack traces they stop delegating and coordinating, and the team loses its decision-maker. Hand debugging to the operations lead.
- **Debugging before mitigating.** Root cause is genuinely not required to stop user impact. Roll back, then investigate; the timeline matters more than the theory.
- **Silent incident channels.** People escalate to leadership because they cannot tell whether anyone is working on it. Post on the agreed cadence even when the update is "no change".
- **Blameless postmortems in name only.** If the writeup names an individual as the cause, engineers stop reporting near-misses and the system stops learning. Describe system conditions and missing safeguards.
- **A postmortem with unowned actions.** "We should add better monitoring" with no owner and no date is a wish. Every action needs a team, a person, and a tracked due date.