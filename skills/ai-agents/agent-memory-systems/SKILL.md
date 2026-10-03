---
name: agent-memory-systems
description: Implements agent memory across working scratchpads, episodic logs, semantic stores, and retrieval policies with decay and consolidation. Use when an assistant must remember past sessions, when long-term facts need to be recalled accurately, or when stored memories start conflicting.
---

# Agent Memory Systems

**Use when:** an agent must persist and recall information across sessions, or when stored facts begin to contradict each other or go stale.
**Do not use when:** the state only needs to survive the current task — that is working state; see `context-window-management`.

## Instructions

1. Separate four stores by write policy, not by name: working state (this task), episodic (what happened, when), semantic (durable facts), and procedural (how we do things). Different stores have different write and retrieval rules.
2. Make every memory a typed record with provenance: source, timestamp, confidence, and the conversation id it came from. A memory without provenance cannot be corrected later.
3. Write memories at decision boundaries, not at every turn. "The user chose plan B over plan A because of price" is worth storing; "user said hello" is not.
4. Require agreement before a fact becomes semantic. Promote a fact from episodic to semantic only after it appears consistently, so one throwaway line does not become permanent truth.
5. Retrieve with the same hybrid stack as document RAG: dense for paraphrase, keyword for identifiers, recency weighting on top of both. Recent memories should not be crowded out by old ones.
6. Apply decay. Confidence falls with age unless a memory is reinforced, and decayed memories get archived rather than deleted, so audit remains possible.
7. Resolve conflicts explicitly: when retrieved memories disagree, surface both with their timestamps and let the agent ask, rather than silently preferring the newer one.
8. Bound the store. Cap per-entity memories, prune superseded ones, and archive to cold storage so the hot set stays small and relevant.
9. Inject a bounded number of memories per turn with their provenance visible, so the model can weigh them and cite them rather than treating them as ground truth.
10. Give the user delete and correct paths. Memory the user cannot inspect or remove is both a trust problem and a compliance problem.

## Patterns

Typed memory record with provenance:

```ts
type Memory = {
  id: string;
  kind: "episodic" | "semantic" | "procedural";
  scope: { userId?: string; project?: string; entity?: string };
  content: string;
  provenance: { source: string; conversationId: string; observedAt: string };
  confidence: number;      // decayed at read time
  reinforcedAt?: string;
  supersededBy?: string;
};
```

Promotion with agreement threshold:

```ts
async function maybePromoteToSemantic(ep: Memory[], entity: string): Promise<Memory | null> {
  const claims = new Map<string, Memory[]>();
  for (const m of ep.filter((m) => m.scope.entity === entity)) {
    for (const claim of extractAtomicClaims(m.content)) {
      claims.set(claim.key, [...(claims.get(claim.key) ?? []), m]);
    }
  }
  const agreed = [...claims.entries()].find(([, ms]) => ms.length >= 3);   // 3 independent observations
  return agreed ? semanticStore.put(agreed[1][0]) : null;                 // else stay episodic
}
```

Decay on read, archive not delete:

```python
import math
from datetime import datetime, timezone

HALF_LIFE_DAYS = 180.0

def decayed_confidence(mem, now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    age_days = (now - datetime.fromisoformat(mem["observed_at"])).total_seconds() / 86400
    reinforced = mem.get("reinforced_at") or mem["observed_at"]
    r_age = (now - datetime.fromisoformat(reinforced)).total_seconds() / 86400
    return round(mem["confidence"] * math.pow(0.5, r_age / HALF_LIFE_DAYS), 4)

def archive_if_stale(mems, threshold=0.15):
    keep, archive = [], []
    for m in mems:
        (archive if decayed_confidence(m) < threshold else keep).append(m)
    return keep, archive
```

Bounded hybrid retrieval with recency weighting:

```ts
const rrf = 0.6 * rankScore(denseRanks, memoryIds) + 0.25 * rankScore(bm25Ranks, memoryIds)
            + 0.15 * recencyScore(memoryIds);

const injected = memoryIds
  .map((id) => ({ id, score: rrf[id] }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 8)
  .map(({ id }) => `- [${memory(id).observedAt.slice(0, 10)}] ${memory(id).content} (source: ${memory(id).source})`);
```

Conflict surfacing in the prompt:

```text
RECALLED CONTEXT
- 2025-11-02: user deploys to eu-west-1 only (source: chat #4412)
- 2026-01-14: user deploys to eu-west-1 and us-east-1 (source: chat #5120)

These records conflict. Do not silently pick one. State the conflict and ask which
is current, or proceed only if the answer does not depend on it.
```

## Checklist

- [ ] Working, episodic, semantic, and procedural stores kept separate with distinct write rules
- [ ] Memories written at decision boundaries, not on every turn; provenance recorded on each
- [ ] Promotion to semantic requires agreement across independent observations
- [ ] Retrieval is hybrid (dense + keyword) with an explicit recency weight
- [ ] Confidence decays with age; stale memories archived rather than deleted
- [ ] Conflicting records surfaced with timestamps instead of auto-resolved
- [ ] Store bounded with per-entity caps and cold-storage archival; only a handful injected per turn, with provenance visible
- [ ] Users can view, correct, and delete their own memories

## Anti-patterns

**One undifferentiated store.** Throwing every observation into a single list of embeddings mixes "user prefers dark mode" with "deploy failed on Tuesday" and retrieves both for either query. Type the memories and scope them.

**Permanent facts from one utterance.** A user says "I'm going to Porto next month" and it becomes a durable location memory that follows them for years. Require agreement or reinforcement before promotion.

**Never decaying.** Memories stored forever accumulate contradictions and crowd out current facts. Decay confidence and archive so the hot set reflects what is still plausibly true.

**Silent conflict resolution.** Always preferring the newest record hides genuine disagreements like two deployments that are both still running. Surface the conflict and let the agent ask.

**Unbounded injection.** Dumping every recalled memory into the prompt grows context until the task drowns. Cap the count, show provenance, and rank rather than append.
