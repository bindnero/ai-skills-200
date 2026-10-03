# Documentation

200 Agent Skills for web and app development, SEO, UI/UX, backend, DevOps, testing, security, and AI-agent work.

**[Full index with one-line descriptions](../CATALOG.md)** · **[README](../README.md)** · [Installing](10-install-targets.md) · [Authoring](11-authoring.md)

## Start here

| Chapter | Read it when |
| --- | --- |
| [01 · Getting started](01-getting-started.md) | you want to understand what a skill is and install your first one |

## The 200 skills

| Chapter | Count | Covers |
| --- | --- | --- |
| [02 · Frontend & Web](02-frontend.md) | 25 | CSS architecture, layout, tokens, components, state, React / Vue / Svelte / Next / Astro, Tailwind, assets, PWA, i18n, bundle performance |
| [03 · Backend & API](03-backend.md) | 25 | REST / GraphQL / gRPC, WebSockets, versioning, pagination, idempotency, validation, errors, auth, jobs, queues, caching, databases |
| [04 · SEO](04-seo.md) | 25 | Technical audits, keyword research, on-page, schema, architecture, indexation, programmatic / ecommerce / local / SaaS / international, migrations, AI search |
| [05 · UI/UX & Design](05-uiux.md) | 25 | Research, personas, IA, wireframes, interaction, design systems, color / type / spacing, motion, accessibility, testing, forms UX |
| [06 · DevOps & Cloud](06-devops.md) | 25 | CI/CD, Docker, Kubernetes, Helm, Terraform, AWS / GCP / Vercel / Cloudflare, serverless, observability, SRE, GitOps, releases |
| [07 · Testing & Quality](07-testing.md) | 25 | Unit → E2E, visual regression, contract, property-based, load, mutation, a11y testing, mocks, fixtures, flakiness, CI gates |
| [08 · Security](08-security.md) | 25 | Threat modeling, OWASP, injection, authn / authz, headers, CSP, crypto, MFA, secrets, supply chain, signing, GDPR |
| [09 · AI & Agents](09-ai-agents.md) | 25 | Prompt design, tool calling, orchestration, RAG, embeddings, chunking, context, cost, evals, guardrails, injection defense, MCP |

## Reference

| Chapter | Read it when |
| --- | --- |
| [10 · Install targets](10-install-targets.md) | you need exact paths, per-tool behaviour, or something is not showing up |
| [11 · Authoring](11-authoring.md) | you want to write, validate, or contribute a skill |

## One idea worth knowing before you read any of it

At session start the tool loads only each skill's `name` and `description` — never the body. The agent then picks skills whose descriptions match your request and loads those bodies.

So every chapter table below reads **"Use it when…"** — that column is not marketing copy. It *is* the mechanism that decides whether that skill loads. The full instructions sit behind it, invisible until matched.

This is also why descriptions in this collection front-load literal keywords like `LCP`, `robots.txt`, `Playwright`, and `Dockerfile` rather than paraphrasing them, and why each skill carries a "Do not use when" boundary pointing at its sibling. With 200 candidates, a description that does not exclude its neighbours will lose to whichever one happens to phrase things more similarly.