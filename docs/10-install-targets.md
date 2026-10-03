# 10 · Install targets

Every target below is a real directory the tool scans. The installer resolves `~` to your home directory when `--global` is passed.

## Quick reference

| Target key | Format | Project path | Global path | Tools |
| --- | --- | --- | --- | --- |
| `agents` | dir | `.agents/skills/<n>/` | `~/.agents/skills/<n>/` | Antigravity, Antigravity CLI, Codex, Zed, Devin, opencode |
| `opencode` | dir | `.opencode/skills/<n>/` | `~/.config/opencode/skills/<n>/` | opencode |
| `claude` | dir | `.claude/skills/<n>/` | `~/.claude/skills/<n>/` | Claude Code |
| `cursor` | dir | `.cursor/skills/<n>/` | `~/.cursor/skills/<n>/` | Cursor |
| `windsurf` | dir | `.windsurf/skills/<n>/` | `~/.codeium/windsurf/skills/<n>/` | Windsurf, Cascade |
| `codex` | dir | `.codex/skills/<n>/` | `~/.codex/skills/<n>/` | Codex CLI (legacy path) |
| `gemini` | dir | `.gemini/config/skills/<n>/` | `~/.gemini/config/skills/<n>/` | Antigravity, global |
| `antigravity-cli` | dir | `.agent/skills/<n>/` | `~/.gemini/antigravity-cli/skills/<n>/` | Antigravity CLI (`agy`), global |
| `cursor-rules` | `.mdc` | `.cursor/rules/<n>.mdc` | `~/.cursor/rules/<n>.mdc` | Cursor, as always-loaded rules |
| `windsurf-rules` | `.md` | `.windsurf/rules/<n>.md` | `~/.codeium/windsurf/rules/<n>.md` | Windsurf, `model_decision` trigger |
| `agentsmd` | index | `AGENTS.md` | `~/.config/zed/AGENTS.md` | Zed, Copilot, Aider, anything reading `AGENTS.md` |

Default when you pass no `--target`: **`agents,opencode`** — the two that need no extra tooling.

---

## Per-tool detail

### Google Antigravity (IDE)

- Workspace: `.agents/skills/<name>/SKILL.md`
- Global: `~/.gemini/config/skills/` (legacy `~/.gemini/antigravity/skills/` still read)
- Backward compatible with `.agent/skills/` — that is what the `antigravity-cli` target writes at project scope.
- Every skill becomes a slash command. Verify with **Customizations → Skills** in the agent side panel.
- Antigravity adopted the open Agent Skills standard, so `SKILL.md` here works unmodified.

### Antigravity CLI (`agy`)

- Project scope: `.agents/skills/`
- Global scope: `~/.gemini/antigravity-cli/skills/`
- **`agy` does not read `~/.agents/skills/`** — that is the one trap. `npx skills` puts skills in `~/.agents/skills/`, which the IDE sees but the CLI does not. Use `--target antigravity-cli -g` for CLI-wide installs.

### opencode

- Project: `.opencode/skills/` or `.opencode/skill/` (both accepted)
- Global: `~/.config/opencode/skills/` — note this is `~/.config/opencode`, **not** `~/.opencode/`
- **Auto-scans external locations** with no config at all: `~/.claude/skills/` and `~/.agents/skills/`. So `-g -t agents` works for opencode too.
- To skip the external scans: `OPENCODE_DISABLE_EXTERNAL_SKILLS=1`, `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1`
- Register an arbitrary directory instead of copying:

  ```json
  {
    "$schema": "https://opencode.ai/config.json",
    "skills": {
      "paths": ["../ai-skills-200/skills"],
      "urls": ["https://example.com/.well-known/skills/"]
    }
  }
  ```

  `paths` is scanned recursively for `**/SKILL.md`.
- **Config loads once.** A running session keeps the config it started with. Quit and restart.

### Claude Code

- Project: `.claude/skills/<name>/SKILL.md`
- Global: `~/.claude/skills/`
- opencode also reads `~/.claude/skills/`, so this target serves both tools.

### Codex CLI

