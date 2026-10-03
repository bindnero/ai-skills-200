---
name: hallucination-mitigation
description: Reduces fabricated facts with grounded citation requirements, abstention policies, retrieval-backed verification, and confidence-aware routing. Use when agents invent citations, cite documents that do not exist, or state facts with no basis in the source material.
---

# Hallucination Mitigation

**Use when:** output contains invented facts, fabricated URLs or citations, or confident claims unsupported by any retrieved source.
**Do not use when:** the content is attacker-controlled text steering the model — that is instruction-following compromise, see `prompt-injection-defense`.

## Instructions

1. Classify the failure first: fabricated source, unsupported inference, stale knowledge, or mis-grounded quotation. Each needs a different fix and the wrong fix makes it worse.
2. Ground every factual claim in retrieved text and require an inline citation per claim. A claim without a citation is a defect the grader can catch.
3. Make abstention a first-class, rewarding behaviour. Specify the exact refusal string, and never punish the model for using it during evaluation.
4. Verify citations programmatically. After generation, check that every cited chunk ID exists, and that a supporting span actually appears in that chunk. Reject the answer if not.
5. Bound the knowledge scope in the prompt: "answer only from the evidence provided; if it is absent, say so". Explicitly forbid filling gaps from general knowledge.
6. Retrieve before answering even when the model believes it knows the answer. Confident prior knowledge is precisely the failure mode you are defending against.
7. Add a verification pass for high-risk claims: a second, cheaper call that is given only the drafted claim and the evidence, and asked whether the evidence entails the claim.
8. Use structured output with an `evidence_ids` field the model must fill per claim, so grounding is a schema requirement rather than a stylistic request.
9. For numbers, dates, and identifiers, extract them programmatically from source text after generation and compare against the source. Never let the model restate them from memory.
10. Track a faithfulness metric per source in production and alert on drops; hallucination usually comes from a retrieval or context regression, not from model drift.

## Patterns

Claim-level citation requirement in the output schema:

```ts
const GroundedAnswer = z.object({
  claims: z.array(z.object({
    text: z.string().min(1),
    evidence_ids: z.array(z.string()).min(1),     // must be non-empty
  })).min(1),
  unsupported: z.string().default(""),             // explicit abstention field
  confidence: z.enum(["high", "medium", "low"]),
}).refine((a) => a.unsupported !== "" || a.claims.every((c) => c.evidence_ids.length > 0), {
  message: "every claim needs evidence or the model must abstain",
});
```

Post-generation citation verification:

```ts
export function verifyCitations(answer: GroundedAnswer, chunks: Map<string, string>) {
  const bogus: string[] = [];
  const unsupported: string[] = [];

  for (const claim of answer.claims) {
    for (const id of claim.evidence_ids) {
      const source = chunks.get(id);
      if (!source) { bogus.push(id); continue; }
      const key = salientTerms(claim.text);
      if (!key.some((t) => source.toLowerCase().includes(t.toLowerCase()))) unsupported.push(claim.text);
    }
  }
  if (bogus.length) return { ok: false, reason: "cited chunk does not exist", bogus };
  if (unsupported.length) return { ok: false, reason: "claim not found in cited chunk", unsupported };
  return { ok: true };
}
```

Entailment verification pass for high-risk claims:

```text
For each claim, decide whether the evidence entails the claim.
Answer "entailed", "contradicted", or "not covered" — nothing else.

Evidence: {evidence}
Claim: {claim}

JSON: {"verdicts": [{"claim_index": 0, "verdict": "entailed"}]}
```

Prompt framing with scope bound and rewarded abstention:

```text
Answer the question using ONLY the evidence below.

- Cite the evidence number after every factual claim.
- Never add information from general knowledge, even if you are certain.
- If the evidence does not cover the answer, set "unsupported" to a plain explanation of
  what is missing and return no claims. This is a correct and expected outcome.
- Never invent an evidence number. Only use numbers from the list above.

EVIDENCE
1. {chunk_1}
2. {chunk_2}
3. {chunk_3}

QUESTION: {question}
```

Numeric extraction verified against source, not memory:

```python
import re

def verify_numbers(answer: str, evidence: str) -> list[str]:
    candidates = set(re.findall(r"\b\d[\d,.]*\b", answer))
    source = evidence.replace(",", "")
    return [c for c in candidates if c.replace(",", "") not in source]
```

## Checklist

- [ ] Failure class identified: fabricated source, unsupported inference, stale knowledge, or mis-quotation
- [ ] Every factual claim carries an inline citation of a real retrieved chunk ID
- [ ] Abstention has an exact specified string and is rewarded in the eval set
- [ ] Citations verified post-generation for existence and lexical support
- [ ] Prompt forbids using general knowledge and states the knowledge boundary; retrieval runs even when the model is confident
- [ ] Entailment verification pass applied to high-risk claims
- [ ] Numbers, dates, and identifiers verified by extraction against the source text
- [ ] Faithfulness tracked per source, and unsupported-claim rate gated in the eval suite with a regression alert

## Anti-patterns

**Citation prompt with no verification.** Telling the model to cite and never checking the citations just moves the fabrication to reference numbers that do not resolve. Verify IDs against the retrieved set programmatically.

**Punished refusal.** Scoring abstain answers as failures teaches the model to guess. Score abstention as correct whenever the evidence genuinely lacks the answer.

**Greedy answering.** Letting the model answer from memory when retrieval returns nothing guarantees invention. Refuse to generate until either evidence exists or the abstain path fires.

**Longer evidence as the fix.** Piling on more retrieved chunks increases distraction and grounding errors as often as it improves coverage. Improve chunk precision instead — see `rag-pipeline-design`.

**Spot-checking hallucinations in QA.** Reading three answers per week finds none of the drift that matters. Track the unsupported-claim rate over the full traffic sample and alert on change.
