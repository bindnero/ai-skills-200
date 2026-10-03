# 05 · UI/UX & Design

The reasoning behind the pixels: finding out what people need, structuring it, designing the interaction, and proving it works — including for people who do not use a mouse or a screen.

26 skills. Each row links to the bundle — read it before doing the work it describes.

## Discovering

Learning what the problem actually is before designing anything.

| Skill | Use it when |
| --- | --- |
| [`design-process`](../skills/uiux-design/design-process/SKILL.md) | Runs the double-diamond design process through discover, define, develop, and deliver with named phase gates, required deliverables, and a critique rubric at each gate. Use when starting a new product or feature, deciding what to build next, or when work keeps shipping with no validation step. |
| [`user-research`](../skills/uiux-design/user-research/SKILL.md) | Plans and runs user research — semi-structured interviews, contextual observation, survey construction, and diary studies — with consent, sampling, and verbatim note-taking standards. Use when a design assumption is untested, before committing to a roadmap bet, or when you need evidence about what users actually do rather than what they say they want. |
| [`persona-synthesis`](../skills/uiux-design/persona-synthesis/SKILL.md) | Synthesizes raw research notes into jobs-to-be-done statements, affinity clusters, and evidence-backed personas with prioritized needs and behaviors instead of demographic fiction. Use when interview notes must become something a team can design against, or when existing personas have no traceable research behind them. |
| [`usability-testing`](../skills/uiux-design/usability-testing/SKILL.md) | Plans and runs task-based usability tests with moderated sessions, think-aloud protocol, defined success metrics, severity-based issue ranking, and SUS scoring. Use when validating a design before build or after release, or when prioritizing a backlog of usability problems. |

## Structuring

Organising content before visual design begins.

| Skill | Use it when |
| --- | --- |
| [`information-architecture`](../skills/uiux-design/information-architecture/SKILL.md) | Designs information architecture — content taxonomy, label vocabulary, faceted navigation, URL structure, and search fallbacks — validated with card sorting and tree testing. Use when users cannot find content, when restructuring a site or app navigation, or before adding a new top-level section. |
| [`wireframing`](../skills/uiux-design/wireframing/SKILL.md) | Produces low- and mid-fidelity wireframes as greyscale structural artifacts with an annotation set, then advances fidelity deliberately once structure is validated. Use when you need to test layout, hierarchy, and flow cheaply before visual design, or to document a screen before build handoff. |

## Systems

The durable decisions: colour, type, spacing, and the governance that keeps them consistent.

| Skill | Use it when |
| --- | --- |
| [`color-systems`](../skills/uiux-design/color-systems/SKILL.md) | Builds color systems from perceptually uniform OKLCH ramps, semantic token layers, and verified light, dark, and high-contrast themes. Use when creating or refactoring a palette, adding dark mode, or when hardcoded colors need to become tokens. |
| [`typography-systems`](../skills/uiux-design/typography-systems/SKILL.md) | Defines a typographic scale using a ratio with paired line-heights, measure limits, weight and optical-size axes, and fluid sizing with clamp(). Use when setting type styles, fixing dense or unreadable body text, or making typography responsive without hardcoded breakpoints. |
| [`spacing-and-grid`](../skills/uiux-design/spacing-and-grid/SKILL.md) | Applies spacing scales, layout grids, stack primitives, and container queries so layout stays consistent across breakpoints and themes. Use when fixing inconsistent padding and gutters, building responsive layouts, or replacing hardcoded pixel values with tokens. |
| [`design-systems-governance`](../skills/uiux-design/design-systems-governance/SKILL.md) | Governs the design system lifecycle across three token tiers, component contribution and deprecation policy, semantic versioning, documentation, and adoption metrics. Use when standing up or scaling a shared design system, deciding whether something gets promoted to a component, or when adoption has stalled. |

## Interaction

Behaviour, feedback, and the management of attention.

| Skill | Use it when |
| --- | --- |
| [`interaction-design`](../skills/uiux-design/interaction-design/SKILL.md) | Specifies interactive component behavior across the full state surface — hover, focus-visible, active, loading, disabled, error, and optimistic transitions — plus the edge-case logic of a flow. Use when writing a component spec, defining transitions between states, or when a flow breaks anywhere outside the happy path. |
| [`motion-principles`](../skills/uiux-design/motion-principles/SKILL.md) | Defines motion as duration, easing, and choreography rules with reduced-motion fallbacks and interruptible transitions. Use when adding transitions or animations, standardizing easing curves and timing tokens, or when UI motion triggers vestibular discomfort. |
| [`microinteraction-design`](../skills/uiux-design/microinteraction-design/SKILL.md) | Designs microinteractions — press, hover, toggle, load, success, and undo feedback — as explicit state machines with timing budgets and truthful progress reporting. Use when refining button and toggle behavior, communicating async results, or making destructive actions reversible. |
| [`cognitive-load-reduction`](../skills/uiux-design/cognitive-load-reduction/SKILL.md) | Reduces cognitive load by chunking work, applying progressive disclosure, matching controls to user mental models, and removing unnecessary decisions. Use when a flow has too many steps or simultaneous choices, when settings and forms overwhelm users, or when users abandon mid-task. |

