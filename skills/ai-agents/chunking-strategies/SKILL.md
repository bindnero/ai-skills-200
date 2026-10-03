---
name: chunking-strategies
description: Splits documents into retrievable units using structure-aware, semantic, and late-chunking methods with tuned size and overlap. Use when setting chunk size or overlap, when a chunk starts mid-argument, or when retrieval returns fragments that lose context.
---

# Chunking Strategies

**Use when:** you are deciding how documents are divided before embedding, or fixing chunks that retrieve poorly because they lack standalone context.
**Do not use when:** chunks are already semantically whole and recall is still poor — the problem is the query side or the index; see `rag-pipeline-design`.

## Instructions

1. Chunk along the document's own structure first: headings, sections, list items, table blocks, code functions. Fall back to fixed size only for unstructured prose.
2. Start at 300-800 tokens for prose with 10-15% overlap, then tune against measured recall. Bigger chunks dilute the embedding; smaller chunks lose the argument.
3. Add overlap to protect facts that straddle a boundary, and confirm with an eval that the duplicated boundary text is not being retrieved as a competing near-duplicate.
4. Prepend a self-describing prefix to every chunk: document title, heading path, and a one-line summary. This is the cheapest recall improvement available.
5. Keep tables atomic. Split a table by header plus a small row group so every chunk carries its own column meaning.
6. Keep code split at function or class boundaries with the import header and docstring attached.
7. Use metadata propagation: every chunk inherits `doc_id`, `title`, `heading_path`, `source_url`, and `updated_at`. Filter and cite from metadata instead of re-deriving it from text.
8. Consider late chunking only when chunk-level retrieval is measurably the bottleneck: embed the full document with a long-context model, then mean-pool tokens per chunk to get chunk vectors that inherit document context.
9. Use semantic chunking when topic boundaries are irregular — it costs an extra LLM pass and pays off only on long unstructured documents.
10. Version the chunking config with the corpus. Any change to size, overlap, or prefix invalidates every stored vector and requires a reindex.

## Patterns

Structure-first splitter with metadata inheritance:

```python
import re
from dataclasses import dataclass

@dataclass
class Chunk:
    id: str
    doc_id: str
    text: str
    heading_path: str
    token_estimate: int

HEADING = re.compile(r"^(#{1,6})\s+(.+)$")

def split_markdown(doc_id: str, title: str, body: str, max_tokens: int = 512) -> list[Chunk]:
    chunks: list[Chunk] = []
    heading_path: list[str] = []
    buffer: list[str] = []

    def flush() -> None:
        if not buffer:
            return
        text = "\n".join(buffer).strip()
        path = " > ".join(heading_path)
        # Self-describing prefix: makes an isolated chunk retrievable on its own.
        prefixed = f"TITLE: {title}\nSECTION: {path}\n---\n{text}"
        chunks.append(
            Chunk(id=f"{doc_id}:{len(chunks)}", doc_id=doc_id, text=prefixed,
                  heading_path=path, token_estimate=len(prefixed) // 4)
        )
        buffer.clear()

    for line in body.splitlines():
        m = HEADING.match(line)
        if m:
            flush()
            heading_path = heading_path[: len(m.group(1)) - 1] + [m.group(2)]
            continue
        if len(" ".join(buffer).split()) // 1.2 > max_tokens:
            flush()
        buffer.append(line)
    flush()
    return chunks
```

Table and code handling:

```python
def chunk_table(header: str, rows: list[str], group: int = 8) -> list[str]:
    """Header travels with every chunk; rows are grouped, never split mid-header."""
    return [header + "\n" + "\n".join(rows[i : i + group]) for i in range(0, len(rows), group)]

def chunk_code(doc_header: str, functions: list[tuple[str, str]]) -> list[str]:
    return [f"{doc_header}\n\n{signature}\n{body}" for signature, body in functions]
```

Late chunking with a long-context embedder:

```python
def late_chunk(whole_doc: str, spans: list[tuple[int, int]], embedder) -> list[list[float]]:
    token_embeddings = embedder.embed_long(whole_doc)      # one long-context pass, per-token vectors
    out = []
    for start, end in spans:                                # character spans of chunks
        s, e = embedder.token_span(start, end)
        out.append(mean_pool(token_embeddings[s:e]))
    return out
```

Overlap sweep against labelled queries:

```python
def best_config(chunks_by_config, probes, ground_truth):
    table = []
    for size in (256, 384, 512, 768, 1024):
        for overlap_pct in (0.0, 0.10, 0.20):
            ids = chunks_by_config(size, overlap_pct)
            r = recall_at_k_against_gold(ids, probes, ground_truth, k=10)
            table.append((size, overlap_pct, r))
    return max(table, key=lambda row: row[2])
```

## Checklist

- [ ] Splitting follows headings, list items, table blocks, and function boundaries first
- [ ] Size and overlap chosen from an eval sweep, not a default
- [ ] Every chunk carries a title + heading-path prefix
- [ ] Tables keep their header in every chunk; code chunks keep imports and docstring context
- [ ] `doc_id`, `title`, `heading_path`, `source_url`, `updated_at` inherited onto every chunk
- [ ] Boundary-straddling facts verified retrievable, and overlapping text does not crowd out distinct chunks in top-k
- [ ] Late or semantic chunking adopted only with measured evidence it helps
- [ ] Chunking config versioned and any change triggers a full reindex

## Anti-patterns

**Fixed 512-token slicing on structured docs.** Blind slicing splits tables from their headers and code from its imports, producing chunks that are meaningless alone. Split on structure and only size-split prose.

**Zero overlap as a principle.** No overlap is cheap until a critical sentence lands exactly on the boundary and becomes half-retrievable. Start at 10-15% and confirm no near-duplicate crowding.

**Chunk with no context.** Embedding a bare paragraph loses the title and section, so it matches everything weakly and nothing strongly. Prefix title and heading path to every chunk.

**Semantic chunking everywhere.** Running an LLM pass to find topic boundaries on clean, well-headed documentation triples ingestion cost for no measurable gain. Reserve it for long unstructured prose.

**Changing chunk size in production without reindex.** New chunks alongside old ones with different semantics produce recall that nobody can explain. Reindex in a shadow collection and cut over atomically.
