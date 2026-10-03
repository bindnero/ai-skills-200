#!/usr/bin/env node
// Generates the per-category doc chapters (docs/02..09) from skills/.
// Hand-written chapters 01, 10 and 11 are never touched.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const SKILLS_DIR = join(ROOT, "skills")
const DOCS_DIR = join(ROOT, "docs")

const META = {
  "frontend-web": {
    file: "02-frontend.md", title: "Frontend & Web Development",
    blurb: "Everything that runs in the browser: how CSS is organised, how layouts hold up across breakpoints, how components are structured, how each major framework's idioms work, and how to stop the bundle and the page weight from getting out of hand.",
    covers: [
      ["Foundations", "How the browser is actually organised into layers, and why the cascade stops being your friend at scale.", ["css-architecture", "responsive-layouts", "design-tokens", "dark-mode-theming", "html-semantics"]],
      ["Components & state", "Component boundaries, ownership of state, and the framework-specific idioms worth knowing.", ["component-library-authoring", "state-management", "forms-validation", "react-performance", "vue-patterns"]],
      ["Frameworks", "Current routing, rendering and data-loading conventions for the mainstream meta-frameworks.", ["svelte-kit-patterns", "nextjs-app-router", "astro-static-sites", "i18n-implementation"]],
      ["Styling systems", "Utility-first architecture and animation that survives real content.", ["tailwind-architecture", "css-animations", "web-components"]],
      ["Performance", "The loading pipeline end to end: what to defer, what to preload, what to measure.", ["lazy-loading-strategies", "image-optimization", "font-loading", "critical-css", "bundle-size-triage", "web-vitals-remediation"]],
      ["Platform APIs", "Offline, storage, and the progressive-app surface.", ["browser-storage-apis", "service-worker-pwa"]],
    ],
  },
  "backend-api": {
    file: "03-backend.md", title: "Backend & API Engineering",
    blurb: "Designing and operating the server side: resource shapes and contracts, transport choices, the cross-cutting concerns every public API needs, and the data layer underneath.",
    covers: [
      ["Transport & contracts", "Choosing and shaping the wire format, and versioning it without breaking clients.", ["rest-api-design", "graphql-schema-design", "grpc-service-design", "websocket-realtime", "api-versioning", "api-documentation"]],
      ["API mechanics", "The things that separate a demo endpoint from one you can put in front of strangers.", ["pagination-patterns", "idempotency-keys", "input-validation", "error-contract-design", "rate-limiting", "graphql-performance"]],
      ["Identity", "Tokens, sessions, third-party authorization, and files that come in from outside.", ["auth-token-lifecycle", "oauth2-integration", "session-management", "file-upload-handling"]],
      ["Async & messaging", "Work that must not happen inside a request.", ["background-jobs", "queue-design", "event-driven-architecture", "webhook-delivery"]],
      ["Data layer", "Storage, caching, and the operational realities of running a database.", ["caching-strategies", "database-migrations", "query-optimization", "connection-pooling"]],
      ["Boundaries", "When to split a service, and what a split costs.", ["microservices-boundaries"]],
    ],
  },
  seo: {
    file: "04-seo.md", title: "SEO",
    blurb: "Search work as an engineering discipline: what Googlebot can actually reach, what the SERP rewards, and how to structure a site so both stay true as it grows.",
    covers: [
      ["Research & strategy", "Finding what is worth targeting, and what the results page already looks like.", ["keyword-research", "serp-analysis", "content-strategy", "saas-seo", "ecommerce-seo", "local-seo"]],
      ["On-page", "The parts of a page that search engines read directly.", ["on-page-seo", "metadata-and-social-cards", "schema-markup", "content-refresh"]],
      ["Architecture", "How pages link, and how that distributes authority.", ["site-architecture", "internal-linking", "crawl-budget-optimization"]],
      ["Indexation control", "The lever that decides what is in the index at all.", ["indexation-control", "robots-and-canonicals", "sitemap-generation", "mobile-first-indexing"]],
      ["Performance & audit", "Speed as a ranking input, and the diagnostic pass that finds real problems.", ["core-web-vitals-seo", "technical-seo-audit", "log-file-analysis", "seo-testing"]],
      ["Scale & change", "Patterns and events that break SEO at volume.", ["programmatic-seo", "international-seo", "seo-migration", "ai-search-visibility"]],
    ],
  },
  "uiux-design": {
    file: "05-uiux.md", title: "UI/UX & Design",
    blurb: "The reasoning behind the pixels: finding out what people need, structuring it, designing the interaction, and proving it works — including for people who do not use a mouse or a screen.",
    covers: [
      ["Discovering", "Learning what the problem actually is before designing anything.", ["design-process", "user-research", "persona-synthesis", "usability-testing"]],
      ["Structuring", "Organising content before visual design begins.", ["information-architecture", "wireframing"]],
      ["Systems", "The durable decisions: colour, type, spacing, and the governance that keeps them consistent.", ["color-systems", "typography-systems", "spacing-and-grid", "design-systems-governance"]],
      ["Interaction", "Behaviour, feedback, and the management of attention.", ["interaction-design", "motion-principles", "microinteraction-design", "cognitive-load-reduction"]],
      ["Accessibility", "The parts that decide whether the design is usable at all for some people.", ["accessibility-audit", "screen-reader-compatibility", "color-contrast", "keyboard-navigation"]],
      ["Content & states", "The interface is mostly text, and mostly empty or broken.", ["error-message-design", "empty-state-design", "onboarding-flows", "form-ux-patterns", "responsive-navigation", "voice-and-tone", "data-visualization"]],
    ],
  },
  "devops-cloud": {
    file: "06-devops.md", title: "DevOps & Cloud",
    blurb: "Getting code into production repeatedly and safely, and then knowing what your systems are doing once they are there.",
    covers: [
      ["Delivery", "The path from commit to running process.", ["ci-cd-pipelines", "release-management", "blue-green-deploy", "rollback-strategy", "gitops-workflow"]],
      ["Containers & orchestration", "Packaging, scheduling, and packaging-at-scale.", ["docker-image-hardening", "kubernetes-manifests", "helm-chart-authoring"]],
      ["Infrastructure as code", "Declarative resources and how to trust them.", ["terraform-modules", "infrastructure-testing"]],
      ["Platforms", "Where it actually runs.", ["aws-deployment", "gcp-deployment", "vercel-deployment", "cloudflare-edge", "serverless-functions", "edge-caching-strategy"]],
      ["Observability", "Turning runtime behaviour into something you can act on.", ["observability-setup", "structured-logging", "metrics-and-alerting", "distributed-tracing"]],
      ["Operating it", "The job after deploy: reliability targets, incidents, cost, and data safety.", ["sre-slos", "incident-response", "cost-optimization", "secrets-management", "backup-and-restore"]],
    ],
  },
  "testing-quality": {
    file: "07-testing.md", title: "Testing & Quality",
    blurb: "Deciding what to test, at what layer, and with what trade-off in cost — plus the practical machinery for keeping a suite fast and trustworthy.",
    covers: [
      ["Planning", "Deciding what deserves a test before writing any.", ["test-strategy-planning", "unit-testing-strategy", "test-documentation"]],
      ["Layers", "The distinct tools for distinct jobs.", ["integration-testing", "e2e-test-authoring", "api-testing", "browser-test-automation", "component-test-harness", "contract-testing", "visual-regression-testing", "accessibility-testing"]],
      ["Test data", "Most flaky tests are test-data problems.", ["test-data-management", "fixture-and-factory-design", "mocking-strategies", "snapshot-testing"]],
      ["Beyond examples", "Ways of testing that find different classes of bug.", ["property-based-testing", "load-testing", "mutation-testing", "benchmark-testing", "chaos-testing"]],
      ["Keeping it green", "The work that stops a suite from becoming ignorable.", ["flaky-test-triage", "parallel-test-execution", "smoke-test-suites", "test-coverage-analysis", "code-quality-gates"]],
    ],
  },
  security: {
    file: "08-security.md", title: "Security",
    blurb: "Finding what can go wrong before someone else finds it, and building the defences that hold when they try anyway.",
    covers: [
      ["Finding threats", "Reasoning about an architecture before writing it.", ["threat-modeling", "penetration-test-planning"]],
      ["The classic classes", "The attacks that keep working because they keep being reinvented.", ["owasp-top-ten", "xss-prevention", "csrf-prevention", "sql-injection-defense", "ssrf-prevention", "input-sanitization"]],
      ["Identity & access", "Proving who, then deciding what.", ["authz-authorization", "multi-factor-auth", "password-handling", "session-hijacking-defense"]],
      ["Browser hardening", "Response headers that cost nothing and remove whole categories of attack.", ["secure-headers", "csp-configuration"]],
      ["Supply chain", "Everything that happens between `npm install` and production.", ["secrets-scanning", "dependency-vulnerability-audit", "supply-chain-security", "code-signing", "sast-dawg", "secure-coding-review"]],
      ["Data & compliance", "Protecting stored data and proving you handled it properly.", ["encryption-at-rest", "api-key-management", "privacy-by-design", "gdpr-compliance", "incident-forensics"]],
    ],
  },
  "ai-agents": {
    file: "09-ai-agents.md", title: "AI & Agents",
    blurb: "Building systems that call language models and act on the result — reliably, at a cost that makes sense, and without handing an attacker the keys.",
    covers: [
      ["Instructions", "Getting the model to do the right thing reliably.", ["prompt-engineering", "system-prompt-design", "structured-output-enforcement", "function-schema-design", "hallucination-mitigation"]],
      ["Agent design", "The loop, the tools, and the orchestration.", ["agent-architecture", "tool-calling-design", "multi-agent-orchestration", "agent-memory-systems", "human-in-the-loop-workflows", "autonomous-agent-workflows", "context-window-management"]],
      ["Retrieval", "Getting the right text in front of the model.", ["rag-pipeline-design", "embedding-strategies", "vector-index-selection", "chunking-strategies"]],
      ["Operating it", "Cost, quality measurement, and model choice.", ["llm-cost-optimization", "llm-evaluation", "model-selection-strategy", "llm-debugging", "streaming-ui-patterns"]],
      ["Safety", "Keeping the model inside its boundaries.", ["agent-safety-guardrails", "prompt-injection-defense"]],
      ["Extending agents", "Giving an agent new capabilities and teaching it new tricks.", ["agent-skill-authoring", "mcp-server-design"]],
    ],
  },
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)
  if (!m) return {}
  const data = {}
  let key = null
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (kv) { key = kv[1]; data[key] = kv[2].trim() }
  }
  return data
}

