---
name: usability-testing
description: Plans and runs task-based usability tests with moderated sessions, think-aloud protocol, defined success metrics, severity-based issue ranking, and SUS scoring. Use when validating a design before build or after release, or when prioritizing a backlog of usability problems.
---

# Usability Testing

**Use when:** you need evidence about whether people can complete a task with a design, or you need to rank a list of usability defects by actual cost to users.
**Do not use when:** you still need to discover what jobs exist, which is `user-research`, or when the question is strictly conformance to a standard, which is `accessibility-audit`.

## Instructions

1. Write tasks as goals, never as instructions. "Find out what the invoice total includes" is a task; "click the Fees tab" is a script that gives away the answer and tests your UI instead of the user's model.
2. Define success criteria before the session: completion, time ceiling, error budget, and whether assistance counts as failure. Without these, results cannot be compared across rounds.
3. Recruit 5 participants per key audience segment from the target population, screened on recent behavior. Five surfaces most usability problems; add participants for edge cases, not for confirmation.
4. Use a think-aloud protocol. Prompt for the last thought, not interpretation: "what are you thinking?" and never "is that intuitive?"
5. Train a neutral facilitator. Do not defend the design, do not react to errors, do not help unless the participant has been stuck for 30 seconds, and log the time you broke the silence.
6. Test the design, not the person. Never write "user error" as a finding; an error means the design did not make the right action obvious at that point.
7. Rank every issue on two axes — impact on task success and frequency across participants — and record the severity as impact multiplied by frequency, not as a gut call.
8. Read results in a fixed order: facts first (counts, times, quotes), interpretation second, recommendations last, and keep them visibly separated.
9. Compare rounds on identical tasks and criteria so improvement is measurable. Changing the task set between rounds destroys the comparison.
10. Stop recruiting when two consecutive sessions produce no new severity-1 or severity-2 issues; report saturation rather than a raw count.

## Patterns

Task script with pre-defined criteria:

```markdown
SESSION  u04  TASK 2 of 4
GOAL     "You suspect the total on invoice #1042 is wrong. Find out what it includes
          and tell me what you would do next."
SETUP    logged in as a bookkeeper; Chrome, 1440x900; start on /invoices
SUCCESS  opens the line-item breakdown and reads the fee line  (time <= 90s)
FAIL     navigates away, contacts support, or cannot state the fee
HELP      a hint may be given once, then logged with timestamp
DO NOT   say "there's a details tab"
```

Think-aloud prompts:

```markdown
SAY        "Tell me what you're thinking as you go."
          "What are you looking for right now?"
          "What did you expect to happen just now?"
          "You paused — what made you pause?"
NEVER     "Is this intuitive?"  "Do you like this?"  "That makes sense, right?"
ASSIST    after 30s of silence: "Would it help if I ...?" then LOG IT
RECOVER   participant asks for help -> "I'll unblock you, but I'm logging that."
```

Severity ranking from real observations:

```markdown
ISSUE 04  Export button hidden behind overflow menu on 1280px
  freq   4/5 participants (u01,u03,u04,u05)          => 0.8
  impact 2 of 3 participants failed Task 3            => 0.67
  SEVERITY = 0.53  -> P1, block release
ISSUE 07  Sort resets to default after page change
  freq   5/5                                              => 1.0
  impact resumption only, no task failure                 => 0.33
  SEVERITY = 0.33  -> P2, fix this sprint
ISSUE 11  Fee label reads "S&H" with no expansion
  freq   2/5                                              => 0.4
  impact confusion, self-recovered in 20s                 => 0.33
  SEVERITY = 0.13  -> P3, backlog
FACTS     3 of 5 exported without finding the control.
QUOTE     "I'd just ask support. Every time."               u04@14:02
INTERPRET control is invisible on the primary success path of Task 3.
ACTION    promote Export to a visible secondary action at 1280px.
```

Readout structure that keeps fact and opinion apart:

```markdown
ROUND   pre-build v1 / post-build v2, same 5 tasks, 5 participants each
FACT    Task 3 completion 2/5 -> 5/5; median time 128s -> 41s
FACT    Severity-1 count 3 -> 0
INTERPRET the inline validation and the sticky primary action carried the gain
UNRESOLVED mobile layout still untested (0 participants on small viewport)
NEXT    re-test Tasks 1 and 5 at 390px before release sign-off
SATURATED after u07 and u08 produced no new P1/P2 findings
```

## Checklist

- [ ] Tasks written as goals, with success, time ceiling, and error budget defined
- [ ] Five participants per segment on recent behavior, run until two clean sessions
- [ ] Think-aloud protocol used; no leading or evaluative questions
- [ ] Assistance given only after 30 seconds of silence, and logged with time
- [ ] Every issue has participant IDs and timestamps, not just a description
- [ ] Severity computed from frequency multiplied by task impact
- [ ] Facts, interpretation, and recommendations presented separately
- [ ] Rounds compared on identical tasks and criteria

## Anti-patterns

**Leading the participant.** "There's a filter on the left — try that." You have just tested your own teaching, and the issue will resurface for every user who was not taught. Fix: log the intervention as a failure, not a facilitation tactic.

**Testing the design you cannot change.** Five sessions on a hi-fi mock whose front end does not behave like the build. Findings do not transfer. Fix: test the prototype, not screenshots; if the prototype fakes a transition, disclose it.

**The satisfied-incumbent sample.** Colleagues who already know the product. They complete everything, and the report says usability is fine. Fix: recruit from the target population, screened on behavior, and never from the team.

**Counting issues without severity.** A report listing 41 findings sorted by vote count. Now engineering has no idea what to build first. Fix: rank by frequency multiplied by task impact and state the cut line for the release.

**Changing the tasks between rounds.** The new round looks better because the tasks got easier. Fix: freeze the task set and success criteria for comparability, and add new tasks only as an explicit additional block.
