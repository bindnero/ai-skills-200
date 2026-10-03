---
name: embedding-strategies
description: Selects and operates embedding models covering dimension choice, Matryoshka truncation, domain fine-tuning, batch throughput, and embedding-drift monitoring. Use when choosing a vector model, when chunk vectors need rebuilding after a model change, or when similarity scores stop discriminating.
---

# Embedding Strategies

**Use when:** you are picking a model to turn text into vectors, or maintaining an index whose vectors must stay consistent over time.
**Do not use when:** the issue is which chunks exist at all — a perfect embedding cannot retrieve a chunk you never indexed; see `chunking-strategies`.

## Instructions

1. Pick the embedding model for the corpus, not the benchmark. Evaluate on 100-200 labelled query-document pairs from your own data; public leaderboards hide domain vocabulary mismatches.
2. Decide dimensionality as a storage and recall tradeoff. Use Matryoshka-trained models so you can start at full dimension and truncate later without invalidating the index.
3. Never mix models inside one index. Vectors from different models share a coordinate system only nominally; similarity across them is meaningless.
4. Treat a model change as a full reindex, not a lazy backfill. Build the new index in parallel, cut over, then retire the old one.
5. Keep document and query preprocessing symmetric. The same case-folding, whitespace normalization, and unicode handling on both sides, or recall drops for reasons you cannot see.
6. Prepend an instruction prefix to queries only, and only if the model was trained for it. Asymmetric prefixes on documents break similarity geometry.
7. Batch aggressively. Providers accept hundreds of texts per request and per-item HTTP overhead dominates otherwise. Respect the per-request token cap.
8. Normalize vectors and use cosine or inner product explicitly. Never mix L2-normalized vectors with an L2 index.
9. Deduplicate near-identical documents before embedding; they crowd the neighbourhood and push distinct content out of top-k.
10. Monitor embedding drift: sample a fixed probe set monthly, record the score distribution, and alert when the mean similarity of probes moves more than a few percent.

## Patterns

Matryoshka truncation sweep before you commit to a dimension:

```python
import numpy as np

def recall_at_k(vectors: np.ndarray, query_vec: np.ndarray, gold: set[int], k: int = 10) -> float:
    q = query_vec / np.linalg.norm(query_vec)
    sims = (vectors / np.linalg.norm(vectors, axis=1)) @ q
    top = np.argsort(-sims)[:k]
    return len(set(top.tolist()) & gold) / max(len(gold), 1)

for dim in (3072, 1536, 1024, 768, 512, 256):
    print(dim, recall_at_k(DOC[:, :dim], Q[0, :dim], gold={7}))
```

Batch embedding with token-budget chunking (Anthropic):

```python
import anthropic

client = anthropic.Anthropic()
MODEL = "voyage-3-large"          # via Voyage, or the model your provider exposes

def embed_many(texts: list[str], batch: int = 96) -> list[list[float]]:
    out: list[list[float]] = []
    for i in range(0, len(texts), batch):
        chunk = texts[i : i + batch]
        resp = client.beta.embeddings.create(model=MODEL, input_type="document", texts=chunk)
        out.extend([rec.embedding for rec in resp.embeddings])
    return out

def embed_query(q: str) -> list[float]:
    resp = client.beta.embeddings.create(model=MODEL, input_type="query", texts=[q])
    return resp.embeddings[0].embedding
```

Query-only instruction prefix:

```text
Represent this sentence for searching relevant passages in a support knowledge base:
{{ user_query }}
```

Symmetric preprocessing applied to both sides:

```python
import re
import unicodedata

_WS = re.compile(r"\s+")

def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = _WS.sub(" ", text).strip()
    return text.casefold()

doc_vecs   = embed_many([normalize(c.text) for c in corpus_chunks])
query_vecs = embed_many([normalize(q) for q in eval_queries], prefix="query: ")
```

Model-change reindex with dual-write and cutover:

```text
1. Snapshot existing chunk IDs and content hashes.
2. Embed the full corpus with the new model into a shadow collection.
3. Re-run the labelled eval set against both collections; compare recall@k.
4. Cut reads over to the shadow collection behind a flag.
5. Keep the old collection for one rollback window, then delete.
```

## Checklist

- [ ] Model chosen on a labelled eval set from the target corpus, not a public leaderboard
- [ ] Matryoshka-capable model selected so dimension can change without a full reindex later
- [ ] All vectors in an index come from one model and one dimension
- [ ] Model change executed as a parallel shadow index with measured recall before cutover
- [ ] Document and query preprocessing are byte-equivalent; query prefix used only if the model was trained for it, never on documents
- [ ] Embedding batched to the provider's per-request token cap
- [ ] Vectors normalized with cosine or inner product selected explicitly in the index
- [ ] Near-duplicate documents removed before indexing; probe-set score distribution monitored with a drift alert

## Anti-patterns

**Mixed-model index.** Adding a second embedding model "just for the new section" produces a neighbourhood where cross-model similarity is noise. Reindex the whole corpus or keep two indexes with an explicit routing rule.

**Idle dimensions.** Choosing 3072-dim vectors because the API defaults to them triples storage and query cost for recall the task never used. Sweep dimensions on your own eval set and pick the knee.

**Prefix on both sides.** Applying the query instruction to indexed documents shifts every document vector away from its topic and silently degrades recall. Prefix queries only.

**Ad-hoc per-request text.** Skipping normalization on the live query path but normalizing at ingest time guarantees the live query never matches its own document. Extract one `normalize()` used by both paths.

**Silent reindex on upgrade.** Bumping a library that changes default embedding behaviour rewrites the meaning of every stored vector. Pin the model and dimension explicitly in config rather than relying on defaults.
