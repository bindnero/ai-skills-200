# 11 · Authoring skills

## The contract

A skill is a folder. The folder name, the `name` field, and the skill's identity are the same string. There is no registration step.

```
skills/<category>/<skill-name>/SKILL.md
```

```markdown
---
name: my-skill
description: What it does and when to trigger it.
---

# My Skill

**Use when:** ...
**Do not use when:** ...

## Instructions
## Patterns
## Checklist
## Anti-patterns
```

**Only two frontmatter keys.** `name` and `description`. Tools disagree on optional keys — opencode accepts `license`, `compatibility`, `metadata`; Codex accepts `metadata` and ignores unknown keys; Antigravity documents only the two. A skill that only uses the intersection runs everywhere. Codex additionally caps `name` at 100 chars and `description` at 500, and requires both to be single-line.

## Writing the description

This is the part that decides whether the skill ever loads. The model sees 200 of these at session start and picks based on nothing else.

**State what it does AND when to trigger it.** A description that only says what it does will match almost nothing, because user requests are phrased as tasks, not as topics.

```
description: Audits indexability, crawl waste, canonicals, sitemaps and Core Web
Vitals across a site from crawl exports and log files. Use when organic traffic drops,
after a migration, or for a technical SEO audit.
```

Four rules, in priority order:

1. **Front-load the literal keywords.** The user's words come first in the string, before your explanation of what it does. `schema-markup`, `LCP`, `robots.txt`, `Playwright`, `Dockerfile` — put the tokens in, not a paraphrase.
2. **Include the trigger phrases.** `Use when`, `Use before`, `Use after`, `Use for`, `Use at`. The validator requires one of these.
3. **Write in third person.** `Audits...`, not `I help you...` or `Use this skill...`.
4. **Make them distinct.** Two near-identical descriptions means one of the two skills never fires. The validator rejects exact duplicates; near-duplicates are your job to avoid.

Length: 60-500 characters. Long enough to carry triggers, short enough that 200 of them stay affordable.

### Use "Use ONLY when"

If a skill should stay quiet even when the topic matches, say so explicitly:

```
description: Rewrites SQL queries for performance. Use ONLY when a query is
demonstrably slow — do not use for schema design or index selection.
```

### The "Do not use when" line

The body is only loaded *after* a skill fires, so a "when to use" section down there does nothing for routing. The negative case belongs in the description. But it also earns a line in the body, right at the top, so the agent can bail out cheaply once it has loaded:

```
**Do not use when:** the issue is cache invalidation rather than query shape — use caching-strategies.
```

Naming the skill to use *instead* is the highest-value thing you can put there. It converts a wrong turn into a right one.

## The body

Target **70-130 lines**. Under 40 and it is not worth loading. Over 260 and you should be splitting.

The body is a **procedure**, not an essay. It is read by an agent that is about to do the work. Everything that does not change what it does next is waste.

Write for these four things:

- **Non-obvious ordering.** What must happen before what. Which decision is irreversible.
- **Real constraints.** Limits, budgets, versions, the rule that is easy to violate.
- **Exact syntax.** Commands, config keys, function signatures. Not "configure the thing" but the actual invocation.
- **Failure modes.** What goes wrong and what it looks like, so the agent recognises it mid-task instead of after.

Cut everything else. History, motivation, and "why this is important" belong in the repo README, not in a body that is competing for context.

## Structure

The four required sections, in order:

### `## Instructions`

5-10 numbered steps. Imperative. Each step should be independently verifiable.

```markdown
## Instructions

1. Capture field data before touching code — run `lighthouse --preset=desktop` and save the JSON.
2. Identify the LCP element with the `web-vitals` attribution build, not the devtools trace.
3. Re-check whether the element is server-rendered. Client-only LCP is a rendering problem, not a loading one.
```

### `## Patterns`

At least two real code blocks. They are the highest-signal part of the file — an agent copying a correct snippet beats an agent reconstructing one from prose.

Must be correct and current. No `// ...rest of implementation`. No `TODO`. If you cannot write the real snippet, the step above it is too vague.

Prefer the pattern that is right by default. If there is a trade-off, show the default and say when to depart from it.

