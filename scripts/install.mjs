#!/usr/bin/env node
/**
 * skills — install Agent Skills bundles into any supported AI tool.
 *
 * The `skills/` folder in this repo is the single source of truth. This CLI
 * copies (or symlinks) selected bundles into the directory layout each tool
 * scans. Run `node scripts/install.mjs --help` for the full flag list.
 */
import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, statSync,
  existsSync, rmSync, cpSync, symlinkSync, lstatSync,
} from "node:fs"
import { join, basename, relative, dirname, sep } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const SKILLS_DIR = join(ROOT, "skills")

const CATEGORY_META = {
  "frontend-web": "Frontend & Web Development",
  "backend-api": "Backend & API Engineering",
  seo: "SEO",
  "uiux-design": "UI/UX & Design",
  "devops-cloud": "DevOps & Cloud",
  "testing-quality": "Testing & Quality",
  security: "Security",
  "ai-agents": "AI & Agents",
}

// ---------------------------------------------------------------------------
// Targets. `dir` is resolved relative to the project root unless --global.
// Verified against each tool's current documented skill locations.
// ---------------------------------------------------------------------------
const TARGETS = {
  agents: {
    label: "Agent Skills standard (.agents/skills) — Antigravity, Antigravity CLI, Codex, Zed, Devin, opencode",
    dir: ".agents/skills",
    globalDir: "~/.agents/skills",
    format: "dir",
  },
  opencode: {
    label: "opencode (native)",
    dir: ".opencode/skills",
    globalDir: "~/.config/opencode/skills",
    format: "dir",
  },
  claude: {
    label: "Claude Code",
    dir: ".claude/skills",
    globalDir: "~/.claude/skills",
    format: "dir",
  },
  cursor: {
    label: "Cursor (skills)",
    dir: ".cursor/skills",
    globalDir: "~/.cursor/skills",
    format: "dir",
  },
  windsurf: {
    label: "Windsurf / Cascade (skills)",
    dir: ".windsurf/skills",
    globalDir: "~/.codeium/windsurf/skills",
    format: "dir",
  },
  codex: {
    label: "Codex CLI (skills feature)",
    dir: ".codex/skills",
    globalDir: "~/.codex/skills",
    format: "dir",
  },
  gemini: {
    label: "Antigravity — global scope",
    dir: ".gemini/config/skills",
    globalDir: "~/.gemini/config/skills",
    format: "dir",
  },
  "antigravity-cli": {
    label: "Antigravity CLI (agy) — global scope",
    dir: ".agent/skills",
    globalDir: "~/.gemini/antigravity-cli/skills",
    format: "dir",
  },
  "cursor-rules": {
    label: "Cursor (rules .mdc — always loaded, high context cost)",
    dir: ".cursor/rules",
    globalDir: "~/.cursor/rules",
    format: "mdc",
  },
  "windsurf-rules": {
    label: "Windsurf (rules — model_decision trigger)",
    dir: ".windsurf/rules",
    globalDir: "~/.codeium/windsurf/rules",
    format: "windsurf",
  },
  agentsmd: {
    label: "AGENTS.md skill index (Zed, Copilot, Aider, anything reading AGENTS.md)",
    dir: ".",
    globalDir: "~/.config/zed",
    format: "agents-md",
  },
}

const ALL_TARGET_KEYS = Object.keys(TARGETS)

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const SHORT = { "-a": "--all-categories", "-A": "--all-targets", "-g": "--global", "-n": "--dry-run", "-f": "--force", "-l": "--list", "-s": "--search", "-t": "--target", "-v": "--verbose", "-h": "--help", "-c": "--category", "-k": "--skill" }
const argv = process.argv.slice(2).map((a) => SHORT[a] || a)
function flag(name, fallback = null) {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = argv[i + 1]
  return next && !next.startsWith("--") ? next : true
}
function flagAll(name) {
  const out = []
  for (let i = 0; i < argv.length; i++) if (argv[i] === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith("--")) out.push(argv[i + 1])
  return out
}
const has = (name) => argv.includes(`--${name}`)

const opts = {
  help: has("help") || has("h"),
  list: has("list"),
  search: flag("search"),
  targets: flagAll("target").flatMap((t) => String(t).split(",")).filter(Boolean),
  allTargets: has("all-targets") || has("A"),
  categories: flagAll("category").flatMap((c) => String(c).split(",")).filter(Boolean),
  allCategories: has("all-categories") || has("a"),
  skills: flagAll("skill").flatMap((s) => String(s).split(",")).filter(Boolean),
  global: has("global") || has("g"),
  dryRun: has("dry-run") || has("n"),
  link: has("link"),
  force: has("force") || has("f"),
  uninstall: has("uninstall"),
  verbose: has("verbose"),
}

