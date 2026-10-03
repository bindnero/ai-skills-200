---
name: agent-skill-authoring
description: Authors agent skills with progressive disclosure using SKILL.md frontmatter, layered references, and trigger-precise descriptions. Use when writing or editing a SKILL.md for an agent, when a skill never triggers, or when skills bloat context.
---

# Agent Skill Authoring

**Use when:** you are writing a skill file an agent loads on demand, or fixing one that fails to trigger or loads too much text.
**Do not use when:** the guidance belongs permanently in the agent's system prompt — see `system-prompt-design`; or when you are tuning a one-off prompt, see `prompt-engineering`.

## Instructions

1. Write the frontmatter with exactly two keys: `name` and `description`. No license, no metadata, no extra fields — unknown keys break strict loaders.
2. Make `name` lowercase-hyphenated and byte-identical to the directory name, since loaders resolve by folder.
3. Write the description as what-it-does plus when-to-trigger, with the literal words a user would type in the first clause. Triggers match against this string, not the body.
4. Make descriptions mutually exclusive. If two skills' descriptions could match the same request, either merge them or sharpen the boundary in each `Do not use when` line.
5. Keep SKILL.md body between roughly 70 and 130 lines. Above that, move detail into a reference file and link it; progressive disclosure is the whole point of the format.
6. Open the body with `Use when` and `Do not use when`, one sentence each, so the agent self-gates even after loading.
7. Write numbered imperative steps that an executing agent follows in order, not background reading. Test each step by asking whether it changes behaviour.
8. Include at least two real artifacts — code, JSON, config, or prompt text — that are correct as written, with no placeholders or TODOs.
9. End with a verifiable checklist and named anti-patterns. A checklist of untestable items teaches nothing.
10. Create exactly one file per skill. If you need scripts, put them in a linked file with a stated path, and never assume a directory structure the loader will not create.

## Patterns

Required frontmatter, exactly two keys:

```yaml
---
name: rag-pipeline-design
description: Builds retrieval-augmented generation pipelines covering ingestion, query rewriting, hybrid search, reranking, and grounded answer generation with citations. Use when building a knowledge-base chatbot, connecting a LLM to private documents, or diagnosing answers that miss or fabricate document content.
---
```

Body skeleton with the four required sections in order:

````markdown
# RAG Pipeline Design

**Use when:** one sentence with concrete trigger conditions.
**Do not use when:** one sentence naming the adjacent skill that owns that case.

## Instructions

1. Concrete, imperative step an agent follows in order.
2. ...

## Patterns

```ts
// at least two real, runnable artifacts
```

## Checklist

- [ ] Verifiable item
- [ ] Verifiable item

## Anti-patterns

**Named failure mode.** Why it fails, then the fix.
````

Progressive disclosure by reference for long detail:

```text
SKILL.md               100 lines: triggers, ordered steps, 2 patterns, checklist
references/
  chunking.md          long-form chunking detail, linked from a step
  eval-harness.md      the evaluation code, loaded only when running evals
```

Step 3 of SKILL.md links the detail:

```markdown
3. Choose chunking per corpus type using the table in `references/chunking.md`.
   For legal and regulatory text, use section-boundary splits with 15% overlap;
   for support threads, use speaker-turn splits instead.
```

Trigger precision: descriptions that must not collide:

```text
prompt-engineering        ... Use when a prompt underperforms or output format drifts ...
system-prompt-design      ... Use when creating or changing the agent's top-level operating instructions ...
tool-calling-design       ... Use when wiring an agent to external APIs with tool definitions ...
mcp-server-design         ... Use when building or exposing tools over the Model Context Protocol transport ...
```

## Checklist

- [ ] Frontmatter has exactly `name` and `description`
- [ ] `name` is lowercase-hyphenated and identical to the folder name
- [ ] Description states what it does and when to trigger, front-loading user vocabulary
- [ ] No two skills have overlapping descriptions; each has a distinct boundary line
- [ ] Body is 70-130 lines with detail pushed into linked references
- [ ] `Use when` and `Do not use when` present immediately under the title
- [ ] Instructions are numbered, imperative, and behaviour-changing
- [ ] At least two complete, correct artifacts with no placeholders; exactly one file per skill directory

## Anti-patterns

**Metadata bloat.** Adding `license`, `version`, `author`, or a `metadata` block breaks loaders that validate the frontmatter shape. Emit exactly `name` and `description`.

**Untriggerable description.** "Helps with agent things" gives a matcher nothing to match on, so the skill never loads. Front-load the concrete nouns a user would type.

**Overlapping descriptions.** Two skills described as "handles RAG" and "builds search systems" cause coin-flip loading and contradictory guidance. Merge them or sharpen the `Do not use when` boundary.

**The 400-line manual.** Packing every edge case into SKILL.md burns context on every load and buries the ordered steps. Move depth into a linked reference and keep the trigger and steps in the main file.

**Advisory steps.** "Consider whether caching might be beneficial" is not executable. Write "Enable prompt caching on the stable prefix and verify `cache_read_input_tokens` is non-zero" so the step changes behaviour.
