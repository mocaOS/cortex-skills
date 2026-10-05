# Search API Reference

Complete endpoint specification for hybrid search fusing vector similarity, keyword matching, and metadata matching with Reciprocal Rank Fusion (RRF).

All endpoints require authentication via `X-API-Key: {API_KEY}` header.

---

## Search Endpoint

```
POST /api/search
Content-Type: application/json
```

### Request Body

| Field           | Type    | Required | Default | Description                                                |
|-----------------|---------|----------|---------|------------------------------------------------------------|
| `query`         | string  | Yes      | --      | Search query. Natural language works best.                 |
| `top_k`         | integer | No       | `5`     | Number of results to return. Valid range: 1-50.            |
| `filters`       | object  | No       | `null`  | Metadata filters to narrow results (pre-filter). Scope to a collection with `{"collection_id": "..."}`. |
| `collection_id` | string  | No       | `null`  | Top-level alternative to `filters.collection_id` — same effect, uniform with `/api/ask` and `/api/upload`. Don't pass both with different values (400). |

Search always runs the same hybrid strategy — vector + keyword + metadata, fused via RRF (k = 60) — and returns the fused ranking as-is. It runs regardless of `ENABLE_HYBRID_SEARCH`: that flag gates a different Ask AI/context RRF fusion — vector + keyword + graph traversal, with graph in place of metadata — followed by optional cross-encoder re-ranking. There is no per-request `search_type` or `fast_mode` field, and no re-ranking on this endpoint — the returned `score` is the RRF fusion score.

### Response `200`

