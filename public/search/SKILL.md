---
name: search
description: Perform hybrid search combining vector similarity, keyword matching, and graph traversal with cross-encoder re-ranking. Use this skill when searching documents, finding relevant chunks, or retrieving knowledge from the Cortex knowledge base.
---

# Hybrid Search

## What You Probably Got Wrong

1. **This is NOT just vector search.** Cortex uses Reciprocal Rank Fusion (RRF) to combine three retrieval strategies: vector similarity (weight 0.5), keyword/BM25 matching (weight 0.3), and knowledge graph traversal (weight 0.2). If you're treating it like a simple embedding lookup, you're missing 50% of the retrieval power.

2. **Results are already re-ranked.** The response comes back re-ranked by a cross-encoder model (`ms-marco-MiniLM-L-6-v2`). Do NOT re-rank them yourself — you'll make results worse. The `score` field reflects the final re-ranked relevance score, not raw cosine similarity.

3. **`top_k` defaults to 5, not "all".** If you're not specifying `top_k`, you're getting 5 results. The valid range is 1–50. Ask for more if you need broader coverage, fewer if you need speed.

4. **Graph traversal is entity-aware.** The graph component doesn't just match keywords — it identifies entities mentioned in your query, finds them in the knowledge graph, and follows relationships to discover contextually related chunks. This is why searches for "the CEO" can find results about a specific person even if "CEO" doesn't appear in the chunk.

5. **Weights are configurable, not fixed.** The default 0.5/0.3/0.2 split can be overridden via environment variables (`VECTOR_WEIGHT`, `KEYWORD_WEIGHT`, `GRAPH_WEIGHT`). If your use case is heavily semantic, you can shift weight toward vector. If you need exact phrase matches, shift toward keyword.

6. **Collection scoping changes the search space entirely.** When you pass `filters: {"collection_id": "..."}`, all three retrieval strategies are scoped to that collection's documents and subgraph. This isn't a post-filter — it's a pre-filter that limits the search index itself.

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

> Search always runs the hybrid strategy (vector + keyword + graph via RRF). There is no per-request `search_type` or `fast_mode` toggle — those behaviors are controlled system-wide via environment variables.

### Response

```json
{
  "query": "original query",
  "results": [
    {
      "document_id": "doc_abc123",
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

---

## How Hybrid Search Works

### Step 1: Parallel Retrieval

Three retrieval strategies execute concurrently:

- **Vector similarity** — The query is embedded using the same model as ingestion (OpenAI `text-embedding-3-small`, 1536 dimensions). A cosine similarity search runs against the chunk vector index and returns the top candidates.
- **Keyword matching (BM25)** — A full-text search using BM25 scoring finds chunks with strong lexical overlap. This catches exact terms, acronyms, and proper nouns that embeddings may miss.
- **Graph traversal** — Named entities in the query are identified and matched against the knowledge graph. The traversal follows `RELATED_TO` and `MENTIONS` edges to find chunks that are semantically connected through entity relationships.

### Step 2: Reciprocal Rank Fusion

Results from all three strategies are merged using RRF:

```
RRF_score(d) = Σ (1 / (k + rank_i(d))) * weight_i
```

Where `k = 60` (standard RRF constant), `rank_i(d)` is the rank of document `d` in strategy `i`, and `weight_i` is the strategy weight.

Default weights:
- Vector: `0.5`
- Keyword: `0.3`
- Graph: `0.2`

### Step 3: Cross-Encoder Re-Ranking

The fused candidate list is re-scored by `ms-marco-MiniLM-L-6-v2`, a cross-encoder that jointly encodes the query and each chunk. This produces the final `score` in the response. Cross-encoder re-ranking is the most expensive step but dramatically improves precision. It can be disabled system-wide with `ENABLE_RERANKING=false`.

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

Latency depends on corpus size and graph density.

---

## Tips for Better Results

- **Use natural language queries.** "How does the system handle failed payments?" outperforms "failed payment handler" because the vector and graph components benefit from context.
- **Increase `top_k` for RAG pipelines.** When feeding results into `/api/ask`, use `top_k: 20` or higher. The re-ranker will sort the best to the top.
- **Use collection scoping for multi-tenant data.** Pass `filters: {"collection_id": "..."}` — collection scoping is architecturally isolated and faster.
- **The graph component shines on entity-heavy queries.** Queries about people, organizations, products, or named concepts get a significant boost from graph traversal.

---

## Environment Variables

| Variable          | Default | Description                                      |
|-------------------|---------|--------------------------------------------------|
| `VECTOR_WEIGHT`   | 0.5     | Weight for vector similarity in RRF fusion.      |
| `KEYWORD_WEIGHT`  | 0.3     | Weight for BM25 keyword matching in RRF fusion.  |
| `GRAPH_WEIGHT`    | 0.2     | Weight for graph traversal in RRF fusion.        |
| `ENABLE_RERANKING`| true    | Enable cross-encoder re-ranking.                 |
| `RERANKING_MODEL` | cross-encoder/ms-marco-MiniLM-L-6-v2 | Cross-encoder model for re-ranking. |
| `RERANK_TOP_K`    | 15      | Candidates kept/reranked per knowledge search.   |

---

## Error Responses

| Status | Meaning                                    |
|--------|--------------------------------------------|
| 400    | Missing `query` or `top_k` out of range.   |
| 401    | Invalid or missing `{API_KEY}`.            |
| 404    | Specified `collection_id` does not exist.  |
| 500    | Internal retrieval failure.                |
| 503    | Search index not ready (still ingesting).  |

## Skill Files

| File | Description |
|------|-------------|
| [references/API.md](references/API.md) | Complete API endpoint reference |
