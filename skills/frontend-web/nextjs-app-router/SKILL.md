---
name: nextjs-app-router
description: Implements Next.js App Router correctly — Server Components, async request APIs, Server Actions with revalidation, streaming Suspense, route handlers, and metadata. Use when building routes under `app/`, fixing stale cached pages after mutations, or eliminating server/client waterfalls and `"use client"` overuse.
---

# Next.js App Router

**Use when:** building routes under `app/`, mutating data from the UI, fixing stale cached output after a write, or removing `"use client"` bloat and sequential `await` waterfalls.
**Do not use when:** the app still uses the Pages Router — migrate first; for framework-agnostic render performance see `react-performance`.

## Instructions

1. Default to Server Components. Add `"use client"` only at the lowest interactive leaf (forms, menus, canvas), never at a layout that wraps static content.
2. Treat `cookies()`, `headers()`, `draftMode()`, `params`, and `searchParams` as async: `await` them. Reading them synchronously works in dev and fails in production builds.
3. Do not pass functions or non-serialisable values from a Server Component to a Client Component. Pass data, or move the boundary down.
4. Stream with Suspense: start independent fetches without awaiting, then `await` inside separate boundaries so the shell flushes immediately.
5. Mutate with Server Actions (`"use server"`), validate with a shared Zod schema, and call `revalidatePath`/`revalidateTag`/`updateTag` explicitly after every write.
6. Remember that Server Actions are public HTTP endpoints: always re-check authentication and authorisation inside the action, never rely on the UI hiding the button.
7. Read the action result with `useActionState` and surface pending/error states with `useFormStatus` or the third state argument.
8. Use route handlers (`route.ts`) only for webhooks, custom endpoints, and streaming responses; for JSON from Server Components call your data layer directly.
9. Keep caching intent explicit. Add `revalidate` or `cacheLife`/`cacheTag` per fetch, and set `dynamic = "force-dynamic"` only when genuinely per-request.
10. Export `generateMetadata` per route segment and add `sitemap.ts` / `robots.ts` file conventions instead of hand-written XML.

## Patterns

Async request APIs plus streaming boundaries:
```tsx
// app/dashboard/[teamId]/page.tsx — a Server Component
import { Suspense } from "react";
import { cookies } from "next/headers";

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params; // params is a Promise in Next 15
  return { title: `Team ${teamId} · Acme` };
}

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const session = (await cookies()).get("session"); // await it: sync reads throw in prod

  // Both requests start now; neither blocks the shell
  const revenue = getRevenue(teamId);
  const members = getMembers(teamId);
  return (
    <main>
      <h1>Team {teamId}</h1>
      {!session && <p>Signed out: showing public totals only.</p>}
      <RevenuePanel promise={revenue} />
      <Suspense fallback={<MembersSkeleton />}>
        <MembersPanel promise={members} />
      </Suspense>
    </main>
  );
}
```

Server Action with validation, revalidation, and `useActionState` on the client:
```ts
// app/teams/[teamId]/actions.ts
"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";

const InviteSchema = z.object({ email: z.email(), role: z.enum(["member", "admin"]) });

export async function inviteMember(teamId: string, _prev: State, formData: FormData): Promise<State> {
  // Actions are public endpoints: authorise inside the action, not in the UI
  const session = await requireSession();
  const parsed = InviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { error: "Check the email and role", fieldErrors: parsed.error.flatten().fieldErrors };
  if (!session.teams.includes(teamId)) return { error: "Not allowed" };

  await db.invite(teamId, parsed.data.email, parsed.data.role);
  revalidateTag(`team:${teamId}`);
  revalidatePath(`/teams/${teamId}/members`);
  return { ok: true };
}

export type State = { error?: string; ok?: boolean; fieldErrors?: Record<string, string[]> };
```
```tsx
"use client";
import { useActionState } from "react";

const initial: State = {};

export function InviteForm({ teamId }: { teamId: string }) {
  const [state, action, pending] = useActionState(inviteMember.bind(null, teamId), initial);
  return (
    <form action={action} aria-busy={pending}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" aria-invalid={Boolean(state.fieldErrors?.email)} />
      {state.fieldErrors?.email?.map((m) => <p key={m} role="alert">{m}</p>)}
      <button type="submit" disabled={pending}>{pending ? "Inviting…" : "Invite"}</button>
      <p role="status">{state.ok ? "Invitation sent" : state.error}</p>
    </form>
  );
}
```
## Checklist

- [ ] `"use client"` only on interactive leaves; layouts wrapping static content stay server-rendered.
- [ ] `await` is used for `cookies`, `headers`, `params`, and `searchParams` everywhere.
- [ ] No functions or class instances are passed across the server/client boundary.
- [ ] Independent fetches start in parallel and resolve inside separate Suspense boundaries.
- [ ] Every Server Action re-authorises the caller and revalidates the affected paths or tags.
- [ ] Action results are consumed via `useActionState`; pending state uses `aria-busy`.
- [ ] Caching is explicit per fetch (`revalidate`, `cacheTag`, or `no-store`); nothing relies on defaults by accident.
- [ ] `generateMetadata`, `sitemap.ts`, and `robots.ts` are defined per route segment.

## Anti-patterns

**Awaiting request APIs synchronously.** `cookies().get("session")` without `await` type-checks in some setups and throws during a production render, producing a 500 only in deployed builds. Fix: `await cookies()` and type `params`/`searchParams` as promises.

**Mutating without revalidation.** The write succeeds and the user stares at the old list until a hard refresh, so the app appears broken. Fix: call `revalidateTag`/`revalidatePath` in the action itself, not in a client effect.

**`"use client"` at the layout root.** Every child component becomes part of the client bundle, so server-only imports and RSC data fetching are lost. Fix: push the boundary down to the interactive leaf and keep data loading in server components.