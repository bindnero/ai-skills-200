---
name: ai-search-visibility
description: Optimizes presence in AI answer engines — Google AI Overviews and AI Mode, Bing Copilot, ChatGPT Search, Perplexity and Claude — via crawler controls, llms.txt, extractable answer blocks, entity clarity, citation-worthy original data and AI-referral analytics. Use when asked about AIO/AI visibility, when tracking AI traffic separately, or when LLM citations need improving.
---

# AI Search Visibility

**Use when:** The goal is to appear in Google AI Overviews/AI Mode, Bing Copilot, ChatGPT Search, Perplexity or Claude answers, when AI crawler access and `llms.txt` need implementing, or when AI referral traffic must be measured separately from organic.
**Do not use when:** traditional blue-link rankings are the target and the query has no AI surface — use `serp-analysis` for the classic SERP.

## Instructions

1. Establish the AI-surface baseline per query. For a set of priority queries, capture whether an AI Overview appears (Google), whether Copilot answers, and what ChatGPT Search/Perplexity/Claude return. Log which competitors get cited. Without this baseline there is nothing to improve against.
2. Configure AI crawler access deliberately. Allow the agents that produce citations (`Google-Extended`, `Bingbot`, `PerplexityBot`, `ClaudeBot`, `OAI-SearchBot`, `ChatGPT-User`) and block training-only scrapers (`GPTBot`, `CCBot`, `anthropic-ai`, `Bytespider`). These are distinct agents with distinct purposes; a blanket block removes your content from AI answers entirely.
3. Publish `llms.txt` as a curated, human-checked index of the most citable pages: brand facts, key definitions, canonical product/company URLs, original research links, and a plain-language summary. Treat it as a curation hint, not a ranking mechanism.
4. Make answers extractable. Any section that could be cited must lead with a self-contained 40–60 word direct answer before elaboration, structured as one claim per block. AI systems quote the first clean declarative sentence after a question-shaped heading; bury the answer and it is never quoted.
5. Use question-shaped H2/H3 headings matching how users ask, answered immediately, plus a real on-page FAQ section — LLM retrieval pulls heavily on direct Q&A pairs. See `on-page-seo` for the H2/answer pattern.
6. Publish citable primary assets: original research with named methodology and date, benchmark tables, comparison matrices, expert quotes with credentials, clear authorship. Content that only summarizes other sources is rarely cited because it adds nothing attributable.
7. Establish entity clarity: consistent brand/product naming, Organization schema with `sameAs` to Wikipedia/LinkedIn/Crunchbase/GitHub, an About page with founding facts. Disambiguation errors kill citations — if "Acme" is ambiguous, engines attribute to another entity.
8. Track AI referrals separately in analytics, with separate source/medium groupings for `chatgpt.com`, `perplexity.ai`, `claude.ai`, `copilot.microsoft.com`, `gemini.google.com` and AI Overview click-through. Report AI sessions and conversions alongside, not blended into, organic.
9. Guard against drift: AI answers change hourly and are non-deterministic. Re-run the baseline monthly and treat citation presence as a tracked metric. Do not build expectations on a specific phrasing.
10. Keep the classic fundamentals intact. AI answers synthesize linked text; the cited pages are the same authoritative, fast, well-linked pages that rank traditionally. AI work that ignores crawlability, CWV and internal linking optimizes the last 5%.

## Patterns

`llms.txt` with verified navigation and content:

```markdown
# Acme Analytics

> B2B log-file analytics that finds crawl waste and reports it per template.

## Docs
- [Log format reference](/docs/log-format): every field we parse, with sample lines
- [Crawl budget guide](/guides/crawl-budget): formulas, 2026 field medians, five fixes

## Calculators
- [Crawl efficiency estimator](/tools/crawl-efficiency): input log sample size, get waste ratio

## Optional
- [Changelog](/changelog): dated release notes
```

Open Graph tags, which are what most AI answer engines actually fetch:

```html
<meta property="og:type" content="article">
<meta property="og:title" content="Crawl Budget Optimization | Acme Analytics">
<meta property="og:description" content="Log-file formulas, 2026 field medians and five fixes.">
<meta property="og:url" content="https://acme.example/guides/crawl-budget/">
<meta property="og:image" content="https://acme.example/og/crawl-budget-1200x630.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
```

