# 07 · Testing & Quality

Deciding what to test, at what layer, and with what trade-off in cost — plus the practical machinery for keeping a suite fast and trustworthy.

25 skills. Each row links to the bundle — read it before doing the work it describes.

## Planning

Deciding what deserves a test before writing any.

| Skill | Use it when |
| --- | --- |
| [`test-strategy-planning`](../skills/testing-quality/test-strategy-planning/SKILL.md) | Plans test investment with a risk matrix, pyramid placement rules, layer budgets, and a change-type-to-test-set mapping. Use at the start of a feature or a quarter, when coverage feels arbitrary, or when deciding which layers a change needs. |
| [`unit-testing-strategy`](../skills/testing-quality/unit-testing-strategy/SKILL.md) | Sets unit test boundaries and writes AAA-structured Vitest suites with dependency injection, injected clocks, fake timers, and table-driven cases. Use when deciding what to unit-test, splitting a module or class for testability, or lifting mutation score on pure business logic. |
| [`test-documentation`](../skills/testing-quality/test-documentation/SKILL.md) | Documents a test suite with a generated test catalog, ownership, run commands, seeding rules, and per-layer conventions. Use when onboarding, when a suite has unknown coverage, or when handing a service to another team. |

## Layers

The distinct tools for distinct jobs.

| Skill | Use it when |
| --- | --- |
| [`integration-testing`](../skills/testing-quality/integration-testing/SKILL.md) | Verifies real subsystem wiring against disposable Postgres, Redis, and HTTP services using Testcontainers, Vitest globalSetup, and transactional isolation. Use when a bug only appears once the database, cache, queue, or two services actually talk to each other. |
| [`e2e-test-authoring`](../skills/testing-quality/e2e-test-authoring/SKILL.md) | Authors Playwright end-to-end specs with role-based selectors, test.step, isolated storageState, and CI-safe sharding. Use when adding a user-journey test, rewriting brittle CSS or nth-child selectors, or driving the Playwright suite in a pipeline. |
| [`api-testing`](../skills/testing-quality/api-testing/SKILL.md) | Tests HTTP endpoints through the real handler stack with Supertest and Fastify inject, Ajv validation against the OpenAPI schema, and auth, pagination, and idempotency matrices. Use when adding or changing a REST endpoint, or when an API's status codes and error bodies must be proven correct. |
| [`browser-test-automation`](../skills/testing-quality/browser-test-automation/SKILL.md) | Drives Chromium and Firefox programmatically with Playwright and Puppeteer for scraping, PDF and screenshot capture, downloads, and reusable authenticated sessions. Use when a script needs a real browser outside a test suite, such as batch rendering or data extraction jobs. |
| [`component-test-harness`](../skills/testing-quality/component-test-harness/SKILL.md) | Builds a component test harness with Testing Library, user-event, Vitest browser mode, and provider wrappers. Use when a component's behaviour needs real DOM events and network mocking rather than jsdom or a full E2E run. |
| [`contract-testing`](../skills/testing-quality/contract-testing/SKILL.md) | Locks service boundaries with Pact consumer-driven contracts, provider verification, and Spectral-linted OpenAPI specs. Use when two teams ship independently against one API, when adding or breaking an endpoint, or when integration tests have become a hand-off bottleneck. |
| [`visual-regression-testing`](../skills/testing-quality/visual-regression-testing/SKILL.md) | Catches pixel regressions with Playwright toHaveScreenshot, per-component snapshots, pinned fonts, and a reviewed-baseline workflow. Use when styling changes can break layout invisibly, when adding a new UI component gallery, or when a bug report says the UI looks wrong. |
| [`accessibility-testing`](../skills/testing-quality/accessibility-testing/SKILL.md) | Automates WCAG checks with axe-core in Vitest and Playwright, then covers keyboard, focus order, and screen-reader semantics by hand. Use when adding interactive UI, fixing an a11y audit finding, or gating a release on WCAG 2.2 AA. |

## Test data

Most flaky tests are test-data problems.

