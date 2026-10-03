#!/usr/bin/env node
// Regenerates CATALOG.md and catalog.json from the skills/ tree.
// Run after adding, renaming, or editing any skill.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, basename } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const SKILLS_DIR = join(ROOT, "skills")

const CATEGORY_META = {
  "frontend-web": { title: "Frontend & Web Development", blurb: "CSS architecture, layout systems, design tokens, framework patterns (React / Vue / Svelte / Next / Astro), Tailwind, asset loading, PWA, i18n, and bundle performance." },
  "backend-api": { title: "Backend & API Engineering", blurb: "REST / GraphQL / gRPC service design, WebSockets, versioning, rate limiting, pagination, idempotency, validation, error contracts, auth flows, jobs, queues, caching, and database work." },
  seo: { title: "SEO", blurb: "Technical audits, keyword and SERP research, on-page and metadata work, schema markup, site architecture, indexation control, international / local / ecommerce / programmatic SEO, migrations, and AI search visibility." },
  "uiux-design": { title: "UI/UX & Design", blurb: "Research, personas, information architecture, wireframes, interaction design, design system governance, color / type / spacing systems, motion, accessibility, usability testing, forms UX, and data visualization." },
  "devops-cloud": { title: "DevOps & Cloud", blurb: "CI/CD pipelines, container hardening, Kubernetes and Helm, Terraform modules, AWS / GCP / Vercel / Cloudflare, serverless, observability, SRE and SLOs, GitOps, secrets, releases, rollback, backups, and cost control." },
  "testing-quality": { title: "Testing & Quality", blurb: "Unit through end-to-end strategy, visual regression, contract and property-based testing, load and mutation testing, accessibility testing, mocks and fixtures, flakiness triage, parallel execution, benchmarks, chaos, and quality gates." },
  security: { title: "Security", blurb: "Threat modeling, OWASP classes, injection defenses, authn / authz, secure headers and CSP, encryption, password and MFA handling, secrets, supply chain, signing, SAST, penetration testing, forensics, privacy, and GDPR." },
  "ai-agents": { title: "AI & Agents", blurb: "Prompt and system-prompt design, tool calling, multi-agent orchestration, RAG pipelines, embeddings and chunking, context management, cost control, evaluation, hallucination mitigation, guardrails, prompt injection defense, MCP, and streaming." },
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!m) return {}
  const data = {}
  let key = null
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (kv) { key = kv[1]; data[key] = kv[2].trim() }
    else if (key && line.trim()) data[key] += " " + line.trim()
  }
  return data
}

function collect() {
  const out = []
  for (const cat of readdirSync(SKILLS_DIR).sort()) {
    const catDir = join(SKILLS_DIR, cat)
    if (!statSync(catDir).isDirectory()) continue
    const skills = []
    for (const name of readdirSync(catDir).sort()) {
      const file = join(catDir, name, "SKILL.md")
      if (!existsSync(file)) continue
      const raw = readFileSync(file, "utf8")
      const fm = parseFrontmatter(raw)
      const body = raw.replace(/^---[\s\S]*?---\r?\n/, "")
      skills.push({
        name: fm.name || name,
        description: fm.description || "",
        folder: name,
        lines: body.split(/\r?\n/).length,
      })
    }
    out.push({ category: cat, skills })
  }
  return out
}

const tree = collect()
const total = tree.reduce((a, c) => a + c.skills.length, 0)

// ---- catalog.json ----
const json = {
  name: "ai-skills-200",
  version: "1.0.0",
  total,
  standard: "Agent Skills (agentskills.io) — SKILL.md directory bundle",
  targets: {
    "agents": { path: ".agents/skills/<name>/SKILL.md", scope: "project", tools: ["Antigravity", "Antigravity CLI", "opencode (external scan)", "npx skills"] },
    "opencode": { path: ".opencode/skills/<name>/SKILL.md", scope: "project", tools: ["opencode"] },
    "claude": { path: ".claude/skills/<name>/SKILL.md", scope: "project", tools: ["Claude Code"] },
    "gemini": { path: "~/.gemini/config/skills/<name>/SKILL.md", scope: "global", tools: ["Antigravity (global)"] },
    "cursor": { path: ".cursor/rules/<name>.mdc", scope: "project", tools: ["Cursor"] },
    "windsurf": { path: ".windsurf/rules/<name>.md", scope: "project", tools: ["Windsurf"] },
    "zed": { path: ".zed/rules/<name>.md", scope: "project", tools: ["Zed"] },
    "codex": { path: ".codex/skills/<name>/SKILL.md", scope: "project", tools: ["Codex CLI"] },
  },
  categories: tree.map((c) => ({
    id: c.category,
    title: CATEGORY_META[c.category]?.title || c.category,
    blurb: CATEGORY_META[c.category]?.blurb || "",
    count: c.skills.length,
    skills: c.skills,
  })),
}
writeFileSync(join(ROOT, "catalog.json"), JSON.stringify(json, null, 2) + "\n")

// ---- CATALOG.md ----
const L = []
L.push("# Catalog")
L.push("")
L.push(`${total} skills across ${tree.length} categories. Every skill is an [Agent Skills](https://agentskills.io) bundle: a folder containing \`SKILL.md\` with \`name\` + \`description\` frontmatter.`)
L.push("")
L.push("Regenerate this file with `npm run catalog` after editing anything under `skills/`.")
L.push("")
L.push("## Contents")
L.push("")
for (const c of tree) {
  const meta = CATEGORY_META[c.category]
  L.push(`- **[${meta?.title || c.category}](#${c.category})** — ${c.skills.length} skills — ${meta?.blurb || ""}`)
}
L.push("")
for (const c of tree) {
  const meta = CATEGORY_META[c.category]
  L.push(`## ${c.category}`)
  L.push("")
  L.push(`**${meta?.title || c.category}** — ${c.skills.length} skills`)
  L.push("")
  if (meta?.blurb) { L.push(`> ${meta.blurb}`); L.push("") }
  L.push("| Skill | Description |")
  L.push("| --- | --- |")
  for (const s of c.skills) {
    L.push(`| [\`${s.name}\`](skills/${c.category}/${s.folder}/SKILL.md) | ${s.description.replace(/\|/g, "\\|")} |`)
  }
  L.push("")
}
writeFileSync(join(ROOT, "CATALOG.md"), L.join("\n"))

console.log(`Wrote CATALOG.md and catalog.json — ${total} skills in ${tree.length} categories.`)