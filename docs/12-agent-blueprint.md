# 12 · Agent master blueprint

A capability-allocation blueprint for driving an AI agent: a 200-point scoring matrix across domains, a four-stage execution pipeline, and modular guidelines per domain. This chapter is reference material — it is **not** a skill bundle and it is never installed automatically.

## 1 · Capability weights

| Domain | Points |
| --- | --- |
| Frontend optimization and architecture | 50 |
| Backend and database systems | 40 |
| SEO and performance engineering | 40 |
| UI/UX design and asset integration | 30 |
| Multimedia data parsing (document/OCR/audio → markdown) | 30 |
| System design and token optimization | 10 |

The weights are a routing table, not a quality score. They say how much attention each domain gets when a request touches several.

## 2 · Execution pipeline

1. **Intake and evaluation** — parse the request, the surrounding context, and any lab or project guidelines, aligning with professional standards before acting.
2. **Prompt optimization** — strip redundancy and compress the request into high-density extractive instructions. Turn a vague or lengthy query into precise atomic tasks, and keep the token budget lean.
3. **Skill routing** — select the specialized skills that match each atomic task, and resize the set as the work changes.
4. **Execution and delivery** — output clean, production-ready code, markdown, or system notes without conversational filler.

## 3 · Domain guidelines

### Frontend and UI engineering — 50

Responsive layouts, high-performance rendering, and modern component architecture. Animate and style with a real system — Tailwind, design tokens, transitions — rather than ad-hoc values.

**Use:** `responsive-layouts`, `design-tokens`, `tailwind-architecture`, `component-library-authoring`, `state-management`, `react-performance`, `bundle-size-triage`, `lazy-loading-strategies`, `input-event-throttling`, `nextjs-app-router`.

### Backend and database integration — 40

Scalable architecture, secure routing, database separation, and API-key management (Brevo, payment providers, custom backends). Correct data flow, real error handling, hardened endpoints.

**Use:** `rest-api-design`, `api-versioning`, `input-validation`, `error-contract-design`, `rate-limiting`, `idempotency-keys`, `auth-token-lifecycle`, `api-key-management`, `query-optimization`, `connection-pooling`, `caching-strategies`.

### SEO and analytics — 40

Technical performance, meta tags, and content structure for search visibility and crawl efficiency.

**Use:** `technical-seo-audit`, `core-web-vitals-seo`, `on-page-seo`, `schema-markup`, `internal-linking`, `crawl-budget-optimization`, `sitemap-generation`, `indexation-control`.

### UI/UX and asset management — 30

Map colour, typography, and layout hierarchy from an explicit design analysis; use clean modular iconography and asset libraries.

**Use:** `color-systems`, `typography-systems`, `spacing-and-grid`, `design-tokens`, `design-systems-governance`, `wireframing`, `accessibility-audit`, `skeleton-loading-ui`, `image-optimization`.

### Multimedia data parsing — 30

Parse multi-format source material — PDF, Word, PowerPoint, Excel, HTML, images via OCR, audio transcriptions — into structured markdown before any analysis.

**Use:** there is no bundle for this today. The closest foundations are `chunking-strategies` and `rag-pipeline-design` for getting parsed text into retrievable form; the extraction step itself is a genuine gap in this collection.

### System design and token optimization — 10

Resilient large-scale patterns — caching, sharding, rate limiting, microservices — plus continuous token compression to keep context and cost down.

**Use:** `system-design`, `microservices-boundaries`, `caching-strategies`, `connection-pooling`, `context-window-management`, `llm-cost-optimization`.

## 4 · Honest limits

The routing in stage 3 is already handled by the tools. Each skill's `description` is loaded at session start and the agent matches your request against it, so you do not need to pick skills or invoke them by name. A blueprint like this one helps you decide **what to ask for** and **what to check afterwards**, not make a skill fire that would otherwise stay silent.
