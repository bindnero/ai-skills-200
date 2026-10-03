---
name: context-window-management
description: Budgets and prunes agent context using compaction, structured note-taking, retrieval-on-demand, and turn summarization with token accounting. Use when context grows too large to fit, when performance degrades mid-conversation, or when "lost in the middle" recall failures appear.
---

# Context Window Management

**Use when:** the conversation or task state no longer fits comfortably in the model's context, or long-context accuracy has degraded.
**Do not use when:** the problem is that retrieval never returned the right chunk — more context cannot fix absent evidence; see `rag-pipeline-design`.

## Instructions

1. Compute the budget before the first call: window minus max output minus a safety margin. Track tokens per turn, not just per request.
2. Model context as typed state plus a rendered view. Compact the state; never compact by deleting messages at random.
3. Compact on trigger, not on schedule. Compact when the token estimate crosses a threshold, when a phase ends, or before a new sub-task — whichever comes first.
4. During compaction, preserve in this order: the original goal, hard constraints and user-stated preferences, decisions already made with their rationale, unresolved questions, and only then the narrative detail.
5. Convert past exchanges into structured notes rather than prose summaries. "Decision: X, because Y" survives compaction better than "The user then asked about X and we agreed it was fine because Y".
6. Load detail on demand. Store bulky artifacts (file bodies, tool dumps, prior transcripts) in an external store and pull a slice when a step actually needs it.
7. Never summarize the most recent turns. Keep the last two or three exchanges verbatim so the model does not lose conversational grip.
8. Make compaction idempotent and single-pass: produce the compacted view once, store it with a version marker, and never re-summarize a summary.
9. Carry forward the exact user wording for constraints. A user requirement paraphrased into a summary becomes a different requirement.
10. Emit a token-budget log per turn and alert when average context grows turn over turn; unbounded growth is the symptom, not the problem.

## Patterns

Typed state with explicit compaction policy:

```ts
type AgentState = {
  goal: string;                              // never compacted
  constraints: string[];                     // verbatim user requirements
  decisions: { decision: string; because: string; at: string }[];
  openQuestions: string[];
  artifacts: Record<string, { uri: string; bytes: number; summary: string }>;
  turns: Turn[];                             // rendered view
  compactedThrough: number;
};

const POLICY = { maxInputTokens: 180_000, reserveOutput: 16_000, safety: 20_000 };

function shouldCompact(s: AgentState, estimate: number) {
  return estimate + POLICY.reserveOutput + POLICY.safety > POLICY.maxInputTokens;
}
```

Compaction prompt that preserves priority order:

```text
Compress the working transcript into structured notes. Preserve, in this order of priority:

1. The original goal, verbatim.
2. Hard constraints and user preferences, verbatim — do not paraphrase them.
3. Decisions made, each as "Decision: <what> — because <why>".
4. Open questions and blockers.
5. Tool results that are still needed, as one line each with their source.

Drop: pleasantries, restated tool output, failed attempts that taught nothing, and any
detail already recorded above.

Output JSON with keys: goal, constraints, decisions, openQuestions, facts.
```

Detail-on-demand artifact loading:

```ts
async function needBody(state: AgentState, uri: string, startLine: number, lines = 120) {
  if (!state.artifacts[uri]) throw new Error(`artifact not registered: ${uri}`);
  const blob = await artifactStore.read(uri, { startLine, limit: lines });
  return { source: `${uri}#L${startLine}`, content: blob };
}
```

Token accounting with early warning:

```python
def budget_decision(state, prompt_tokens, reserve_output=16_000, safety=20_000):
    window = 200_000
    headroom = window - reserve_output - safety
    usage = prompt_tokens / headroom
    if usage > 1.0:
        return "compact_now"
    if usage > 0.75:
        return "compact_soon_and_start_summarizing_tool_results"
    return "continue"
```

Anthropic context editing, letting the provider drop stale tool results:

```ts
const res = await client.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 16_000,
  context_management: { edits: [{ type: "clear_tool_uses_20250919" }] },
  messages,
});
```

## Checklist

- [ ] Window budget computed as window minus max output minus margin, per turn
- [ ] Context modelled as typed state with a rendered view, not a raw transcript
- [ ] Compaction triggered by threshold, phase boundary, or new sub-task
- [ ] Preservation order enforced: goal, constraints, decisions, open questions, narrative
- [ ] Constraints carried forward in the user's exact wording
- [ ] Bullky artifacts stored externally and loaded by slice on demand
- [ ] Most recent two to three turns kept verbatim; compaction idempotent and version-marked
- [ ] Per-turn token usage logged with a growth alert; provider-side context editing or caching enabled where available

## Anti-patterns

**Middle-out deletion.** Dropping the oldest N messages to make room destroys goal and constraints while keeping the least useful tail. Compact into structured notes instead of slicing the transcript.

**Re-summarizing summaries.** Compacting on every turn without a marker means turn 200 compacts a summary of turn 150, and details blur away cumulatively. Compact once per segment and record `compactedThrough`.

**Dumping whole files into context.** Inlining a 300 KB file for one lookup spends the entire budget on data the step never reads. Keep the artifact in a store and load a targeted slice.

**Paraphrasing user constraints.** "User prefers short answers" replacing "never more than 3 sentences, no bullet lists" quietly changes the requirement. Copy constraints verbatim.

**Treating a large window as free.** Assuming 1M tokens means you can keep everything pushes latency and cost far past the point where the model's recall has already degraded. Budget and prune deliberately regardless of window size.