const ASC = { "frontend-web": 2, "backend-api": 3, seo: 4, "uiux-design": 5, "devops-cloud": 6, "testing-quality": 7, security: 8, "ai-agents": 9 }

if (!existsSync(DOCS_DIR)) throw new Error("docs/ not found")

let written = 0
let missing = []

for (const [category, meta] of Object.entries(META)) {
  const catDir = join(SKILLS_DIR, category)
  if (!existsSync(catDir)) { missing.push(category); continue }

  const skills = new Map()
  for (const entry of readdirSync(catDir)) {
    const file = join(catDir, entry, "SKILL.md")
    if (!existsSync(file)) continue
    const fm = parseFrontmatter(readFileSync(file, "utf8"))
    skills.set(fm.name || entry, { ...fm, folder: entry })
  }

  const L = []
  L.push(`# ${String(ASC[category]).padStart(2, "0")} · ${meta.title}`)
  L.push("")
  L.push(meta.blurb)
  L.push("")
  L.push(`${skills.size} skills. Each row links to the bundle — read it before doing the work it describes.`)
  L.push("")

  const linked = []
  for (const [groupTitle, groupBlurb, names] of meta.covers) {
    const present = names.map((n) => [n, skills.get(n)]).filter(([, s]) => s)
    for (const n of names) if (!skills.has(n)) missing.push(`${category}/${n}`)
    if (!present.length) continue
    L.push(`## ${groupTitle}`)
    L.push("")
    L.push(groupBlurb)
    L.push("")
    L.push("| Skill | Use it when |")
    L.push("| --- | --- |")
    for (const [name, s] of present) {
      L.push(`| [\`${name}\`](../skills/${category}/${s.folder}/SKILL.md) | ${(s.description || "").replace(/\|/g, "\\|")} |`)
      linked.push(name)
    }
    L.push("")
  }

  const orphans = [...skills.keys()].filter((k) => !linked.includes(k))
  if (orphans.length) {
    L.push("## Also in this category")
    L.push("")
    L.push("| Skill | Use it when |")
    L.push("| --- | --- |")
    for (const name of orphans) {
      const s = skills.get(name)
      L.push(`| [\`${name}\`](../skills/${category}/${s.folder}/SKILL.md) | ${(s.description || "").replace(/\|/g, "\\|")} |`)
    }
    L.push("")
  }

  L.push("---")
  L.push("")
  L.push(`[Full index](../CATALOG.md) · [Install targets](10-install-targets.md) · [Authoring](11-authoring.md)`)
  L.push("")

  writeFileSync(join(DOCS_DIR, meta.file), L.join("\n"))
  written++
}

console.log(`Wrote ${written} doc chapter(s): ${Object.values(META).map((m) => m.file).join(", ")}`)
if (missing.length) {
  console.log(`\nNOTE — ${missing.length} reference(s) not found in skills/: ${missing.join(", ")}`)
}