AI-crawler policy, decided per purpose rather than by blanket allow:

```text
# training crawlers: your call, make it explicit
User-agent: GPTBot
Disallow: /

# search and answer engines: allow, they drive referral traffic
User-agent: OAI-SearchBot
User-agent: ClaudeBot
User-agent: PerplexityBot
Allow: /
Disallow: /app/
Disallow: /account/
Sitemap: https://acme.example/sitemaps/index.xml
```

```python
# Track citations and referrals separately from organic sessions
REFERRAL_HOSTS = {"chatgpt.com": "ai_assistant", "claude.ai": "ai_assistant",
                  "perplexity.ai": "ai_search", "gemini.google.com": "ai_search"}
def classify_referral(host):
    for needle, bucket in REFERRAL_HOSTS.items():
        if needle in host.lower():
            return bucket
    return "referral"
```

Answer-shaped content that cites itself:

```html
<section aria-labelledby="answer">
  <h2 id="answer">What is crawl budget?</h2>
  <p>Crawl budget is the number of URLs Googlebot requests from your server per
     crawl session, scaled to site size and server health. On sites under 1,000 URLs
     the median crawl frequency in our 2026 sample was every 3-7 days.</p>
  <table class="citeable">
    <caption>Crawl frequency by site size (Acme field data, 2M-URL sample, 2026)</caption>
    <tbody><tr><th scope="row">&lt; 1,000 URLs</th><td>3-7 days</td></tr>
           <tr><th scope="row">10,000-100,000</th><td>2-6 weeks</td></tr></tbody>
  </table>
</section>
```

```bash
# what an answer engine actually receives
curl -s https://acme.example/guides/crawl-budget/ | grep -c 'og:'   # OG tags in raw HTML
curl -s https://acme.example/llms.txt | head -20
curl -s https://acme.example/robots.txt | grep -iE 'GPTBot|OAI-SearchBot|ClaudeBot'
```

## Checklist

- [ ] AI-surface baseline captured per priority query with cited competitors logged.
- [ ] `robots.txt` allows citation crawlers (Google-Extended, Bingbot, PerplexityBot, ClaudeBot, OAI-SearchBot) and blocks training-only agents (GPTBot, CCBot, anthropic-ai).
- [ ] `llms.txt` published with brand facts, canonical URLs, definitions and research links; accuracy verified.
- [ ] Every citable section leads with a self-contained 40–60 word answer before elaboration.
- [ ] Question-shaped H2/H3 answered immediately, plus a real on-page FAQ section.
- [ ] Primary citable assets published with methodology, dates, named authors and credentials.
- [ ] Organization schema carries `sameAs` to Wikipedia/LinkedIn/Crunchbase; brand naming consistent.
- [ ] AI referrals segmented separately from organic; conversions reported per AI source.

## Anti-patterns

- **Blocking all AI crawlers reflexively** — blocking `GPTBot` and `CCBot` while also blocking `OAI-SearchBot`/`ChatGPT-User` removes your content from AI *answers* entirely, forfeiting the fastest-growing referral channel. Block training, allow search.
- **Treating `llms.txt` as a ranking switch** — it is a voluntary convention with no published enforcement by any engine. Publishing one is fine; expecting guaranteed placement from it is not.
- **Answering only in burdan format** — an answer emerging after 300 words of preamble, a TOC and caveats is never extracted cleanly. Front-load the claim.
- **Drawing conclusions from a single AI prompt** — outputs are non-deterministic and vary by phrasing and region. Track whether your domain appears in citations across a query set over time.
- **Blaming AI for organic declines without data** — AIO clicks often replace organic clicks on the same query. The honest test is total clicks and impressions across both surfaces per query, not AI citation presence alone.

## References

- AI crawler directives follow each vendor's published bot list; training and search bots are intentionally distinct agents with separate policies.
- Google's AI Overviews and AI Mode docs describe the surfaces and their use of indexed content; no engine publishes a distinct "AI SEO" factor list.
- `llms.txt` is a community proposal (llmstxt.org); adoption is voluntary and unspecified by search engines.