## Accessibility

The parts that decide whether the design is usable at all for some people.

| Skill | Use it when |
| --- | --- |
| [`accessibility-audit`](../skills/uiux-design/accessibility-audit/SKILL.md) | Audits interfaces against WCAG 2.2 Level AA using automated tooling plus manual checks of focus order, reflow, target size, and status messages, then produces prioritized remediation tickets. Use before shipping a feature that must meet accessibility requirements, or when fixing a reported accessibility defect. |
| [`screen-reader-compatibility`](../skills/uiux-design/screen-reader-compatibility/SKILL.md) | Verifies screen reader behavior across VoiceOver, NVDA, and TalkBack by tracing focus order, accessible names, roles, states, and live-region announcements. Use when a page is unusable with a screen reader, when building custom widgets, or before claiming accessibility conformance. |
| [`color-contrast`](../skills/uiux-design/color-contrast/SKILL.md) | Computes and enforces WCAG 2.2 color contrast for text and non-text elements, including large-text and disabled-state rules, using relative luminance and OKLCH chroma reduction. Use when a palette fails contrast, a token change breaks readability, or auditing gray text on colored surfaces. |
| [`keyboard-navigation`](../skills/uiux-design/keyboard-navigation/SKILL.md) | Implements full keyboard operability — logical focus order, visible focus indicators, roving tabindex in composites, focus trapping only where justified, skip links, and scoped shortcuts. Use when fixing tab order or focus traps, adding shortcuts, or making a component operable without a pointer. |

## Content & states

The interface is mostly text, and mostly empty or broken.

| Skill | Use it when |
| --- | --- |
| [`error-message-design`](../skills/uiux-design/error-message-design/SKILL.md) | Writes and places error messages that state what happened, why, and how to recover, using inline validation, error summaries, preserved input, and appropriate live-region urgency. Use when rewriting vague validation errors, choosing between inline and toast errors, or when forms fail users at submission. |
| [`empty-state-design`](../skills/uiux-design/empty-state-design/SKILL.md) | Designs distinct empty states for first-run, no-results, cleared, error, and permission-restricted conditions with purposeful next actions and correct semantics. Use when a list or dashboard shows nothing and users do not know what to do next, or when zero-data and no-results are conflated. |
| [`skeleton-loading-ui`](../skills/uiux-design/skeleton-loading-ui/SKILL.md) | Designs loading placeholders that match final layout, prevent layout shift, and set honest timing expectations without fake progress bars. Use when a view waits on data before rendering, when perceived performance is the complaint, or when spinners make an interface feel unpredictable. |
| [`onboarding-flows`](../skills/uiux-design/onboarding-flows/SKILL.md) | Designs onboarding and activation flows with progressive profiling, checklists, contextual empty states, and time-to-first-value instrumentation. Use when reducing signup drop-off, getting new users to a first success moment, or simplifying a multi-step setup wizard. |
| [`form-ux-patterns`](../skills/uiux-design/form-ux-patterns/SKILL.md) | Applies form patterns including correct input types and autocomplete tokens, persistent labels, inline validation on blur, input masking, and accessible error association. Use when building or fixing a form, reducing form abandonment, or adding autofill and password manager support. |
| [`responsive-navigation`](../skills/uiux-design/responsive-navigation/SKILL.md) | Designs navigation that adapts across breakpoints using persistent sidebars, disclosure menus, off-canvas drawers, and bottom tab bars with correct ARIA and focus management. Use when converting a desktop nav to mobile or when a menu breaks at tablet width. |
| [`voice-and-tone`](../skills/uiux-design/voice-and-tone/SKILL.md) | Defines product voice and tone, builds a terminology glossary, and writes UI microcopy for buttons, confirmations, and status messages consistently across surfaces. Use when writing interface copy, resolving conflicting terminology, or aligning marketing language with in-product voice. |
| [`data-visualization`](../skills/uiux-design/data-visualization/SKILL.md) | Selects and builds correct charts and dashboards — choosing encodings, scales, honest axes, accessible color, and tabular fallbacks for screen readers. Use when creating a new chart or dashboard, fixing a misleading visualization, or making data viz accessible. |

---

[Full index](../CATALOG.md) · [Install targets](10-install-targets.md) · [Authoring](11-authoring.md)
