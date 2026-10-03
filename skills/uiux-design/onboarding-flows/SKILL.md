---
name: onboarding-flows
description: Designs onboarding and activation flows with progressive profiling, checklists, contextual empty states, and time-to-first-value instrumentation. Use when reducing signup drop-off, getting new users to a first success moment, or simplifying a multi-step setup wizard.
---

# Onboarding Flows

**Use when:** users abandon during signup or setup, the product's first success moment is unclear or too far away, or an existing wizard has too many steps.
**Do not use when:** the issue is a single screen's content density, which is `cognitive-load-reduction`, or the blank state on an established account, which is `empty-state-design`.

## Instructions

1. Define the **activation event** first: the one observable action proving the user got value. Everything else in onboarding exists to make that action reachable, and it must be instrumented before you change the flow.
2. Measure the time and the number of steps to activation for the median new account. If it exceeds a couple of sessions, the onboarding problem is product access, not onboarding copy.
3. Apply progressive profiling: ask only what the current step needs, and defer everything else. Every early field you do not need is a drop-off you created.
4. Pre-fill everything the system can infer — SSO email domain, country from locale, timezone, workspace name from the domain. Show the inferred value in an editable field, never a silent assumption.
5. Connect OAuth and SSO where available and make it the default. Password creation before value is the single largest preventable activation loss in B2B onboarding.
6. Ask for permission-based prompts at the moment of relevance ("Connect Slack to get alerts on failed deploys?"), not as an upfront wall of permission requests.
7. Offer an interactive product tour only for genuinely novel interaction models; otherwise use contextual empty states that teach in place, which is cheaper and less ignorable than a modal tour.
8. Use a setup checklist for post-activation configuration, showing 3-5 tasks with real completion states, and make it dismissible with a persistent way back.
9. Let users skip and come back. Forcing setup before value creates abandoned accounts that never reach the setup screen anyway.
10. Instrument drop-off per step, permission grant rates, tour skip rates, and checklist completion, then A/B test one change at a time with a pre-declared sample size.

## Patterns

Activation definition and funnel:

```markdown
ACTIVATION EVENT   first deployment reaches "running" state
WHY THIS ONE       requires setup, produces visible output, correlates with retention
TIME TO ACTIVATE   median 4m12s, p90 1h38m, 41% never activate
BOTTLENECK          step 3 (connect repo)  -> 22% exit; OAuth not offered
FIX                 add GitHub/GitLab OAuth at step 1, defer repo choice to step 3
MEASURE             activation_rate, median_time_to_activate, activation_by_cohort
```

Progressive profiling, one step per need:

```markdown
STEP 1  Identity        SSO (email domain already known)          no manual typing
STEP 2  Workspace       name pre-filled from domain, editable     1 field
STEP 3  Connect source  GitHub OAuth -> repos listed -> pick 1    1 decision
STEP 4  First deploy    choose a template, then run              1 decision
DEFERRED to first use  team size, billing, notification prefs, custom domain
RULE     never ask for a field the current step does not need
```

Permission prompt at the moment of relevance:

```html
<aside class="activation-nudge" aria-labelledby="connect-slack">
  <h2 id="connect-slack">Get alerted when a deploy fails</h2>
  <p>Connect Slack and we'll post build results to <code>#eng-builds</code>.</p>
  <button type="button" class="btn" data-connect="slack">Connect Slack</button>
  <button type="button" class="btn btn--quiet">Not now</button>
</aside>
```

Dismissible setup checklist with real states:

```html
<section aria-labelledby="setup-h">
  <h2 id="setup-h">Finish setting up <span aria-live="polite">3 of 5 done</span></h2>
  <ul>
    <li><label><input type="checkbox" checked disabled> Connect a repository</label></li>
    <li><label><input type="checkbox"> Add a teammate</label></li>
    <li><label><input type="checkbox"> Set an alert channel</label></li>
    <li><label><input type="checkbox"> Import existing projects</label></li>
    <li><label><input type="checkbox"> Invite your team</label></li>
  </ul>
  <button type="button" class="btn--quiet" data-dismiss-setup>Dismiss</button>
</section>
```

Experiment record:

```markdown
CHANGE      add GitHub OAuth at step 1, remove password field
HYPOTHESIS  passwordless signup raises activation by >=5pt for team accounts
SAMPLE      pre-declared n=1200 accounts, 14 days, two-arm
RESULT      47.2% -> 53.8% activation (+6.6pt), p90 time-to-activate -38%
DECISION    ship; side effect: support tickets about "where is my password" +3
MITIGATION  add a line in the confirmation email explaining SSO-only access
```

## Checklist

- [ ] Activation event defined and instrumented, with median and p90 time-to-activation baselined
- [ ] Only step-relevant fields asked; the rest explicitly deferred
- [ ] Inferred values pre-filled and visible as editable, not silent
- [ ] SSO/OAuth offered and made the default where available
- [ ] Permission prompts placed at point of relevance, not as an upfront wall
- [ ] Skipping allowed, with a persistent path back to incomplete setup
- [ ] Setup checklist limited to 3-5 tasks with real completion states
- [ ] One change tested at a time with a pre-declared sample size

## Anti-patterns

**The five-step wizard before any value.** Account, team, preferences, billing, then a tour. Most users reach step two. Fix: shortest path to the activation event; collect everything else lazily.

**Product tour modals.** A sequence of tooltips teaching features nobody needs yet. Nearly everyone dismisses it, and it teaches the interface instead of the outcome. Fix: contextual empty states that teach the one action in place, and skip the tour entirely for familiar patterns.

**Empty optional fields.** "Phone number (required)" for an account with no phone features. Fix: audit every field against a real downstream use and delete the ones without one.

**Forced setup.** Setup cannot be skipped, so users enter garbage to get past it, and the data is worthless later. Fix: allow skip, remember the state, and re-prompt contextually where the missing field actually matters.

**Chasing signups over activation.** Optimizing registration completion while the median new account never reaches a first successful action. Fix: hold registration rate flat and optimize activation rate; the first number is cheap and the second is the product working.