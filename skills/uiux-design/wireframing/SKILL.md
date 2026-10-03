---
name: wireframing
description: Produces low- and mid-fidelity wireframes as greyscale structural artifacts with an annotation set, then advances fidelity deliberately once structure is validated. Use when you need to test layout, hierarchy, and flow cheaply before visual design, or to document a screen before build handoff.
---

# Wireframing

**Use when:** you need to settle structure, hierarchy, and flow before spending effort on visual design, or you need a buildable layout spec.
**Do not use when:** the layout is stable and you are defining component states and transitions — that is `interaction-design`.

## Instructions

1. Pick fidelity to answer one question: structure and flow (low), content and hierarchy (mid), or look and feel (high). Announce the question in the file name.
2. Draw every wireframe in pure greyscale with system fonts. Colour in a wireframe invites aesthetic debate that cannot yet be settled and hides contrast failures.
3. Use real content lengths, not "Lorem ipsum". A 40-character label and a 6-character label produce completely different layouts, and the failure only appears at build.
4. Fix the grid before the boxes. Decide column count, gutters, and content max-width first, then place elements on that grid — otherwise every screen invents its own spacing.
5. Annotate every non-obvious region with: purpose, content source, state defaults, and behavior on interaction. An unannotated wireframe is a picture, not a spec.
6. Include the state surface inline — annotate what loading, empty, error, and overflow look like, even if you draw only the populated case.
7. Wire the flow as a navigable prototype or a numbered screen sequence. Structural validity cannot be judged from static pages.
8. Test at the smallest supported viewport first, in greyscale, before testing at desktop. If it only works wide, you have an IA problem, not a layout one.
9. Run `usability-testing` on the wireframe, not the polished mock. Findings at this stage are structural and cheap to act on.
10. Version wireframes alongside the written flows and keep them in the repo as build references; do not let them drift into decorative artifacts after build.

## Patterns

Low-fidelity structure-first wireframe with annotations:

```markdown
+--------------------------------------------------------------+
| LOGO        [Search__________]      Help  [Account v]        |  01 global header
|                                     auth state: signed in    |     search -> /search?q=
+--------------------------------------------------------------+
| Home > Reports > Invoice summary        breadcrumb, all links  |  02 orientation
+-------------------------------+------------------------------+
| FILTERS                        | INVOICE SUMMARY              |  03 facets
| [Type      v] [State     v]    |  [2026-01-01] -> [2026-03-31]|  04 range, 2 presets
| [Owner     v] [Tag chips  +]   |  $412,880        [Export]     |  05 export -> async
| active: type=invoice state=overdue                            |
| (chips removable, zero-res msg)| +--------+--------+--------+ |  06 stat row
|                               | |Overdue | Pending|  Paid  | |     each -> filtered view
+-------------------------------+---+--------+--------+--------+
| INVOICES (n=142)                              [Sort v] [v]  |  07 sortable header
| +----------------------------------------------------------+|  08 default sort: due asc
| | #1042  Northwind    $1,240  Overdue  Due 2026-02-01  [>] |||  09 row -> detail drawer
| | #1043  Contoso        $  890  Pending  Due 2026-02-04  [>] ||| 10 destructive? no
| | #1044  Fabrikam      $2,010  Paid     Due 2026-02-04  [>] ||| 11 bulk select: no
| +----------------------------------------------------------+| 12 overflow: 2-line title
| [Prev] 1 2 3 [Next]                                          | 13 sticky pager, 25/page
+--------------------------------------------------------------+
| toast region (role=status)             errors -> live region   | 14 announcer
+--------------------------------------------------------------+
```

Annotation format attached to each numbered region:

```markdown
07  RESULT HEADER
    PURPOSE   show count + sort state; anchors the list
    CONTENT   count is live-updating; sort is a <select>, not a menu
    DEFAULTS  sort=due_date asc, page=1, 25 per page
    STATES    loading -> 5 skeleton rows, aria-busy on <tbody>
              empty   -> see 08b zero-results copy, filters kept visible
              error   -> inline alert, list preserved, [Retry]
    BEHAVIOUR row click -> /invoices/{id}; selection via checkbox only
    DATA     GET /invoices?type=&state=&page=  (stable IDs in links)
```

Mid-fidelity upgrade, still greyscale, real copy:

```markdown
+--------------------------------------------------------------+
| 9 invoices need attention                                   |  headline = count,
| Three are overdue by more than 30 days. [Review them]       |  not "Invoices"
+--------------------------------------------------------------+
| #1042  Northwind Freight          $1,240   Overdue 31d      |
|        PO-8821 missed                              [Review]  |  secondary line only
| #1043  Contoso Ltd                $  890   Overdue 34d      |    when it changes
| #1044  Fabrikam Inc               $2,010   Overdue 61d      |    the decision
+--------------------------------------------------------------+
| Showing 3 of 9        [Review all]          [Dismiss x]     |  dismiss persists
+--------------------------------------------------------------+
```

Tooling note: a wireframe file is HTML/CSS with `filter: grayscale(1)` and one comment block per annotation, so it stays greyscale in every environment and diffs cleanly in review.

```html
<section aria-labelledby="s1" style="filter: grayscale(1)">
  <h2 id="s1">9 invoices need attention</h2>
  <!-- 04 CONTENT: headline is a live count; CTA targets the same filter -->
  <p>Three are overdue by more than 30 days.</p>
  <a href="/invoices?state=overdue&amp;min_days=30">Review them</a>
</section>
```

## Checklist

- [ ] Fidelity level and the question it answers named in the file
- [ ] Entire wireframe is greyscale with system fonts
- [ ] Real copy and real data lengths, no placeholder filler
- [ ] Grid, gutters, and max-width decided before element placement
- [ ] Every region annotated with purpose, defaults, states, and behavior
- [ ] Loading, empty, error, and overflow annotated even if not drawn
- [ ] Flow navigable as a prototype or numbered screen sequence
- [ ] Verified at the smallest supported viewport in greyscale

## Anti-patterns

**Colored wireframes.** Colour invites stakeholders to argue about it before structure is settled, and it masks contrast problems that will surface at build. Fix: `filter: grayscale(1)` on the whole frame; colour lives in the high-fidelity stage.

**Lorem ipsum layout.** Placeholder text hides the fact that real titles wrap and real numbers are wider. Fix: use production content or a documented worst-case dataset.

**Unannotated picture.** A pretty static image with no states, defaults, or behavior notes. Engineers invent the rest, differently per screen. Fix: an annotation block per region, in the file.

**Wireframing only the desktop happy path.** The layout is validated at 1440px in the populated state. Fix: draw and test the smallest viewport first, and annotate empty and overflow.
