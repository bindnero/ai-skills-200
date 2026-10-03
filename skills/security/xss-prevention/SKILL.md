---
name: xss-prevention
description: Eliminates cross-site scripting by auditing HTML sinks, URL and attribute sinks, and DOM injection points, then applying context-aware output encoding. Use when rendering user-supplied HTML or Markdown, reviewing innerHTML/dangerouslySetInnerHTML, sanitizing rich text, or hardening templating against reflected and stored XSS.
---

# XSS Prevention

**Use when:** any user-controlled value reaches an HTML, attribute, URL, JavaScript, or CSS context — including Markdown renderers, WYSIWYG editors, template strings, and direct DOM writes.
**Do not use when:** the value never enters a browser-executable context, for example a command-line argument or a numeric column type — use `input-sanitization` instead.

## Instructions

1. Enumerate every output sink and its exact context: element text, attribute value, `href`/`src` URL, `<script>` body, inline event handler, `style`, `srcdoc`, or a JavaScript string. Context determines encoding; a single global "escape" is not sufficient.
2. Determine whether the value is HTML at all. If plain text is sufficient, keep it plain text and never re-interpret it. The strongest control is not sending a markup language to a place that does not need one.
3. Apply the framework's default auto-escaping and never bypass it. For each `dangerouslySetInnerHTML`, `v-html`, `{{{ }}}`, `.innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, or `|safe`, record the reason it exists.
4. For values that must contain markup, sanitize server-side with a well-maintained library configured from an explicit allowlist of elements and attributes. Ship the sanitized output as HTML, not as untrusted text.
5. Sanitize before storage, not only before render, when multiple consumers render the same field. Store the sanitized form so a future consumer inherits the guarantee.
6. Block script-bearing URL schemes. Where URLs are user-supplied, validate the scheme against an allowlist (`https`, `mailto`) after decoding and after trimming control characters, and reject anything resolving to a script scheme.
7. Deploy a Content Security Policy as the second layer with no `unsafe-inline` or `unsafe-eval` in script-src, so an encoding mistake is not directly exploitable. Coordinate with `csp-configuration`.
8. Add a regression test that submits each payload class for every rich-text field and asserts the response contains the encoded or stripped form and no executable script context.
9. Mark every remaining sink in code review comments with the exact context so the next maintainer does not "simplify" the encoding away.

## Patterns

Context-specific encoding in server templates:

```html
<!-- HTML text context -->
<p>{{ user.bio }}</p>

<!-- Attribute context: quote and escape, never interpolate raw -->
<div data-user-id="{{ user.id }}"></div>

<!-- URL context: allowlist schemes server-side, then encode the attribute -->
<a href="{{ url_for(user.website) }}">site</a>

<!-- Rich text: sanitized on write -->
<div class="bio">{!! sanitized_bio_html !!}</div>
```

Markdown-to-HTML sanitization (Python, server side):

```python
import bleach

ALLOWED_TAGS = {
    "p", "br", "strong", "em", "ul", "ol", "li",
    "code", "pre", "blockquote", "a", "h2", "h3", "h4",
}
ALLOWED_ATTRS = {"a": ["href", "title"], "code": ["class"]}

def sanitize_markdown(raw: str) -> str:
    html = markdown_it.render(raw)              # render markdown -> html
    return bleach.clean(                   # then allowlist-sanitize
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=["https", "http", "mailto"],
        strip=True,
    )
```

TypeScript URL scheme allowlist, run after decoding:

```typescript
const SAFE_SCHEMES = new Set(["https:", "http:", "mailto:"]);

export function safeUrl(input: string): string | null {
  const trimmed = input.trim().replace(/[\u0000-\u001F\u007F]/g, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed, "https://example.invalid");
  } catch {
    return null;
  }
  if (!SAFE_SCHEMES.has(parsed.protocol)) return null;
  if (!parsed.hostname.endsWith("example.com") && parsed.protocol === "https:") return null;
  return parsed.toString();
}
```

Avoiding DOM sinks entirely in React:

```tsx
// Preferred: render as text. No sink, no parser, no risk.
<span>{user.bio}</span>

// Only when markup is a hard requirement, and value was sanitized on write
<div dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
```

## Checklist

- [ ] Every output sink is classified by context and has the matching encoding applied.
- [ ] No user input reaches `innerHTML`, `document.write`, `insertAdjacentHTML`, `v-html`, or `|safe` without a recorded reason.
- [ ] Rich-text input is sanitized with a tag and attribute allowlist, not a blocklist of dangerous tags.
- [ ] Sanitization happens on write so all downstream renderers inherit it, and raw is never persisted as the render source.
- [ ] User-supplied URLs are scheme-allowlisted after decoding, with `data:`, `javascript:`, and `vbscript:` rejected.
- [ ] `rel="noopener noreferrer"` is present on `target="_blank"` links to prevent reverse tabnabbing.
- [ ] CSP is deployed with script-src free of `unsafe-inline` and `unsafe-eval`, serving as the containment layer.
- [ ] A regression test covers stored, reflected, and DOM-based payload classes for each rich-text field.

## Anti-patterns

- **Blocklist sanitization.** Filtering `<script>` or `onerror=` misses dozens of vectors: `svg onload`, `img src=x onerror`, encoded payloads, mutation-XSS via `noscript`/`style` context. Use an allowlist so unknown elements are removed by default.
- **Encode once, universally.** Running `html.escape()` before inserting into a JavaScript string or a URL attribute is insufficient and sometimes double-encodes into a working payload. Encode per destination context, at the point of use.
- **Client-side-only sanitization.** Sanitizing in the browser means the stored payload is still live in the database, the email, the PDF renderer, and the mobile client. Sanitize on write, server side, and treat client sanitization as defense in depth.
- **Treating CSP as the fix.** A CSP with `unsafe-inline` and `unsafe-eval` in `script-src` provides almost no XSS containment and legitimizes the bypass. CSP is the second layer after encoding, not the primary control.
- **Regex-based sanitization.** Patterns like `/on\w+=/i` are bypassed by newlines, tabs, null bytes, and unusual parsing. Regex has no place in HTML sanitization; use a parser-based library that matches browser parsing behavior.