---
name: typescript-strict-mode
description: Turns on TypeScript strict-family compiler flags and clears the errors they surface, using tsconfig strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, and satisfies. Use when migrating a project to strict mode, when implicit any or unchecked index access is hiding bugs, when a large batch of type errors blocks a build, or when deciding which strict flag to adopt next.
---

# TypeScript Strict Mode

**Use when:** `strict` is off or partial, `any` has crept into typed code, or a codebase has accumulated type errors that everyone has learned to ignore.
**Do not use when:** the types themselves are wrong-shaped — modelling a domain with unions and generics is `typescript-generic-patterns`; validating untrusted request bodies at runtime is `input-validation`.

## Instructions

1. Turn on the family flags in one commit, not one per week. `strict` implies `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, and `alwaysStrict`; pair it with `noUnusedLocals` and `noUnusedParameters`.
2. Add `noUncheckedIndexedAccess` next. It is the single highest-value flag for real bugs: `arr[0]` becomes `T | undefined` instead of silently claiming a `T` exists. Every new error it reports is a genuine out-of-bounds read you had been getting away with.
3. Add `exactOptionalPropertyTypes` after that, and only with a plan: it distinguishes `{ x?: string }` from `{ x: string | undefined }`, which is what stops "assign the prop, forget the default" bugs, but it breaks every library type that was written loosely.
4. Run `tsc --init` only for a greenfield file. In an existing repo, edit `tsconfig.json` by hand — the generated file omits the flags that matter and adds `moduleResolution` settings that fight the bundler.
5. Measure before and after: `npx tsc --noEmit --pretty false 2>&1 | Measure-Object -Line`. Record the error count in the PR description so the reviewer can see the delta instead of guessing.
6. Clear errors in dependency order — libraries, then hooks and utils, then components, then tests. Fixing a leaf type removes dozens of downstream `any` escape hatches for free.
7. Ban the escape hatches in the same PR. `noImplicitAny` is worthless if the codebase answer to every hard error is `as unknown as T` or an `any` alias.
8. Replace `any` with the three honest alternatives in order of preference: `unknown` plus narrowing, a real type, or a generic parameter `<T>` when the caller owns the detail.
9. Use `satisfies` instead of a type annotation when you want the value checked *and* the literal keys kept:

   ```ts
   // ❌ annotation widens, so typos in these keys are now legal
   const routes: Record<string, Handler> = { "GET /users": listUsers }

   // ✅ satisfies checks the shape and keeps autocomplete for the real keys
   const routes = {
     "GET /users": listUsers,
     "GET /orders": listOrders,
   } satisfies Record<string, Handler>
   ```

10. Add `"typecheck": "tsc --noEmit"` to CI and run it on every PR, separate from `build`, so a type failure cannot be discovered only at deploy time.
11. Fix the escape routes in lint too: `@typescript-eslint/no-explicit-any`, `no-unsafe-assignment`, `no-unsafe-member-access` at `error` in the files you own, warning elsewhere so the count ratchets down.

## Patterns

The flag set that actually holds the line, with the reasons each one is on:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "lib": ["es2023", "dom", "dom.iterable"],
    "jsx": "react-jsx",
    "noEmit": true,
    "skipLibCheck": true
  }
}
```

The four errors `strict` finds in real code, and the fix for each:

```ts
// 1. implicit any on a callback parameter
items.map((item) => item.name)
items.map((item: CartLine) => item.name)

// 2. possibly undefined — the real bug noUncheckedIndexedAccess exposes
const first = list[0].name            // ❌
const first = list[0]?.name           // ✅ deliberate: absence is fine
const [head] = list
if (!head) return renderEmpty()      // ✅ deliberate: absence is not fine

// 3. object literal is missing a required field, caught by satisfies
const config = { retries: 3 } satisfies RetryPolicy   // ❌ error: missing backoffMs

// 4. a class field shadowing a base member
class Base { label = "" }
class Button extends Base {
  override label = "go"   // ✅ `noImplicitOverride` makes this explicit
}
```

Typed boundaries instead of `any` at the edges where data enters:

```ts
type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

function isJson(input: unknown): input is Json {
  if (input === null || typeof input !== "object") return false
  return Object.values(input).every(
    (v) => v === null || ["string", "number", "boolean"].includes(typeof v) || isJson(v),
  )
}

async function loadConfig(url: string): Promise<Config> {
  const res = await fetch(url)
  const body: unknown = await res.json()      // unknown, not any
  if (!isConfig(body)) throw new ConfigError(body)
  return body
}
```

## Checklist

- [ ] `strict: true` is on in the shared `tsconfig.json`, and every package extends it rather than re-declaring compiler options.
- [ ] `noUncheckedIndexedAccess` is on, and each new error it produced was fixed rather than silenced with `!`.
- [ ] `exactOptionalPropertyTypes` is on or has a dated ticket explaining why it is not.
- [ ] `tsc --noEmit` runs as its own CI job and is required, not advisory.
- [ ] `npx tsc --noEmit` reports zero errors in `src/` — not zero errors with `skipLibCheck` hiding library noise plus hand-written `// @ts-ignore`.
- [ ] `as unknown as` appears nowhere new; each existing one has a comment saying which unsoundness it is papering over.
- [ ] `@typescript-eslint/no-explicit-any` is an error, and there is a ratcheting baseline file for the legacy hits.
- [ ] `satisfies` is used for config maps and route tables so literal keys stay autocompleted and typos fail.
- [ ] The PR that enabled each flag records the before/after error count.

## Anti-patterns

**`strict: false` with `"strict": true` in an unused base config.** The base file looks correct in review and the app inherits a child config that turns it back off. Fix: one root `tsconfig.json`, extend-only children, and verify with `tsc --showConfig | Select-String '"strict": true'`.

**`!` non-null assertion to clear a batch of errors.** `list[0]!.id` silences the compiler without changing the runtime, so the crash just moves to production. Fix: handle the `undefined` branch; when a branch is provably dead, assert at the boundary once with a comment, not at every use site.

**`as any` on a library whose types are wrong.** It compiles, and now every value flowing through that point is unchecked. Fix: wrap the library once with a typed adapter that does the cast inside, or add a `@types` patch in `types/` and reference it via `paths`.

**Fixing the type instead of the bug.** Adding an optional field or widening to `Record<string, unknown>` makes the error go away and hides the missing case. Fix: ask what the code means when that value is absent — the answer is usually a new explicit state, not a wider type.

**Enabling every strict flag in one giant PR.** 4,000 errors in a single diff is unreviewable, so it gets rubber-stamped and the flags get reverted. Fix: one flag per commit, small enough that CI stays green and the reviewer can follow the diff.