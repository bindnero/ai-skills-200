---
name: forms-validation
description: Validates forms with shared Zod schemas, native constraint validation, and accessible error messaging wired through `aria-invalid` and `aria-describedby`. Use when building signup/checkout/settings forms, mirroring validation between client and server, fixing inaccessible or jarring error UX, or hardening input handling.
---

# Forms Validation

**Use when:** building or fixing signup, checkout, settings, and multi-step forms; mirroring validation rules between client and server; or making error messages announced and properly associated.
**Do not use when:** the data is being validated in a backend service or database layer — use the backend API skill; for input sanitisation against injection use the security category.

## Instructions

1. Write one Zod schema per form in a shared module (`shared/validation/*.ts`) imported by both the client form and the server action/route. Never re-declare rules in two places.
2. Start from the server: define the schema, derive TypeScript types with `z.infer`, and let the type drive field rendering. The client then cannot drift from the server.
3. Turn off browser bubbles with `noValidate` on the `<form>` and render your own messages, unless the native UX is genuinely acceptable — inconsistent native bubbles look broken in a designed UI.
4. Validate on blur for text fields, on change for already-invalid fields, and on submit for everything. Never validate an untouched field on every keystroke; that punishes the user mid-sentence.
5. Wire each field with `id`, `<label htmlFor>`, `aria-invalid`, and `aria-describedby` pointing at both the hint and the error node; keep the error node in the DOM (visually hidden if needed) so the association is valid.
6. Return server errors in a structured shape keyed by field path (`{ fieldErrors, formErrors }`) and merge them into the form state so the user sees errors without retyping.
7. Announce async submission status: `aria-busy` on the submit button, `useFormStatus` for the pending state, and an `aria-live="polite"` region for success/failure summaries.
8. Support autofill and password managers — set correct `autocomplete` tokens (`email`, `new-password`, `one-time-code`) and never disable inputs to "protect" values.
9. Mark optional fields as optional in the schema rather than omitting `required`, so screen reader users know which fields may be empty. Test the rules with table-driven schema cases plus Testing Library tests for blur, submit, and server-error merge.

## Patterns

Shared schema is the single source of truth for client and server:

```ts
// shared/validation/signup.ts
import { z } from "zod";

export const signupSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(12, "Use at least 12 characters")
    .regex(/[0-9]/, "Include a number")
    .regex(/[^A-Za-z0-9]/, "Include a symbol"),
  displayName: z.string().trim().min(2, "Enter at least 2 characters"),
  marketingOptIn: z.boolean(),
});

export type SignupInput = z.infer<typeof signupSchema>;
```

Field wiring — label, hint, and error all reachable from the input:
```tsx
export function EmailField({ error, ...field }: FieldProps) {
  const id = useId();
  const describedBy = [field["aria-describedby"], `${id}-hint`, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="field">
      <label htmlFor={id}>Work email</label>
      <input
        {...field}
        id={id}
        type="email"
        autoComplete="email"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      <p id={`${id}-hint`} className="field__hint">We only use this for sign-in.</p>
      <p id={`${id}-error`} className="field__error">{error}</p>
    </div>
  );
}
```

React Hook Form with the shared resolver and blur mode:

```tsx
const form = useForm<SignupInput>({
  resolver: zodResolver(signupSchema),
  mode: "onBlur",
  reValidateMode: "onChange",
  defaultValues: { marketingOptIn: false },
});

async function onSubmit(values: SignupInput) {
  const parsed = signupSchema.safeParse(values);
  if (!parsed.success) return;
  const res = await fetch("/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  const body = await res.json();
  if (res.ok) return router.push("/welcome");

  // Server is authoritative: map its field errors back into the form
  form.setError("root.server", { message: body.message ?? "Something went wrong" });
  for (const [name, message] of Object.entries(body.fieldErrors ?? {})) {
    form.setError(name as keyof SignupInput, { message });
  }
}
```

```tsx
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Creating account…" : "Create account"}
    </button>
  );
}

/* One polite region for the outcome, placed right after the form */
<p role="status" aria-live="polite">{form.formState.errors.root?.server?.message}</p>
```

## Checklist

- [ ] One Zod schema per form, imported by both client and server; types from `z.infer`, no hand-written interfaces.
- [ ] `<form noValidate>` set when custom error UI is rendered.
- [ ] Every field has `id` + `<label htmlFor>` + `aria-invalid` + `aria-describedby` referencing hint and error nodes.
- [ ] `autocomplete` tokens set; no input disabled to protect a value.
- [ ] Tests cover schema rules, blur validation, submit validation, and server-error merge.

## Anti-patterns

**Validating on every keystroke for untouched fields.** The user is told "invalid email" after the first character, which is both wrong and hostile. Fix: `mode: "onBlur"` with `reValidateMode: "onChange"`, and validate untouched fields on submit.

**Rules duplicated in HTML attributes and JS.** `required` plus `minLength` plus a regex in a resolver means three sources of truth whose messages disagree. Fix: attributes for semantics and autofill behaviour only; the schema owns rules and messages.

**Error text in `aria-label` or `title`.** Screen readers announce a label change on focus but not when the user moves on, and hover-only tooltips fail keyboard and touch. Fix: a visible error node referenced by `aria-describedby`.

**Client-only validation before a plain `fetch`.** Rules live in the bundle and can be bypassed, and the API must re-validate anyway. Fix: import the same schema server-side, treat its result as authoritative, and map failures back to fields.