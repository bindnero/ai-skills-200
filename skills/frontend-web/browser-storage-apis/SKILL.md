---
name: browser-storage-apis
description: Persists client state safely with `localStorage`, `sessionStorage`, IndexedDB, and the Origin Private File System, including quota handling, eviction behaviour, and cross-tab sync. Use when caching data offline, saving drafts, or debugging `QuotaExceededError` and storage eviction.
---

# Browser Storage APIs

**Use when:** caching data for offline use, persisting drafts or preferences, storing large structured records client-side, or debugging quota errors and unexpected data loss.
**Do not use when:** the data must survive across devices or be shared with other users — that belongs on a server; for HTTP response caching use `service-worker-pwa`.

## Instructions

1. Pick the smallest API that fits: `localStorage` for a few small strings, `sessionStorage` for per-tab state, IndexedDB for structured records and blobs, and the Origin Private File System for large files.
2. Remember `localStorage` is synchronous and string-only. JSON-serialise on write and parse on read, and never use it for anything on the critical path in a loop.
3. Treat every storage read as a possible failure: private browsing, disabled cookies, and full quotas all throw. Wrap access in `try/catch` with an in-memory fallback.
4. Keep an explicit schema version in the stored payload and migrate or discard on mismatch. Unmigrated data is the main cause of "works on my machine" bugs.
5. Never store secrets, tokens, or personal data in `localStorage`/`IndexedDB`. Any XSS can read them; use `HttpOnly` cookies for session material.
6. Check quota before large writes with `navigator.storage.estimate()`, and request persistence with `navigator.storage.persist()` so the browser does not evict you under pressure.
7. Use IndexedDB with indexes for anything you will query. A key-value scan over `objectStore.getAll()` on a large store blocks the main thread and grows unbounded.
8. Clean up on write: cap caches (keep the 50 most recent entries), delete superseded records, and version cache keys so old data can be dropped wholesale.
9. Sync across tabs with the `storage` event for `localStorage`, or `BroadcastChannel` for richer messages; both fire only in *other* tabs, never the writer.
10. Wrap IndexedDB access in a small typed layer (`idb`) so transaction handling, cursor iteration, and error handling live in one tested place.

## Patterns

A typed storage layer with versioning and a memory fallback:
```ts
// lib/persistent-store.ts
type Envelope<T> = { v: number; at: number; data: T };
const VERSION = 3;
const memory = new Map<string, unknown>();

export const store = {
  read<T>(key: string): T | null {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as Envelope<T> | null;
      if (!parsed) return (memory.get(key) as T) ?? null;
      if (parsed.v !== VERSION) {
        localStorage.removeItem(key); // stale shape: drop rather than guess
        return null;
      }
      return parsed.data;
    } catch {
      return (memory.get(key) as T) ?? null; // private mode or storage disabled
    }
  },

  write<T>(key: string, data: T): boolean {
    memory.set(key, data);
    try {
      localStorage.setItem(key, JSON.stringify({ v: VERSION, at: Date.now(), data } satisfies Envelope<T>));
      return true;
    } catch (error) {
      console.warn("persist failed", (error as DOMException).name); // quota or disabled
      return false;
    }
  },
};

export async function usage() {
  const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) ?? {};
  return { usedMB: +(usage / 1048576).toFixed(1), quotaMB: +(quota / 1048576).toFixed(0) };
}
```

IndexedDB with an index, cursor pagination, and a bounded cache:
```ts
import { openDB, type DBSchema } from "idb";

interface CacheDB extends DBSchema {
  messages: { key: string; value: { id: string; body: string; at: number }; indexes: { byAt: number } };
}

const dbPromise = openDB<CacheDB>("app-cache", 1, {
  upgrade(db) {
    const store = db.createObjectStore("messages", { keyPath: "id" });
    store.createIndex("byAt", "at");
  },
});

const MAX_ROWS = 50;
export async function saveMessage(id: string, body: string) {
  const db = await dbPromise;
  const tx = db.transaction("messages", "readwrite");
  await tx.objectStore("messages").put({ id, body, at: Date.now() });
  await tx.done;

  // Trim the oldest rows so the store never grows without bound
  const rows = await db.getAllFromIndex("messages", "byAt");
  await Promise.all(rows.slice(0, Math.max(0, rows.length - MAX_ROWS)).map((r) => db.delete("messages", r.id)));
}

export const recent = async (limit = 20) => (await dbPromise).getAllFromIndex("messages", "byAt", undefined, limit);
```

Cross-tab sync, durability, and large files:
```ts
// The `storage` event fires in other tabs only; the writer already knows its change
window.addEventListener("storage", (e) => {
  if (e.key === "app:cart" && e.newValue) store.write("app:cart:pending", e.newValue);
});
new BroadcastChannel("app").postMessage({ type: "logout" });

// Ask the browser not to evict us under storage pressure
if (!(await navigator.storage.persisted())) await navigator.storage.persist();

// Large files go to the Origin Private File System instead of IndexedDB records
const dir = await navigator.storage.getDirectory();
const writable = await (await dir.getFileHandle("export.csv", { create: true })).createWritable();
await writable.write(csvBlob);
await writable.close();
```

## Checklist

- [ ] The smallest sufficient API is used per data shape; IndexedDB for structured or large data.
- [ ] Every storage access is wrapped in `try/catch` with an in-memory fallback.
- [ ] Stored payloads carry a schema version and are migrated or discarded on mismatch.
- [ ] No tokens, secrets, or personal data in `localStorage`/`IndexedDB`.
- [ ] Quota checked with `navigator.storage.estimate()`; persistence requested where data matters.
- [ ] IndexedDB queries use an index with limits, and caches are trimmed with versioned keys.
- [ ] Cross-tab updates handled via `storage` or `BroadcastChannel`.

## Anti-patterns

**Storing auth tokens in `localStorage`.** Any injected script can read them, so a single XSS becomes a full account takeover. Fix: `HttpOnly`, `Secure`, `SameSite` cookies for session material.

**Unbounded JSON blobs in `localStorage`.** A 5MB string cap plus synchronous serialisation on the main thread means a growing log eventually throws `QuotaExceededError` mid-interaction and freezes the UI. Fix: IndexedDB with indexes and a trim policy.

**Ignoring the `storage` event.** Two tabs end up with divergent state and the user sees a stale cart in one of them. Fix: listen for `storage`, or use `BroadcastChannel` when you need to send structured messages.