---
name: information-architecture
description: Designs information architecture — content taxonomy, label vocabulary, faceted navigation, URL structure, and search fallbacks — validated with card sorting and tree testing. Use when users cannot find content, when restructuring a site or app navigation, or before adding a new top-level section.
---

# Information Architecture

**Use when:** users report they cannot find things, you are adding or reorganizing navigation sections, or content taxonomy decisions need evidence rather than a sitemap drawn from the org chart.
**Do not use when:** the structure is settled and the problem is a single component's labels, which is `interaction-design` or `form-ux-patterns`.

## Instructions

1. Inventory the content you actually have — every entity, document type, and filter value — before proposing any hierarchy. IA built on assumed content fails at launch.
2. Extract the vocabulary users already use from search logs, support tickets, and interview quotes. Match labels to their words; introduce your internal taxonomy only where it genuinely clarifies.
3. Choose one organizing principle per level and apply it consistently. Mixing facets (by topic, then by team, then by date) at the same depth produces unpredictable positions for the same object.
4. Design facets so they are mutually exclusive where possible and filter-combinable where necessary. Declare which facets are single-select, multi-select, and range, and what happens when selections conflict.
5. Define the URL scheme as part of the architecture, not after it. URLs are a navigation affordance users paste, bookmark, and share; encode stable IDs, never display strings.
6. Run card sorting (open or closed, 15-30 items, 15-20 participants) to validate the top-level taxonomy, then tree testing the resulting structure before building any navigation.
7. Provide a search fallback with synonyms, typo tolerance, and a zero-results state that suggests the nearest categories. Search is the safety net under imperfect IA.
8. Show location at all times: breadcrumbs on deep pages, current-item state in navigation, and a persistent way back. Never leave a user guessing where they are.
9. Test the structure with first-click testing before shipping: give participants a goal and count whether their first click lands in the right branch.
10. Instrument it — search terms with zero results, filter combinations that yield zero, and pages with high exit rates are your IA defect queue. Review monthly.

## Patterns

Closed card-sort instruction sheet:

```markdown
TASK   Sort these 24 cards into as many groups as you like, then name each group.
        You may use "Other". You may leave cards out if they do not fit anywhere.
        There is no correct number of groups.
STEP 1 Read all cards. STEP 2 Create groups. STEP 3 Name groups.
STEP 4 Move any card you placed badly. STEP 5 Tell us what each group means.
MEASURE  Dendrogram + agreement matrix; target RM = sqrt(agreement).
        Open-sort first if any taxonomy assumption is still shaky.
```

Taxonomy with declared principle per level:

```markdown
L1  by job-to-be-done      Documents / Projects / Reports      (principle: what the user came to do)
L2  by object type         /projects/drafts /projects/active  (principle: state, mutually exclusive)
L3  by attribute           filters: owner, date range, tag     (facets, not hierarchy)
NEVER  /projects/by-team/2026   <- mixes team and date at the same depth
```

Faceted filter state contract:

```markdown
GET /reports?type=invoice&state=overdue&owner=7&q=   (stable IDs, filterable query)
Single-select: type.   Multi-select: state, tag.   Range: date, amount.
Conflict rule: selecting state=paid clears state=overdue; multi-select is OR within a facet,
              AND across facets. Chips render as removable, each one a link with ? removed.
Zero-result: keep chips visible, name the conflicting combination, offer the nearest single-step removal.
```

URL scheme rules:

```markdown
GOOD  /invoices/1042/edit        stable ID, action as a segment
BAD   /invoices/Unpaid-Apr-2026  display string; breaks on rename and on i18n
Redirect table required for every legacy URL, 301, and logged for a quarter.
```

## Checklist

- [ ] Content inventory completed from real data before hierarchy design
- [ ] Labels drawn from user vocabulary found in search logs or transcripts
- [ ] One organizing principle per level, with mixed-principle paths explicitly forbidden
- [ ] Facets declare select type, conflict rule, and zero-result behavior
- [ ] URLs encode stable IDs and survive renames and localization
- [ ] Card sort run before the top level is committed
- [ ] Tree test or first-click test run before navigation is built
- [ ] Zero-result search terms and zero-result filter combos instrumented and reviewed

## Anti-patterns

**Org-chart IA.** "Products, then by department, then by cost center." The organization is not the user's mental model, so every search becomes a guess. Fix: derive levels from jobs-to-be-done, and verify with card sorting before building.

**The deep taxonomy.** Eight levels of nested folders because the data model has eight relationships. Users navigate by search, not by hierarchy. Fix: cap navigation depth at three levels and expose the remaining structure as filters.

**Renaming objects into labels.** URLs containing `"Overdue-Apr-2026"` break the moment a record is renamed or the site is translated. Fix: stable IDs in URLs, display strings only in the page.

**No zero-result path.** A search or filter combination that returns nothing renders a blank screen with no recovery. This is where most IA abandons happen. Fix: keep active filters visible as removable chips, name the conflict, and offer the nearest single-step removal.

**Shipping structure untested.** A sitemap approved in review, then built. Fix: tree test the open tree with 5+ participants before a single nav component is coded.
