---
name: graphql-performance
description: Optimizes GraphQL execution with DataLoader batching, query depth and cost limits, and response caching. Use when a GraphQL endpoint is slow, over-fetches, or needs protection against abusive queries.
---

# GraphQL Performance

**Use when:** a GraphQL endpoint is slow, a query over-fetches, or untrusted clients can submit arbitrarily expensive operations.
**Do not use when:** the bottleneck is one slow SQL statement — see `query-optimization`; or the API is REST-shaped and clients need per-resource caching — see `rest-api-design`.

## Instructions

1. Batch every per-parent lookup with a per-request DataLoader. The default resolver issuing one query per list element turns a 200-item list into 201 round trips and is the most common GraphQL slowdown.
2. Cap query cost, not just depth. Depth limits do not stop a shallow query with `first: 1000` on five nested lists; compute weighted cost from the query AST.
3. Enforce a `maxAliases` limit, or one field repeated 500 times aliases into 500 resolver invocations and defeats every other limit.
4. Always set a query timeout and disable introspection in production. A resolver waiting on a downstream timeout must not hold the connection open indefinitely.
5. Return `null` rather than an error when a nested field is genuinely absent, so one failure does not null the whole response and force a client refetch.
6. Precompute or persist documents (APQ or a persisted-query allowlist). Parsing and validating a large document every request is measurable, and an allowlist is also the cheapest complexity defence.
7. Batch across service boundaries the same way as across tables. Without batching, calling a downstream service per list element multiplies network latency instead of database latency.
8. Track field-execution count and resolver duration percentiles per operation type. A regression usually shows as `fields/req` climbing long before p99 does.

## Patterns

Per-request DataLoader with a batch ceiling:

```ts
import DataLoader from "dataloader";

export type Loaders = { userById: DataLoader<string, User | null>; productsBySku: DataLoader<string, Product | null> };

export function createLoaders(ctx: { db: Db; billing: BillingClient }): Loaders {
  // One instance per operation. A module-level loader caches across requests,
  // which leaks data between users and serves rows from before an invalidation.
  const userById = new DataLoader<string, User | null>(
    async (ids) => {
      const rows = await ctx.db.user.findMany({ where: { id: { in: [...ids] } } });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id) ?? null); // one value per requested key, in order
    },
    { maxBatchSize: 500, cache: true }, // cap so a 10k-key request cannot build one huge query
  );

  const productsBySku = new DataLoader<string, Product | null>(
    async (skus) => {
      const rows = await ctx.billing.getProducts(skus); // batching crosses services too
      const bySku = new Map(rows.map((r) => [r.sku, r]));
      return skus.map((s) => bySku.get(s) ?? null);
    },
    { maxBatchSize: 200 },
  );

  return { userById, productsBySku };
}

export const resolvers = {
  Order: {
    customer: (order: Order, _a: unknown, ctx: Context) => ctx.loaders.userById.load(order.customerId),
    items: (order: Order) => order.items, // already on the row: zero extra queries
  },
  OrderItem: {
    product: (item: { sku: string }, _a: unknown, ctx: Context) => ctx.loaders.productsBySku.load(item.sku),
  },
  Query: {
    orders: async (_r: unknown, args: { first: number }, ctx: Context) => {
      // Argument bounds are the server's job, not the client's.
      if (args.first < 0 || args.first > 100) {
        throw new GraphQLError("first must be between 0 and 100", { extensions: { code: "BAD_USER_INPUT" } });
      }
      return ctx.db.order.findMany({ take: args.first, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    },
  },
};
```

AST-based cost, depth, and alias limits enforced before execution:

