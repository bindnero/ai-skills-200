---
name: api-payload-compression
description: Shrinks API and static response bodies over the wire with gzip and Brotli negotiation, a minimum size threshold, correct Vary and ETag handling, and streaming exceptions. Use when JSON responses or assets are large on the network, when mobile clients report slow API calls, or when transfer size and bandwidth cost need reducing.
---

# API Payload Compression

**Use when:** response bodies are large enough that transfer time or bandwidth cost is measurable, or clients on slow links report slow API calls.
**Do not use when:** the bottleneck is query time rather than transfer size - use `query-optimization`; the same ground is being handled at the CDN edge - use `edge-caching-strategy`.

## Instructions

1. Negotiate compression explicitly. Read `Accept-Encoding`, prefer Brotli (`br`) when the client offers it, fall back to gzip, and send an uncompressed body when the client offers neither.
2. Set `Content-Encoding` and vary on `Accept-Encoding` in the same response. Without `Vary: Accept-Encoding`, a shared cache or CDN stores whichever variant arrived first and serves compressed bytes to a client that cannot read them.
3. Only compress above a size threshold, roughly 1-2 KB. Below it the CPU and the extra headers cost more than the bytes saved.
4. Compress JSON, SVG, HTML, CSS, JavaScript, and plain text. Never compress JPEG, PNG, WebP, AVIF, MP4, or archives - they are already compressed and the CPU is wasted.
5. Keep compression off for `text/event-stream`, chunked streaming endpoints, and any response that must be flushed byte by byte. A buffering compressor holds the first token until its window fills, which breaks live streaming.
6. Compress at the layer you actually control, and pick one layer. Compressing in the app and again at the proxy double-charges CPU for the same bytes.
7. Keep the uncompressed size measurable. `Content-Length` after compression describes the wire size, so log the original byte count too when tracking payload growth.
8. Revisit `ETag` semantics for compressed responses: a weak validator over the uncompressed representation (`W/"..."`) lets the same tag serve both variants safely once `Vary` is set.
9. Watch compression ratio as a health signal. A JSON response that stops compressing is usually `gzip` giving up on random data - often a base64 blob or a UUID-per-row payload that should be redesigned.

## Patterns

Negotiation and threshold with Express:

```ts
import { createGzip, createBrotliCompress, constants as zlibConstants } from "node:zlib";
import { pipeline } from "node:stream/promises";

const MIN_BYTES = 1024;
const COMPRESSIBLE = /^(application\/(json|javascript|xml|graphql)|text\/|image\/svg\+xml)/;
const NO_COMPRESS = /^(text\/event-stream|multipart\/form-data)/;

app.use((req, res, next) => {
  res.vary("Accept-Encoding");

  const accepted = (req.headers["accept-encoding"] ?? "") as string;
  const wantsBrotli = /\bbr\b/.test(accepted) && brQuality(accepted) >= 5;
  const wantsGzip = /\bgzip\b/.test(accepted);

  const type = res.getHeader("Content-Type")?.toString() ?? "";
  if (NO_COMPRESS.test(type) || !COMPRESSIBLE.test(type)) return next();

  // Only rewrite the body once the payload is known to be large enough to pay for itself.
  const chunks: Buffer[] = [];
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  let decided = false;

  const decide = () => {
    decided = true;
    const bytes = Buffer.concat(chunks).length;
    if (bytes < MIN_BYTES) {
      res.removeHeader("Content-Encoding");
      res.setHeader("Content-Length", String(bytes));
      res.end(Buffer.concat(chunks));
      return;
    }
    const compressor = wantsBrotli
      ? createBrotliCompress({ params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } })
      : createGzip({ level: 6 });
    res.setHeader("Content-Encoding", wantsBrotli ? "br" : "gzip");
    res.removeHeader("Content-Length");
    pipeline(compressor, res).catch(next);
    compressor.write(Buffer.concat(chunks));
    compressor.end();
  };

  res.write = ((chunk: Buffer, ...rest: unknown[]) => {
    if (decided) return originalWrite(chunk, ...(rest as []));
    chunks.push(Buffer.from(chunk));
    return true;
  }) as typeof res.write;

  res.end = ((chunk?: Buffer | string, ...rest: unknown[]) => {
    if (decided) return originalEnd(chunk as never, ...(rest as []));
    if (chunk) chunks.push(Buffer.from(chunk));
    decide();
    return res;
  }) as typeof res.end;

  next();
});

function brQuality(header: string): number {
  // "br;q=0.5" is a refusal to use Brotli, not a weak preference.
  const match = /br;q=([\d.]+)/.exec(header);
  return match ? Number(match[1]) : 1;
}
```

Nginx at the edge instead, so the application never spends CPU:

```nginx
gzip              on;
gzip_vary         on;
gzip_proxied      any;
gzip_min_length   1024;
gzip_comp_level   6;
gzip_types        application/json application/javascript text/css text/plain
                  image/svg+xml application/graphql;
# Already-compressed assets: pass through untouched.
gzip_disable      ".*\.(jpg|jpeg|png|webp|avif|gz|br|zip|mp4)$";

brotli            on;
brotli_comp_level 5;
brotli_types      application/json text/css application/javascript image/svg+xml;

location /events {
  # Streaming must reach the client token by token, so no compression here.
  proxy_buffering off;
  gzip off;
  proxy_set_header Accept-Encoding "";
}
```

## Checklist

- [ ] `Content-Encoding` set only when the client actually advertised that encoding
- [ ] `Vary: Accept-Encoding` present on every compressible response
- [ ] Minimum size threshold applied so tiny bodies skip compression
- [ ] Already-compressed media types excluded
- [ ] Streaming and SSE endpoints excluded from any buffering compressor
- [ ] Compression applied at exactly one layer, not app plus proxy
- [ ] Uncompressed size logged alongside wire size
- [ ] Compression ratio monitored as a payload-health signal
- [ ] Brotli quality tuned on a real CDN CPU budget, not set to maximum everywhere

## Anti-patterns

**Compressing without `Vary`.** The first client's compressed response gets stored by a shared cache or CDN and then served to a client that did not advertise gzip, producing a body that fails to parse. The bug looks random because it depends on who hit the cache first.

**Compressing a compression layer away.** Brotli on an already-gzipped static file, or gzip applied to JPEG or PNG, burns CPU on every request to save zero bytes and can enlarge the payload.

**Buffering a streaming response to compress it.** Wrapping an SSE or token-streaming endpoint in `createGzip` withholds output until the internal window fills, so the "live" feature updates in bursts or not at all. Stream endpoints stay uncompressed and use `X-Accel-Buffering: no`.

**Compressing every request including 300-byte responses.** Below roughly 1 KB the header overhead and the CPU cost exceed the bytes saved, and the compression ratio on short JSON is poor. Threshold first, compress second.
