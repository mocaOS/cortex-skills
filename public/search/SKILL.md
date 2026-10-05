---
version: 1.2.3
name: search
description: Perform hybrid search combining vector similarity, keyword matching, and metadata matching (filename, topic hints, custom-input content), fused with Reciprocal Rank Fusion. Use this skill when searching documents, finding relevant chunks, or retrieving knowledge from the Cortex knowledge base.
---

# Hybrid Search

## What You Probably Got Wrong

1. **This is NOT just vector search.** This endpoint fuses three retrieval legs with Reciprocal Rank Fusion (RRF): vector similarity (weight 0.5), keyword/full-text matching (weight 0.3), and metadata matching (weight 0.2) — filename, custom topic hints, and raw content of custom inputs. If you're treating it like a simple embedding lookup, you're missing most of the retrieval power.

2. **Results are NOT re-ranked on this endpoint.** The `score` field is the RRF fusion score — `weight / (60 + rank)` summed over the legs a chunk appears in — so values are small (a chunk ranked first in all three legs scores ≈ 1/61 ≈ 0.016 with the default weights). Cross-encoder re-ranking happens on the Ask AI/context retrieval path, not here; don't expect cross-encoder-calibrated scores from `/api/search`.

3. **`top_k` defaults to 5, not "all".** If you're not specifying `top_k`, you're getting 5 results. The valid range is 1–50. Ask for more if you need broader coverage, fewer if you need speed.

4. **There is no entity-relationship traversal leg here.** `/api/search` uses the same Neo4j store, but entity-aware traversal, query-entity resolution, and ranked traversal are features of the Ask AI/deep-research retrieval path (`knowledge_search`). Entity-heavy queries get no graph-traversal boost from this endpoint; its third leg matches document metadata instead.

5. **The 0.5/0.3/0.2 split is fixed on this endpoint.** `VECTOR_WEIGHT`, `KEYWORD_WEIGHT`, and `GRAPH_WEIGHT` are environment variables, but they tune the Ask AI/context RRF fusion — the one that includes the graph leg — not `/api/search`, which always uses its built-in 0.5 (vector) / 0.3 (keyword) / 0.2 (metadata) weights.

6. **Collection scoping narrows every leg.** When you pass `collection_id` (top-level, or the legacy `filters: {"collection_id": "..."}`), all three legs are scoped to that collection's documents — the scope is applied inside each leg's query as a `Collection → CONTAINS → Document` match, not as a filter on returned results. The vector leg over-fetches when scoped: with the default factor 10, ANN depth is `max(depth, min(10 × depth, 200))`, where the leg's fetch depth is `top_k × 2`. Neo4j 5.x vector indexes cannot filter while they search.

7. **`document_title` is just the filename.** It mirrors `metadata.filename`; there is no separate title field. Web-imported documents are filed by domain, so on backends up to v1.2.1 fifteen essays crawled one at a time from the same site all show `museumofcrypto.substack.com.md` — the real title is the first heading of chunk 0 (newer backends name single-page imports `host - Page Title.md`). To triage look-alike hits, read `content` of the `chunk_index: 0` hit or fetch the document (next point).

8. **Search returns chunks; when you need the source, fetch the document.** Every hit carries a `document_id` — `GET /api/documents/{id}/content` returns `full_content` (all chunks in order) plus `chunks[]` and metadata, with a read key. Chunks are for finding; the document is for reading. And when you need a synthesized, cited answer rather than passages, switch to streaming Deep Research (`POST /api/ask/stream`, `use_agentic: true`) — the [ask skill](../ask/SKILL.md) has the decision tree.

---

## Endpoint

```
POST {BASE_URL}/api/search
```

### Headers

```
X-API-Key: {API_KEY}
Content-Type: application/json
```

### Request Body

| Field           | Type     | Required | Default | Description                                      |
|-----------------|----------|----------|---------|--------------------------------------------------|
| `query`         | string   | Yes      | —       | The search query. Natural language works best.    |
| `top_k`         | integer  | No       | 5       | Number of results to return. Range: 1–50.        |
| `filters`       | object   | No       | null    | Metadata filters to narrow results. Scope to a collection with `{"collection_id": "..."}`. |
| `collection_id` | string   | No       | null    | Top-level alternative to `filters.collection_id` — same effect, uniform with `/api/ask` and `/api/upload`. Don't pass both with different values (400). |

