---
name: file-upload-handling
description: Handles multipart and direct-to-object-storage uploads with presigned URLs, streaming MIME checks, and malware scanning. Use when adding file upload endpoints, image processing, or attachment handling to an API.
---

# File Upload Handling

**Use when:** a client needs to send a file to your service and you are choosing between proxied multipart and direct-to-storage upload.
**Do not use when:** the payload is small structured data — use `input-validation`; or you are downloading a remote file to process — see `event-driven-architecture`.

## Instructions

1. Prefer direct-to-object-storage with a presigned URL above a few megabytes. Proxying a 2 GB upload ties up a worker and a pool slot for the whole transfer and fails when one pod restarts.
2. Validate on three surfaces: the presign request (declared size, type, ownership), the bucket policy (key prefix, content-length limit, required encryption), and a post-upload job (sniffed MIME and magic bytes).
3. Treat client-declared `Content-Type` as untrusted. Sniff magic bytes server-side; a `.png` that is actually SVG or an HTML polyglot achieves script execution when served from your origin.
4. Serve user uploads from a separate origin or with `Content-Disposition: attachment` and a strict CSP. Same-origin user content is stored XSS behind an upload form.
5. Cap size at the proxy and in the presign policy (`content-length-range`), reject before allocating, and stream rather than buffering.
6. Generate storage keys server-side. A client-supplied key permits traversal (`../../`) and overwriting other users' objects.
7. Quarantine then promote. Upload into `quarantine/`, scan and verify, then move to `live/` only on a clean verdict.
8. Record content hash, byte size, sniffed type, and scanner verdict with the object so consumers never re-derive them.

## Patterns

Presign endpoint with server-owned keys and a hard ceiling:

```ts
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

const s3 = new S3Client({ region: process.env.AWS_REGION });
const MAX_BYTES = 25 * 1024 * 1024;
const EXT_FOR_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "application/pdf": "pdf", "text/csv": "csv" };

const PresignRequest = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(["image/png", "image/jpeg", "application/pdf", "text/csv"]),
  sizeBytes: z.number().int().positive().max(MAX_BYTES),
  purpose: z.enum(["avatar", "receipt", "attachment"]),
}).strict();

export async function presignUpload(req: Request, user: Principal): Promise<Response> {
  const parsed = PresignRequest.safeParse(await req.json());
  if (!parsed.success) return json(422, { error: { code: "validation_failed", errors: fieldErrors(parsed.error) } });
  const { filename, contentType, sizeBytes, purpose } = parsed.data;

  // Server-owned key: the client never influences the path.
  const objectKey = `quarantine/${user.tenantId}/${user.sub}/${randomUUID()}.${EXT_FOR_MIME[contentType]}`;

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.UPLOAD_BUCKET,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: sizeBytes,
      Metadata: { "declared-type": contentType, "declared-name": encodeURIComponent(filename).slice(0, 900), purpose, uploader: user.sub },
      ServerSideEncryption: "aws:kms",
      SSEKMSKeyId: process.env.UPLOAD_KMS_KEY_ID,
    }),
    { expiresIn: 300 },
  );

  await db.uploadIntent.create({
    data: { objectKey, tenantId: user.tenantId, uploadedBy: user.sub, declaredType: contentType, declaredSize: sizeBytes, state: "awaiting_upload", expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
  });

  return json(201, { uploadUrl: url, objectKey, method: "PUT", expiresInSeconds: 300, maxSizeBytes: MAX_BYTES });
}
```