```ts
import { parse, visit, Kind, type DocumentNode } from "graphql";

const MAX_COST = 1000;
const MAX_DEPTH = 12;
const MAX_ALIASES = 30;
const FIRST_WEIGHT = 0.05;

export function analyzeComplexity(source: string): { cost: number; depth: number; aliases: number } {
  const doc: DocumentNode = parse(source);
  let cost = 1;
  let maxDepth = 0;
  let aliases = 0;

  // Resolve each field's effective `first`, so an omitted argument is not free.
  const firstDefaults = new Map<string, number>();
  visit(doc, {
    Field(node) {
      const arg = node.arguments?.find((a) => a.name.value === "first");
      firstDefaults.set(node.name.value, arg ? Number(arg.value.kind === Kind.INT ? arg.value.value : 25) : 25);
    },
  });

  function walk(node: any, depth: number, multiplier: number): void {
    if (node.kind === Kind.FIELD) {
      if (node.alias) aliases += 1;
      const first = firstDefaults.get(node.name.value) ?? 0;
      const m = node.selectionSet ? multiplier * first : 1;
      cost += node.selectionSet ? m * FIRST_WEIGHT * 10 : m;
      maxDepth = Math.max(maxDepth, depth);
      node.selectionSet?.selections.forEach((sel: any) => walk(sel, depth + 1, m));
    } else if (node.selectionSet) {
      node.selectionSet.selections.forEach((sel: any) => walk(sel, depth, multiplier));
    } else if (node.arguments) {
      cost += multiplier * FIRST_WEIGHT;
    }
  }

  walk(doc, 1, 1);
  return { cost: Math.ceil(cost), depth: maxDepth, aliases };
}

export function enforceQueryLimits(source: string, persisted?: Set<string>): void {
  // Allowlist: only known-good documents execute. Cheapest DoS defence available.
  if (persisted && !persisted.has(sha256(source))) {
    throw new GraphQLError("Only pre-registered queries are permitted", { extensions: { code: "PERSISTED_QUERY_NOT_ALLOWED" } });
  }

  const { cost, depth, aliases } = analyzeComplexity(source);
  if (aliases > MAX_ALIASES) throw new GraphQLError(`${aliases} aliases exceeds limit ${MAX_ALIASES}`, { extensions: { code: "QUERY_TOO_COMPLEX" } });
  if (depth > MAX_DEPTH) throw new GraphQLError(`depth ${depth} exceeds limit ${MAX_DEPTH}`, { extensions: { code: "QUERY_TOO_COMPLEX" } });
  if (cost > MAX_COST) throw new GraphQLError(`cost ${cost} exceeds limit ${MAX_COST}`, { extensions: { code: "QUERY_TOO_COMPLEX" } });
}
```

Server wiring with fresh loaders per operation and field instrumentation:

```ts
import { createServer } from "yoga";

export const yoga = createServer({
  schema,
  validationRules: [...specifiedRules], // unknown fields rejected before any resolver runs
  maskedErrors: process.env.NODE_ENV === "production",

  context: async ({ request }) => {
    const source = await readBody(request);
    enforceQueryLimits(source, persistedQueryHashes);
    const billing = createBillingClient();
    return { db, billing, loaders: createLoaders({ db, billing }) }; // loaders per operation
  },

  plugins: [
    {
      onExecute({ args }) {
        const started = performance.now();
        const executor = args.executeFn;
        return () => async (result: ExecutionResult) => {
          const op = args.contextValue.operationName ?? "anonymous";
          metrics.increment("graphql.operations", { op });
          metrics.gauge("graphql.fields_per_req", { op }, countResultFields(result));
          metrics.timing("graphql.duration_ms", { op }, performance.now() - started);
          return result;
        };
        void executor;
      },
    },
  ],
});

function countResultFields(result: ExecutionResult): number {
  const walk = (data: unknown): number => {
    if (Array.isArray(data)) return data.reduce<number>((sum, d) => sum + walk(d), 0);
    if (data && typeof data === "object") return Object.values(data as Record<string, unknown>).reduce<number>((sum, v) => sum + walk(v), 1);
    return 1;
  };
  return walk(result.data ?? null);
}
```

## Checklist

- [ ] DataLoader instances are created per request and used for every per-parent lookup
- [ ] Query cost, depth, and alias count are computed from the AST and enforced before execution
- [ ] Server-side limits cap `first`/`last` on every paginated field
- [ ] Persisted queries or an allowlist gate arbitrary documents in production
- [ ] Introspection is disabled and a query timeout is enforced in production
- [ ] `fields/req` and resolver duration percentiles are tracked per operation name
- [ ] Batching crosses service boundaries, not just database calls

## Anti-patterns

**No DataLoader, so N+1 over the network.** A list of 200 orders resolving `customer` per item issues 200 sub-requests; the endpoint slows in proportion to page size and the downstream service rate-limits. Batch into one request.

**Depth limit as the only complexity control.** A deeply nested query fits any depth limit, while a shallow query with `first: 10000` on three lists passes and runs 30,000 resolvers. Compute weighted cost from arguments.

**Sharing DataLoader instances across requests.** A module-level loader caches rows from request one into request two, leaking one user's data to another and serving values that predate an invalidation. Scope loaders to the operation.

**Client-side filtering with over-fetching.** Returning 40 fields and hiding 35 in the UI multiplies database work and payload by a factor you cannot see. Request only the fields the client needs.