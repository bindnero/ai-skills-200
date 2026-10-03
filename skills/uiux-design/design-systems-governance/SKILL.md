---
name: design-systems-governance
description: Governs the design system lifecycle across three token tiers, component contribution and deprecation policy, semantic versioning, documentation, and adoption metrics. Use when standing up or scaling a shared design system, deciding whether something gets promoted to a component, or when adoption has stalled.
---

# Design Systems Governance

**Use when:** you are building or scaling a design system, deciding what earns promotion into the shared library, or diagnosing a system that exists but is not being used.
**Do not use when:** you are choosing specific color or spacing values inside one product — use `color-systems` or `spacing-and-grid`.

## Instructions

1. Structure tokens in three tiers with a single direction of dependency: **primitive** (raw values) → **semantic** (purpose) → **component** (slots). Components must never reference primitives directly.
2. Keep primitives context-free and small (`--blue-600`, `--space-4`). Semantics carry the meaning (`--color-text-danger`, `--space-section-gap`) so themes can be swapped without touching components.
3. Set the promotion bar explicitly. Something becomes a component only when it recurs three or more times, has a stable use case, and has an owner willing to maintain it. Otherwise it is a local pattern, and that is fine.
4. Write a contribution path that is cheap: a template, a review checklist, a playground with copy and all states, and a named decision-maker with a response-time SLA.
5. Version the system semantically. Breaking change to a token name or a component's public API is a major. New optional prop or new token is a minor. Visual-only correction is a patch.
6. Publish a deprecation path with codemods, not just warnings. Announce, measure adoption of the old API, and remove it on a date. A deprecation nobody migrates becomes permanent dead weight.
7. Instrument adoption per team: percentage of shared components over local ones, hardcoded hex values, duplicate token overrides, and overrides of system defaults. These numbers are the health report.
8. Make overrides deliberate and visible. Support them, but require a comment or lint rule so overrides are reviewed rather than silently scattered.
9. Document decisions, not just usage. Every token and component needs a "when not to use" section; without it, misuse is the default.
10. Run a quarterly prune: delete unused tokens, merge near-duplicates, and re-audit contrast after any token change. Systems grow only unless someone removes things.

## Patterns

Three-tier token architecture, direction of dependency only downward:

```json
{
  "primitive": {
    "color": { "blue-600": { "value": "oklch(0.55 0.19 256)" } },
    "space":  { "4": { "value": "8px" } }
  },
  "semantic": {
    "color": {
      "action-primary": {
        "value": "{color.blue-600}",
        "description": "Primary action fill. Fails on white at 3.9:1 - not used for text."
      },
      "text-danger": { "value": "{color.red-700}" }
    },
    "space": { "section-gap": { "value": "{space.8}" } }
  },
  "component": {
    "button-primary": {
      "bg": "{semantic.color.action-primary}",
      "fg": "{semantic.color.text-on-action}",
      "pad-inline": "{semantic.space.4}"
    }
  }
}
```

Promotion decision record:

```markdown
CANDIDATE  date-range-picker
EVIDENCE  4 product surfaces, 2 vendors, ~380 instances; last built 3x by hand
RISKS     date math and timezone handling; heavy maintenance
OWNER     platform-ui, 2 reviewers, quarterly review
DECISION  PROMOTE as headless primitive + styled <DateRangeField>
VERSION   4.2.0 minor (new component, no existing API changed)
REVIEWS   contribution p95 6 days (SLA 10)
```

Deprecation record:

```markdown
DEPRECATED   Button variant="ghost"        @ui/core 3.4.0 -> 5.0.0
REPLACED BY  variant="tertiary" (visually identical since 3.4.1)
WARNING      console.warn + lint rule ui/no-ghost-button (warn -> error in 60 days)
CODEMOD      npx @ui/codemods ghost-button tertiary
ADOPTION     last measured 71% (2026-03-11), target 0% by 2026-06-01
OWNER        platform-ui
```

Adoption metrics, reviewed monthly:

```markdown
shared_component_usage      78%  target 90%   (per team, not pooled)
hardcoded_hex_in_repo      212  target <25    (rg '#[0-9a-f]{6}' src/)
token_override_lines        340  target <120   (grep var(-- overrides)
tokens_total / unused        410 / 96        prune the 96, target unused <5%
contrast_failures_after_prune -  target 0
```

## Checklist

- [ ] Three token tiers with dependencies flowing only downward
- [ ] Components reference no primitive tokens directly
- [ ] Promotion bar written down: three uses, stable use case, named owner
- [ ] Semantic versioning policy applied and documented
- [ ] Deprecations ship with codemods, an announcement, and a removal date
- [ ] Contribution template and review SLA exist for the whole team
- [ ] Adoption metrics tracked per team, including hardcoded-value count
- [ ] Every component documents when not to use it, and the quarterly prune removed unused tokens

## Anti-patterns

**Primitive soup.** Components hardcode `#2563eb` and `8px`. The system cannot be re-themed or audited, and nobody knows what is in use. Fix: forbid primitive references at the component layer via lint; only semantic names ship.

**Committee by committee.** Every proposed component waits on a design-systems board for months, so teams route around the system entirely. Fix: a published threshold plus a self-serve path — anything inside the threshold merges on a scheduled review day with a named approver.

**Deprecation without migration.** Announcing a removal with no codemod. Nothing migrates, the old API lives forever, and the team carries two paths. Fix: a codemod ships with the deprecation in the same release.

**Documentation as a mirror.** Docs restate the props table. They never say when not to use the component, so misuse becomes the norm. Fix: every entry gets a "when not to use" section with a named alternative.

**Growth without pruning.** Token count climbs every quarter while adoption stalls. Fix: schedule the prune, delete unused tokens, and re-audit contrast on every token change.
