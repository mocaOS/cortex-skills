# Search API Reference

Complete endpoint specification for hybrid search with vector similarity, keyword matching, graph traversal, and cross-encoder re-ranking.

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

Search always runs the hybrid strategy (vector + keyword + graph, fused via RRF, then cross-encoder re-ranked). There is no per-request `search_type` or `fast_mode` field — hybrid search and re-ranking are toggled system-wide via environment variables (`ENABLE_HYBRID_SEARCH`, `ENABLE_RERANKING`).

### Response `200`

```json
{
  "query": "original query",
  "results": [
    {
      "document_id": "doc_xyz789",
      "chunk_id": "chunk_001",
      "content": "The retrieved text content of this chunk...",
      "score": 0.9234,
      "metadata": {
        "filename": "report.pdf",
        "chunk_index": 7
      }
    }
  ],
  "total_results": 5
}
```

The response has exactly three top-level fields: `query` (echo of the request), `results` (an array of `SearchResult`), and `total_results` (count of returned results).

Each `SearchResult` carries `document_id`, `chunk_id`, `content`, `score`, and `metadata`. The `metadata` object contains `filename` and `chunk_index`; some retrieval paths also add `rerank_score`. The `score` field reflects the final re-ranked relevance score (not raw cosine similarity) when re-ranking is active.

### Errors

| Status | Cause                                             |
|--------|---------------------------------------------------|
| 400    | Missing `query`, or `top_k` out of valid range    |
| 401    | Invalid or missing API key                        |
| 404    | Specified `collection_id` does not exist           |
| 500    | Internal retrieval failure                         |
| 503    | Search index not ready (still ingesting)           |

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

The three retrieval strategies are combined via Reciprocal Rank Fusion (RRF) with configurable weights.

### RRF Formula

```
RRF_score(d) = SUM( (1 / (k + rank_i(d))) * weight_i )
```

Where `k` is the RRF constant (default 60), `rank_i(d)` is the rank of document `d` in strategy `i`, and `weight_i` is the strategy weight.

### Default Weights

| Strategy  | Weight | Environment Variable |
|-----------|--------|----------------------|
| Vector    | 0.5    | `VECTOR_WEIGHT`      |
| Keyword   | 0.3    | `KEYWORD_WEIGHT`     |
| Graph     | 0.2    | `GRAPH_WEIGHT`       |

Weights should sum to 1.0.

### RRF Constant

| Variable | Default | Description                                     |
|----------|---------|-------------------------------------------------|
| `RRF_K`  | `60`    | Higher values flatten rank score differences     |

### Tuning Guidance

- Heavily semantic use cases: increase `VECTOR_WEIGHT`, decrease others
- Exact phrase / acronym matching: increase `KEYWORD_WEIGHT`
- Entity-rich queries (people, organizations, products): increase `GRAPH_WEIGHT`
- Mixed general use: keep defaults (0.5 / 0.3 / 0.2)

---

## Re-Ranking Details

After RRF fusion produces a candidate list, a cross-encoder model re-scores each candidate by jointly encoding the query and chunk text together. This is the most expensive step but significantly improves precision.

### Configuration

| Variable           | Default                              | Description                          |
|--------------------|--------------------------------------|--------------------------------------|
| `ENABLE_RERANKING` | `true`                               | Master switch for cross-encoder      |
| `RERANKING_MODEL`  | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Cross-encoder model identifier    |

### Behavior

- The `score` field in results reflects the cross-encoder score when re-ranking is active
- Set `ENABLE_RERANKING=false` to disable re-ranking system-wide (there is no per-request toggle)
- Re-ranking adds ~30-50ms to query latency depending on `top_k`

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
- Supports phrase matching

### Graph Traversal

- Named entities in the query are identified and matched against the knowledge graph
- Follows `RELATED_TO` and `MENTIONS` edges
- Traversal depth: up to `MAX_GRAPH_HOPS` (default 2) hops from matched entities
- Entity-aware: "the CEO" can resolve to a specific person entity
- Returns chunks that are semantically connected through entity relationships

---

## Collection Scoping

Scope search to a collection by passing its id inside `filters`: `{"collection_id": "..."}`. All three retrieval strategies are then scoped to that collection's documents and subgraph — a pre-filter that limits the search index itself, not a post-filter on results.

```json
{
  "query": "quarterly revenue",
  "filters": {"collection_id": "financial-reports"}
}
```

---

## Performance Characteristics

| Configuration             | Typical Latency | Use Case                            |
|---------------------------|-----------------|-------------------------------------|
| Default (`top_k=5`)       | 150-300ms       | General-purpose search              |
| Large (`top_k=50`)        | 300-600ms       | Comprehensive retrieval for RAG     |
| Collection-scoped         | 100-250ms       | Targeted domain search              |

Latency depends on corpus size and graph density.

---

## All Environment Variables

| Variable              | Default                              | Description                                         |
|-----------------------|--------------------------------------|-----------------------------------------------------|
| `ENABLE_HYBRID_SEARCH`| `true`                               | Enable hybrid search (vector + keyword + graph)     |
| `VECTOR_WEIGHT`       | `0.5`                                | Weight for vector similarity in RRF fusion          |
| `KEYWORD_WEIGHT`      | `0.3`                                | Weight for BM25 keyword matching in RRF fusion      |
| `GRAPH_WEIGHT`        | `0.2`                                | Weight for graph traversal in RRF fusion            |
| `RRF_K`               | `60`                                 | RRF constant; higher values flatten rank scores     |
| `ENABLE_RERANKING`    | `true`                               | Enable cross-encoder re-ranking                     |
| `RERANKING_MODEL`     | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Cross-encoder model for re-ranking              |
| `MAX_GRAPH_HOPS`      | `2`                                  | Maximum graph traversal depth                       |
| `SHOW_RETRIEVAL_STATS`| `true`                               | Include `retrieval_stats` in response               |
| `EMBEDDING_MODEL`     | `openai/text-embedding-3-small`      | Model used to embed queries (must match ingestion)  |
| `EMBEDDING_DIMENSION` | `1536`                               | Embedding vector dimensions                         |
