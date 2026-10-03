#!/usr/bin/env node
// Validates every skill bundle: frontmatter shape, name/folder match,
// required sections, description quality, and duplicate detection.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, basename } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const SKILLS_DIR = join(ROOT, "skills")

const REQUIRED_SECTIONS = ["## Instructions", "## Patterns", "## Checklist", "## Anti-patterns"]
const errors = []
const warnings = []
const skills = []

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!m) return null
  const keys = []
  const data = {}
  let currentKey = null
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (kv) {
      currentKey = kv[1]
      keys.push(currentKey)
      data[currentKey] = kv[2].trim()
    } else if (currentKey && line.trim()) {
      data[currentKey] += " " + line.trim()
    }
  }
  return { keys, data }
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      const skillFile = join(full, "SKILL.md")
      if (existsSync(skillFile)) out.push({ dir: full, name: basename(full), file: skillFile })
      else out.push(...walk(full))
    }
  }
  return out
}

if (!existsSync(SKILLS_DIR)) {
  console.error("skills/ directory not found")
  process.exit(1)
}

for (const entry of walk(SKILLS_DIR)) {
  const raw = readFileSync(entry.file, "utf8")
  const rel = entry.file.slice(ROOT.length).replace(/\\/g, "/")
  const fm = parseFrontmatter(raw)

  if (!fm) {
    errors.push(`${rel}: missing or malformed YAML frontmatter`)
    continue
  }

  const { keys, data } = fm
  const extra = keys.filter((k) => k !== "name" && k !== "description")
  if (extra.length) {
    errors.push(`${rel}: unexpected frontmatter keys [${extra.join(", ")}] (portability requires only name + description)`)
  }
  if (!data.name) errors.push(`${rel}: frontmatter missing "name"`)
  else if (data.name !== entry.name) {
    errors.push(`${rel}: name "${data.name}" does not match folder "${entry.name}"`)
  } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.name)) {
    errors.push(`${rel}: name "${data.name}" is not lowercase-hyphenated`)
  }

  if (!data.description) {
    errors.push(`${rel}: frontmatter missing "description" (skill will never be surfaced)`)
  } else {
    const d = data.description
    if (d.length < 60) errors.push(`${rel}: description too short (${d.length} chars) — will not trigger reliably`)
    if (d.length > 500) warnings.push(`${rel}: description very long (${d.length} chars) — costs index tokens`)
    if (!/\bUse (only )?(when|whenever|at|before|after|for|on|if)\b/i.test(d)) {
      warnings.push(`${rel}: description has no trigger clause ("Use when...")`)
    }
    if (/^(I help|I'm|As an AI)/i.test(d)) {
      errors.push(`${rel}: description uses first person — must be third person`)
    }
  }

  const body = raw.replace(/^---[\s\S]*?---\r?\n/, "")
  const lines = body.split(/\r?\n/).length

  let lastIdx = -1
  for (const section of REQUIRED_SECTIONS) {
    const idx = body.indexOf(section)
    if (idx === -1) {
      errors.push(`${rel}: missing required section "${section}"`)
    } else if (idx < lastIdx) {
      errors.push(`${rel}: section "${section}" is out of order`)
    } else {
      lastIdx = idx
    }
  }

  if (!/\*\*Use when:\*\*/.test(body)) warnings.push(`${rel}: no "**Use when:**" trigger line`)
  if (!/\*\*Do not use when:\*\*/.test(body)) warnings.push(`${rel}: no "**Do not use when:**" boundary line`)

  const fences = (body.match(/^```/gm) || []).length
  if (fences % 2 !== 0) {
    // An odd count means a block was never closed, so every line after it renders as code.
    errors.push(`${rel}: unbalanced code fence (${fences} markers) — a code block is not closed`)
  } else if (fences < 4) {
    warnings.push(`${rel}: only ${fences / 2} code block(s) — expected at least 2`)
  }

  if (lines < 40) errors.push(`${rel}: body only ${lines} lines — too thin to be useful`)
  else if (lines > 260) warnings.push(`${rel}: body ${lines} lines — consider splitting into references/`)

  const checklist = (body.match(/^- \[ \] /gm) || []).length
  if (checklist < 3) warnings.push(`${rel}: only ${checklist} checklist items`)

  skills.push({ ...data, folder: entry.name, category: entry.dir.slice(SKILLS_DIR.length + 1).split(/[\\/]/)[0], lines })
}

const byName = new Map()
for (const s of skills) {
  if (byName.has(s.name)) errors.push(`duplicate skill name "${s.name}" in ${s.category} and ${byName.get(s.name).category}`)
  else byName.set(s.name, s)
}

const seenDesc = new Map()
for (const s of skills) {
  const key = (s.description || "").toLowerCase().replace(/[^a-z]/g, "")
  if (key && seenDesc.has(key)) errors.push(`duplicate description for "${s.name}" and "${seenDesc.get(key)}"`)
  else if (key) seenDesc.set(key, s.name)
}

const cats = {}
for (const s of skills) cats[s.category] = (cats[s.category] || 0) + 1

console.log(`skills: ${skills.length}`)
for (const [c, n] of Object.entries(cats).sort()) console.log(`  ${c.padEnd(18)} ${n}`)
const totalLines = skills.reduce((a, s) => a + s.lines, 0)
console.log(`total body lines: ${totalLines}`)

if (warnings.length) {
  console.log(`\nwarnings (${warnings.length}):`)
  for (const w of warnings.slice(0, 40)) console.log(`  ! ${w}`)
  if (warnings.length > 40) console.log(`  ... ${warnings.length - 40} more`)
}

if (errors.length) {
  console.error(`\nFAILED with ${errors.length} error(s):`)
  for (const e of errors) console.error(`  x ${e}`)
  process.exit(1)
}
console.log("\nAll checks passed.")