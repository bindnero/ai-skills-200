# 01 · Getting started

## What an Agent Skill actually is

A skill is a folder with a `SKILL.md` at its root:

```
my-skill/
└── SKILL.md
```

`SKILL.md` is two things glued together:

```markdown
---
name: my-skill
description: What this does and when to trigger it.
---

# My Skill

**Use when:** ...
The body — loaded only after the skill fires.
```

That's the whole specification. No SDK, no plugin API, no runtime.

**What that means in practice:** a skill is a prompt, not code. Installing one copies a text file — nothing executes, no dependency is added, and your app does not change behaviour on its own. The value comes at the moment the agent loads the file and acts on it. A skill that never triggers, or an agent that ignores its checklist, is worth exactly nothing. Judge these by what your agent does differently, not by how many are installed.

## Why this works across every tool

Every major coding agent independently arrived at the same design, because it solves the same problem: **210 skill bodies will not fit in a context window, but 210 one-line descriptions will.**

| Stage | What is loaded | Size |
| --- | --- | --- |
| Discovery | every skill's `name` + `description` | ~100 tokens each |
| Activation | the full body of skills that matched | ~2-5k tokens each |
| Bundled assets | `scripts/`, `references/`, `assets/` — only if read | on demand |

So the `description` is not documentation. It is the **retrieval key**. It is the single most important line in the file, and it is the only part every skill in this repo shares.

## The three levels of a skill

Most of the 210 skills here are instruction-only: a single `SKILL.md`, no helper files. That keeps installs small and bodies readable.

When a skill genuinely needs more, the standard allows bundling:

```
my-skill/
├── SKILL.md          required — when to use this, and the core workflow
├── scripts/          optional — executable helpers
├── references/       optional — long docs, loaded only when relevant
└── assets/           optional — templates, schemas, boilerplate
```

**Split when the body passes ~500 lines.** Move the long tail into `references/` and link it from `SKILL.md` with an explicit instruction about when to read it. Do not duplicate the same content in both places.

## Install your first skills

```bash
git clone https://github.com/bindnero/ai-skills-200
cd ai-skills-200
```

No install step, no `npm install` — there are zero dependencies.

```bash
node scripts/install.mjs --list                    # browse all 210
node scripts/install.mjs --search "core web vitals" # find the right ones
node scripts/install.mjs --category seo,uiux-design -t agents,opencode
```

## Verify it worked

Each tool has its own check:

```bash
# opencode — restart first, config loads once at startup
opencode
> which skills do you have?

# Antigravity IDE — restart, then Customizations -> Skills in the agent side panel

# Antigravity CLI
agy
/ skills

# Codex CLI
codex
/ skills

# Claude Code — restart the session, then ask
```

A reliable test: ask the agent something that should trigger exactly one skill, and check that it followed the instructions rather than improvising. The [seo-testing](skills/seo/seo-testing/SKILL.md) skill is a good probe — ask it to check a URL and see whether it runs a structured audit.

## Common first moves

| You want | Do this |
| --- | --- |
| Everything, everywhere, once | `node scripts/install.mjs -a -A -g` |
| Only SEO, this project | `node scripts/install.mjs --category seo` |
| Edit skills live while you work | `node scripts/install.mjs --category seo -t agents --link` |
| See the shape of things first | `node scripts/install.mjs -a -A -n` (dry run) |
| Keep the repo clean of installs | they're gitignored — see [.gitignore](../.gitignore) |

## What is actually installed

`skills/` in this repo is the source of truth and stays that way. Installed copies land in tool directories, which are all gitignored, so cloning the repo never carries 210 duplicated bundles.

If you'd rather have zero copies, opencode can read the collection directly:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "skills": {
    "paths": ["../ai-skills-200/skills"]
  }
}
```

## Next

- [Install targets](10-install-targets.md) — exact paths, per-tool notes, troubleshooting
- [Authoring](11-authoring.md) — write your own, and the contract the validator enforces

---

[Full index](../CATALOG.md) · [README](../README.md) · [02 Frontend](02-frontend.md) · [10 Install targets](10-install-targets.md) · [11 Authoring](11-authoring.md)