---
name: websocket-realtime
description: Builds resilient WebSocket servers with heartbeat liveness, backpressure handling, and Redis-backed fan-out. Use when adding live updates, presence, or subscriptions over a persistent connection rather than polling.
---

# WebSocket and Realtime

**Use when:** the product needs push to a connected client — presence, live dashboards, collaborative cursors, chat — over a long-lived connection.
**Do not use when:** the client can wait seconds for a response — use `rest-api-design`; or you deliver an event with no live session — use `webhook-delivery`.

## Instructions

1. Authenticate at the handshake and reject unauthenticated or cross-origin upgrades with `401`/`403`. Once a socket is open, refusing a client means closing it after it has already consumed resources.
2. Re-validate on a schedule. Tokens expire mid-connection; when the token expires, send close code `4001` with a reason so the client refreshes and re-handshakes instead of retrying blindly.
3. Implement application-level heartbeats. TCP alone will not notice a half-open connection behind a load balancer for hours; ping every 25-30 seconds and terminate any socket that misses two rounds.
4. Bound every queue. When `socket.bufferedAmount` exceeds a high-water mark, drop the oldest non-critical update or close with `1013`; never let an array grow because one consumer stalled.
5. Fan out through Redis pub/sub or a broker. A WebSocket server is stateful and cannot be round-robin load balanced; sticky sessions hide the problem until a node restarts.
6. Resume with cursors, not replay. Send the last event id on reconnect and fetch the gap from a durable log; replaying an in-memory window loses events after a restart.
7. Cap per-connection subscription count and channel cardinality, or one account with a wildcard subscription becomes an amplification vector.
8. Instrument connections, send latency, `buffered_amount`, and dropped messages per node — fan-out is where memory leaks hide.

## Patterns

Server with handshake auth, heartbeat, and backpressure shedding:

```ts
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";

const HEARTBEAT_MS = 30_000;
const MAX_BUFFERED_BYTES = 1 << 20;
const MAX_SUBS_PER_SOCKET = 32;

type Client = { socket: WebSocket; userId: string; isAlive: boolean; subscriptions: Set<string> };
const clients = new Set<Client>();

const wss = new WebSocketServer({
  port: 8080,
  verifyClient: ({ req }, done) => {
    // Reject here: a handshake check is cheap, provable, and frees no resources.
    const token = new URL(req.url ?? "/", "http://x").searchParams.get("token");
    const claims = token ? verifyAccessToken(token) : null;
    if (!claims) return done(false, 401, "Unauthorized");
    (req as AuthedRequest).claims = claims;
    done(true);
  },
});

wss.on("connection", (socket, req) => {
  const client: Client = { socket, userId: (req as AuthedRequest).claims!.sub, isAlive: true, subscriptions: new Set() };
  clients.add(client);

  socket.on("pong", () => { client.isAlive = true; });
  socket.on("close", () => clients.delete(client));
  socket.on("error", () => clients.delete(client));

  socket.on("message", (raw) => {
    let msg: { type: string; channels?: string[] };
    try { msg = JSON.parse(String(raw)); } catch { return socket.close(4003, "Malformed JSON"); }

    if (msg.type !== "subscribe") return;
    if (client.subscriptions.size >= MAX_SUBS_PER_SOCKET) return socket.close(4029, "Subscription limit exceeded");
    for (const ch of msg.channels ?? []) {
      if (!isChannelVisibleTo((req as AuthedRequest).claims!, ch)) return socket.close(4003, "Not authorized for channel");
      client.subscriptions.add(ch);
    }
  });
});

const heartbeat = setInterval(() => {
  for (const client of clients) {
    if (!client.isAlive) { client.socket.terminate(); clients.delete(client); continue; }
    client.isAlive = false;
    client.socket.ping();
  }
}, HEARTBEAT_MS);
heartbeat.unref();

function publish(client: Client, envelope: { type: string; seq: number; payload: unknown }): void {
  if (client.socket.readyState !== WebSocket.OPEN) return;

  if (client.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
    if (envelope.type !== "order.status_changed") { metrics.increment("ws.dropped", { reason: "backpressure" }); return; }
    client.socket.close(1013, "Client too slow");
    return;
  }
  client.socket.send(JSON.stringify(envelope));
}

// Any node may produce the event; subscribers may live on any node.
const subscriber = createClient({ url: process.env.REDIS_URL });
await subscriber.connect();
await subscriber.subscribe("realtime:events", (channel, json) => {
  const envelope = JSON.parse(json) as { audience: string[]; type: string; seq: number; payload: unknown };
  for (const client of clients) {
    if (envelope.audience.includes(client.userId) || client.subscriptions.has(channel)) publish(client, envelope);
  }
});
```