if (opts.help) {
  console.log(`
skills — install Agent Skills bundles into opencode, Antigravity, Claude Code,
Cursor, Windsurf, Zed and Codex CLI.

USAGE
  node scripts/install.mjs [selection] [options]

SELECTION
  -a, --all-categories        Install every skill in every category
  --category <names>          Comma-separated categories (${Object.keys(CATEGORY_META).join(", ")})
  --skill <names>             Comma-separated individual skill names
  -s, --search <query>        Fuzzy-filter skills by name/description
  -l, --list                  List available skills and exit

TARGETS (default: agents, opencode)
  -t, --target <names>        Comma-separated target keys
  -A, --all-targets           Install to every supported target
      ${ALL_TARGET_KEYS.map((k) => k.padEnd(17)).join(" ")}

  Target keys:
${Object.entries(TARGETS).map(([k, v]) => `    ${k.padEnd(17)} ${v.label}`).join("\n")}

OPTIONS
  -g, --global                Install to user-level (home) directories
  -n, --dry-run               Show what would happen, write nothing
      --link                  Symlink instead of copy (for live editing)
  -f, --force                 Overwrite existing files
      --uninstall             Remove installed skills
  -v, --verbose               Per-skill output
  -h, --help                  This message

EXAMPLES
  node scripts/install.mjs --list
  node scripts/install.mjs --search lighthouse --target agents,opencode -g
  node scripts/install.mjs --category seo --all-targets
  node scripts/install.mjs --skill schema-markup,technical-seo-audit -t cursor
  node scripts/install.mjs -a -A -g --dry-run
  node scripts/install.mjs --category security -t agents --link   # live-edit mode
`)
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Collect skills
// ---------------------------------------------------------------------------
function collect() {
  const out = []
  if (!existsSync(SKILLS_DIR)) return out
  for (const cat of readdirSync(SKILLS_DIR).sort()) {
    const catDir = join(SKILLS_DIR, cat)
    if (!statSync(catDir).isDirectory()) continue
    for (const name of readdirSync(catDir).sort()) {
      const file = join(catDir, name, "SKILL.md")
      if (!existsSync(file)) continue
      const raw = readFileSync(file, "utf8")
      const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
      const data = {}
      if (fm) for (const line of fm[1].split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
        if (kv) data[kv[1]] = kv[2].trim()
      }
      out.push({
        name: data.name || name,
        description: data.description || "",
        category: cat,
        folder: name,
        src: join(catDir, name),
      })
    }
  }
  return out
}

const all = collect()

if (opts.list) {
  const q = opts.search ? String(opts.search).toLowerCase() : null
  let rows = all
  if (q) rows = all.filter((s) => (s.name + " " + s.description + " " + s.category).toLowerCase().includes(q))
  if (opts.categories.length) rows = rows.filter((s) => opts.categories.includes(s.category))
  let current = null
  for (const s of rows) {
    if (s.category !== current) {
      current = s.category
      console.log(`\n${CATEGORY_META[current] || current}  (${rows.filter((r) => r.category === current).length})`)
    }
    console.log(`  ${s.name.padEnd(30)} ${s.description.slice(0, 96)}`)
  }
  console.log(`\n${rows.length} of ${all.length} skills`)
  process.exit(0)
}

if (opts.search && !opts.list) {
  const q = String(opts.search).toLowerCase()
  const rows = all.filter((s) => (s.name + " " + s.description + " " + s.category).toLowerCase().includes(q))
  for (const s of rows) console.log(`${s.category}/${s.name}\n  ${s.description}\n`)
  console.log(`${rows.length} match(es) for "${opts.search}"`)
  process.exit(0)
}

// Resolve selection
let selected = all
if (opts.skills.length) {
  const want = new Set(opts.skills.map((s) => s.toLowerCase()))
  selected = all.filter((s) => want.has(s.name.toLowerCase()))
  const missing = [...want].filter((w) => !all.some((s) => s.name.toLowerCase() === w))
  if (missing.length) console.error(`warning: unknown skill(s): ${missing.join(", ")}`)
}
if (opts.categories.length) {
  selected = selected.filter((s) => opts.categories.includes(s.category))
  const unknown = opts.categories.filter((c) => !Object.keys(CATEGORY_META).includes(c))
  if (unknown.length) console.error(`warning: unknown category(ies): ${unknown.join(", ")}`)
}
if (!opts.allCategories && !opts.categories.length && !opts.skills.length) {
  console.error("Nothing selected. Use --list, --search, --category, --skill, or -a/--all-categories.")
  console.error("Run with --help for examples.")
  process.exit(1)
}
if (!selected.length) {
  console.error("Selection matched 0 skills.")
  process.exit(1)
}

// Resolve targets
let targets = opts.targets
if (opts.allTargets) targets = ALL_TARGET_KEYS
if (!targets.length) targets = ["agents", "opencode"]
const unknownTargets = targets.filter((t) => !TARGETS[t])
if (unknownTargets.length) {
  console.error(`Unknown target(s): ${unknownTargets.join(", ")}`)
  console.error(`Valid targets: ${ALL_TARGET_KEYS.join(", ")}`)
  process.exit(1)
}

const expandHome = (p) => p.replace(/^~(?=$|[/\\])/, homedir())
const baseDir = opts.global ? homedir() : process.cwd()
const resolveOut = (t) => (opts.global ? expandHome(t.globalDir) : join(baseDir, t.dir))

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------
const stripFrontmatter = (raw) => raw.replace(/^---\r?\n[\s\S]*?---\r?\n/, "").trimStart()

function renderDir(skill, raw) {
  return { type: "dir", content: raw }
}

function renderMdc(skill, raw) {
  const body = stripFrontmatter(raw)
  return {
    type: "file",
    path: `${skill.name}.mdc`,
    content: `---\ndescription: ${skill.description}\nglobs: \nalwaysApply: false\n---\n\n${body}`,
  }
}

function renderWindsurf(skill, raw) {
  const body = stripFrontmatter(raw)
  return {
    type: "file",
    path: `${skill.name}.md`,
    content: `---\ntrigger: model_decision\ndescription: ${skill.description}\n---\n\n${body}`,
  }
}

function renderAgentsMd() {
  const byCat = {}
  for (const s of selected) (byCat[s.category] ||= []).push(s)
  const L = ["<!-- Generated by scripts/install.mjs. Do not edit by hand. -->", "", "# Available Agent Skills", ""]
  L.push(`${selected.length} skill${selected.length === 1 ? "" : "s"} installed from the ai-skills-200 collection.`)
  L.push("Each entry points at a folder containing a `SKILL.md` bundle. Read the file before doing the work it describes.")
  L.push("")
  for (const [cat, list] of Object.entries(byCat)) {
    L.push(`## ${CATEGORY_META[cat] || cat}`)
    L.push("")
    for (const s of list) L.push(`- **\`${s.name}\`** — ${s.description}  →  \`skills/${cat}/${s.folder}/SKILL.md\``)
    L.push("")
  }
  return { type: "agents-md", content: L.join("\n") }
}

const RENDERERS = { dir: renderDir, mdc: renderMdc, windsurf: renderWindsurf, "agents-md": renderAgentsMd }

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------
const log = (msg) => console.log(msg)
const created = []
const removed = []
const skipped = []
const overwritten = []
const errors = []

for (const targetKey of targets) {
  const target = TARGETS[targetKey]
  const outRoot = resolveOut(target)
  const renderer = RENDERERS[target.format]

  if (!opts.dryRun) mkdirSync(outRoot, { recursive: true })

  const scoped = opts.global ? "global" : "project"
  log(`\n${target.label}  [${targetKey}]  ->  ${outRoot}  (${scoped})`)

  // ---- uninstall: remove only paths matching selected skill names ----
  if (opts.uninstall) {
    for (const skill of selected) {
      const candidates =
        target.format === "dir" ? [join(outRoot, skill.name)]
        : target.format === "agents-md" ? [join(outRoot, "AGENTS.md")]
        : [join(outRoot, `${skill.name}.md`), join(outRoot, `${skill.name}.mdc`)]
      for (const dest of candidates) {
        if (!existsSync(dest) && !isLink(dest)) continue
        if (opts.dryRun) { removed.push(dest); continue }
        try {
          rmSync(dest, { recursive: true, force: true })
          removed.push(dest)
          if (opts.verbose) log(`  - ${relative(outRoot, dest) || basename(dest)}`)
        } catch (e) {
          errors.push(`${dest}: ${e.message}`)
        }
      }
    }
    // Tidy empty skill directories, and strip the generated AGENTS.md block.
    if (!opts.dryRun) {
      if (target.format === "agents-md") {
        const f = join(outRoot, "AGENTS.md")
        if (existsSync(f)) {
          const txt = readFileSync(f, "utf8")
          if (txt.includes("<!-- BEGIN: ai-skills-200")) {
            const stripped = txt
              .replace(/<!-- BEGIN: ai-skills-200[\s\S]*?<!-- END: ai-skills-200 -->\n?/g, "")
              .replace(/\n{3,}/g, "\n\n")
              .trimEnd()
            if (stripped) writeFileSync(f, stripped + "\n")
            else { rmSync(f, { force: true }); removed.push(f) }
          }
        }
      } else if (target.format === "dir" && existsSync(outRoot)) {
        try {
          if (readdirSync(outRoot).length === 0) rmSync(outRoot, { recursive: true, force: true })
        } catch { /* non-empty or not removable — fine */ }
      }
    }
    continue
  }

  for (const skill of selected) {
    const raw = readFileSync(join(skill.src, "SKILL.md"), "utf8")
    const rendered = renderer(skill, raw)

    try {
      if (rendered.type === "agents-md") {
        const dest = join(outRoot, "AGENTS.md")
        const BEGIN = "<!-- BEGIN: ai-skills-200 (generated by scripts/install.mjs) -->"
        const END = "<!-- END: ai-skills-200 -->"
        const existing = existsSync(dest) ? readFileSync(dest, "utf8") : ""
        const block = `${BEGIN}\n\n${rendered.content.split("\n").slice(2).join("\n")}\n${END}\n`

        let merged
        if (existing.includes(BEGIN) && existing.includes(END)) {
          merged = existing.replace(/<!-- BEGIN: ai-skills-200[\s\S]*?<!-- END: ai-skills-200 -->\n?/, block)
        } else {
          merged = (existing.trimEnd() ? existing.trimEnd() + "\n\n" : "") + block
        }

        if (opts.dryRun) { created.push(dest); continue }
        writeFileSync(dest, merged)
        ;(existing.includes(BEGIN) ? overwritten : created).push(dest)
        if (opts.verbose) log(`  ~ AGENTS.md`)
        continue
      }

      if (rendered.type === "dir") {
        const dest = join(outRoot, skill.name)
        if (existsSync(dest) || isLink(dest)) {
          if (opts.link) { rmSync(dest, { recursive: true, force: true }) }
          else if (!opts.force) { skipped.push(dest); continue }
          else { rmSync(dest, { recursive: true, force: true }); overwritten.push(dest) }
        }
        if (opts.dryRun) { created.push(dest); if (opts.verbose) log(`  + ${relative(outRoot, dest) || skill.name}`); continue }
        if (opts.link) {
          try {
            symlinkSync(skill.src, dest, "junction")
          } catch {
            cpSync(skill.src, dest, { recursive: true })
          }
        } else {
          cpSync(skill.src, dest, { recursive: true })
        }
        created.push(dest)
        if (opts.verbose) log(`  + ${skill.name}`)
        continue
      }

      // single-file renderers
      const dest = join(outRoot, rendered.path)
      if (existsSync(dest)) {
        if (!opts.force) { skipped.push(dest); continue }
        overwritten.push(dest)
      }
      if (opts.dryRun) { created.push(dest); if (opts.verbose) log(`  + ${rendered.path}`); continue }
      writeFileSync(dest, rendered.content)
      created.push(dest)
      if (opts.verbose) log(`  + ${rendered.path}`)
    } catch (e) {
      errors.push(`${dest}: ${e.message}`)
    }
  }
}

function isLink(p) {
  try { return lstatSync(p).isSymbolicLink() } catch { return false }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
log("")
if (opts.uninstall) {
  log(`${removed.length} item(s) removed across ${targets.length} target(s)`)
  if (!removed.length) log("(nothing matched — those skills were not installed here)")
} else {
  log(`installed ${created.length} bundle(s) across ${targets.length} target(s)`)
  if (overwritten.length) log(`overwrote ${overwritten.length} existing item(s) (--force)`)
  if (skipped.length) {
    log(`skipped ${skipped.length} existing item(s) — re-run with --force to overwrite`)
    if (opts.verbose) for (const s of skipped.slice(0, 20)) log(`  = ${s}`)
  }
}
if (errors.length) {
  console.error(`\n${errors.length} error(s):`)
  for (const e of errors) console.error(`  x ${e}`)
  process.exit(1)
}

if (created.length && !opts.dryRun) {
  log("")
  log("Restart your tool to pick up the new skills:")
  log("  opencode          restart the TUI (config is loaded once at startup)")
  log("  Antigravity IDE   restart, or Customizations -> Skills")
  log("  Antigravity CLI   run /skills")
  log("  Claude Code       restart the session")
  log("  Codex CLI         restart, then /skills")
  log("  Cursor            reload the window")
  log("  Windsurf/Cascade  reload the window")
  log("  Zed               new agent thread")
}
if (opts.dryRun) log("\n(dry run — nothing was written)")