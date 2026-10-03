---
name: rag-pipeline-design
description: Builds retrieval-augmented generation pipelines covering ingestion, query rewriting, hybrid search, reranking, and grounded answer generation with citations. Use when building a knowledge-base chatbot, connecting a LLM to private documents, or diagnosing answers that miss or fabricate document content.
---

# RAG Pipeline Design

**Use when:** a model must answer from your own corpus and you own the full path from document ingestion to grounded output.
**Do not use when:** the corpus fits in the context window with room to spare — long-context prompting beats an entire retrieval stack; or when the task needs exact lookups by ID rather than semantic similarity.

## Instructions

1. Decide the retrieval contract first: what a correct answer must cite, and what the system should say when nothing relevant exists. A refusal path is part of the design, not an afterthought.
2. Build ingestion as an idempotent pipeline: fetch, normalize, extract text with structural markers, chunk, embed, upsert with content hashes. Re-runs must not duplicate vectors.
3. Preserve structure during extraction. Retain headings, table rows as rows, and code as code — semantic-only flattening destroys the signals that make chunks retrievable.
4. Write the chunk for retrieval before embedding it: prepend the document title, the heading path, and a one-line summary so an isolated chunk is still self-describing.
5. Retrieve with more candidates than you need. Pull top 50-100 chunks, then reduce with a reranker or cross-encoder to top 5-10 before generation.
6. Fuse keyword and vector search. Pure dense retrieval misses exact identifiers, error codes, and product names; pure BM25 misses paraphrase. Use hybrid with reciprocal rank fusion or weighted score normalization.
7. Rewrite multi-turn or vague queries before retrieval: strip conversational referents, expand acronyms, and produce 2-4 standalone query variants that are unioned.
8. Give the generator an explicit evidence contract: cite chunk IDs inline, state when the evidence is insufficient, and forbid inference beyond the supplied chunks for factual claims.
9. Measure with a retrieval metric and a generation metric separately. Recall@k tells you whether the chunk was retrieved; faithfulness tells you whether the answer used it.
10. Log the retrieved chunk IDs, scores, and the final answer for every production request so regressions are debuggable after the fact.

## Patterns

Fusion of dense and BM25 with reciprocal rank fusion:

```python
from typing import Sequence

def reciprocal_rank_fusion(
    rankings: dict[str, Sequence[str]], k: int = 60, top_n: int = 20
) -> list[tuple[str, float]]:
    scores: dict[str, float] = {}
    for ranked in rankings.values():
        for position, chunk_id in enumerate(ranked, start=1):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (k + position)
    return sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:top_n]
```

Query expansion into standalone variants:

```text
Rewrite the conversation question into up to 3 standalone search queries.
Resolve pronouns and ellipsis using the conversation. Expand known acronyms.
Do not add information that is not implied by the question.

Conversation:
User: It still crashes on the webhook retry.
Assistant: Which endpoint?
User: The one for order.shipped.

Queries:
1. webhook retry crash on order.shipped endpoint
2. order.shipped webhook retry failure
3. duplicate delivery on shipment webhook
```

Self-describing chunk text built at ingestion time:

```python
def build_chunk_text(doc_title: str, heading_path: str, summary: str, body: str) -> str:
    return f"TITLE: {doc_title}\nSECTION: {heading_path}\nSUMMARY: {summary}\n---\n{body}"
```

Grounded generation with citations and a refusal path:

```text
<evidence>
{chunk_1}
---
{chunk_2}
---
{chunk_3}
</evidence>

Answer using only the evidence above.

Rules:
- Cite the evidence number after each factual claim, like [1].
- If the evidence does not contain the answer, reply exactly:
  "I could not find that in the available documents."
- Do not use prior knowledge about this product, even if you are confident.

Question: {question}
```

Batched embedding with idempotent upsert (Python):

```python
import hashlib
import numpy as np

def embed_and_upsert(store, chunks: list[str], batch_size: int = 256) -> dict[str, int]:
    stats = {"inserted": 0, "updated": 0}
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        vectors = embed_many(batch)                      # one provider round trip per batch
        for text, vec in zip(batch, vectors):
            content_hash = hashlib.sha256(text.encode()).hexdigest()
            existing = store.get_by_hash(content_hash)
            store.upsert(text=text, vector=np.asarray(vec), content_hash=content_hash)
            stats["updated" if existing else "inserted"] += 1
    return stats
```

## Checklist

- [ ] Refusal behaviour for "no relevant evidence" specified, and abstention scored as correct
- [ ] Ingestion idempotent via content hashing; re-runs create no duplicates
- [ ] Extraction preserves headings, table structure, and code boundaries
- [ ] Chunk text carries title, heading path, and summary for standalone retrieval
- [ ] Hybrid dense + keyword retrieval with rank fusion; candidates (top 50-100) reranked to top 5-10 before generation
- [ ] Multi-turn questions rewritten into standalone query variants
- [ ] Generator instructed to cite evidence IDs and refuse when evidence is insufficient
- [ ] Recall@k measured separately from faithfulness, and retrieved chunk IDs and scores logged per request

## Anti-patterns

**Vector-only retrieval.** Embedding search alone cannot retrieve an error code or a SKU that appears verbatim in the document. Add BM25 and fuse the two rankings.

**Generation over top-5 with no reranking.** Feeding the top-5 nearest neighbours straight to the generator discards precision you already paid for. Pull 50-100 candidates and rerank before you generate.

**No refusal path.** Without an explicit "evidence is insufficient" instruction, the model answers from parametric memory and the failure looks like a correct answer. Make the refusal string exact and test that it fires.

**Chunking once, forever.** Fixing chunk size at launch and never re-evaluating leaves recall rotting as content shifts. Track recall@k per corpus section and re-chunk on content change, not only on new documents.

**Topic sentence left to the reader.** Chunks that start mid-argument embed as ambiguous fragments that match everything weakly. Prepend a self-describing prefix so the vector represents the whole idea.
