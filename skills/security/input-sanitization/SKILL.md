---
name: input-sanitization
description: Validates untrusted input at the system boundary with typed schemas, explicit allowlists, canonicalization, and size limits, rejecting malformed data before it reaches business logic. Use when adding or reviewing request bodies, query parameters, headers, file uploads, and API input validation.
---

# Input Sanitization

**Use when:** data crosses a trust boundary into the application — HTTP bodies and parameters, headers, cookies, uploaded files, queue messages, or third-party webhook payloads.
**Do not use when:** the input is already validated and typed and you are deciding how to escape it for a specific output context — use `xss-prevention` or `sql-injection-defense`.

## Instructions

1. Define a schema at the boundary for every endpoint and reject anything not matching it. Use the framework's validation layer so validation cannot be forgotten on a new route.
2. Declare types strictly: reject unknown fields rather than ignoring them, coerce nothing implicitly, and require explicit formats for identifiers (UUID), dates (ISO 8601), and numbers with documented ranges.
3. Apply allowlists, not denylists, for anything enumerated — country codes, status values, sort keys, role names, file types. An unknown value is a 400, never a silent default.
4. Set and enforce bounds: maximum request body size, string length, array length, numeric magnitude, nesting depth, and pagination cap. Unbounded input is a denial-of-service primitive.
5. Canonicalize before comparing or storing — trim, Unicode-normalize to NFC, and casefold for identifiers — so visually identical values do not create duplicate accounts or bypass a blocklist.
6. Validate structure separately from content. Parse JSON, XML, or form data with a parser configured to reject external entities and deep nesting; never validate with ad-hoc string operations.
7. Treat filenames, paths, and content types as untrusted. Store uploads under a server-generated name in a non-executable location, verify the type by sniffing bytes rather than trusting the declared MIME type or extension.
8. Normalize and validate external input that flows into outbound systems too: email addresses (RFC-shaped plus length cap), phone numbers, URLs, and hostnames, since these become lookup keys and delivery targets.
9. Return field-level validation errors that disclose only the field name and constraint, never the rejected value, stack trace, or internal type. Reject before any database write, file creation, or outbound call.
10. Log rejections at a low-noise rate with the rule identifier so an attack pattern is visible without turning input validation into a log-flooding vector.

## Patterns

Strict boundary schema:

```python
from pydantic import BaseModel, ConfigDict, Field, field_validator

class CreateOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")        # unknown fields are a 400, not ignored
    customer_id: UUID
    currency: str = Field(pattern=r"^(USD|EUR|GBP)$")
    quantity: int = Field(ge=1, le=500)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("currency")
    @classmethod
    def uppercase(cls, v: str) -> str:
        return v.strip().upper()
```

Middleware caps that actually terminate oversized bodies:

```python
class MaxBodySize:
    def __init__(self, limit: int = 1_048_576):     # 1 MiB
        self.limit = limit
    def __call__(self, request):
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > self.limit:
            return PlainTextResponse("Payload too large", status_code=413)
        return request
```

Allowlist validation with canonicalization:

```python
import unicodedata

COUNTRIES = {"US", "CA", "GB", "DE", "FR", "JP"}
SORT_KEYS = {"created": "created_at", "total": "total_cents", "name": "customer_name"}

def normalize_code(raw: str, allowed: set[str], label: str) -> str:
    canonical = unicodedata.normalize("NFC", raw).strip().upper()
    if canonical not in allowed:
        raise ValidationError(f"{label} is not a supported value")
    return canonical
```

Upload handling without trusting metadata:

```python
import uuid, magic

SAFE_BYTES = 10 * 1024 * 1024
ALLOWED_MIME = {"image/png": ".png", "image/jpeg": ".jpg", "application/pdf": ".pdf"}

async def store_upload(file, tenant_id: str) -> str:
    data = await file.read(SAFE_BYTES + 1)
    if len(data) > SAFE_BYTES:
        raise ValidationError("file exceeds maximum size")
    detected = magic.from_buffer(data[:4096], mime=True)   # sniff, do not trust header
    ext = ALLOWED_MIME.get(detected)
    if ext is None:
        raise ValidationError("unsupported file type")
    key = f"tenants/{tenant_id}/uploads/{uuid.uuid4()}{ext}"   # server-generated name
    await storage.put(key, data)
    return key
```

## Checklist

- [ ] Every endpoint has an explicit schema that rejects unknown fields and wrong types.
- [ ] Enumerated inputs use allowlists; unknown values return 400 rather than a default.
- [ ] Body size, string length, array size, numeric range, nesting depth, and page size all have enforced limits.
- [ ] Structured input is parsed by a hardened parser with entity resolution and deep nesting disabled.
- [ ] Identifiers are canonicalized (trim, NFC normalize, casefold) before comparison and storage.
- [ ] Uploads are size-capped, type-sniffed, renamed server-side, and stored outside the executable path.
- [ ] Errors disclose field name and constraint only — never the rejected value, internal type, or trace.
- [ ] Validation happens before any side effect, and rejections are logged by rule id at a controlled rate.

## Anti-patterns

- **Sanitizing for the wrong sink.** Stripping `<` to prevent XSS does nothing for SQL injection, and escaping quotes does nothing for path traversal. Validate structure at the boundary and encode per output context.
- **Silent coercion.** Parsing `"true"`, `1`, and `"yes"` as a boolean means the attacker chooses the value. Require the exact type and reject everything else.
- **Denylisting keywords or characters.** Blacklisting `<script>` or stripping `..` fails against encoding, unicode lookalikes, and alternate syntax. Use allowlists of permitted values.
- **Validating after the side effect.** Checking length after writing the file or after the database insert leaves the damage done. Validate first, then act.
- **Relying on the frontend.** Client-side validation is a usability feature. An attacker posts to the API directly, so every constraint must be re-exenforced server side.