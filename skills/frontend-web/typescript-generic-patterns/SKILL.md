---
name: typescript-generic-patterns
description: Designs TypeScript APIs with generics, discriminated unions, key remapping, and template literal types so callers keep inference instead of annotating every call. Use when a function or hook is drowning in type parameters, when state needs a discriminated union instead of optional booleans, when writing type-safe config or event maps, or when a prop type grows a fifth boolean flag.
---

# TypeScript Generic Patterns

**Use when:** a signature needs two or more type parameters, a component has accumulated boolean props that are mutually exclusive, or callers are writing explicit type arguments they should not have to.
**Do not use when:** you only need the compiler flags to catch unchecked access — that is `typescript-strict-mode`; modelling a fallible operation as a value is `typescript-result-handling`.

## Instructions

1. Count the type parameters before designing. Zero parameters is a plain function, one is usually fine, two is where inference starts breaking, three is where you should split the type or introduce an options object.
2. Give every parameter a job: one is the input shape, one is the thing being collected or produced. If you cannot name the second one in a sentence, delete it.
3. Constrain with `extends` so the implementation is type-safe, not just the callers. A bare `<T>` turns every internal property access into a cast.
4. Prefer inference at the call site. If callers write `useQuery<User>(...)` where the return type already says `User`, the parameter is doing nothing — delete it and let inference work.
5. Push unions into the caller when the function does not care which member it got: `function logAll(events: LogEvent[])` beats `function log<E extends LogEvent>(e: E)`. A generic that returns its parameter unchanged is a cast in disguise.
6. Model states as discriminated unions instead of parallel booleans. `isLoading` plus `data` plus `error` is three booleans describing four impossible combinations; a union of states is one impossible-case check.
7. Add a `never` default to every switch over a union. It turns "someone added a variant" into a compile error at the switch instead of a silent fallthrough at runtime.
8. Use `keyof`, `typeof`, and indexed access to derive types from an existing value. Never hand-maintain a union and the object it describes — they drift within a week.
9. Keep type-level machinery out of runtime files. Type-only helpers live in `types/`, marked `import type`, so the emitted JavaScript stays empty for them.
10. Make illegal states unrepresentable rather than documented. A `{ kind: "open" } | { kind: "closed"; reason: string }` union is checked by the compiler; a `reason?: string` on one object is checked by code review, eventually, maybe.
11. Test the types themselves when they carry real logic: `expectTypeOf(...).toEqualTypeOf<...>()` in a `*.test-d.ts` file, or a compile-only `@ts-expect-error` assertion. If a type change is invisible to tests, it is unprotected.
12. Check the hover output before shipping. If the displayed signature is a wall of `infer` placeholders, the API is too clever for the humans using it — simplify even when the types are technically correct.

## Patterns

Generic over the key, derived from the object itself so the two cannot drift:

```ts
const routes = {
  users: { path: "/users", method: "GET" },
  orders: { path: "/orders", method: "POST" },
} as const

type RouteName = keyof typeof routes                    // "users" | "orders"
type Method = (typeof routes)[RouteName]["method"]      // "GET" | "POST"

function buildUrl<K extends RouteName>(name: K, id: string): string {
  const { path } = routes[name]                        // safe: name is a real key
  return id ? `${path}/${id}` : path
}

buildUrl("users", "42")           // ok
// @ts-expect-error "invoices" is not a route name
buildUrl("invoices", "42")
```

A discriminated union for state, with `never` closing the exhaustiveness hole:

```ts
type RequestState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error; retryable: boolean }

function assertNever(x: never, where: string): never {
  throw new Error(`Unhandled variant ${JSON.stringify(x)} in ${where}`)
}

function label(state: RequestState<User>): string {
  switch (state.status) {
    case "idle": return "Not started"
    case "loading": return "Loading…"
    case "success": return state.data.name      // data exists only here
    case "error": return `${state.error.message}${state.retryable ? " (retry)" : ""}`
    default: return assertNever(state, "label")
  }
}
```

A constrained generic that makes the implementation honest:

```ts
type Identifiable = { id: string }
type Indexed<T extends Identifiable> = { [K in T["id"]]?: T }

function indexById<T extends Identifiable>(items: readonly T[]): Indexed<T> {
  const out: Indexed<T> = {}
  for (const item of items) out[item.id] = item   // no cast, no any
  return out
}

const byId = indexById([{ id: "a", n: 1 }, { id: "b", n: 2 }])   // T inferred, never written
```

Template literal and key-remapped types for event maps:

```ts
type Domain = "orders" | "refunds"
type EventName = `${Domain}.created` | `${Domain}.cancelled`

// each domain only accepts its own events, derived rather than hand-listed
type HandlerMap = {
  [K in Domain]: { [E in EventName as E extends `${K}.${string}` ? E]: (id: string) => void }
}

const handlers: HandlerMap = {
  orders: { "orders.created": (id) => track(id), "orders.cancelled": (id) => refund(id) },
  refunds: { "refunds.created": (id) => track(id), "refunds.cancelled": (id) => reverse(id) },
}
// @ts-expect-error "refunds.created" belongs under refunds
handlers.orders["refunds.created"]
```

Mutually exclusive props as a union, so the invalid combination does not compile:

```ts
type ButtonProps =
  | { variant: "primary" | "ghost"; href: string; onClick?: never; children: string }
  | { variant: "primary" | "ghost"; href?: never; onClick: () => void; children: string }
  | { variant: "loading"; loading: true; href?: never; onClick?: never; children: string }
```

## Checklist

- [ ] Every type parameter has a nameable job, and none of them returns unchanged as its own argument.
- [ ] All type parameters are constrained with `extends`; no bare `<T>` reaches an internal property access.
- [ ] Call sites are annotation-free — no explicit type arguments where inference already succeeds.
- [ ] Component props that are mutually exclusive are one union, not a set of `boolean | undefined` flags.
- [ ] Every switch over a state or event union ends in `assertNever` or an equivalent `never` check.
- [ ] Repeated unions are derived with `keyof`/`typeof`/key remapping instead of copied by hand.
- [ ] Type-level assertions exist in `*.test-d.ts` and run under `vitest typecheck` or `tsc`.
- [ ] Type-only imports use `import type`, and `verbatimModuleSyntax` confirms nothing leaks into the bundle.

## Anti-patterns

**`<T>` used once, adding nothing.** `function first<T>(arr: T[]): T` pretends to be generic but callers still annotate `first<User>(...)`. Fix: drop the parameter, or make it earn its place by constraining it (`T extends { id: string }`).

**Five boolean props that cannot all be true.** `primary`, `ghost`, `loading`, `disabled`, `danger` describes 32 states, three of which are nonsense and none of which the compiler knows about. Fix: a union keyed on `variant`, where the legal combinations are the only ones that type-check.

**A generic that lets the caller choose the output.** `function parse<T>(raw: string): T` means every caller picks the type and the compiler checks nothing. Fix: return `unknown` when the source is untrusted, or let the parser's own signature supply `T`.

**Type gymnastics inside a component file.** Fifty lines of conditional types next to JSX means nobody can review either. Fix: move the type layer to `types/` or a generated declaration, keep a one-line `import type` in the component, and comment the constraint that makes it work.

**Manual union duplication.** `type Status = "pending" | "done"` maintained beside the reducer that handles it. The two drift, and the bug appears only at the unhandled value. Fix: derive the union from the states (`keyof typeof states`) or check exhaustiveness so the drift fails the build. Long `Extract<>` / `Omit<>` chains are the same disease: after four conditional steps nobody can tell what the type is, so name the intermediate types or restructure until each step reads on its own.