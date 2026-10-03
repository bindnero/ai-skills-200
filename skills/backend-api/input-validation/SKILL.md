---
name: input-validation
description: Validates and coerces untrusted API input with schema libraries, typed errors, and size limits enforced before parsing. Use when adding request validation to endpoints, hardening parsers, or turning untyped bodies into TypeScript types.
---

# Input Validation

**Use when:** request data crosses a trust boundary — path params, query strings, headers, bodies, uploads, webhook payloads — and must become trusted typed values.
**Do not use when:** the input is already trusted in-process, or it is a query you are deliberately passing to a database builder — see `query-optimization`.

## Instructions

1. Validate at the edge, once, before business logic or I/O. A handler should never see `unknown`; if a variable is unvalidated, the type system should say so.
2. Derive the output type from the schema (`z.infer<typeof CreateUser>`) so types cannot drift from validation.
3. Reject unknown keys on strict endpoints. `.strict()` or `additionalProperties: false` stops a client smuggling `role: "admin"` into a body that would silently ignore it.
4. Apply limits at every dimension: string length, array count, numeric range, nesting depth, and body bytes. A validator with no `.max()` is an unbounded allocation.
5. Validate strings for format, not just type: email, URL, ULID/UUID, currency code, ISO-8601. Never hand a client string to `new Date()` or `new URL()` unchecked.
6. Normalize before use — trim, lowercase identifiers, collapse whitespace — and validate after normalizing so `" USER@x.com "` cannot create a second account.
7. Return field-addressed errors with a machine code and pointer path. `"invalid input"` gives the client nothing actionable.
8. Cap the work validation itself can do: bound body size at the proxy, reject deep nesting, and avoid regexes with nested quantifiers that backtrack catastrophically.

## Patterns

Schema module as the single source of truth for a route:

```ts
import { z } from "zod";

export const CreateUserInput = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),       // normalize then validate
    displayName: z.string().trim().min(1).max(80).optional(),
    age: z.number().int().min(13).max(130).optional(),
    currency: z.string().length(3).regex(/^[A-Z]{3}$/).default("USD"),
    address: z.object({
      line1: z.string().trim().min(1).max(200),
      country: z.string().length(2).regex(/^[A-Z]{2}$/),
      postalCode: z.string().trim().min(2).max(16),
    }).strict(),
    tags: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
    // Discriminated union: the client picks one shape, it cannot blend them.
    contact: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("email"), email: z.string().email() }).strict(),
      z.object({ kind: z.literal("sms"), phone: z.string().regex(/^\+[1-9]\d{7,14}$/) }).strict(),
    ]),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.age !== undefined && val.age < 18 && val.contact.kind === "sms") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["contact"], message: "Minors cannot be contacted by SMS" });
    }
  });

export type CreateUserInput = z.infer<typeof CreateUserInput>;

export const UpdateUserPatch = z
  .object({ displayName: z.string().trim().min(1).max(80), age: z.number().int().min(13).max(130) })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Patch must contain at least one field" });
```

Middleware that attaches the parsed value and produces structured errors:

```ts
import type { RequestHandler } from "express";
import { ZodError, type ZodTypeAny } from "zod";
import { HttpError } from "./errors.js";

type Source = "body" | "query" | "params";

export function validate<S extends ZodTypeAny>(schema: S, source: Source = "body"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = (result.error as ZodError).issues.map((i) => ({ path: i.path.join(".") || "(root)", code: i.code, message: i.message }));
      next(new HttpError(422, "validation_failed", "Request failed validation", { violations: errors }));
      return;
    }
    // Replace the raw value with the coerced, normalized output.
    Object.defineProperty(req, `validated${source[0].toUpperCase()}${source.slice(1)}`, {
      value: result.data,
      writable: false,
      configurable: true,
    });
    next();
  };
}

app.post("/v1/users", validate(CreateUserInput, "body"), async (req, res) => {
  const input = (req as Request & { validatedBody: CreateUserInput }).validatedBody;
  const user = await userService.create(input);
  res.location(`/v1/users/${user.id}`).status(201).json(user);
});
```

Limits applied before the parser allocates, and the runtime rejection path:

```ts
import express from "express";

app.use(express.json({
  limit: "256kb", // hard ceiling BEFORE parsing, not after
  depth: 12,      // reject pathological nesting early
  strict: true,   // objects and arrays only at the top level
  type: ["application/json", "application/*+json"],
}));

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: { code: "malformed_json", message: "Request body is not valid JSON" } });
    return;
  }
  if (isHttpError(err) && err.status === 413) {
    res.status(413).json({ error: { code: "payload_too_large", message: "Body exceeds 256kb" } });
    return;
  }
  next(err);
});
```

## Checklist

- [ ] Every handler argument is `unknown` at the boundary and typed after validation
- [ ] Types are inferred from the schema, never maintained beside it
- [ ] Request objects are strict; unknown keys are rejected, not ignored
- [ ] Strings, arrays, numbers, nesting depth, and body bytes all have maximums
- [ ] Identifiers and emails are normalized before the uniqueness check
- [ ] Errors name the field path, a machine code, and a message
- [ ] The 400-versus-422 split is consistent: malformed syntax is 400, semantics are 422
- [ ] Tests explicitly exercise invalid input for every route

## Anti-patterns

**Trusting because the client is "our app".** A mobile client is attacker-controlled; anyone can replay a captured request with curl. Validate every field on every path regardless of caller identity.

**Ad-hoc `if (!body.name)` checks in handlers.** They miss nested fields and produce inconsistent error shapes. One schema at the boundary is both shorter and complete.

**Validating but keeping the raw input.** Parsing into a variable and then reading `req.body` again bypasses normalization and lets unnormalized values reach the database. Replace the source with the parsed output.

**Unbounded validation.** No `.max()` on strings or arrays and no body limit means one deeply nested multi-megabyte payload exhausts memory in the JSON parser before your schema runs. Set limits at the proxy and in the schema.