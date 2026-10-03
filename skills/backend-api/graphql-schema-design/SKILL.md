---
name: graphql-schema-design
description: Designs GraphQL SDL schemas with sound nullability, non-null propagation rules, and query-root ergonomics. Use when creating or refactoring a `.graphql` schema, defining object and input types, or deciding mutation and error contracts.
---

# GraphQL Schema Design

**Use when:** you are authoring or reviewing a GraphQL schema — types, nullability, input objects, mutations — before writing resolvers.
**Do not use when:** the surface is many small independently cacheable resources — use `rest-api-design`.

## Instructions

1. Default to non-null for anything the server can always produce: `id`, `createdAt`, computed totals. A non-null field that resolves to `null` bubbles the error up and nulls the parent, so nullability is a promise about your data sources, not about one query.
2. Mark nullable exactly where absence is real: optional profile fields, nullable foreign keys, `deletedAt`. Never use nullable to silence a resolver error.
3. Distinguish "field absent" from "list has no members": `friends: [User!]!` is always-present and possibly empty; `[User]` allows a `null` element most clients cannot render.
4. Keep arguments narrow. Prefer a dedicated input object over eight positional scalars so every error path is one `field` name deep.
5. Use `enum`, never `String`, for finite state. An enum generates client unions, validation, and metric dimensions; a string generates a string.
6. Model root fields by cost, not by entity. Both `user(id)` and `userSearch(filter)` let the planner choose; only `allUsers(filter)` forces every caller to fetch.
7. Return the mutated node plus affected aggregates from a mutation, so the client never needs a follow-up round trip to refresh its store.
8. Express partial failure as a typed union member, not by throwing away the whole response.

## Patterns

Schema with deliberate nullability and a typed mutation result:

```graphql
interface Node { id: ID! }

enum UserStatus { ACTIVE SUSPENDED DEACTIVATED }

type User implements Node {
  id: ID!
  status: UserStatus!
  email: String!
  displayName: String          # nullable: genuinely optional column
  avatarUrl: URL               # nullable: absent for invited users
  lastSeenAt: DateTime         # nullable: real NULL in the table
  memberships: [Membership!]! # always present, possibly empty
  primaryWorkspace: Workspace # nullable: row may be soft-deleted
}

input CreateUserInput {
  email: String!
  displayName: String
  workspaceId: ID!
}

union CreateUserResult = CreateUserSuccess | ValidationFailure | ConflictFailure

type CreateUserSuccess { user: User!  membership: Membership! }
type ValidationFailure { errors: [FieldError!]! }
type ConflictFailure { message: String!  conflictingField: String!  existingResourceUrl: URL }
type FieldError { field: String!  message: String! }

type Query {
  node(id: ID!): Node
  viewer: User!
  user(id: ID!): User
  searchWorkspaces(query: String!, first: Int = 10, after: String): WorkspaceConnection!
}

type Mutation {
  createUser(input: CreateUserInput!): CreateUserResult!
  updateUser(id: ID!, patch: UpdateUserInput!): User!
}
```

Resolvers that honour the schema's null promises:

```ts
import { GraphQLError } from "graphql";

const User = {
  memberships: (u: { id: string }, _a: unknown, ctx: Ctx) => ctx.loaders.membershipsByUserId.load(u.id), // [] is fine
  primaryWorkspace: (u: { id: string }, _a: unknown, ctx: Ctx) => ctx.loaders.primaryWorkspaceByUserId.load(u.id), // null is legal
  avatarUrl: (u: { avatarUrl: string | null }, _a: unknown, ctx: Ctx) => {
    if (!u.avatarUrl) return null;
    try {
      return new URL(u.avatarUrl).toString();
    } catch {
      // Non-null field: a bad URL would bubble and null the whole User.
      throw new GraphQLError("Stored avatar URL is malformed", { extensions: { code: "INTERNAL", path: ctx.path } });
    }
  },
};

const Mutation = {
  createUser: async (_r: unknown, { input }: { input: CreateUserInput }, ctx: Ctx) => {
    const email = input.email.trim().toLowerCase();

    if (!ctx.z.string().email().safeParse(email).success) {
      return { __typename: "ValidationFailure", errors: [{ field: "input.email", message: "Must be a valid email" }] };
    }
    if (await ctx.db.user.findUnique({ where: { email } })) {
      return { __typename: "ConflictFailure", message: "Email already registered", conflictingField: "input.email", existingResourceUrl: null };
    }

    const { user, membership } = await ctx.db.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email, displayName: input.displayName } });
      const m = await tx.membership.create({ data: { userId: created.id, workspaceId: input.workspaceId, role: "OWNER" } });
      return { user: created, membership: m };
    });

    ctx.pubsub.publish("user.created", { userCreated: { user } });
    return { __typename: "CreateUserSuccess", user, membership };
  },
};

export const resolvers = { User, Mutation };
```

## Checklist

- [ ] Every non-null field's data source is verified to guarantee it against real rows
- [ ] List types are `[T!]!` or `[T!]` unless an element can genuinely be null
- [ ] No resolver returns `null` to suppress an error on a non-null field
- [ ] Required arguments are non-null and consolidated into an input object
- [ ] Enums replace free-form strings for all finite state
- [ ] Mutations return the mutated node plus affected aggregates
- [ ] Partial failures are union members, not thrown errors
- [ ] `Node`/`PageInfo`/connection shapes are consistent across every list field

## Anti-patterns

**Blanket non-nullability.** Marking everything `!` because the dev seed has no nulls turns one sparse row into an empty `data` object for the client. Derive nullability from the schema, not the sample.

**The `JSON` escape hatch.** A `metadata: JSON` field pushes validation, autocomplete, and permissions out of the schema into client code. Promote the fields you query or validate into typed objects.

**Nullability as error suppression.** Returning `null` because an upstream timed out converts a retryable 503 into a permanent `null` the client caches forever. Throw with `extensions.code`.

**Root fields named after entity plurals.** `users(first: 500)` invites unbounded fetches and removes the server's ability to reject a bad query before execution. Give each access pattern its own root field with a capped, defaulted `first`.