Bucket policy that enforces the ceiling even if a client bypasses the API:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOversizeAndUnencrypted",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::acme-uploads/quarantine/*",
      "Condition": {
        "NumericLessThan": { "s3:content-length": 26214400 },
        "Bool": { "aws:SecureTransport": "true", "s3:x-amz-server-side-encryption": "aws:kms" }
      }
    },
    {
      "Sid": "DenyPublicACLs",
      "Effect": "Deny",
      "Principal": "*",
      "Action": ["s3:PutObjectAcl", "s3:PutObjectVersionAcl"],
      "Resource": "arn:aws:s3:::acme-uploads/*",
      "Condition": {
        "StringEqualsIfExists": { "s3:x-amz-acl": ["public-read", "public-read-write", "authenticated-read"] }
      }
    }
  ]
}
```

Post-upload verification: sniff, scan, then promote:

```ts
import { fileTypeFromBuffer } from "file-type";
import { GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const ALLOWED_SNIFFED = new Set(["image/png", "image/jpeg", "application/pdf", "text/csv"]);

export async function verifyAndPromote(objectKey: string): Promise<{ sha256: string; mime: string }> {
  const intent = await db.uploadIntent.findUnique({ where: { objectKey } });
  if (!intent || intent.state !== "awaiting_upload") throw new Error(`no pending upload intent for ${objectKey}`);

  const head = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey, Range: "bytes=0-8191" }));
  const headBytes = Buffer.concat(await collect(head.Body as AsyncIterable<Buffer>));

  const sniffed = await fileTypeFromBuffer(headBytes);
  const actualMime = sniffed?.mime ?? (looksLikeUtf8Text(headBytes) ? "text/csv" : "application/octet-stream");

  if (!ALLOWED_SNIFFED.has(actualMime)) throw new Error(`unsupported sniffed type ${actualMime}`);
  if (actualMime !== intent.declaredType) throw new Error(`declared ${intent.declaredType} but content is ${actualMime}`);

  // A PNG that also parses as HTML/SVG is an XSS vector when served back.
  if (looksLikeHtml(headBytes) || looksLikeSvg(headBytes)) throw new Error("active markup rejected");

  const verdict = await scanForMalware(objectKey);
  if (!verdict.clean) {
    await db.uploadIntent.update({ where: { objectKey }, data: { state: "rejected", rejectionReason: verdict.signature ?? verdict.engine } });
    throw new Error("malware detected");
  }

  const liveKey = objectKey.replace(/^quarantine\//, "live/");
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket, CopySource: `${bucket}/${objectKey}`, Key: liveKey,
      MetadataDirective: "REPLACE",
      Metadata: { sha256: verdict.sha256, "sniffed-type": actualMime, "scanned-by": verdict.engine },
      ContentDisposition: "attachment", // never render user content inline on our origin
      CacheControl: "private, max-age=31536000, immutable",
    }),
  );
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
  await db.uploadIntent.update({ where: { objectKey }, data: { state: "live", liveKey, sha256: verdict.sha256, sniffedMime: actualMime, verifiedAt: new Date() } });

  return { sha256: verdict.sha256, mime: actualMime };
}
```

## Checklist

- [ ] Files above a few MB go direct to storage via presigned URL
- [ ] Client-declared MIME is ignored for trust and re-verified from magic bytes
- [ ] Storage keys are server-generated and constrained to a tenant prefix
- [ ] Size is capped at the proxy, the presign policy, and the bucket policy
- [ ] User content is served from a separate origin or as `Content-Disposition: attachment`
- [ ] HTML/SVG polyglots are rejected even when magic bytes match an allowed type
- [ ] Uploads land in `quarantine/` and are promoted only after a clean scan
- [ ] Content hash, size, sniffed type, and scanner verdict are persisted with the object

## Anti-patterns

**Trusting the client's `Content-Type`.** Renaming `evil.html` to `evil.png` with a forged type gets it stored and then served from your origin as HTML. Sniff the bytes and serve user content as a download.

**Buffering uploads in memory.** Reading the whole file into a Buffer to validate it first means one large upload can OOM the pod, and the cost scales with attacker input. Enforce the limit in the parser and stream the rest.

**Client-supplied object keys.** Accepting `key` from the request body lets a caller write `../../other-tenant/…` or overwrite an existing object. Mint the key server-side.

**Validating only during upload.** Scanning in the upload request but serving before the scan finishes creates a race where unsanitized content is live. Quarantine, verify asynchronously, then promote.