| Skill | Use it when |
| --- | --- |
| [`test-data-management`](../skills/testing-quality/test-data-management/SKILL.md) | Seeds, scopes, and resets test data with deterministic Faker, migration-based fixtures, per-test transactions, and seed-recorded replay. Use when tests interfere through shared rows, when data volume skews results, or when a failure needs a reproducible dataset. |
| [`fixture-and-factory-design`](../skills/testing-quality/fixture-and-factory-design/SKILL.md) | Builds typed test data factories and fixtures with defaults, overrides, freeze semantics, and composable builders. Use when test setup is verbose or error-prone, or when fixtures are mutated by one test and break another. |
| [`mocking-strategies`](../skills/testing-quality/mocking-strategies/SKILL.md) | Replaces network and boundary dependencies with MSW request handlers and vi.mock module stubs, choosing the seam and controlling coverage per test. Use when testing code that calls fetch or third-party SDKs, or when a real service is too slow or unavailable. |
| [`snapshot-testing`](../skills/testing-quality/snapshot-testing/SKILL.md) | Pins serialized output with Vitest snapshots, asymmetric property matchers, inline snapshots, and CI read-only mode. Use when comparing large stable structures such as markup, i18n bundles, config output, or generated code. |

## Beyond examples

Ways of testing that find different classes of bug.

| Skill | Use it when |
| --- | --- |
| [`property-based-testing`](../skills/testing-quality/property-based-testing/SKILL.md) | Finds counterexamples with fast-check arbitraries, invariants, shrinking, and seeded regression replay. Use when input space is too large to enumerate, when testing parsers, encoders, reducers, or invariants across round trips. |
| [`load-testing`](../skills/testing-quality/load-testing/SKILL.md) | Builds k6 scenarios with arrival-rate load models, threshold gates, custom Trend and Rate metrics, and staged soak tests. Use when validating throughput or latency SLOs before a launch, when capacity regresses, or when choosing instance sizes. |
| [`mutation-testing`](../skills/testing-quality/mutation-testing/SKILL.md) | Measures test strength with Stryker mutators, per-test coverage analysis, mutation score thresholds, and diff-scoped runs. Use when coverage looks high but assertions are weak, or when adding a strict quality gate for critical modules. |
| [`benchmark-testing`](../skills/testing-quality/benchmark-testing/SKILL.md) | Measures code performance with Vitest bench, tinybench, and CI budgets that fail on regression. Use when tracking a latency or memory budget, choosing between two implementations, or preventing an optimisation from silently regressing. |
| [`chaos-testing`](../skills/testing-quality/chaos-testing/SKILL.md) | Injects latency, packet loss, and dependency outages with Toxiproxy and fault-injection seams, then asserts the system degrades and recovers correctly. Use when validating retries, circuit breakers, timeouts, and graceful degradation before a launch. |

## Keeping it green

The work that stops a suite from becoming ignorable.

| Skill | Use it when |
| --- | --- |
| [`flaky-test-triage`](../skills/testing-quality/flaky-test-triage/SKILL.md) | Detects, reproduces, and root-causes intermittent test failures with quarantine, per-test seeds, and shared failure triage. Use when a test fails intermittently in CI, when retry counts are masking regressions, or when the suite has gone red without code changes. |
| [`parallel-test-execution`](../skills/testing-quality/parallel-test-execution/SKILL.md) | Runs suites concurrently with Vitest pools and thread affinity, Playwright shards, per-worker databases, and nextest profiles. Use when the suite exceeds the CI time budget, or when tests collide on shared ports, databases, or files. |
| [`smoke-test-suites`](../skills/testing-quality/smoke-test-suites/SKILL.md) | Builds and runs fast smoke suites that gate deploys and rollouts, using tagged Playwright specs, health probes, and a real environment. Use when a release needs a go/no-go check, or when wiring a smoke stage into a deployment pipeline. |
| [`test-coverage-analysis`](../skills/testing-quality/test-coverage-analysis/SKILL.md) | Interprets V8 coverage reports, sets per-directory thresholds, and ratchets against a base-branch baseline. Use when deciding where to add tests, when coverage dropped, or when a coverage gate needs realistic numbers. |
| [`code-quality-gates`](../skills/testing-quality/code-quality-gates/SKILL.md) | Wires automated test and quality enforcement into CI with layered jobs, required status checks, coverage and mutation gates, and size-of-change limits. Use when setting up or repairing a merge gate, or when CI is slow or unreliable. |

---

[Full index](../CATALOG.md) · [Install targets](10-install-targets.md) · [Authoring](11-authoring.md)
