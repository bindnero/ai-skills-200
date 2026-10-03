---
name: vercel-deployment
description: Configures Vercel projects with vercel.json, monorepo root directories, function memory and regions, preview environments, cron jobs and security headers. Use when setting up or debugging a Vercel build, fixing a no-Output-Directory error, or cutting edge cold starts.
---

# Vercel Deployment

**Use when:** Configuring a Vercel project — `vercel.json`, monorepo builds, function regions and memory, preview environments, crons or domain mapping.
**Do not use when:** You are self-hosting containers and managing your own ingress; use `docker-image-hardening` with your own orchestrator instead.

## Instructions

1. Run `vercel pull --yes --environment=production` then `vercel build` locally before pushing. Most "works on Vercel" mysteries reproduce locally in under two minutes.
2. In monorepos set `installCommand` explicitly and build through the workspace root. Do not point the project at a subdirectory that is not a standalone install root.
3. Set `outputDirectory` explicitly for Build Output API projects. A missing output directory fails at the deploy step with a confusing message rather than at build time.
4. Pin function `memorySize` and `regions` in `vercel.json`. Default regions route European users to US edges and add latency nobody budgeted for.
5. Keep secrets as Vercel environment variables scoped per environment and sync them locally with `vercel env pull`. Never commit `.env` files.
6. Give every pull request an isolated preview target, ideally a database branch, rather than pointing previews at production data.
7. Declare `crons` in `vercel.json` and pair long jobs with an explicit `maxDuration` that fits the platform limit.
8. Set `cleanUrls` and explicit `headers`, including a strict `Content-Security-Policy` and `Strict-Transport-Security`, applied to every response path.
9. Treat the `NEXT_PUBLIC_` prefix as a public API surface. Anything with it is bundled to the browser; keep secrets in server-only variables.
10. Separate production promotion from the merge to `main`: merge creates a preview, and production moves only through `vercel promote` or an explicit approval.

## Patterns

A `vercel.json` for a monorepo with pinned regions, per-function limits and security headers:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "npm ci",
  "buildCommand": "npm run build --workspace=@acme/web",
  "outputDirectory": "apps/web/.next",
  "regions": ["iad1", "fra1"],
  "cleanUrls": true,
  "functions": {
    "apps/web/app/api/**": {
      "memory": 1024,
      "maxDuration": 30,
      "regions": ["iad1", "fra1"]
    },
    "apps/web/app/api/heavy/**": {
      "runtime": "nodejs22.x",
      "memory": 3008,
      "maxDuration": 300,
      "regions": ["iad1"]
    }
  },
  "crons": [{ "path": "/api/cron/reindex", "schedule": "17 3 * * *" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; frame-ancestors 'none'" }
      ]
    }
  ],
  "build": { "env": { "NEXT_TELEMETRY_DISABLED": "1" } }
}
```

Middleware that gates traffic and routes API calls to the internal service:

```typescript
import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(req: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && !req.headers.get("x-vercel-ip-country")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    const url = req.nextUrl.clone();
    url.hostname = process.env.INTERNAL_API_HOST!;
    return NextResponse.rewrite(url);
  }

  const headers = new Headers(req.headers);
  headers.set("x-request-id", req.headers.get("x-request-id") ?? crypto.randomUUID());
  return NextResponse.next({ request: { headers } });
}
```

A cron-safe route that authenticates, returns immediately, and does the work after the response:

```typescript
import { after } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  after(async () => {
    await reindex();
  });
  return Response.json({ ok: true, queued: true });
}
```

## Checklist

- [ ] `vercel pull` plus `vercel build` run clean locally before every push
- [ ] `installCommand`, `buildCommand` and `outputDirectory` all set explicitly
- [ ] Function `regions` chosen to match user geography, not defaults
- [ ] `maxDuration` within the platform limit for every function with a cron or slow path
- [ ] Environment variables scoped per environment; no `.env` committed
- [ ] `NEXT_PUBLIC_` used only for values that are genuinely public
- [ ] Security headers applied to all paths including CSP and HSTS
- [ ] Production promotion is an explicit step separate from merging to `main`

## Anti-patterns

- **Relying on the auto-detected project root in a monorepo.** Vercel then installs the wrong workspace and the build fails or silently produces a different app. Set `installCommand` and `outputDirectory` by hand.
- **Leaving function regions at the default.** Users in Europe get US cold starts and unexplained latency, and it looks like an application bug. Pin regions to where the users are.
- **Cron routes that do the work inline.** They run until the platform kills them, then Vercel retries, producing duplicate work. Authenticate, enqueue, return, and use `after` for the tail.
- **Promoting `main` straight to production.** One merge becomes a production release with no verification window. Deploy previews and promote explicitly.
- **Treating `NEXT_PUBLIC_` as a naming convention.** Any such variable is in the client bundle and readable by every visitor. Rename to a server-only variable or accept that the value is public.