---
name: i18n-implementation
description: Localises interfaces with ICU MessageFormat plurals, `Intl` APIs for dates/numbers/relative time, typed message keys, locale routing with `hreflang`, and RTL support. Use when extracting hardcoded strings, adding a language switcher, or fixing broken plurals, date formats, and RTL layouts.
---

# I18n Implementation

**Use when:** extracting hardcoded strings, adding a language switcher or locale-prefixed routes, or fixing broken plural forms, date/currency formats, and RTL layout.
**Do not use when:** the work is translation copy itself — this skill covers the mechanism; for RTL-specific layout primitives see `responsive-layouts`.

## Instructions

1. Never concatenate sentences. Word order differs by language, so `"You have " + n + " items"` is unfixable in German or Japanese. Use a message with a placeholder and let ICU handle it.
2. Use ICU plural and select syntax for anything countable or genderable: `{count, plural, one {# item} other {# items}}`.
3. Format all dates, numbers, currencies, lists, and relative times with `Intl` APIs and an explicit locale. Never hand-roll `"1.234,56"` or a month-name table.
4. Type message keys so a missing translation is a compile error. Derive a union of keys from the source locale file and use `t()` with that generic.
5. Keep locale data out of the initial bundle. Dynamic-`import()` per locale (or per namespace) so users only download what they display.
6. Serve the same locale on the server and the client. Render text on the server with the negotiated locale, or wrap locale-dependent formatting in `suppressHydrationWarning` and correct after mount.
7. Put the locale in the URL (`/de/`, `/ja/`) rather than in `localStorage`, so links are shareable, crawlable, and cacheable. Negotiate from `Accept-Language` only to redirect on first visit.
8. Emit `hreflang` alternates plus `x-default`, and set `lang` on `<html>` per locale.
9. Use logical CSS properties so RTL needs no mirrored stylesheet, and test at least one RTL locale (Arabic or Hebrew) plus one CJK locale.
10. Design for expansion: German runs roughly 30% longer than English, so allow wrapping, flexible buttons, and no fixed-height text containers.

## Patterns

Typed messages with ICU plurals and `Intl` formatting:
```json
{
  "cart.title": "Your cart",
  "cart.items": "{count, plural, =0 {Your cart is empty} one {# item} other {# items}}",
  "cart.total": "{amount, number, ::currency/USD} · ships {when, relativeTime}",
  "cart.by": "{gender, select, female {She} male {He} other {They}} added this item"
}
```

```ts
// lib/i18n.ts
import { IntlMessageFormat } from "intl-messageformat";

export const en = { "cart.title": "Your cart", "cart.items": "{count, plural, =0 {Your cart is empty} one {# item} other {# items}}" };
export type MessageKey = keyof typeof en;
export const messages: Record<string, Partial<Record<MessageKey, string>>> = { en };

const cache = new Map<string, IntlMessageFormat>();

export function t(key: MessageKey, locale: string, values: Record<string, unknown> = {}): string {
  const id = `${locale}:${key}`;
  let format = cache.get(id);
  if (!format) {
    const message = messages[locale]?.[key] ?? en[key];
    format = new IntlMessageFormat(message, locale);
    cache.set(id, format);
  }
  return format.format(values) as string;
}

// Locale-dependent formatting always goes through Intl
const money = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(amount);
const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-3, "day");
const list = new Intl.ListFormat(locale, { style: "long" }).format(["Bo", "Ada", "Cy"]);
```

Lazy-loading locales and routing by URL prefix:
```ts
// app/[locale]/layout.tsx
export const locales = ["en", "de", "ja", "ar"] as const;
export type Locale = (typeof locales)[number];

export async function getMessages(locale: Locale) {
  const mod = await import(`./messages/${locale}.json`); // only the chosen locale is fetched
  return mod.default as Record<string, string>;
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export function generateMetadata() {
  const languages = Object.fromEntries(locales.map((l) => [l, `/${l}`]));
  return { alternates: { languages: { ...languages, "x-default": "/en" } } };
}
```
```tsx
<html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
  <body>{children}</body>
</html>
```

Negotiating the initial locale on the server:
```ts
export function negotiate(header: string | null, supported: string[], fallback: string) {
  const ranked = (header ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const exact = supported.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const base = tag.split("-")[0];
    const partial = supported.find((l) => l.toLowerCase().split("-")[0] === base);
    if (partial) return partial;
  }
  return fallback;
}
```

## Checklist

- [ ] No user-facing string is built by concatenation; all come from message files.
- [ ] Countables and genderables use ICU `plural`/`select`, not `n === 1` ternaries.
- [ ] Dates, numbers, currency, lists, and relative times use `Intl` with an explicit locale.
- [ ] Message keys are typed from the source locale, so missing keys fail the build.
- [ ] Locale bundles are dynamically imported and absent locales are not downloaded.
- [ ] Locale lives in the URL with `hreflang` alternates and `x-default`.
- [ ] `<html lang>` and `dir` are set per locale, and RTL is verified with a real locale.
- [ ] Layouts tolerate 30%+ text expansion with no fixed-height text containers.

## Anti-patterns

**Concatenating translated fragments.** Word order and inflection differ by language, so template-built sentences read as broken machine translation and cannot be fixed by translation alone. Fix: single messages with placeholders.

**Selecting plural forms with `n === 1` in code.** English has two forms, Arabic has six, and Russian has three plus a special form for fractions. Fix: ICU plural categories in the message file and let the runtime select.