Client reconnect with jittered backoff and token-expiry handling:

```ts
export function connectRealtime(token: string): { subscribe: (ch: string, fn: (e: Event) => void) => () => void } {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let closedByUs = false;
  const listeners = new Map<string, Set<(e: Event) => void>>();
  const cursors = new Map<string, number>();

  const backoffMs = () => Math.min(30_000, 500 * 2 ** attempt) * (0.5 + Math.random()); // full jitter

  function open(): void {
    ws = new WebSocket(`wss://rt.acme.io/v1/realtime?token=${encodeURIComponent(token)}`);
    attempt = 0;

    ws.addEventListener("open", () => {
      if (cursors.size > 0) ws!.send(JSON.stringify({ type: "resume", cursors: [...cursors] }));
      if (listeners.size > 0) ws!.send(JSON.stringify({ type: "subscribe", channels: [...listeners.keys()] }));
    });

    ws.addEventListener("message", (ev) => {
      const envelope = JSON.parse(ev.data as string) as { seq: number; channel: string };
      cursors.set(envelope.channel, envelope.seq);
      listeners.get(envelope.channel)?.forEach((fn) => fn(envelope));
    });

    ws.addEventListener("close", (ev) => {
      if (closedByUs) return;
      if (ev.code === 4001) { void refreshAccessToken().then(open); return; } // refresh, do not blind-retry
      attempt += 1;
      setTimeout(open, backoffMs());
    });
  }

  open();

  return {
    subscribe(channel, fn) {
      const set = listeners.get(channel) ?? new Set<(e: Event) => void>();
      if (set.size === 0) ws?.send(JSON.stringify({ type: "subscribe", channels: [channel] }));
      set.add(fn);
      listeners.set(channel, set);
      return () => { set.delete(fn); if (set.size === 0) listeners.delete(channel); };
    },
  };
}
```

## Checklist

- [ ] Unauthenticated and cross-origin upgrades are rejected during the handshake
- [ ] Close code `4001` means token expiry and triggers refresh, not blind retry
- [ ] A ping/pong heartbeat runs every 25-30 seconds and terminates unresponsive sockets
- [ ] `bufferedAmount` is checked before every send with a drop-or-close policy
- [ ] Cross-node fan-out goes through Redis pub/sub or a broker
- [ ] Reconnect resumes from a durable cursor, not an in-memory replay window
- [ ] Per-connection subscription count and channel cardinality are capped
- [ ] Connections, drops, buffered bytes, and send latency are exported as metrics

## Anti-patterns

**Fixed reconnect intervals.** A thousand clients retrying every 1 second produce a synchronised thundering herd the instant the server returns. Exponential backoff with full jitter.

**Ping with no pong timeout.** TCP keepalive defaults to hours and most proxies never surface the death. Without an application heartbeat, dead sockets accumulate until the event loop stalls on writes.

**Unbounded `bufferedAmount`.** A slow mobile client with a fast producer fills memory until the node OOMs and every other connection on that node drops. Check the high-water mark and shed.

**In-process fan-out behind a round-robin balancer.** Clients on node A never see events produced on node B. Publish to Redis or a broker so any node can serve any subscriber.