---
name: browser-test-automation
description: Drives Chromium and Firefox programmatically with Playwright and Puppeteer for scraping, PDF and screenshot capture, downloads, and reusable authenticated sessions. Use when a script needs a real browser outside a test suite, such as batch rendering or data extraction jobs.
---

# Browser Test Automation

**Use when:** you need a repeatable script that operates a real browser for a non-test purpose — batch screenshotting, PDF rendering, scraping, file downloads, or minting session tokens for fixtures.
**Do not use when:** the goal is to assert product behaviour in CI — use `e2e-test-authoring`; or when `fetch` plus a DOM parser would do — headless Chromium is a dependency you do not need.

## Instructions

1. Reach for `fetch` first. Only launch a browser when the task needs JavaScript rendering, canvas, or a user gesture such as dismissing a consent banner.
2. Choose the driver deliberately: Playwright for cross-browser and test-adjacent work, Puppeteer for Chrome-only jobs that need DevTools Protocol features such as tracing or throttling.
3. Reuse one browser and one context for the whole job, opening a fresh page per task. Launching a browser per URL turns a 30-second job into 20 minutes.
4. Authenticate once via `storageState`: log in, `context.storageState({ path })`, reuse it on later runs, and verify the session is still valid before launching a browser.
5. Make the script resumable and idempotent by tracking processed ids in a manifest, so a mid-run failure does not reprocess thousands of pages.
6. Use `waitUntil: 'networkidle'` or an explicit `waitForResponse` — `domcontentloaded` fires before the content you came for exists.
7. Set a hard budget: a per-page timeout, a total deadline, and a bounded retry with backoff for transient failures. Scripts that hang overnight are worse than scripts that fail fast.
8. Extract data with locators and `$$eval` rather than regexes over `page.content()`, so markup changes produce readable failures instead of silently empty output.
9. Write artifacts deterministically — stable filenames derived from the record id, no timestamps — so reruns diff cleanly, and screenshot on error into a fixed directory that CI uploads, because a silent blank output is the most common failure mode.

## Patterns

Reusable authenticated browser job with resume support and bounded retries:

```ts
// scripts/capture-product-shots.ts
import { chromium, type BrowserContext } from '@playwright/browser-chromium';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const BASE = process.env.BASE_URL!;
const OUT = 'artifacts/product-shots';
const MANIFEST = 'artifacts/.captured.json';

const targets = (await (await fetch(`${BASE}/api/products`)).json()) as { id: string; slug: string }[];
let done = new Set<string>();
try {
  done = new Set(JSON.parse(await readFile(MANIFEST, 'utf8')) as string[]);
} catch {}
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const context: BrowserContext = await browser.newContext({
  storageState: 'auth.json',
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
if (!(await context.request.get(`${BASE}/api/session`)).ok()) {
  await context.request.post(`${BASE}/api/session`, {
    data: { email: 'bot@example.com', password: process.env.BOT_PASSWORD! },
  });
  await context.storageState({ path: 'auth.json' });
}

for (const target of targets) {
  const file = `${OUT}/${target.slug}.png`;
  if (done.has(target.id) && existsSync(file)) continue;

  const page = await context.newPage();
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await page.goto(`${BASE}/p/${target.slug}`, { waitUntil: 'networkidle', timeout: 30_000 });
        await page.waitForResponse((r) => r.url().includes('/api/reviews') && r.ok());
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
        done.add(target.id);
        await writeFile(MANIFEST, JSON.stringify([...done], null, 2)); // resumable
        break;
      } catch (error) {
        if (attempt >= 3) {
          await page.screenshot({ path: `${OUT}/FAILED-${target.slug}.png` });
          console.error(`failed ${target.slug}: ${(error as Error).message}`);
          break;
        }
        await page.waitForTimeout(2 ** attempt * 1000);
      }
    }
  } finally {
    await page.close();
  }
}
await context.close();
await browser.close();
```

Puppeteer for CDP-only capabilities in a Chrome-only job:

```ts
// scripts/pdf-render.ts
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const client = await page.createCDPSession();
await client.send('Emulation.setCPUThrottlingRate', { rate: 6 });
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
});
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
await page.goto(`${process.env.BASE_URL}/invoices/INV-1024`, { waitUntil: 'networkidle2' });
await page.pdf({ path: 'artifacts/invoices/INV-1024.pdf', format: 'A4', printBackground: true });
await browser.close();
```

```bash
# Install only the browser this job needs, not all three.
npx playwright install --with-deps chromium
npx tsx scripts/capture-product-shots.ts
```

## Checklist

- [ ] `fetch` considered and rejected with a stated reason before launching a browser
- [ ] One browser and one context for the whole job, with a fresh page per task
- [ ] Authentication established once and persisted via `storageState`
- [ ] Job resumable via a manifest of processed ids
- [ ] Per-page timeout, total deadline, and bounded retries with backoff configured
- [ ] Extraction uses locators or `$$eval`, not regex over `page.content()`
- [ ] Output filenames deterministic, with no timestamps
- [ ] Failure screenshots uploaded from CI to a fixed artifact directory

## Anti-patterns

**Launching a browser per URL.** A thousand-page job spends most of its time starting processes. Fix: one browser, one context, new page per task, closed in a `finally`.

**No timeout and no deadline.** The script hangs overnight on a hung spinner and nobody learns until morning. Fix: a timeout on every navigation plus a total job deadline.

**Regex over `page.content()`.** A class-name tweak silently produces zero rows. Fix: extract via locators or `$$eval` so an empty result fails loudly with the selector in the message.

**Logging in inside the loop.** Every iteration re-authenticates, trips rate limits, and makes failures look like application errors. Fix: establish and verify the session once before the loop.