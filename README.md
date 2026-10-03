# ai-skills-200

**205 Agent Skills** for web and app development, SEO, UI/UX, backend, DevOps, testing, security, and AI-agent work — installable into opencode, Google Antigravity, Claude Code, Cursor, Windsurf, Zed, and Codex CLI. Each one is a markdown instruction file an agent reads at the moment it is relevant. Read [What a skill actually is](#what-a-skill-actually-is) before you install.

Every skill is a portable [Agent Skills](https://agentskills.io) bundle: a folder containing a `SKILL.md` with `name` + `description` frontmatter. No proprietary format, no runtime, no dependencies.

```
skills/<category>/<skill-name>/SKILL.md
```

MIT licensed. Open source — contributions welcome ([CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md)).

---

## What a skill actually is

A skill is a markdown file of instructions, nothing more. `scripts/install.mjs` copies files into directories — it never executes anything from a bundle.

**These are prompts, not code.** There is no library to import, no API to call, no build step, no runtime. The only files are `SKILL.md` text files.

**Installing them does not make anything faster or better by itself.** Nothing runs at install time and no behaviour changes in your app. What changes is what your AI agent reads.

**The gain comes from the work, not the download.** A skill helps when the agent loads it at the moment it matters and then actually follows it — running the Lighthouse audit, adding the CSP header, writing the load test. A skill nobody triggers, or an agent that ignores it, changes nothing. Results also depend on the model, the tool, and your project.

Judge this repo by what your agent does differently after installing it, not by the skill count.

---

## Why this exists

Agent tools all converged on the same idea — a folder with a `SKILL.md` that advertises *when* to use it. So a skill written once works everywhere. This repo is the content layer; `scripts/install.mjs` is the plumbing layer that puts each bundle where each tool looks for it.

| Tool | Reads from |
| --- | --- |
| opencode | `.opencode/skills/<n>/SKILL.md` and `~/.agents/skills/` |
| Google Antigravity (IDE) | `.agents/skills/<n>/SKILL.md` |
| Antigravity CLI (`agy`) | `.agents/skills/`, `~/.gemini/config/skills/` |
| Claude Code | `.claude/skills/<n>/SKILL.md` |
| Cursor | `.cursor/rules/<n>.mdc` |
| Windsurf | `.windsurf/rules/<n>.md` |
| Zed | `.zed/rules/<n>.md` |
| Codex CLI | `.codex/skills/<n>/SKILL.md` |
| Anything with `AGENTS.md` | appended skill index |

---

## Install

### Everything, everywhere

```bash
git clone https://github.com/nerongai/ai-skills-200.git
cd ai-skills-200
npm run check          # validate 205 bundles, regenerate the catalog

# project scope
node scripts/install.mjs -a -A

# global scope (available in every project on this machine)
node scripts/install.mjs -a -A -g
```

### Just the ones you need

```bash
node scripts/install.mjs --list                       # browse all 205
node scripts/install.mjs --search lighthouse           # find by keyword
node scripts/install.mjs --category seo --all-targets
node scripts/install.mjs --skill schema-markup,technical-seo-audit -t cursor
node scripts/install.mjs -a -t agents -g --dry-run    # preview first
```

### Flags

| Flag | Meaning |
| --- | --- |
| `-a, --all-categories` | every skill in every category |
| `--category <names>` | comma-separated categories |
| `--skill <names>` | comma-separated individual skills |
| `-s, --search <query>` | filter by name / description / category |
| `-l, --list` | print the catalog and exit |
| `-t, --target <names>` | comma-separated target keys |
| `-A, --all-targets` | every supported target |
| `-g, --global` | install to home directories, not the project |
| `-n, --dry-run` | print the plan, write nothing |
| `--link` | symlink instead of copy — edit skills live |
| `-f, --force` | overwrite existing installs |
| `--uninstall` | remove installed bundles |

Target keys: `agents` `opencode` `claude` `codex` `gemini` `antigravity` `cursor` `windsurf` `zed` `agentsmd`.
Default target is `agents,opencode` — the two that need no extra tooling.

> **Restart your tool after installing.** opencode loads config once at startup; Antigravity indexes skills on launch. `agentsmd` prints per-tool reminders.

---

## What's in the box

| Category | Skills | Covers |
| --- | --- | --- |
| [Frontend & Web](docs/02-frontend.md) | 26 | CSS architecture, layout, design tokens, component authoring, React / Vue / Svelte / Next / Astro, Tailwind, asset loading, input throttling, PWA, i18n, bundle triage |
| [Backend & API](docs/03-backend.md) | 27 | REST / GraphQL / gRPC, WebSockets, versioning, rate limiting, pagination, idempotency, validation, error contracts, payload compression, auth, jobs, queues, caching, databases, system design |
| [SEO](docs/04-seo.md) | 25 | Technical audits, keyword research, on-page, schema markup, architecture, indexation, programmatic / ecommerce / local / SaaS / international, migrations, AI search |
| [UI/UX & Design](docs/05-uiux.md) | 26 | Research, IA, wireframes, interaction, design systems, color / type / spacing, motion, skeleton loading states, accessibility, usability testing, forms UX, dataviz |
| [DevOps & Cloud](docs/06-devops.md) | 26 | CI/CD, Docker hardening, Kubernetes, Helm, Terraform, load balancers, AWS / GCP / Vercel / Cloudflare, serverless, observability, SRE, GitOps, releases, rollback |
| [Testing & Quality](docs/07-testing.md) | 25 | Unit → E2E strategy, visual regression, contract, property-based, load, mutation, a11y testing, mocks, fixtures, flakiness, CI gates |
| [Security](docs/08-security.md) | 25 | Threat modeling, OWASP, injection defenses, authn / authz, headers / CSP, crypto, MFA, secrets, supply chain, signing, SAST, privacy, GDPR |
| [AI & Agents](docs/09-ai-agents.md) | 25 | Prompt design, tool calling, multi-agent orchestration, RAG, embeddings, chunking, context management, cost, evals, guardrails, injection defense, MCP |

Full index with one-line descriptions: **[CATALOG.md](CATALOG.md)** · machine-readable: **[catalog.json](catalog.json)**

---

## How a skill is used

1. **Discovery** — at session start the tool reads every `SKILL.md`'s `name` and `description` into context. Only metadata, not bodies.
2. **Activation** — the agent semantic-matches your request against those descriptions and loads the full body of anything relevant.
3. **Execution** — the body is followed as instructions.

No code is invoked at any point. A skill that never gets activated, or an agent that reads the checklist and does not act on it, changes nothing on its own.

This is why `description` quality is the whole ballgame. Descriptions in this repo front-load the literal words a user would type, and every bundle ships a **"Do not use when"** line to stop adjacent skills from firing over each other.

---

## Customize

### Edit in place

```bash
node scripts/install.mjs --category seo -t agents --link   # symlinks
```

Now editing `skills/seo/schema-markup/SKILL.md` changes what the agent sees, with no reinstall. Use `--force` later to convert symlinks back to real copies.

### Fork and point a tool at the whole collection

opencode can register any directory as a skill root — no copying at all:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "skills": {
    "paths": ["../ai-skills-200/skills"]
  }
}
```

### Author a new skill

```markdown
---
name: my-skill
description: What it does and when to trigger, third person, front-loading the keywords a user would type.
---

# My Skill

**Use when:** concrete trigger conditions.
**Do not use when:** the adjacent case that belongs elsewhere.

## Instructions
## Patterns
## Checklist
## Anti-patterns
```

Only two frontmatter keys — `name` and `description`. That is deliberate: extra keys are tolerated inconsistently across tools, and the `name` must match the folder. Full authoring guide: [docs/11-authoring.md](docs/11-authoring.md).

Then run `npm run check` — the validator enforces frontmatter shape, folder-name match, section order, description quality, and duplicate detection across all 205 bundles.

---

## Docs

| Chapter | Contents |
| --- | --- |
| [01 Getting started](docs/01-getting-started.md) | concepts, first install, verifying it worked |
| [02 Frontend](docs/02-frontend.md) | the 25 frontend skills |
| [03 Backend](docs/03-backend.md) | the 25 backend skills |
| [04 SEO](docs/04-seo.md) | the 25 SEO skills |
| [05 UI/UX](docs/05-uiux.md) | the 25 design skills |
| [06 DevOps](docs/06-devops.md) | the 25 DevOps skills |
| [07 Testing](docs/07-testing.md) | the 25 testing skills |
| [08 Security](docs/08-security.md) | the 25 security skills |
| [09 AI & Agents](docs/09-ai-agents.md) | the 25 AI-agent skills |
| [10 Install targets](docs/10-install-targets.md) | exact paths, per-tool notes, troubleshooting |
| [11 Authoring](docs/11-authoring.md) | writing, validating, and contributing skills |

---

## Scripts

| Command | Does |
| --- | --- |
| `npm run list` | print all skills grouped by category |
| `npm run validate` | enforce the format contract across every bundle |
| `npm run catalog` | regenerate `CATALOG.md` and `catalog.json` |
| `npm run check` | validate, then regenerate the catalog |
| `npm run docs` | regenerate the per-category doc chapters |
| `npm run install:all-global` | install all 205 to every tool, user scope |

No dependencies. Node 18+.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and the exact format contract, and [docs/11-authoring.md](docs/11-authoring.md) for how to write a description that actually triggers. In short: one `SKILL.md` per skill, frontmatter with only `name` + `description`, and the four sections `Instructions` → `Patterns` → `Checklist` → `Anti-patterns`. Run `npm run check` before opening a PR — CI enforces it.

Found a security issue in the tooling, or prompt-injection content inside a skill? See [SECURITY.md](SECURITY.md) — please report those privately.

Everyone participating is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT — see [LICENSE](LICENSE). Use it, fork it, remix the collections, contribute skills back.