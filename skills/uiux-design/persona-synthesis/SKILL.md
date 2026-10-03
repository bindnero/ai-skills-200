---
name: persona-synthesis
description: Synthesizes raw research notes into jobs-to-be-done statements, affinity clusters, and evidence-backed personas with prioritized needs and behaviors instead of demographic fiction. Use when interview notes must become something a team can design against, or when existing personas have no traceable research behind them.
---

# Persona Synthesis

**Use when:** you have raw notes, transcripts, or support logs and need to turn them into a small set of design targets with defensible priorities.
**Do not use when:** you still need to collect the evidence, which is `user-research`, or when the output is a navigation structure rather than a human model.

## Instructions

1. Segment by job and context, not by demographics. Age, title, and company size rarely predict behavior; the trigger, the goal, and the constraint do.
2. Extract jobs-to-be-done statements verbatim from notes using the formula "When <situation>, I want to <motivation>, so I can <expected outcome>." Keep the participant's own nouns — those become your UI labels.
3. Affinity-cluster the jobs into 3-5 groups. Resist going past 5; past that, personas stop guiding decisions and start decorating decks.
4. Build an evidence ledger for each cluster: participant count, session IDs, timestamps, and the strongest quotes. Any persona claim without a ledger row is a guess.
5. Write each persona around goals, context, blockers, and current workarounds. Drop name, age, and photo unless the org genuinely needs them for workshop rapport; a stock photo actively implies a person who does not exist.
6. Rank each persona's needs by frequency, intensity, and business impact — a three-factor matrix, not intuition. Frequency alone over-ranks trivia.
7. Keep one primary persona per screen or flow and name it in the design file. Designs without a named target are redesigned for the loudest stakeholder.
8. Track confidence explicitly and date it. Personas expire; tag each one with the study that produced it and the last date it was checked against new evidence.
9. Review personas against support tickets and funnel data quarterly. If real users cluster differently, the persona changed — update it rather than defending it.
10. Write an explicit anti-persona for the flow's edge cases: the one-time admin doing a one-off task under time pressure, and the user with assistive technology. Designs built only for the primary persona fail these users.

## Patterns

Job statement extracted from notes, participant's own words preserved:

```markdown
JOB  When the month closes and I get 60 invoices (u03, u07, u11)
     I want to match each one to a bank line
     so I can close the books by Friday.

FORCED FUNCTIONALITY  "match by amount and date"          (u03)
FORCED EMOTIONS       "feel like nothing is hiding"       (u11)
CURRENT WORKAROUND   screenshot + spreadsheet + Ctrl-F     (u03, u07)
HIRING CRITERIA      <not hiring for emotion; see risks>   (u07)
```

Affinity cluster → persona mapping with evidence ledger:

```markdown
CLUSTER A "Close the books"      jobs 3 | participants 7/11 | confidence HIGH
  ledger: u03@14:02, u07@22:10, u11@09:44, u14@31:55  (session index)
CLUSTER B "Chase a late payer"   jobs 2 | participants 4/11 | confidence MED
  ledger: u02@11:30, u05@18:02, u09@27:41
CLUSTER C "Prove what happened"  jobs 2 | participants 5/11 | confidence HIGH
  ledger: u01@08:15, u04@12:44, u06@30:10, u08@19:22, u10@14:02
```

Persona card, evidence-first:

```markdown
## Rina — Month-End Reconciler        (confidence HIGH, evidence 2026-03-11)

CONTEXT   Closes books monthly, ~60 invoices, 4 bank lines/day, mostly desktop.
GOALS     Finish in under 2 hours. Nothing surprises her.
BLOCKERS  Ambiguous partial matches; no way to see what was skipped.
CURRENT   Spreadsheet with screenshot columns.
NEEDS     1. Bulk match + unmatched tray          freq 7/7  impact HIGH
          2. Explain why a row did not match       freq 5/7  impact HIGH
          3. Export for the accountant            freq 6/7  impact MED
QUOTES    "I need to trust that nothing fell through"      u07@22:10
          "The worst part is the ones I can't explain."   u11@09:44
NOT TRUE  Does not care about dashboards; skipped every analytics question.
```

## Checklist

- [ ] Segmentation derived from jobs and context, not demographics
- [ ] Every persona carries a jobs-to-be-done statement in the participant's own words
- [ ] Three to five personas maximum
- [ ] Evidence ledger with session IDs and timestamps for every claim
- [ ] Needs ranked by frequency, intensity, and impact
- [ ] Workarounds documented, with the workaround treated as the real competitor
- [ ] Confidence level and evidence date on every persona
- [ ] Each designed screen names its primary persona

## Anti-patterns

**Demographic fiction.** "Sarah, 34, marketing manager, loves Instagram." The traits are unfalsifiable and generate zero design decisions. Fix: replace each attribute with a context, a trigger, or a constraint that changes the interface.

**Persona laundry list.** Twelve personas, one per survey segment, so nobody can be prioritized. Fix: cluster by job, cap at five, and force a "which screen is this for" answer for each.

**Untraceable personas.** Invented in a workshop with no research behind them. They quietly become product requirements. Fix: no ledger row, no persona; write the assumption down as an explicit hypothesis with a scheduled test.

**Ranking by frequency alone.** The most-mentioned need is often the least costly to ignore. Fix: score frequency × intensity × impact and show the matrix, not the winner.

**Never expiring personas.** Built once in 2021, still cited in 2026. Users and workflows have moved. Fix: date-stamp the evidence and re-check against support and funnel data on a fixed cadence.