```json
{
  "query": "original query",
  "results": [
    {
      "document_id": "doc_xyz789",
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

The response has exactly four top-level fields: `query` (echo of the request), `results` (an array of `SearchResult`), `total_results` (count of returned results), and `total` (alias of `total_results`, kept in lockstep).

Each `SearchResult` carries `document_id`, `chunk_id`, `content`, `score`, `metadata`, and `document_title` (an alias of `metadata.filename`, filled server-side). The `metadata` object contains `filename` and `chunk_index`. The `score` field is the RRF fusion score — `weight / (60 + rank)` summed over the legs the chunk appears in — so values are small (a chunk ranked first in all three legs scores ≈ 1/61 ≈ 0.016 with the default weights). This endpoint does not re-rank: `rerank_score` never appears here and the score is never a cross-encoder value.

### Fetching the Whole Document

Hits are chunks. To read a source end to end, follow `document_id`:

```
GET {BASE_URL}/api/documents/{document_id}/content
```

Returns `{id, filename, file_type, file_size, upload_date, chunk_count, collection_id, chunks: [{id, content, chunk_index}], full_content}` — `full_content` is every chunk concatenated in order (empty while still processing). Requires `read`; `404` when the id is unknown or outside the key's collections. The original file: `GET /api/documents/{document_id}/file`.

### Errors

| Status | Cause                                                              |
|--------|--------------------------------------------------------------------|
| 400    | `collection_id` and `filters.collection_id` disagree                |
| 401    | Invalid or missing API key                                         |
| 403    | A restricted key requested a `collection_id` outside its allowlist |
| 422    | Missing `query`, or `top_k` outside 1-50 (request validation)      |
| 500    | Internal retrieval failure                                         |

Error semantics follow the audited current producer source; deployed instances
may run older revisions (no version claim implied). All-scope and admin keys get
no collection-existence check (an unknown `collection_id` retrieves no matching
collection — results can come back empty); restricted keys get 403 for an id
outside their allowlist, empty retrieval for an allowed-but-unknown id, and
permitted-collections search when `collection_id` is omitted (an allowlist that
has become empty retrieves nothing). Only completed documents are searchable, so
there is no readiness gate that could return 503. Reachable 503s are
infrastructural: generated-key validation when the auth store cannot be consulted
(`503`, `Retry-After: 2`; the admin environment key is validated without the
store), and x402 payment-configuration or facilitator failures for `cortex_pub_`
priced keys. A keyword or metadata retrieval-leg failure is contained — that leg
contributes nothing instead of failing the request; other retrieval failures
surface as 500.

---

## Filter Syntax

The `filters` object applies exact-match pre-filtering on chunk metadata fields. Filters reduce the search space before retrieval, not after.

### Supported Operators

| Operator           | Syntax                                      | Example                                              |
|--------------------|---------------------------------------------|------------------------------------------------------|
| String equality    | `{"field": "value"}`                        | `{"filename": "report.pdf"}`                         |
| Array membership   | `{"field": ["val1", "val2"]}`               | `{"tags": ["engineering", "q4"]}`                    |
| Document type      | `{"document_type": "pdf"}`                  | Filter by source format                              |
| Source             | `{"source": "upload"}`                      | Filter by ingestion method (`upload`, `custom_input`)|

### Example

```json
{
  "query": "error handling best practices",
  "top_k": 20,
  "filters": {
    "source": "upload",
    "filename": "engineering-handbook.pdf"
  }
}
```

Filters are applied as a pre-filter to all three retrieval strategies. This is not a post-filter on results.

---

## Weight Configuration

The three retrieval legs of **this endpoint** are combined via Reciprocal Rank Fusion (RRF) with fixed weights.

### RRF Formula

```
RRF_score(d) = SUM( (1 / (k + rank_i(d))) * weight_i )
```

Where `k` is the RRF constant (fixed at 60 in the producer), `rank_i(d)` is the 1-based rank of document `d` in leg `i` (the first result has rank 1), and `weight_i` is the leg weight.

### Fixed Weights (this endpoint)

| Strategy  | Weight |
|-----------|--------|
| Vector    | 0.5    |
| Keyword   | 0.3    |
| Metadata  | 0.2    |

There is no environment variable that changes these, and no `RRF_K` setting — the constant is hardcoded at 60.

### Ask AI/context weights

The `VECTOR_WEIGHT`, `KEYWORD_WEIGHT`, and `GRAPH_WEIGHT` environment variables (defaults 0.5 / 0.3 / 0.2) tune a **different** fusion: the Ask AI/context retrieval path, whose RRF legs are vector + keyword + graph traversal. Tuning guidance there:

- Heavily semantic use cases: increase `VECTOR_WEIGHT`, decrease others
- Exact phrase / acronym matching: increase `KEYWORD_WEIGHT`
- Entity-rich queries (people, organizations, products): increase `GRAPH_WEIGHT`
- Mixed general use: keep defaults (0.5 / 0.3 / 0.2)

---

## Re-Ranking Details

Re-ranking is **not** applied to `/api/search` — the response `score` is always the RRF fusion score. The Ask AI/context retrieval path re-ranks its fused candidates through a cross-encoder model that jointly encodes the query and chunk text together; that is the expensive precision step, and it is controlled there by:

| Variable           | Default                              | Description                          |
|--------------------|--------------------------------------|--------------------------------------|
| `ENABLE_RERANKING` | `true`                               | Master switch for cross-encoder re-ranking (Ask AI/context retrieval) |
| `RERANKING_MODEL`  | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Cross-encoder model identifier    |

---

## Retrieval Strategy Details

### Vector Search

- Embedding model: configurable via `EMBEDDING_MODEL` (default `openai/text-embedding-3-small`)
- Dimensions: configurable via `EMBEDDING_DIMENSION` (default 1536)
- Similarity metric: cosine similarity
- Index: Neo4j native vector index
- The query is embedded using the same model as ingestion

### Keyword Search (BM25)

- Engine: Neo4j full-text indexes
- Scoring: BM25
- Catches exact terms, acronyms, proper nouns, and specific phrases that embeddings may miss
- The query is reduced to word tokens OR-joined into a parse-safe Lucene query, so syntax characters (`/`, `:`, unbalanced parens, bare `AND`/`OR`/`NOT`) can't break the leg

### Metadata Search

- Case-insensitive containment matching on document metadata, returning the matching documents' chunks
- Match targets, with their fixed relevance scores: `filename` (3.0), custom-input `topic_hint` (2.5), raw content of custom inputs (2.0)
- Results are ordered by that relevance score, then by chunk index
- This is the third leg of `/api/search`. Graph traversal is **not** part of this endpoint — it is the third leg of the Ask AI/context RRF fusion (entity resolution + ranked traversal; see the ask skill)

---

## Collection Scoping

Scope search to a collection by passing its id as a **top-level** `collection_id` field (uniform with `/api/ask` and `/api/upload`) or inside `filters`: `{"collection_id": "..."}`. Both work; when both are present they must agree, or the request is rejected with 400. All three legs are then scoped to that collection's documents — the scope is applied inside each leg's query (a `Collection → CONTAINS → Document` match), not as a filter on the returned results. The vector leg over-fetches candidates when scoped because the vector index cannot filter while it searches.

```json
{
  "query": "quarterly revenue",
  "collection_id": "financial-reports"
}
```

---

## Performance Characteristics

| Configuration             | Typical Latency | Use Case                            |
|---------------------------|-----------------|-------------------------------------|
| Default (`top_k=5`)       | 150-300ms       | General-purpose search              |
| Large (`top_k=50`)        | 300-600ms       | Comprehensive retrieval for RAG     |
| Collection-scoped         | 100-250ms       | Targeted domain search              |

Latency depends on corpus size and collection scope.

---

## All Environment Variables

Unless noted, these configure the Ask AI/context retrieval path (hybrid RRF with a graph leg, then cross-encoder re-ranking). `/api/search` itself always runs vector + keyword + metadata with fixed 0.5/0.3/0.2 weights, no graph leg, and no re-ranking, regardless of these flags. The embedding settings and `VECTOR_SCOPED_OVERFETCH` also apply to `/api/search`'s vector leg.

| Variable              | Default                              | Description                                         |
|-----------------------|--------------------------------------|-----------------------------------------------------|
| `ENABLE_HYBRID_SEARCH`| `true`                               | Gates the Ask AI/context hybrid path (vector + keyword + graph via RRF). `false` selects legacy vector + graph traversal (no keyword leg); collection scope still reaches both chunk-query builders. Graph entity/relationship metadata remains global in both paths. `/api/search` is unaffected. |
| `VECTOR_WEIGHT`       | `0.5`                                | Weight for the vector leg in the Ask AI/context RRF fusion          |
| `KEYWORD_WEIGHT`      | `0.3`                                | Weight for the keyword leg in the Ask AI/context RRF fusion         |
| `GRAPH_WEIGHT`        | `0.2`                                | Weight for the graph-traversal leg in the Ask AI/context RRF fusion |
| `ENABLE_RERANKING`    | `true`                               | Enable cross-encoder re-ranking (Ask AI/context retrieval)          |
| `RERANKING_MODEL`     | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Cross-encoder model for re-ranking              |
| `MAX_GRAPH_HOPS`      | `2`                                  | Maximum graph traversal depth (Ask AI/context path) |
| `RERANK_TOP_K`        | `15`                                 | Candidates kept per search; fetch depth ≈ 2× this   |
| `ENABLE_QUERY_ENTITY_RESOLUTION` | `true`                    | Resolve query entities incl. aliases before traversal |
| `ENABLE_RANKED_GRAPH_TRAVERSAL` | `true`                     | Entity-only neighbors, passages ranked by mentions  |
| `VECTOR_SCOPED_OVERFETCH` | `10`                             | Scoped vector over-fetch factor (cap 200); 1 = off  |
| `ENABLE_PARALLEL_SEARCH_LEGS` | `true`                       | Run the Ask AI/context RRF legs concurrently        |
| `SHOW_RETRIEVAL_STATS`| `true`                               | Include `retrieval_stats` in Ask AI/context responses |
| `EMBEDDING_MODEL`     | `openai/text-embedding-3-small`      | Model used to embed queries (must match ingestion)  |
| `EMBEDDING_DIMENSION` | `1536`                               | Embedding vector dimensions                         |
