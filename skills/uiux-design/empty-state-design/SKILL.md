---
name: empty-state-design
description: Designs distinct empty states for first-run, no-results, cleared, error, and permission-restricted conditions with purposeful next actions and correct semantics. Use when a list or dashboard shows nothing and users do not know what to do next, or when zero-data and no-results are conflated.
---

# Empty State Design

**Use when:** a surface renders nothing and the user has no idea whether they are broken, finished, or expected to act, or when "no results" and "no data yet" share one message.
**Do not use when:** the surface does have content but the hierarchy is wrong, which is `cognitive-load-reduction`.

## Instructions

1. Distinguish the five conditions explicitly and never share copy across them: **first-run** (no data exists), **no-results** (data exists, filters excluded it), **cleared** (the user deleted it), **error** (we could not load it), and **permission-restricted** (it exists but is not yours to see).
2. Answer three questions in every empty state, in this order: what this is, why it is empty, and what to do next. Most implementations answer only the first.
3. Give a primary action in first-run and no-results states, and always make it reachable by keyboard with a visible focus style. An empty state with no action is a dead end.
4. In no-results states, keep the active filters visible and removable, name the conflicting combination, and offer the nearest single-step removal. Never show a bare "No results found."
5. In error states, do not use the empty-state layout at all. Show an error pattern with a retry, so the two are never confused.
6. In permission-restricted states, say who can grant access and how to request it. A lock icon with no path forward is worse than an honest explanation.
7. Include illustration or icon only when it aids recognition, and never at the expense of the action. Keep it small, decorative, and `aria-hidden`.
8. Keep the empty state's vertical rhythm distinct — the same slot size the populated state uses, so the surface does not jump when content arrives.
9. Reserve content space so loading skeleton, empty state, and populated state all occupy the same box. Layout shift on first data arrival reads as a glitch.
10. Track each empty state as a funnel step. A high exit rate on "first-run, zero projects" is a product onboarding defect, not a copy defect.

## Patterns

Five conditions with distinct treatment:

```markdown
CONDITION              HEADLINE                       ACTION                     LAYOUT
first-run              "No projects yet"              [Create a project]         illustrated
no-results (filters)   "No projects match these       [Clear owner filter]       inline chips
                        filters"                      + chips, one-step removal
cleared                "No archived projects"         [View active projects]     quiet, no art
error                  "Couldn't load projects"      [Retry]                    error pattern
permission             "Projects are visible to       [Request access]           explain owner
                        workspace admins only"
NEVER   one shared "Nothing here yet" string across all five.
```

No-results state with removable filter context:

```html
<section class="empty empty--no-results" aria-labelledby="nr-title">
  <svg aria-hidden="true" class="empty__art" viewBox="0 0 96 72"><!-- magnifier --></svg>
  <h2 id="nr-title">No projects match these filters</h2>
  <p>3 filters are active. Removing <strong>Owner: me</strong> returns 12 results.</p>
  <ul class="filter-chips" aria-label="Active filters">
    <li>
      <span>Owner: me</span>
      <a href="/projects?state=active&amp;tag=infra" aria-label="Remove filter Owner: me">×</a>
    </li>
    <li>
      <span>Status: archived</span>
      <a href="/projects?owner=me&amp;tag=infra" aria-label="Remove filter Status: archived">×</a>
    </li>
  </ul>
  <a class="btn" href="/projects">Clear all filters</a>
</section>
```

First-run state with a single primary action:

```html
<section class="empty empty--first-run" aria-labelledby="fr-title">
  <svg aria-hidden="true" class="empty__art" viewBox="0 0 96 72"><!-- folder plus --></svg>
  <h2 id="fr-title">No projects yet</h2>
  <p>Projects group your deployments, environments, and access rules.
     Create one to get started.</p>
  <a class="btn btn--primary" href="/projects/new">Create a project</a>
  <p class="empty__secondary"><a href="/docs/projects">Or read how projects work</a></p>
</section>
```

Stable geometry across all three content states:

```css
.surface { min-block-size: 22rem; display: grid; align-content: start; }
.surface > * { grid-area: 1 / 1; }              /* skeleton, empty, list stack */
.empty   { display: grid; justify-items: center; gap: var(--space-4);
           text-align: center; padding-block: var(--space-12); }
.empty--no-results { text-align: start; justify-items: start; }  /* copy is longer */
.empty__art { inline-size: 6rem; block-size: auto; opacity: 0.9; }
.empty h2 { font-size: var(--step-1); line-height: var(--lh-snug); }
.empty p  { color: var(--text-muted); max-inline-size: 46ch; }
.empty :focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
```

Funnel instrumentation per condition:

```markdown
EVENT              EMPTY_KIND     RATE      EXIT_30S    READ
projects.list      first-run      100% of new accounts     41%   P1
projects.list      no-results      7.2% of sessions        63%   P2
projects.list      cleared         1.1% of sessions        22%   ok
archive.list       permission       0.4% of sessions       12%   P3 copy
NOTE first-run 41% exit in 30s is an activation problem, not a copy problem ->
route to onboarding-flows, keep this skill for the surface treatment.
```

## Checklist

- [ ] Five conditions identified and never sharing one copy string
- [ ] Every empty state answers what it is, why it is empty, and what to do
- [ ] Primary action present, keyboard reachable, with visible focus
- [ ] No-results state keeps filters visible with one-step removal
- [ ] Error condition uses the error pattern, never the empty-state layout
- [ ] Decorative art is `aria-hidden` and does not displace the action
- [ ] Loading, empty, and populated states share the same reserved space
- [ ] Each condition instrumented with an exit rate, an owner, and an activation referral

## Anti-patterns

**One "Nothing here" for every case.** New user, filtered-to-zero, and permission-denied all render "No items." Users cannot tell whether to create, clear a filter, or ask an admin. Fix: five distinct conditions with five distinct treatments.

**The dead-end empty state.** "You have no invoices." No action, no explanation. Fix: state what would appear here and give the one action that creates it.

**Wiping filter context.** A no-results state that hides the active filters, so the user has to remember what they set. Fix: render filters as removable chips, each an actual link with that filter dropped from the query.

**Illustration in place of explanation.** A large friendly graphic and "Nothing to see here!" while the reason is a permission setting. Fix: reserve space for one sentence of cause; the art is optional, the cause is not.

**Layout jump on first data.** The empty state is 200px tall, the populated list is 600px, and everything below slides down when data arrives. Fix: reserve the maximum expected content box and overlay the states within it.
