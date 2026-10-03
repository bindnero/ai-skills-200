---
name: design-process
description: Runs the double-diamond design process through discover, define, develop, and deliver with named phase gates, required deliverables, and a critique rubric at each gate. Use when starting a new product or feature, deciding what to build next, or when work keeps shipping with no validation step.
---

# Design Process

**Use when:** you are starting net-new product or feature work and need research, definition, exploration, and delivery sequenced behind explicit go/no-go gates.
**Do not use when:** you are polishing something already shipped — token cleanup, spacing, or component states belong to `design-systems-governance`, `spacing-and-grid`, or `interaction-design`.

## Instructions

1. Write a problem statement first, naming user, job, and evidence. Ban solution nouns from it. If you cannot fill all three slots, go to `user-research` before designing anything.
2. Inventory constraints before ideation: deadline, engineering capacity, legal limits, existing design-system coverage, and data you can actually access. Ideation inside an invented constraint set is waste.
3. Discover with at least three touchpoints — interviews, contextual observation, and behavioral data. Triangulating three methods beats depth in one.
4. Synthesize into a small set of **needs** and **tensions**. A need is "needs to compare invoices without opening five tabs", never "needs a comparison view".
5. Define the success metric and the anti-metric together. Anti-metrics (support tickets about the same confusion, time-on-task regression) catch features that win on the dashboard and lose in the field.
6. Pass a gate only when the named deliverable exists and its exit test is met. Vibes and seniority do not clear gates.
7. Develop at three fidelities in order: greyscale boxes-and-lines, then real copy and real data states, then visual design. Structural defects are cheapest to find before polish.
8. Test the core flow at least twice with `usability-testing` — once before build, once after. Second-round findings route back into the design, not into a "known issues" backlog.
9. Deliver the full state surface: loading, empty, error, partial, success, permission-denied. Shipping only the happy path is a process failure.
10. Log gate decisions in an ADR-style record so the reasoning outlives the team that made it.

## Patterns

Phase gates with entry criteria, deliverable, and exit test:

```markdown
| Gate | Entry | Required deliverable | Exit test |
| --- | --- | --- | --- |
| 0 Frame | Sponsor named | Problem statement + constraint inventory | User and job named; zero solution nouns |
| 1 Discover | Gate 0 | 3+ touchpoints, raw notes attached | At least one finding contradicts the original assumption |
| 2 Define | Gate 1 | Needs, tensions, success + anti metric, flows | Metrics instrumented before build starts |
| 3 Develop | Gate 2 | Lo-fi, mid-fi, hi-fi + full state surface | 2 moderated tests on core flow, all issues triaged |
| 4 Deliver | Gate 3 | Build, QA, instrumentation | Post-launch anti-metric check scheduled with a date |
```

Critique rubric — score 0/1/2 per line; any 0 is a hard stop, below 11/16 returns to the owning phase:

```markdown
1 Problem evidence ......... findings triangulated across >=3 methods
2 Flow coverage ............ every branch has a defined error and cancel path
3 State surface ............ loading/empty/partial/error/denied/success all designed
4 Content .................. real copy, real names, real data lengths
5 Accessibility ............ keyboard path and screen reader path traced end to end
6 System fit ............... uses existing tokens; each new pattern justified in writing
7 Measurement .............. success and anti metric instrumented
8 Feasibility .............. costs, risks, and tradeoffs stated plainly
```

Brief skeleton:

```markdown
PROBLEM:     <user> needs to <job> because <evidence>, but today <barrier>.
CONSTRAINTS: <deadline | stack | compliance | data access>
NON-GOALS:   <what this deliberately will not do>
SUCCESS:     <metric, baseline, target>
ANTI-METRIC: <what must not degrade>
CORE FLOWS:  <flow 1> | <flow 2>
STATES:      loading / empty / partial / error / denied / success
RISKS:       <risk> — <mitigation> — <owner>
```

## Checklist

- [ ] Problem statement contains a user, a job, and evidence, and no solution nouns
- [ ] Constraint inventory written before any ideation
- [ ] Three research methods triangulated; raw notes attached, not just conclusions
- [ ] Success metric and anti-metric both defined and instrumented pre-build
- [ ] Three fidelities in sequence; lo-fi tested before visual polish
- [ ] All six state conditions designed for every core flow
- [ ] Critique rubric scored at each gate, with returns logged
- [ ] Gate decisions recorded with dates and owners

## Anti-patterns

**Skipping discovery.** Jumping to lo-fi because "we know the user" produces confident solutions to problems nobody confirmed. Fix: state the assumption as a falsifiable claim and schedule the cheapest test that could kill it.

**Metric monoculture.** Optimizing one success metric while shipping a flow users abandon. Fix: pair every success metric with an anti-metric and check both at the same review.

**Fidelity jump.** Going from sketch to polished mockup in one pass. This hides structural problems under visual quality, so the real defects surface after build. Fix: render every wireframe in pure greyscale; any colour decision belongs to a later gate.

**Deliverable theatre.** Producing decks nobody reads instead of decisions. Fix: the artifact of each gate is a decision plus a named owner, not a slide.

**Happy-path delivery.** Building only the screenshot flow. Loading, empty, partial, and denied states get discovered in production. Fix: treat the state surface as an explicit gate-3 deliverable and refuse the build without it.