### `## Checklist`

5-8 verifiable items the agent can actually check off. Not aspirations — things that either hold or don't.

```
- [ ] `description` front-loads the keywords a user would type
- [ ] Every pattern block runs as written
```

### `## Anti-patterns`

3-5 named failure modes. Each gets **why it fails** and **the fix**, not just the name. This is the section that prevents the mistake, because it is what the agent recalls mid-task.

```
- **Inlining the font base64 into CSS.** Pushes 200 KB into the critical path and
  blocks first paint on a 3G connection. Fix: self-host the `.woff2`, preload it, and
  let `font-display: swap` handle the fallback.
```

## Optional: split into `references/`

Past roughly 500 lines, move the tail out:

```
my-skill/
├── SKILL.md
├── references/
│   ├── provider-matrix.md
│   └── migration-notes.md
└── scripts/
    └── validate.sh
```

Rules that matter:

- **Link from `SKILL.md` with a condition.** `For provider-specific quirks, read references/provider-matrix.md when targeting a vendor.` Not just "see also".
- **Do not duplicate.** Content lives in one place. Duplication drifts.
- **Scripts are the best of both worlds** — they run without ever entering the context window.

```markdown
## Instructions

1. Read `references/provider-matrix.md` **only if** the target is a specific cloud vendor.
2. Otherwise follow the vendor-neutral path below.
```

## Validate

```bash
npm run validate
```

Enforced across every bundle:

| Check | Severity |
| --- | --- |
| Frontmatter present and parseable | error |
| Only `name` and `description` keys | error |
| `name` matches the folder name | error |
| `name` is lowercase-hyphenated | error |
| `description` present | error |
| `description` at least 60 chars | error |
| Description is third person | error |
| Description has a trigger clause | warn |
| No duplicate `name` across categories | error |
| No duplicate descriptions | error |
| `## Instructions`, `## Patterns`, `## Checklist`, `## Anti-patterns` present and in order | error |
| Body at least 40 lines | error |
| At least 2 code blocks | warn |
| At least 3 checklist items | warn |
| `**Use when:**` line | warn |
| `**Do not use when:**` line | warn |

Then regenerate the indexes:

```bash
npm run catalog   # CATALOG.md + catalog.json
npm run docs      # docs/02..09
npm run check     # validate, then catalog
```

## Adding a skill

```bash
mkdir -p skills/<category>/<name>
$EDITOR skills/<category>/<name>/SKILL.md
npm run check
git commit -am "add <name> skill"
```

For a substantial skill, start from the closest existing one in the same category and follow its structure. Consistency across 200 files is worth more than local cleverness — it means the whole collection reads as one authored work.

## Test that it fires

The validator cannot tell you whether a skill triggers. Only a real agent can.

1. Install just that skill: `node scripts/install.mjs --skill <name> -t agents -f`
2. Restart the tool.
3. Ask a request phrased the way a user would, **not** the way the description is written.
4. Check the agent followed the instructions rather than improvising.
5. Ask a near-miss request that belongs to a sibling skill. Confirm the wrong skill stays quiet.

If it does not fire, the description is the problem — not the body. Nobody ever reads a body that was never loaded, so do not debug the body.

## Anti-patterns in authoring

- **Descriptions that describe the skill instead of the user's request.** `A structured guide to CSS architecture.` matches nobody. `Refactors tangled CSS into layers... Use when CSS is hard to change or styles are leaking between components.` matches people.
- **`## When to use` in the body.** Useless for routing — the body loads after the decision is made.
- **Advice with no code.** "Use a container query" teaches nothing. The container query teaches everything.
- **Truncation.** `// ...rest of handler` invites invention.
- **Duplicated concepts across skills.** Put it in one skill and point at it from the others' "Do not use when".
- **Skills over 500 lines.** Split into `references/`. A body that costs 8k tokens on every activation is a tax on every session that touches the topic.
- **Inventing APIs.** Verify the library exists at the version you claim. A confidently wrong snippet is worse than no snippet.

---

[01 Getting started](01-getting-started.md) · [10 Install targets](10-install-targets.md) · [Full index](../CATALOG.md)