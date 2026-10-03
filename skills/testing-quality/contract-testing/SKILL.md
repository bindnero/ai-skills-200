---
name: contract-testing
description: Locks service boundaries with Pact consumer-driven contracts, provider verification, and Spectral-linted OpenAPI specs. Use when two teams ship independently against one API, when adding or breaking an endpoint, or when integration tests have become a hand-off bottleneck.
---

# Contract Testing

**Use when:** a consumer and a provider depend on each other's HTTP or event schema but deploy on separate schedules, and you need to know a change is safe before either ships.
**Do not use when:** both sides live in one codebase and deploy together — use `api-testing`; or the risk is a user-visible journey — use `e2e-test-authoring`.

## Instructions

1. Identify consumers of the endpoint or event, not the endpoints. Contracts are expressed from the consumer's point of view, so a contract suite is organised by consumer team, not by provider route.
2. Write a Pact file for each meaningful interaction, keyed on provider state (`given an existing order with id 1`) and request fields (`upon receiving GET /orders/1`), then pin the exact required response fields.
3. Assert only what the consumer actually depends on. A contract that mirrors every field of the payload becomes a change freeze nobody will agree to.
4. Use a provider state handler per `given` clause so verification setups are explicit and idempotent; the same handler runs on every verification, so it must start from a clean state.
5. Verify the provider against the pact in the provider's CI, publishing the pact artifact. Consumers regenerate contracts and fail their own build when a pact changes.
6. Lint the OpenAPI document in CI with Spectral and fail on rule violations such as undocumented responses, missing operationIds, and untyped parameters.
7. Validate live responses against the spec where you cannot get a provider — compile the OpenAPI schema with Ajv and assert status, headers, and body shape in a contract test suite.
8. Version deliberately: additive changes (new optional field) keep the pact green; removals, renames, or new required fields must go through a deprecation window with dual-read support.
9. Never assert on array ordering or full body equality in a contract test. Contracts constrain shape and required semantics, not the server's query implementation.
10. Keep contract tests in the fast unit project so they run on every PR — the whole point is feedback before integration environments exist.

## Patterns

Consumer-side Pact test producing an executable expectation:

```ts
// contract/order-receipt.pact.spec.ts
import { pactV3 } from '@pact-foundation/pact';
import { OrderClient } from '../../src/clients/order-client';

const provider = new OrderClient({ baseUrl: 'http://localhost:8080' });

const pact = pactV3()
  .given('an order with id 1 in state paid')
  .uponReceiving('a request for order 1')
  .withRequest({
    method: 'GET',
    path: '/orders/1',
    headers: { Accept: 'application/json' },
    query: { expand: 'lineItems' },
  })
  .willRespondWith({
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: 1,
      status: 'paid',
      totalCents: 4500,
      currency: 'USD',
      lineItems: [{ sku: 'sku-1', quantity: 2 }],
    },
  });

describe('OrderClient.get with expand', () => {
  it('returns a receipt whose total and line items the UI can render', async () => {
    await pact.executeTest(async (mock) => {
      provider.baseUrl = mock.url;

      const order = await provider.get(1, { expand: 'lineItems' });

      expect(order.totalCents).toBe(4500);
      expect(order.lineItems).toHaveLength(1);
    });
  });
});
```

Provider verification against the published pact, run in the provider's CI:

```ts
// contract/provider-verification.spec.ts
import { verifier } from '@pact-foundation/pact/verifier';
import { resetDb, seedPaidOrder } from './state-handlers';

describe('order-service provider', () => {
  afterAll(async () => {
    await verifier({
      provider: 'order-service',
      providerBaseUrl: 'http://localhost:8080',
      providerStatesSetupUrl: 'http://localhost:8080/__pact/state-change',
      pactBrokerUrl: process.env.PACT_BROKER_URL!,
      providerVersion: process.env.GIT_SHA!,
      afterProviderVerification: async ({ verificationResults }) => {
        const failed = verificationResults.filter((r) => !r.success);
        if (failed.length) throw new Error(`pact violations: ${failed.length}`);
      },
    });
  });

  it('exposes an idempotent handler for every given clause', async () => {
    expect(seedPaidOrder.name).toBe('an order with id 1 in state paid');
  });
});
```

Spec linting as a merge gate:

```yaml
# .spectral.yaml
extends: ["spectral:oas"]
rules:
  operation-tag-defined: error
  operation-operationId-unique: error
  operation-description: warn
  no-eval-in-markdown: error
  typed-enum: error
```

```bash
npx spectral lint openapi.yaml --ruleset .spectral.yaml --fail-severity=error
```

## Checklist

- [ ] Every pact is authored in the consumer's repo from consumer requirements
- [ ] Each interaction declares a provider state with a working, idempotent state handler
- [ ] Assertions cover only fields the consumer genuinely reads
- [ ] Provider verification runs in the provider's CI and publishes to a pact broker
- [ ] Breaking changes blocked by a pact change require consumer sign-off
- [ ] OpenAPI spec linted by Spectral in CI, failing on undocumented responses
- [ ] Additive vs breaking changes classified before the PR is opened
- [ ] Contract tests run in the fast PR lane, not only before deploy

## Anti-patterns

**Provider-authored contracts.** The provider writing what it promises invites field sprawl and hides consumer needs, so consumers break silently. Fix: consumer authors the pact; the provider proves it.

**Full-body equality in a contract test.** `toEqual` on a whole payload turns every additive field into a pact break and trains teams to run `pact --update`. Fix: assert required fields and shapes, treat added optional fields as compatible.

**Pacts without provider states.** A `given` clause nobody implements makes verification fail for environmental reasons, and the team starts skipping it. Fix: implement each state in the provider state-change endpoint and keep it idempotent.

**Verifying contracts only on main.** A provider can merge a breaking change and only learn about it after both sides are deployed. Fix: run provider verification on every PR and gate the merge on pact verification results.
