---
name: user-research
description: Plans and runs user research — semi-structured interviews, contextual observation, survey construction, and diary studies — with consent, sampling, and verbatim note-taking standards. Use when a design assumption is untested, before committing to a roadmap bet, or when you need evidence about what users actually do rather than what they say they want.
---

# User Research

**Use when:** you need observed or reported evidence about real behavior to decide between design directions, or a roadmap bet rests on an assumption nobody has tested.
**Do not use when:** you already have the evidence and need to turn it into a decision artifact — that is `persona-synthesis` or `design-process`.

## Instructions

1. Write the research question as a decision you will make, not a topic. "Which of these three filter models do we build?" beats "what do users think about filtering?"
2. Pick the method from the question type. Past behavior → interview. Task execution → observation. Frequency and distribution → survey. Change over time → diary study. Never use a survey to answer "why".
3. Recruit for behavior, not demographics. Screen on a recent, checkable action ("reconciled invoices in the last 30 days"), not on self-description ("is a finance professional").
4. Write a discussion guide with behavioral, past-tense prompts: "walk me through the last time you did this." Eliminate hypotheticals — "would you use", "do you like", "A or B?" — because they reliably produce agreeable non-answers.
5. Get explicit consent before recording, state that the session is not a test of the participant, and build in a no-explanation exit.
6. Separate three note types in every artifact: what was **done**, what was **said** (verbatim, quoted), and what was **inferred**. Inferences never contaminate quotes.
7. Capture failures and workarounds with the same attention as successes. A manual spreadsheet holding the product together is a design finding, not a user trait.
8. Log time-on-task, errors, and assistance level per task. These become the severity inputs for `usability-testing` prioritization.
9. Synthesize within one session, not across the project. Cluster raw notes, then look for contradictions. Contradictions are the findings.
10. Attach every conclusion to its evidence. A claim with no linked quote or observation does not ship.

## Patterns

Discussion guide, 45 minutes, behavioral-first:

```markdown
1 Warm-up (3)  "Tell me about the last time you <did the job>."
2 Episode walk (15)
   "Start where you started. What did you look at first?"
   "What made you open that?"
   "What made you pause?"
   "What were you expecting to happen?"
3 Triggers + workarounds (10)
   "What made you do it this time instead of last month?"
   "What have you built to work around this? Show me the screen."
4 Comprehension check (10)
   "What did you think this screen was for?"
   "In your own words, what happens when you press Save?"
5 Wrap (5)  "What did I not ask about that I should have?"
```

Note-taking structure with inference quarantined:

```markdown
SESSION u07 / MODERATOR A.R. / 2026-03-11 / laptop / task: reconcile 40 invoices
DID   opened 3 tabs, copied totals into a sheet, re-typed the bank reference
SAID  "I never trust the number until I add the fee myself" (00:18:40)
INFER confidence gap on fees display          <- hypothesis, not evidence
FRICTION 4m12s, 2 errors, 1 self-recovery, 0 assistance
```

Consent script:

```markdown
"I'm researching how people handle <job> — I'm not testing you, and there are no
right answers. This takes about 45 minutes. I would like to record the screen and
audio so I can stay present instead of typing; if you'd rather not, I'll take
written notes. You can pause or stop at any point and you don't have to give a
reason. Any question before we start? And can I record?"
```

Sampling rules of thumb:

```markdown
Interviews   5-7 per distinct segment, not 7 total. Saturate on insight, not count.
Observation  5 participants surfaces most usability problems; add 3-5 for edge cases.
Survey       n >= 385 for +/-5 percentage points at 95% confidence (1.96/sqrt(n)).
Diary        12-20 participants over 2+ weeks to catch non-daily behavior.
```

## Checklist

- [ ] Research question names a decision, not a topic
- [ ] Method matched to question type; no "why" answered by survey
- [ ] Recruitment screened on recent, verifiable behavior
- [ ] Guide uses past-tense prompts with zero hypothetical questions
- [ ] Recording consent captured and an untaped alternative offered
- [ ] Notes split into DID / SAID (verbatim) / INFER
- [ ] Workarounds and failures documented alongside successes
- [ ] Every conclusion linked to a quote, timestamp, or observation

## Anti-patterns

**Asking about the future.** "Would you use a bulk export?" gets a yes from people who will never click it. Real preferences do not predict behavior, and stated preference is the weakest evidence class. Fix: ask for the last concrete instance, then observe the current tool.

**Leading the witness.** Mentioning your solution before the participant describes theirs anchors every later answer. Fix: never name a feature in an interview; probe for the trigger, the workaround, and the vocabulary they already use.

**Participant-as-evaluator.** Asking users to rate designs. Users critique; they do not design. Fix: measure time-on-task, errors, and comprehension, and let the design answer follow the behavior.

**Diary data without separation.** Notes where quotes and guesses are blended. The next round of work inherits the guess as if it were evidence. Fix: three labelled fields per note and an INFER field that is explicitly non-binding.

**Recruiting by job title.** Titles are not behavior, and one account manager interviewed six times is not six data points. Fix: screen on a behavior and report per-segment, never pooled.
