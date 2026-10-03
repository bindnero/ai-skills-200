---
name: typescript-result-handling
description: Models fallible operations as typed Result and Option values with exhaustive matching instead of thrown exceptions, unchecked nulls, or ad-hoc error codes. Use when errors are caught and ignored, when a function returns null for several different reasons, when building a library callers must use safely, or when designing an error contract that stays type-safe end to end.
---

# TypeScript Result Handling

**Use when:** failure is represented by `null`, an empty string, a thrown `any`, or a boolean flag, and the consequence is a silently skipped branch or an unhandled rejection.
**Do not use when:** you need the wire format for an HTTP error body — that is `error-contract-design`; the shape of the fallible value itself is `typescript-generic-patterns`.

## Instructions

1. Pick one convention per boundary and write it down. Three of these approaches work: `Result`/`Either` values, typed exceptions (`class NotFound extends Error`), or an out-param carrying the error. Mixing two conventions in one module means every caller has to know both.
2. Use `Result` when failure is expected and the caller must act on it — parsing, network calls, feature probes. Use exceptions for genuinely exceptional states and reserve them for programmer errors that should never be caught in bulk.
3. Never return `null` to mean several different things. `findUser(): User | null` forces every caller to invent an error path, and "not found" gets reported as a 500 because nobody recorded the distinction.
4. Make the error channel typed and narrow: `Error` has no `code`, so catch blocks cast, and the cast is unchecked. A `Result<T, AppError>` where `AppError` is a discriminated union forces the caller to handle each case by name.
5. Return errors, do not log and swallow. `catch (e) { logger.warn(e); return null }` converts a typed failure into an undefined value and pushes the handling decision onto every caller.
6. Make the happy path the default and the error path explicit. `const { value, error } = await load(url)` then `if (error) return errorView(error)` reads top-to-bottom without a `try` block.
7. Turn every `catch` into a decision: rethrow as a typed error, return a `Result`, or re-emit as an observable metric. A `catch` that only logs is a bug with a stack trace pointing the wrong way.
8. Mark the functions that must not throw. A `parse(): Result<Config, ConfigError>` with `no-throw` discipline is testable exhaustively; wrap third-party calls that throw (`JSON.parse`, `fetch`) at the boundary and convert once.
9. Thread results through rather than unwrapping early. The moment you `unwrap()` in the middle of a pipeline, the caller above must remember to check again — so the type stops carrying the information the function had.
10. Keep async failures in the type. A rejected promise is invisible to the compiler; a `Promise<Result<T, E>>` puts the failure in the signature where the caller sees it. Add `void` before genuinely fire-and-forget calls so lint does not hide the omission.
11. Log once, at the edge. Convert and enrich internal errors into the wire error contract in one boundary module, so business logic throws domain errors and only the edge knows about status codes.
12. Exhaustively match. Every `switch` over `Result` or an error union ends with `assertNever`, and every error variant has an owner — if nobody handles a case, the union should not contain it yet.

## Patterns

The two channel types, kept small enough to read inline:

```ts
export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export type Option<T> = { some: true; value: T } | { some: false }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

// recover / unwrap turns the type back into an exception at the boundary only
export function unwrap<T, E extends Error>(r: Result<T, E>): T {
  if (r.ok) return r.value
  throw r.error
}
```

A typed error union, so callers switch on names instead of strings they could typo:

```ts
export type AppError =
  | { kind: "not-found"; resource: string; id: string }
  | { kind: "conflict"; resource: string; currentVersion: number }
  | { kind: "rate-limited"; retryAfterMs: number }
  | { kind: "upstream"; service: string; status: number }
  | { kind: "invalid"; field: string; reason: string }

function describe(e: AppError): string {
  switch (e.kind) {
    case "not-found": return `${e.resource} ${e.id} does not exist`
    case "conflict": return `${e.resource} changed since you read it (v${e.currentVersion})`
    case "rate-limited": return `try again in ${e.retryAfterMs}ms`
    case "upstream": return `${e.service} responded ${e.status}`
    case "invalid": return `${e.field}: ${e.reason}`
    default: return assertNever(e, "describe")
  }
}
```

Async work that carries failure in the signature, plus the boundary that converts thrown values once:

```ts
async function loadProfile(id: string): Promise<Result<Profile, AppError>> {
  const res = await fetch(`/api/profiles/${id}`)
  if (res.status === 404) return err({ kind: "not-found", resource: "profile", id })
  if (res.status === 429) return err({ kind: "rate-limited", retryAfterMs: 5000 })
  if (!res.ok) return err({ kind: "upstream", service: "profiles", status: res.status })
  return ok((await res.json()) as Profile)      // narrow at the trust boundary only
}

function parsePort(input: string): Result<number, AppError> {
  const n = Number(input)
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return err({ kind: "invalid", field: "port", reason: `${input} is not a TCP port` })
  }
  return ok(n)
}
```

Call sites that cannot skip the error path:

```ts
const result = await loadProfile(id)
if (!result.ok) return renderError(describe(result.error))   // explicit, no try/catch
renderProfile(result.value)

// sequences: each step checked once, never unwrapped in the middle
const port = parsePort(process.env.PORT ?? "")
if (!port.ok) throw new ConfigError(port.error)
const profile = await loadProfile(id)
if (!profile.ok) throw new AppFailure(profile.error)
startServer({ port: port.value, user: profile.value })
```

## Checklist

- [ ] One error convention per module, stated in a comment at the module's top.
- [ ] No function returns `null`, `0`, or `""` as a multi-meaning failure signal.
- [ ] Expected failures are `Result` values; exceptions are reserved for programmer errors and unwrapped only at an edge.
- [ ] Error types are discriminated unions, not `Error` with an untyped `code` cast in a `catch`.
- [ ] Every `catch` block converts, rethrows, or records a metric — none only logs.
- [ ] `Promise<Result<T, E>>` is the return type of anything that calls a remote service.
- [ ] Fire-and-forget promises are prefixed with `void` and have a `.catch` that records something.
- [ ] Every `switch` over a `Result` or error union ends in `assertNever`.
- [ ] Internal errors are mapped to status codes and wire bodies in exactly one boundary module.

## Anti-patterns

**`catch { return null }`.** The caller cannot distinguish "no data", "request failed", and "permission denied", so all three get rendered as an empty state. Fix: return a `Result` with a typed error, and render each case differently.

**`error as AppError`.** The thrown value may be a string, a `DOMException`, or a validation library object, so the cast lies and `e.code` is `undefined` on the failure you most needed it for. Fix: normalise unknown values with `error instanceof Error ? error : new Error(String(error))` at the boundary, once.

**Returning `Result` from the domain and unwrapping in every caller.** The moment three of five callers unwrap, the error handling has moved back out of the type and you are back to try/catch. Fix: pass the `Result` up; unwrap only in the handler that owns the user-visible outcome.

**Silent default on failure.** `const items = await loadItems().catch(() => [])` renders a plausible empty list during an outage, and the incident is discovered from a support ticket. Fix: return the error and let the empty state mean "no items", not "the request broke".

**Union used as documentation.** `type Fetched<T> = { data: T; error: null } | { data: null; error: Error }` correctly forbids the impossible combination, then the code immediately builds the impossible one with `as`. Fix: make the illegal object unrepresentable with a constructor, so `as` has nothing to lie about.

**Exceptions for expected outcomes in hot paths.** Throwing and catching per row to skip malformed records costs stack capture on every iteration and hides the failure count. Fix: `flatMap` over `Result` and count the errors afterwards.