> Search always runs the same hybrid strategy — vector + keyword + metadata, fused via RRF (k = 60). It runs regardless of `ENABLE_HYBRID_SEARCH` (that flag gates a different Ask AI/context fusion: vector + keyword + graph traversal, with graph in place of metadata). There is no per-request `search_type` or `fast_mode` toggle.

### Response

```json
{
  "query": "original query",
  "results": [
    {
      "document_id": "doc_abc123",
      "chunk_id": "chunk_001",
      "content": "The retrieved text content of this chunk...",
      "score": 0.0164,
      "document_title": "report.pdf",
      "metadata": {
        "filename": "report.pdf",
        "chunk_index": 7
      }
    }
  ],
  "total_results": 1,
  "total": 1
}
```

`total` and `total_results` are aliases (kept in lockstep), and `document_title` mirrors `metadata.filename`. The `score` is the RRF fusion score, not a similarity or cross-encoder value.

---

## How Hybrid Search Works

### Step 1: The Three Legs (run in sequence, one request)

- **Vector similarity** — The query is embedded using the same model as ingestion (OpenAI `text-embedding-3-small`, 1536 dimensions). A similarity search runs against the chunk vector index. When a collection scope or filter applies, the ANN fetch depth is `max(depth, min(depth × factor, 200))`, where the leg's depth is `top_k × 2` and `VECTOR_SCOPED_OVERFETCH` defaults to 10. Candidates are filtered afterwards, because Neo4j 5.x vector indexes cannot filter while they search.
- **Keyword matching** — A Neo4j full-text (Lucene, BM25) search over chunk content. The query is reduced to its word tokens before it reaches the index, so characters Lucene treats as syntax (`/`, `:`, parentheses, bare `AND`/`OR`/`NOT`) can never break the leg. This catches exact terms, acronyms, and proper nouns that embeddings may miss.
- **Metadata matching** — Case-insensitive containment on the document's filename (relevance 3.0), its custom topic hint (2.5), or the raw content of custom inputs (2.0). Matching documents contribute their chunks, ordered by that relevance score and then chunk position.

Each leg fetches up to `top_k × 2` candidates.

### Step 2: Reciprocal Rank Fusion

Results from all three legs are merged using RRF:

```
RRF_score(d) = Σ (1 / (k + rank_i(d))) * weight_i
```

Where `k = 60` (fixed in the producer), `rank_i(d)` is the 1-based rank of document `d` in leg `i` (the first result has rank 1), and `weight_i` is the leg weight.

Fixed weights for this endpoint:
- Vector: `0.5`
- Keyword: `0.3`
- Metadata: `0.2`

### Step 3: No Re-Ranking on This Endpoint

The fused list is trimmed to `top_k` and returned as-is — the `score` in the response is the RRF fusion score. There is no cross-encoder step here. The Ask AI/context retrieval path re-ranks its own fused candidates through a cross-encoder (`ENABLE_RERANKING`); that is a different pipeline.

---

## Examples

### Basic Search

```bash
curl -X POST {BASE_URL}/api/search \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How does the authentication system handle token refresh?",
    "top_k": 10
  }'
```

### Search with More Results

```bash
curl -X POST {BASE_URL}/api/search \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "database migration strategies",
    "top_k": 30
  }'
```

### Search Within a Collection

```bash
curl -X POST {BASE_URL}/api/search \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "quarterly revenue projections",
    "top_k": 15,
    "filters": {"collection_id": "col_finance2025"}
  }'
```

### Search with Metadata Filters

```bash
curl -X POST {BASE_URL}/api/search \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "error handling best practices",
    "top_k": 20,
    "filters": {
      "source": "upload",
      "filename": "engineering-handbook.pdf"
    }
  }'
```

---

## From a Hit to the Whole Document

```bash
curl -s "{BASE_URL}/api/documents/{document_id}/content" \
  -H "X-API-Key: {API_KEY}" | jq -r .full_content
```

Response: `{id, filename, file_type, file_size, upload_date, chunk_count, collection_id, chunks: [{id, content, chunk_index}], full_content}`. `full_content` is empty while a document is still processing; `GET /api/documents/{id}/file` serves the original upload. Typical loop: search with `top_k: 20`, group hits by `document_id`, fetch the two or three documents that matter, quote from `full_content`.

---

## Metadata Filters

