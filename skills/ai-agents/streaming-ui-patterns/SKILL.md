---
name: streaming-ui-patterns
description: Implements LLM streaming in interfaces using SSE, partial JSON rendering, tool-call streaming, cancellation, and reconnectable streams. Use when building chat or agent interfaces, when showing incremental output, or when streams disconnect mid-response.
---

# Streaming UI Patterns

**Use when:** delivering incremental model output to a user, or rendering tool activity while a response is still generating.
**Do not use when:** the consumer is a batch job or another service — stream only where latency is visible to a human; see `structured-output-enforcement` for payload shape.

## Instructions

1. Choose the transport deliberately. Server-Sent Events for one-way token streams over HTTP; WebSocket only when the server also needs to push tool events and client input on one connection.
2. Stream from the server, never expose provider credentials to the browser. The browser connects to your endpoint, your endpoint holds the provider stream.
3. Define an event protocol with named event types and a monotonic sequence number: `start`, `text_delta`, `tool_call`, `tool_result`, `error`, `done`. Consumers switch on type, never parse free text.
4. Buffer partial structured output and parse incrementally where the format allows; never render half a JSON object as user-facing prose. If incremental parsing is not possible, buffer and swap in a skeleton.
5. Show progress honestly. Render a tool name and its current state from `tool_call` events, not a generic spinner that implies work with no information.
6. Implement cancellation end to end. The client aborts the fetch, your server aborts the provider request, and the conversation state records what completed.
7. Make streams resumable where it matters: persist completed message segments server-side and let a reconnecting client fetch the missing tail by sequence number.
8. Throttle UI updates to roughly 10-20 updates per second. Rendering every token delta starves the main thread and makes text unreadable.
9. Guard the four failure modes explicitly: mid-stream provider error, client disconnect, provider rate limit, and a stream that ends without a `done` event.
10. Handle screen-reader and reduced-motion users: announce completion once through a polite status region, never per delta.

## Patterns

Server-Sent Events proxy that holds provider credentials:

```ts
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: Request) {
  const { message } = await req.json();
  const ac = new AbortController();
  req.signal.addEventListener("abort", () => ac.abort());

  const client = new Anthropic();
  const stream = client.messages.stream(
    { model: "claude-sonnet-4-5", max_tokens: 4096, messages: [{ role: "user", content: message }] },
    { signal: ac.signal },
  );

  const sse = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let seq = 0;
      const send = (type: string, data: unknown) =>
        controller.enqueue(enc.encode(`id: ${seq++}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`));

      send("start", { model: "claude-sonnet-4-5" });
      try {
        stream.on("text", (delta) => send("text_delta", { delta }));
        stream.on("toolCall", (tc) => send("tool_call", { id: tc.id, name: tc.name }));
        await stream.done();
        send("done", { finishReason: "end_turn" });
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "stream failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sse, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
}
```

Client consumption with throttling and abort:

```ts
export function streamChat(body: unknown, onEvent: (type: string, data: any) => void) {
  const ac = new AbortController();
  let lastPaint = 0;

  fetch("/api/chat", { method: "POST", body: JSON.stringify(body), signal: ac.signal })
    .then(async (res) => {
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf = buf.slice(buf.lastIndexOf("\n\n") + 2) + value;              // keep only the partial frame
        for (const frame of buf.split("\n\n").slice(0, -1)) {
          const type = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (!type || !data) continue;
          const now = performance.now();
          if (type === "text_delta") {                                     // ~20 fps paint ceiling
            if (now - lastPaint < 50) continue;
            lastPaint = now;
          }
          onEvent(type, JSON.parse(data));
        }
      }
    })
    .catch((e) => { if (e.name !== "AbortError") onEvent("error", { message: "connection lost" }); });

  return { abort: () => ac.abort() };
}
```

Incremental JSON for tool arguments without rendering partial objects, with streamed text in a node marked `aria-live="off"`:

```ts
function renderToolStatus(name: string, argsRaw: string) {
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(argsRaw); } catch { return `Running ${name}…`; }  // still streaming
  return `${name}: ${args.tool}(${JSON.stringify(args).slice(0, 80)}…)`;
}
```

## Checklist

- [ ] Transport chosen and justified: SSE one-way, WebSocket only when bidirectional; provider credentials stay server-side
- [ ] Named event types with monotonic sequence numbers; consumers switch on type, never parse text
- [ ] Partial JSON buffered and parsed on completion, never shown as raw fragments
- [ ] Tool activity rendered from real events, throttled to ~20 fps; cancellation threaded end to end
- [ ] `aria-live="off"` on the streamed answer, completion announced once via a polite status region
- [ ] Mid-stream error, client disconnect, rate limit, and a missing `done` event all handled

## Anti-patterns

**Provider key in the browser.** Calling the provider directly from the client exposes credentials and blocks server-side controls like guardrails and logging. Proxy through your own endpoint.

**Partial JSON on screen.** Showing `{"tool":"refund","amou` in the answer box reads as corruption. Accumulate and parse on completion; show a labelled skeleton meanwhile.

**Spinner-only progress.** A spinner during a 20-second tool call gives the user nothing and hides a hang. Emit and render tool name plus arguments as they stream.

**Ignoring the abort signal.** When a user sends a new message, the previous provider request keeps running and billing unless the signal is threaded end to end. Wire `req.signal` into the provider call.

**No terminal event.** A provider connection that drops without a finish reason leaves spinners running forever. Send an explicit `done` or `error` event in a `finally` block, and treat a missing `done` on a closed connection as an error.
