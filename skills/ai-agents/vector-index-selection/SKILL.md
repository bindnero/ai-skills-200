---
name: vector-index-selection
description: Chooses and operates vector search indexes across HNSW, IVF-PQ, disk-backed, and managed services, tuning ef_search, nprobe, filters, and recall-latency tradeoffs. Use when picking a vector database, when p99 search latency misses target, or when filtered search returns fewer results than expected.
---

# Vector Index Selection

**Use when:** you are selecting an index type or database for vector search, or tuning search-time parameters against a recall and latency budget.
**Do not use when:** recall is poor because the wrong text was embedded or chunked — tune the vector first; see `embedding-strategies` and `chunking-strategies`.

## Instructions

1. Write the requirement as three numbers: corpus size, target recall at k, and p99 latency budget. Index choice is a function of these, not of popularity.
2. Start with the built-in vector search in your primary database. A single-node HNSW inside Postgres or a managed serverless index is usually enough until you have measured a problem.
3. Choose HNSW for flat recall at high QPS, IVF-PQ when memory forces compression, and disk-backed or on-disk-PQ for corpora beyond RAM.
4. Tune build-time parameters once and record them in config. `m`, `ef_construction`, `nlist`, and the training sample size are part of the index definition, not runtime knobs.
5. Separate build-time from query-time knobs. Tune `ef_search` and `nprobe` per query class; a support bot and a batch job should not share one value.
6. Measure recall at k against brute-force ground truth on a fixed sample, never against intuition. Brute force is the only correct reference.
7. Filter before the graph when the filter is highly selective, and after (with a wider k) when it is not. Filtering during graph traversal silently returns fewer than k.
8. If you must filter after, request `k * oversample` candidates and re-rank. Under-fetching is the most common cause of "the filter returns nothing".
9. Budget index memory explicitly: vectors × dimensions × 4 bytes × graph overhead, plus the working set. Know your number before provisioning.
10. Plan the reindex before launch. Every index that cannot be built online in place should ship with a shadow-build and flag-based cutover.

## Patterns

Requirement-driven selection table:

```text
Corpus         | Latency   | Recall | Choice
< 1M vectors   | < 50ms    | > 0.95 | Postgres pgvector HNSW (ef_search 100-200)
< 5M vectors   | < 100ms   | > 0.95 | HNSW tuned (m=32, ef_construction=400)
RAM-bound      | < 100ms   | > 0.90 | IVF-PQ (nlist ~ sqrt(N), nprobe 20-50)
> 50M vectors   | < 200ms   | > 0.92 | Disk-backed HNSW / on-disk PQ
Multi-tenant   | any       | any    | Per-tenant namespaces + partition pruning
```

Ground-truth recall measurement for a parameter sweep:

```python
import numpy as np

def brute_force_topk(vectors, queries, k=10):
    qn = queries / np.linalg.norm(queries, axis=1, keepdims=True)
    vn = vectors / np.linalg.norm(vectors, axis=1, keepdims=True)
    sims = vn @ qn.T
    idx = np.argsort(-sims, axis=0)[:k]
    return [set(idx[:, c].tolist()) for c in range(sims.shape[1])]

def recall_at_k(index, queries, truth, k=10):
    hits = sum(len(index.search(q, k) & truth[i]) for i, q in enumerate(queries))
    return hits / (len(queries) * k)

truth = brute_force_topk(train_vectors, probe_queries)
for ef in (50, 100, 200, 400, 800):
    index.hnsw.ef_search = ef
    print(f"ef_search={ef} recall@10={recall_at_k(index, probe_queries, truth):.4f} p99={bench(index).p99_ms:.1f}ms")
```

Pre-filtering at query time in pgvector:

```sql
SET LOCAL hnsw.ef_search = 200;

SELECT id, content, embedding <=> :query_vec AS dist
FROM   doc_chunks
WHERE  tenant_id = :tenant          -- selective: filters before graph search
  AND  status    = 'published'
ORDER BY embedding <=> :query_vec
LIMIT 20;
```

Selective vs non-selective filtering, with compensating oversample:

```text
Highly selective (< 5% of rows):   push filter into the query, keep k as-is.
Weakly selective (> 50% of rows):  filter after search, request k * 5, then re-rank
                                   and slice down to k before returning.
```

TypeScript client for pgvector with query-class-specific knobs:

```ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type QueryClass = "interactive" | "batch";

export async function searchChunks(
  embedding: number[], tenantId: string, k: number, cls: QueryClass = "interactive",
) {
  const { rows } = await pool.query(
    `SET LOCAL hnsw.ef_search = $3;
     SELECT id, content, heading_path, embedding <=> $1 AS dist
       FROM doc_chunks
      WHERE tenant_id = $2
      ORDER BY embedding <=> $1
      LIMIT $4`,
    [`[${embedding.join(",")}]`, tenantId, cls === "interactive" ? 200 : 60, k],
  );
  return rows;
}
```

## Checklist

- [ ] Corpus size, recall target, and p99 latency budget written down before choosing
- [ ] Built-in vector search in the existing database tried before adding a new service
- [ ] Index type justified by RAM and corpus size, not by trend
- [ ] Build-time parameters pinned in config, with recall measured against brute force on a fixed probe sample
- [ ] Query-time `ef_search`/`nprobe` tuned per query class
- [ ] Filter strategy chosen by selectivity; oversampling applied when filtering post-search
- [ ] Memory budget calculated: dimensions × 4 bytes × vector count, plus graph overhead
- [ ] Online reindex path (shadow build plus flag cutover) and tenant partitioning defined before launch

## Anti-patterns

**One knob for every workload.** A single global `ef_search` forced by an interactive demo makes batch jobs slow and interactive queries inaccurate. Set the knob per request from an explicit query class.

**Filtering inside the graph.** Requesting `k=10` while filtering on a low-selectivity column mid-traversal returns three results and gets misdiagnosed as an embedding problem. Oversample and re-rank.

**Benchmarking against sampled neighbours.** Measuring "recall" by eyeballing top-5 results proves nothing. Compare against exact brute-force KNN on a fixed probe set.

**Sizing from row count alone.** A 5M-row table at 1536 dimensions needs roughly 30 GB for vectors plus graph links before you touch the data. Compute it before choosing the instance size.

**In-place reindex on a live table.** Rebuilding a large index synchronously locks or degrades production queries for the duration. Build a shadow table or collection, verify recall, then cut over behind a flag.
