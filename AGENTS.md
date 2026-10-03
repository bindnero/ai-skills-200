# AGENTS.md

Repository instructions for coding agents working **on this skills repository**.

## What this repo is

A collection of 200 [Agent Skills](https://agentskills.io) bundles plus the tooling that installs them. The bundles are the product; `scripts/` is the plumbing.

```
skills/<category>/<skill-name>/SKILL.md   the 200 bundles — source of truth
scripts/validate.mjs                      enforces the format contract
scripts/catalog.mjs                       regenerates CATALOG.md + catalog.json
scripts/docs.mjs                          regenerates docs/02..09
scripts/install.mjs                       installs bundles into any supported tool
```

Categories: `frontend-web` `backend-api` `seo` `uiux-design` `devops-cloud` `testing-quality` `security` `ai-agents` — 25 skills each.

## Before you commit anything

```bash
npm run check
```

That runs `validate` then `catalog`. If you added or renamed a skill, also run:

```bash
npm run docs
```

Validation is strict and enforced in CI. `npm run validate` fails on: malformed frontmatter, any frontmatter key other than `name`/`description`, `name` not matching the folder, a `description` under 60 chars or without a trigger clause, first-person descriptions, duplicate names, duplicate descriptions, missing or out-of-order required sections, and bodies under 40 lines.

## Invariants — do not violate these

1. **A bundle contains exactly one file: `SKILL.md`.** No `scripts/`, `references/`, or `assets/` subfolders. If a skill genuinely needs them, that is a deliberate exception and must be justified — do not add them casually.
2. **Frontmatter has exactly two keys.** `name` and `description`. Tools disagree about optional keys; a bundle using the intersection runs everywhere.
3. **`name` always equals the folder name.**
4. **Descriptions front-load literal keywords** and always carry a trigger clause (`Use when` / `Use before` / `Use after` / `Use for` / `Use at`).
5. **Every body has all four sections, in order:** `## Instructions`, `## Patterns`, `## Checklist`, `## Anti-patterns`.
6. **Body length 70-130 lines.** Under is thin, over is context tax.
7. **Every skill has a "Do not use when" line naming the adjacent skill** that owns the neighbouring case. With 200 candidates this is what stops misfires.
8. **No duplicate descriptions.** Two identical descriptions means one skill never fires.

## Generated files — do not hand-edit

`CATALOG.md`, `catalog.json`, and `docs/02-*.md` through `docs/09-*.md` are generated. Edit the skill, then run `npm run check` and `npm run docs`. Hand edits are silently overwritten.

Hand-written and safe to edit: `README.md`, `AGENTS.md`, `docs/README.md`, `docs/01-getting-started.md`, `docs/10-install-targets.md`, `docs/11-authoring.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.github/` templates and workflows.

## Installing during development

Installed copies go into tool directories, all gitignored. Never commit them.

```bash
node scripts/install.mjs --list
node scripts/install.mjs --skill <name> -t agents --link   # symlink, live-edit
node scripts/install.mjs -a -A --uninstall                 # clean up
```

Prefer `--link` while editing a skill — no reinstall between changes.

## Adding a skill

1. `mkdir -p skills/<category>/<name>`
2. Write `SKILL.md` following an existing bundle in the same category for consistency.
3. Add the name to its category chapter in `scripts/docs.mjs` `META` if it fits no existing group. The generator reports ungrouped skills under "Also in this category".
4. `npm run check && npm run docs`
5. Commit.

Read [docs/11-authoring.md](docs/11-authoring.md) before writing the description — it is the retrieval key, and the validator cannot tell you whether it will actually fire.

## Updating a tool's install path

`scripts/install.mjs` `TARGETS` is the single place that maps a tool to a directory. Paths were verified against each tool's current docs — see [docs/10-install-targets.md](docs/10-install-targets.md) for the evidence and per-tool notes. If a tool moves its skills directory, update `TARGETS`, that doc, and the table in `scripts/catalog.mjs`. Do not scatter path literals elsewhere.

## Style

- Node 18+, ESM, zero runtime dependencies. Do not add a dependency.
- Comments explain *why*, not *what*.
- The installer prints a reminder to restart the tool after installing, because every one of them indexes skills at launch. Keep that reminder accurate when adding a target.