The `filters` object supports exact-match filtering on any metadata field attached to documents at upload time. Filters are applied before retrieval (pre-filter), not after.

Supported operators:
- String equality: `{"filename": "report.pdf"}`
- Array membership: `{"tags": ["engineering", "q4"]}`

Filters reduce the search space, which can improve both speed and relevance when you know which subset of documents to target.

---

## Performance Characteristics

| Configuration           | Typical Latency | Use Case                          |
|-------------------------|-----------------|-----------------------------------|
| Default (top_k=5)       | 150–300ms       | General-purpose search            |
| Large (top_k=50)        | 300–600ms       | Comprehensive retrieval for RAG   |
| Collection-scoped       | 100–250ms       | Targeted domain search            |

Latency depends on corpus size and collection scope.

---

## Tips for Better Results

- **Use natural language queries.** "How does the system handle failed payments?" outperforms "failed payment handler" because the vector leg benefits from context.
- **Increase `top_k` for triage.** Use `top_k: 20` or higher, then group by `document_id` — the RRF fusion sorts the best to the top and the grouping shows which documents carry the topic. (Ask AI does its own retrieval; you don't feed it search results.)
- **Use collection scoping for multi-tenant data.** Pass `collection_id` (top-level) or `filters: {"collection_id": "..."}` — scoping narrows every leg to that collection's documents.
- **The metadata leg helps when the query names a file or topic.** Queries that contain a document's filename, a custom input's topic hint, or text from a custom input match that leg directly. Entity-relationship discovery is an Ask AI-path feature, not something this endpoint adds.

---

## Environment Variables

These variables configure the Ask AI/context retrieval path (hybrid RRF with a graph leg, then cross-encoder re-ranking). They do **not** change `/api/search`, which always fuses vector + keyword + metadata with fixed 0.5/0.3/0.2 weights and never re-ranks.

| Variable          | Default | Description                                      |
|-------------------|---------|--------------------------------------------------|
| `VECTOR_WEIGHT`   | 0.5     | Weight for the vector leg in the Ask AI/context RRF fusion.      |
| `KEYWORD_WEIGHT`  | 0.3     | Weight for the keyword leg in the Ask AI/context RRF fusion.  |
| `GRAPH_WEIGHT`    | 0.2     | Weight for the graph-traversal leg in the Ask AI/context RRF fusion.        |
| `ENABLE_RERANKING`| true    | Enable cross-encoder re-ranking on the Ask AI/context retrieval path.                 |
| `RERANKING_MODEL` | cross-encoder/ms-marco-MiniLM-L-6-v2 | Cross-encoder model for re-ranking. |
| `RERANK_TOP_K`    | 15      | Candidates kept/reranked per knowledge search.   |

---

## Error Responses

| Status | Meaning                                                                             |
|--------|-------------------------------------------------------------------------------------|
| 400    | `collection_id` and `filters.collection_id` disagree — pass one, or the same value. |
| 401    | Invalid or missing `{API_KEY}`.                                                     |
| 403    | A restricted key requested a `collection_id` outside its allowed collections.       |
| 422    | Missing `query`, or `top_k` outside 1–50 (request validation).                      |
| 500    | Internal retrieval failure.                                                         |

The error semantics above follow the audited current producer source; deployed
instances may run older revisions (no version claim implied). Scope handling is
per principal:

- All-scope and admin keys: no collection-existence check — an id matching no
  collection retrieves no matching collection and results can come back empty.
- Restricted keys: an id outside the allowlist is denied with 403 before
  retrieval, even if unknown; an allowed-but-unknown id retrieves nothing.
  Omitting `collection_id` searches the key's permitted collections (an
  allowlist that has become empty retrieves nothing).
- Only completed documents are searchable, so there is no readiness gate on
  this route that could return 503.
- Reachable 503s are infrastructural: generated-key validation when the auth
  store cannot be consulted (`503`, `Retry-After: 2`; the admin environment key
  is validated without the store), and x402 payment-configuration or
  facilitator failures for `cortex_pub_` priced keys (`503`, `Retry-After`).
- A keyword or metadata retrieval-leg failure is contained — that leg
  contributes nothing instead of failing the request; other retrieval failures
  surface as 500.

## Skill Files

| File | Description |
|------|-------------|
| [references/API.md](references/API.md) | Complete API endpoint reference |