- Modern: scans `.agents/skills/` from your cwd upward to the repo root, plus `~/.agents/skills/` and `/etc/codex/skills/` → use `-t agents`.
- Legacy v1: `~/.codex/skills/**/SKILL.md`, recursive, exact filename `SKILL.md`, symlinks followed. Requires `skills = true` in `~/.codex/config.toml`.
- Invoke explicitly with `$skill-name`, or browse with `/skills`.
- **Invalid frontmatter triggers a blocking startup modal.** If Codex complains at launch, run `npm run validate` — the validator enforces the same rules.

### Cursor

- Skills: `.cursor/skills/<name>/SKILL.md` (project), `~/.cursor/skills/` (global)
- Rules: `.cursor/rules/<name>.mdc` with `description` / `globs` / `alwaysApply` frontmatter.
- Prefer `-t cursor`. `-t cursor-rules` flattens the body into a single `.mdc` and sets `alwaysApply: false` — still model-invoked, but it drops the `scripts/` and `references/` subfolders.

### Windsurf / Cascade

- Skills: `.windsurf/skills/<name>/SKILL.md` (workspace), `~/.codeium/windsurf/skills/` (global)
- Rules: `.windsurf/rules/*.md` with `trigger:` frontmatter. Valid values: `always_on`, `manual`, `model_decision`, `agent`, `glob`. The `windsurf-rules` target emits `model_decision`.
- Explicitly activate a skill by typing `@skill-name`.

### Zed

- **Zed retired its Rules system in favour of Skills.** Global skills live in `~/.agents/skills/` → `-t agents -g`.
- Always-on personal guidance moved to `~/.config/zed/AGENTS.md` (`%APPDATA%\Zed\AGENTS.md` on Windows) → `-t agentsmd -g`.
- Project instruction files, first match wins: `.rules`, `.cursorrules`, `.windsurfrules`, `.clinerules`, `.github/copilot-instructions.md`, `AGENT.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`.
- Known limitation: as of v1.8.x Zed loads only the worktree-root instruction file. Nested per-package `AGENTS.md` in a monorepo is silently ignored. Skill bundles are unaffected.

---

## Format notes

The installer renders each target appropriately rather than copying blindly.

**Directory targets** (`agents`, `opencode`, `claude`, `cursor`, `windsurf`, `codex`, `gemini`, `antigravity-cli`) get the folder verbatim, so `scripts/` and `references/` survive.

**`.mdc` / rules targets** flatten to a single file, stripping frontmatter and replacing it with the target's own keys:

```markdown
---
description: <the skill description>
globs: 
alwaysApply: false
---

<SKILL.md body>
```

**`agentsmd`** writes a marker-delimited block into `AGENTS.md`. Re-running is idempotent — the block is replaced, never duplicated, and your own content above it is preserved:

```markdown
<!-- BEGIN: ai-skills-200 (generated by scripts/install.mjs) -->
...
<!-- END: ai-skills-200 -->
```

`--uninstall` strips exactly that block and deletes the file if nothing else remains.

---

## Working with installs

```bash
# preview
node scripts/install.mjs -a -A -n

# live-edit: symlink instead of copy, so edits to skills/ take effect immediately
node scripts/install.mjs --category seo -t agents --link

# convert symlinks back to real copies
node scripts/install.mjs --category seo -t agents --link -f

# remove
node scripts/install.mjs -a -A --uninstall
```

Symlinks need Developer Mode or admin on Windows. The installer falls back to copying automatically, so `--link` is safe everywhere.

## Troubleshooting

**Skills do not appear.** Restart the tool — every one of these indexes skills at launch, not on file change. opencode in particular loads config once.

**Skill exists but never fires.** The description is the trigger. Confirm it front-loads the words you would actually type. Compare against `catalog.json` and rephrase:

```bash
node scripts/install.mjs --search "your keywords"
```

**Too many skills firing at once.** Two descriptions are too close. Narrow the "Use when" and add a "Do not use when" boundary.

**Codex shows a startup error modal.** Malformed frontmatter. Run `npm run validate` and fix what it reports.

**`agy` sees nothing but the IDE works.** You installed to `~/.agents/skills/`. Antigravity CLI does not read that path — use `--target antigravity-cli -g`.

**Install says "skipped".** The bundle already exists. Re-run with `--force`.

**Everything is fine but nothing changed.** Installed copies are snapshots. Re-run the install, or use `--link` from the start.

---

[01 Getting started](01-getting-started.md) · [11 Authoring](11-authoring.md) · [Full index](../CATALOG.md)