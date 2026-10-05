# Cortex API Reference

Complete API reference for Cortex. All endpoints require the `X-API-Key` header unless noted otherwise.

**Base URL:** Your Cortex instance URL (e.g., `https://cortex.example.com`).

---

## Authentication

All API requests require an API key passed via the `X-API-Key` header.

**Permissions:** Keys carry one or both of two permissions. Keys can also be scoped to a specific collection.

| Permission | Access |
|-------|--------|
| `read` | Ask AI, search, list documents, view stats and graphs |
| `manage` | Upload, edit, delete documents and collections |

Full-instance operations (API key management, system reset) require the root **admin API key**, set via the `ADMIN_API_KEY` env var at startup. This is not a permission tier -- it is a single privileged key that cannot be created through the API.

**Request IDs:** every response echoes an `X-Request-ID` header (honored if you send one, minted otherwise). In production, 5xx bodies are sanitized to a generic message plus a `request_id` -- correlate via the ID rather than parsing 5xx bodies.

---

## Health and Stats

### GET /health

Check API health. Does not require authentication.

```bash
curl "{BASE_URL}/health"
```

**Response (healthy, 200):**

```json
{
  "status": "healthy",
  "neo4j_connected": true,
  "schema_initialized": true,
  "version": "<instance release>"
}
```

A degraded instance — Neo4j unreachable, or the schema (constraints/indexes) not yet confirmed at startup — answers **HTTP 503** with `"status": "degraded"`, not 200 with a degraded body, so healthchecks and health-aware proxies can key off the status code.

`version` reports the instance's product release and changes release to release — it is not a feature flag. **Never use it for feature detection**; read the image tag instead. It is also unrelated to the `2.0.0` in the OpenAPI schema, which versions the API contract rather than the product.

### GET /api/stats

Get knowledge base statistics. Requires `read` permission.

```bash
curl "{BASE_URL}/api/stats" -H "X-API-Key: {API_KEY}"
```

**Response:**

```json
{
  "document_count": 156,
  "chunk_count": 4280,
  "entity_count": 1542,
  "relationship_count": 3891,
  "per_chunk_relationship_count": 1204,
  "community_count": 23,
  "collection_count": 5
}
```

The response also carries the monthly unit quota meter — `monthly_usage_used`, `monthly_usage_limit`, `monthly_usage_query`, `monthly_usage_processing` (limit `0` = unlimited) — and free-disk telemetry (`disk_free_mb`, `disk_total_mb`).

---

## Document Upload

### POST /api/upload

Upload a single file. Parameters `collection_id`, `start_processing`, and `source` work as URL query parameters **or** multipart form fields — use one placement consistently and avoid conflicting values. When both placements are sent: a nonempty query `collection_id`/`source` takes precedence, but a form `start_processing=true` overrides a query `false` (the server cannot distinguish an explicit `false` from the unset default). Older instances accept query params only.

```bash
curl -X POST "{BASE_URL}/api/upload?collection_id={COLLECTION_ID}&start_processing=true" \
  -H "X-API-Key: {API_KEY}" \
  -F "file=@/path/to/file.md"
```

| Query Parameter | Type | Default | Description |
|----------------|------|---------|-------------|
| `collection_id` | string | default collection | Target collection |
| `start_processing` | boolean | `false` | Whether to begin processing immediately |

**Response:**

```json
{
  "filename": "document.pdf",
  "doc_id": "doc_abc123",
  "status": "processing",
  "message": "Document uploaded and processing started",
  "collection_id": "default"
}
```

**Supported formats:** `.pdf`, `.txt`, `.md`, `.docx`

**Max file size:** Configured via `MAX_FILE_SIZE_MB` (default 50MB).

### Bulk Upload Pattern

Upload many files without processing, then trigger batch processing:

```bash
# 1. Upload all files without processing
for file in documents/*.pdf; do
  curl -X POST "{BASE_URL}/api/upload?collection_id={COLLECTION_ID}&start_processing=false" \
    -H "X-API-Key: {API_KEY}" \
    -F "file=@$file"
done

# 2. Trigger batch processing
curl -X POST "{BASE_URL}/api/documents/process-pending" \
  -H "X-API-Key: {API_KEY}"
```

---

## Documents

### Sessions (`ENABLE_SESSIONS`, opt-in)

Server-stored conversation state: `POST /api/sessions` `{name?, history?, memory?}` → `{id, ...}`; pass `id` as `session_id` on ask endpoints and the backend keeps history + curated memory (no blob round-trip). `GET /api/sessions?limit=&offset=` (own sessions, metadata), `GET /api/sessions/{id}` (full state), `DELETE /api/sessions/{id}`. 403 while disabled; feature-detect via `GET /api/features` → `enable_sessions`. `session_id` is mutually exclusive with client-carried `conversation_history`/`conversation_memory` (400) and unavailable with fast search.

### POST /api/context

Token-budgeted context bundle for injection into YOUR OWN prompt (retrieval without Cortex writing the answer). Body: `{query (required), max_tokens (default 4000, 200-32000), collection_id?, top_k?, include_graph?, include_communities?, use_reranking?}`. Returns `{chunks[], graph_context, communities[], text, token_count, budget, collection_id}` — `text` is ready to inject, chunks cited `[src_N]`. Available to monetized keys at the base rate. Requires backend ≥ 2026-08-10 (older instances 404).

```bash
curl -X POST "{BASE_URL}/api/context" -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "deployment options", "max_tokens": 3000}'
```

### GET /api/ingestion/status

One-call pipeline backlog view (read permission): `{counts: {pending, queued, processing, extracting, completed, failed}, active: [{id, filename, progress_current, progress_total, live}], backlog, idle, total_documents}`. Use instead of polling individual documents; on `ENABLE_WEBHOOKS` instances, prefer registering a webhook.

### GET /api/documents

List documents. Server-side filtering, sorting and pagination: `collection_id`, `status`, `sort` (`upload_date|filename|file_size|chunk_count|processing_status|entity_count`, prefix `-` for descending), `limit` (1-1000), `offset`. No params = full list, newest first. `total` is the filtered count before pagination.

```bash
curl "{BASE_URL}/api/documents?collection_id={COLLECTION_ID}&status=completed&sort=-upload_date&limit=100" \
  -H "X-API-Key: {API_KEY}"
```

| Query Parameter | Type | Default | Description |
|----------------|------|---------|-------------|
| `collection_id` | string | -- | Filter by collection |
| `status` | string | -- | Filter: `pending`, `processing`, `completed`, `failed` |
| `limit` | integer | 100 | Max results |

### Sessions (`ENABLE_SESSIONS`, opt-in)

Server-stored conversation state: `POST /api/sessions` `{name?, history?, memory?}` → `{id, ...}`; pass `id` as `session_id` on ask endpoints and the backend keeps history + curated memory (no blob round-trip). `GET /api/sessions?limit=&offset=` (own sessions, metadata), `GET /api/sessions/{id}` (full state), `DELETE /api/sessions/{id}`. 403 while disabled; feature-detect via `GET /api/features` → `enable_sessions`. `session_id` is mutually exclusive with client-carried `conversation_history`/`conversation_memory` (400) and unavailable with fast search.

### POST /api/context

Token-budgeted context bundle for injection into YOUR OWN prompt (retrieval without Cortex writing the answer). Body: `{query (required), max_tokens (default 4000, 200-32000), collection_id?, top_k?, include_graph?, include_communities?, use_reranking?}`. Returns `{chunks[], graph_context, communities[], text, token_count, budget, collection_id}` — `text` is ready to inject, chunks cited `[src_N]`. Available to monetized keys at the base rate. Requires backend ≥ 2026-08-10 (older instances 404).

```bash
curl -X POST "{BASE_URL}/api/context" -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "deployment options", "max_tokens": 3000}'
```

### GET /api/ingestion/status

One-call pipeline backlog view (read permission): `{counts: {pending, queued, processing, extracting, completed, failed}, active: [{id, filename, progress_current, progress_total, live}], backlog, idle, total_documents}`. Use instead of polling individual documents; on `ENABLE_WEBHOOKS` instances, prefer registering a webhook.

### GET /api/documents/{doc_id}

Get document details including processing status.

```bash
curl "{BASE_URL}/api/documents/{doc_id}" -H "X-API-Key: {API_KEY}"
```

**Response:**

```json
{
  "id": "doc_abc123",
  "filename": "document.pdf",
  "processing_status": "completed",
  "chunk_count": 42,
  "entity_count": 18,
  "upload_date": "2026-01-15T10:30:00Z",
  "collection_id": "default",
  "collection_name": "Default",
  "image_progress_current": 3,
  "image_progress_total": 67,
  "image_progress_message": "Analyzed 3/67 images"
}
```

**`processing_status` values:** `pending` | `processing` | `completed` | `failed`

> **Field names — the one trap.** Document objects carry **`processing_status`**, not `status` — `d["status"]` on a document is always empty (only *action* responses like upload/reprocess use a `status` key, and the list endpoint's `status` *query parameter* filters on it). The timestamp is **`upload_date`**; there is no `created_at` or `processed_at`. Stats uses **`document_count`**, not `total_docs` or `documents_count`. When in doubt, `GET {BASE_URL}/openapi.json` is the source of truth.

A document with `processing_status: "completed"` may still have background image analysis running. Check `image_progress_current` vs `image_progress_total` to confirm.

### Sessions (`ENABLE_SESSIONS`, opt-in)

Server-stored conversation state: `POST /api/sessions` `{name?, history?, memory?}` → `{id, ...}`; pass `id` as `session_id` on ask endpoints and the backend keeps history + curated memory (no blob round-trip). `GET /api/sessions?limit=&offset=` (own sessions, metadata), `GET /api/sessions/{id}` (full state), `DELETE /api/sessions/{id}`. 403 while disabled; feature-detect via `GET /api/features` → `enable_sessions`. `session_id` is mutually exclusive with client-carried `conversation_history`/`conversation_memory` (400) and unavailable with fast search.

### POST /api/context

Token-budgeted context bundle for injection into YOUR OWN prompt (retrieval without Cortex writing the answer). Body: `{query (required), max_tokens (default 4000, 200-32000), collection_id?, top_k?, include_graph?, include_communities?, use_reranking?}`. Returns `{chunks[], graph_context, communities[], text, token_count, budget, collection_id}` — `text` is ready to inject, chunks cited `[src_N]`. Available to monetized keys at the base rate. Requires backend ≥ 2026-08-10 (older instances 404).

```bash
curl -X POST "{BASE_URL}/api/context" -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "deployment options", "max_tokens": 3000}'
```

### GET /api/ingestion/status

One-call pipeline backlog view (read permission): `{counts: {pending, queued, processing, extracting, completed, failed}, active: [{id, filename, progress_current, progress_total, live}], backlog, idle, total_documents}`. Use instead of polling individual documents; on `ENABLE_WEBHOOKS` instances, prefer registering a webhook.

### GET /api/documents/{doc_id}/file

Download the original uploaded file.

```bash
curl "{BASE_URL}/api/documents/{doc_id}/file" \
  -H "X-API-Key: {API_KEY}" -o document.pdf
```

### POST /api/documents/{doc_id}/reprocess

Reprocess a document (useful after changing extraction settings). Optional `engine=docling` (instances from August 2026 on) forces the Docling conversion engine for this run — the recourse when the anydoc fast path converted a document badly or a text-PDF's images should be extracted for vision; it also bypasses the "content unchanged" skip.

```bash
curl -X POST "{BASE_URL}/api/documents/{doc_id}/reprocess" \
  -H "X-API-Key: {API_KEY}"
```

### POST /api/documents/process-pending

Trigger batch processing of all pending documents.

```bash
curl -X POST "{BASE_URL}/api/documents/process-pending" \
  -H "X-API-Key: {API_KEY}"
```

### Sessions (`ENABLE_SESSIONS`, opt-in)

Server-stored conversation state: `POST /api/sessions` `{name?, history?, memory?}` → `{id, ...}`; pass `id` as `session_id` on ask endpoints and the backend keeps history + curated memory (no blob round-trip). `GET /api/sessions?limit=&offset=` (own sessions, metadata), `GET /api/sessions/{id}` (full state), `DELETE /api/sessions/{id}`. 403 while disabled; feature-detect via `GET /api/features` → `enable_sessions`. `session_id` is mutually exclusive with client-carried `conversation_history`/`conversation_memory` (400) and unavailable with fast search.

### POST /api/context

Token-budgeted context bundle for injection into YOUR OWN prompt (retrieval without Cortex writing the answer). Body: `{query (required), max_tokens (default 4000, 200-32000), collection_id?, top_k?, include_graph?, include_communities?, use_reranking?}`. Returns `{chunks[], graph_context, communities[], text, token_count, budget, collection_id}` — `text` is ready to inject, chunks cited `[src_N]`. Available to monetized keys at the base rate. Requires backend ≥ 2026-08-10 (older instances 404).

```bash
curl -X POST "{BASE_URL}/api/context" -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "deployment options", "max_tokens": 3000}'
```

### GET /api/ingestion/status

One-call pipeline backlog view (read permission): `{counts: {pending, queued, processing, extracting, completed, failed}, active: [{id, filename, progress_current, progress_total, live}], backlog, idle, total_documents}`. Use instead of polling individual documents; on `ENABLE_WEBHOOKS` instances, prefer registering a webhook.

### GET /api/documents/pending

List all documents awaiting processing.

```bash
curl "{BASE_URL}/api/documents/pending" -H "X-API-Key: {API_KEY}"
```

### POST /api/documents/move

Move documents between collections.

```bash
curl -X POST "{BASE_URL}/api/documents/move" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"document_ids": ["doc_1", "doc_2"], "target_collection_id": "coll_def456"}'
```

### POST /api/documents/download-zip

Download multiple documents as a ZIP archive.

```bash
curl -X POST "{BASE_URL}/api/documents/download-zip" \
  -H "Content-Type: application/json" \
  -d '{"document_ids": ["doc_abc123", "doc_def456"]}' \
  -o documents.zip
```

### POST /api/documents/delete

Bulk delete documents. Cancels active processing before deletion.

```bash
curl -X POST "{BASE_URL}/api/documents/delete" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"document_ids": ["doc_abc123", "doc_def456"]}'
```

**Response:**

```json
{
  "message": "Successfully deleted 2 document(s)",
  "deleted_count": 2,
  "processing_cancelled": 1,
  "orphaned_entities_removed": 28,
  "orphaned_communities_removed": 3
}
```

### DELETE /api/documents/{doc_id}

Delete a single document. Cancels active processing, removes chunks, and cleans up orphaned entities and communities.

```bash
curl -X DELETE "{BASE_URL}/api/documents/{doc_id}" -H "X-API-Key: {API_KEY}"
```

**Response:**

```json
{
  "message": "Document deleted successfully",
  "processing_cancelled": true,
  "orphaned_entities_removed": 15,
  "orphaned_communities_removed": 2
}
```

### DELETE /api/documents

Delete all documents (use with caution).

```bash
curl -X DELETE "{BASE_URL}/api/documents" -H "X-API-Key: {API_KEY}"
```

---

## Custom Inputs

Add knowledge manually without uploading files.

### POST /api/custom-input

```bash
curl -X POST "{BASE_URL}/api/custom-input" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"input_type": "qa", "content": "What is X?", "answer": "X is...", "title": "FAQ"}'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input_type` | string | Yes | `"qa"`, `"text"`, or `"markdown"` |
| `content` | string | Yes | Main content body. For `qa`, this is the question. |
| `answer` | string | For `qa` | The answer (Q&A only) |
| `title` | string | No | Optional title/topic hint |

---

## Search

### POST /api/search

Hybrid search fusing vector (0.5), keyword (0.3), and metadata matching (0.2) with Reciprocal Rank Fusion. This endpoint does not re-rank — the `score` is the RRF fusion score (small values; a chunk ranked first in all three legs scores ≈ 1/61 ≈ 0.016). The Ask AI retrieval path adds a graph-traversal leg and cross-encoder re-ranking.

```bash
curl -X POST "{BASE_URL}/api/search" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "your search query", "top_k": 5}'
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | string | **required** | Search query |
| `top_k` | integer | 5 | Max results (range 1-50) |
| `filters` | object | null | Filter criteria. Scope to a collection with `{"collection_id": "coll_abc123"}`. |
| `collection_id` | string | null | Top-level alternative to `filters.collection_id` (same effect; don't pass both with different values — that's a 400). |

**Response** (actual shape — `document_title` mirrors `metadata.filename`; `total` and `total_results` are aliases; no `graph_context` or timing field on this endpoint):

```json
{
  "query": "your search query",
  "results": [
    {
      "chunk_id": "chunk_abc123",
      "content": "Machine learning algorithms can be categorized...",
      "score": 0.0164,
      "document_id": "doc_xyz789",
      "document_title": "ML Fundamentals.pdf",
      "metadata": {
        "filename": "ML Fundamentals.pdf",
        "chunk_index": 3
      }
    }
  ],
  "total_results": 5,
  "total": 5
}
```

---

## Ask AI (RAG)

### POST /api/ask/stream

Primary endpoint — retrieval starts here. Returns Server-Sent Events (SSE) with real-time answer tokens, sources, and graph context. Send `use_agentic: true` for a Deep Research query (the first choice when asked to retrieve/find knowledge in the Cortex).

```bash
curl -N "{BASE_URL}/api/ask/stream" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"question": "Summarize what I know about machine learning", "use_agentic": true}'
```

### POST /api/ask

Non-streaming RAG query — quick chat answers. Bounded by a ~28s server deadline (`504 deadline_exceeded`). On default configurations (`ENABLE_AGENT_RESEARCH=true`) it rejects `use_agentic: true` with `400 agentic_requires_streaming`; with the flag `false` the legacy deep-research fallback runs here within the deadline — streaming `POST /api/ask/stream` remains the recommended Deep Research path either way.

```bash
curl -X POST "{BASE_URL}/api/ask" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"question": "What do I know about topic X?", "use_agentic": false}'
```

**Request schema (RAGRequest):**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `question` | string | **required** | The question to ask |
| `top_k` | integer | 5 | Results to retrieve (1-20) |
| `use_reranking` | boolean | true | Apply cross-encoder reranking |
| `use_graph` | boolean | true | Include knowledge graph context |
| `max_hops` | integer | 2 | Graph traversal depth (1-3) |
| `use_agentic` | boolean | false | Enable deep research mode |
| `use_fast_search` | boolean | false | Vector-only search (disables hybrid/reranking) |
| `collection_id` | string | null | Scope to a specific collection |
| `conversation_history` | array | null | Previous messages for multi-turn context |

**Conversation message format:**

```json
{"role": "user" | "assistant", "content": "Message text"}
```

**SSE event types:**

| Event Key | Type | Mode | Description |
|-----------|------|------|-------------|
| `content` | string | All | A token of the streamed answer |
| `sources` | array | All | Retrieved source documents with scores |
| `graph_context` | object | All | Entities, relationships, community data |
| `thinking` | string | Deep Research | Current reasoning step |
| `sub_questions` | array | Deep Research | Decomposed research sub-questions |
| `retrieval` | string | Deep Research | Per-search retrieval progress |
| `retrieval_stats` | object | Deep Research | Summary of sources considered |
| `done` | boolean | All | `true` when stream is complete |
| `error` | string | All | Error message |

**Chat mode event sequence:** `sources` -> `graph_context` -> `content` (repeated) -> `done`

**Deep Research event sequence:** `thinking` (repeated) -> `retrieval` (repeated) -> `sources` -> `graph_context` -> `retrieval_stats` -> `content` (repeated) -> `done`

---

## Collections

### GET /api/collections

List all collections.

```bash
curl "{BASE_URL}/api/collections" -H "X-API-Key: {API_KEY}"
```

**Response:**

```json
{
  "collections": [
    {
      "id": "coll_abc123",
      "name": "Research Papers",
      "document_count": 45,
      "entity_count": 892
    }
  ]
}
```

### POST /api/collections

Create a new collection.

```bash
curl -X POST "{BASE_URL}/api/collections" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Collection", "description": "Description"}'
```

**Response:**

```json
{
  "id": "coll_abc123",
  "name": "My Collection",
  "description": "Description",
  "document_count": 0,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### GET /api/collections/{id}

Get collection details including counts and size.

```bash
curl "{BASE_URL}/api/collections/{id}" -H "X-API-Key: {API_KEY}"
```

**Response:**

```json
{
  "id": "coll_abc123",
  "name": "Research Papers",
  "description": "Academic papers on AI and ML",
  "document_count": 45,
  "chunk_count": 1280,
  "entity_count": 892,
  "relationship_count": 2341,
  "total_size_bytes": 52428800,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-20T14:22:00Z"
}
```

### PUT /api/collections/{id}

Update collection name or description.

```bash
curl -X PUT "{BASE_URL}/api/collections/{id}" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Name", "description": "New description"}'
```

### DELETE /api/collections/{id}

Delete a collection and all its documents and entities.

```bash
curl -X DELETE "{BASE_URL}/api/collections/{id}" -H "X-API-Key: {API_KEY}"
```

---

## Knowledge Graph -- Entities

### GET /api/graph/entities

Search entities by name and type.

```bash
curl "{BASE_URL}/api/graph/entities?search=neural&type=Concept&limit=20" \
  -H "X-API-Key: {API_KEY}"
```

| Query Parameter | Type | Default | Description |
|----------------|------|---------|-------------|
| `search` | string | -- | Name search filter |
| `type` | string | -- | Entity type filter |
| `limit` | integer | 20 | Max results |

**Entity types:** Person, Organization, Concept, Technology, Location, Event, Product, Document, System, Process

### GET /api/graph/entities/{entity_id}

Get entity details including relationships and related documents.

**Response:**

```json
{
  "id": "ent_abc123",
  "name": "OpenAI",
  "type": "Organization",
  "description": "AI research company",
  "mention_count": 45,
  "related_documents": ["doc_1", "doc_2", "doc_3"],
  "relationships": [
    {"target": "GPT-4", "type": "CREATED"},
    {"target": "Sam Altman", "type": "LED_BY"}
  ]
}
```

### GET /api/graph/entities/{entity_id}/relationships

Get all relationships for a specific entity.

### DELETE /api/graph/entities

Delete all entities and their connections (DETACH DELETE).

**Response:**

```json
{
  "entities_deleted": 1542
}
```

---

## Knowledge Graph -- Relationships

### POST /api/graph/relationships/analyze

Trigger cross-document relationship analysis (Phase B). Runs as a background task.

```bash
curl -X POST "{BASE_URL}/api/graph/relationships/analyze" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"collection_id": "default", "mode": "incremental"}'
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `collection_id` | string | -- | Target collection |
| `mode` | string | `"incremental"` | `"incremental"` or `"rebuild"` |

**Relationship types (14 standard):** RELATED_TO, CREATED_BY, WORKS_FOR, PART_OF, USES, LOCATED_IN, IMPLEMENTS, DEPENDS_ON, IS_A, HAS_PROPERTY, FOUNDED_BY, FEATURES, CONTAINS, INTERACTS_WITH

### DELETE /api/graph/relationships

Delete all entity relationships.

**Response:**

```json
{
  "relationships_deleted": 142
}
```

---

## Knowledge Graph -- Subgraph

### POST /api/graph/subgraph

Get a subgraph starting from a specific entity.

```bash
curl -X POST "{BASE_URL}/api/graph/subgraph" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"entity_name": "Machine Learning", "max_depth": 2, "limit": 50}'
```

### GET /api/graph/visualization

Get full graph visualization data (nodes and edges). Supports collection scoping.

```bash
curl "{BASE_URL}/api/graph/visualization?collection_id={COLLECTION_ID}" \
  -H "X-API-Key: {API_KEY}"
```

**Response:**

```json
{
  "nodes": [
    {"id": "ent_1", "label": "OpenAI", "type": "Organization"}
  ],
  "edges": [
    {"source": "ent_1", "target": "ent_2", "type": "CREATED"}
  ]
}
```

---

## Entity Deduplication

### GET /api/entities/duplicates

Find duplicate entity candidates using fuzzy name similarity.

```bash
curl "{BASE_URL}/api/entities/duplicates?threshold=0.85&limit=50" \
  -H "X-API-Key: {API_KEY}"
```

| Query Parameter | Type | Default | Description |
|----------------|------|---------|-------------|
| `threshold` | float | 0.85 | Similarity threshold (0.5 to 1.0) |
| `limit` | integer | 50 | Max groups to return |
| `refresh` | boolean | false | Bypass the cached result and force a fresh scan |

One scan runs at a time (single-flight); identical requests join the running scan. On large graphs the scan may outlast the inline wait window, in which case the response is `202 {"status": "running", "progress": 0.42}` — poll the same URL (without `refresh`) until it returns `"status": "complete"`. Completed results are cached server-side; entity merges invalidate the cache.

**Response `200`** (scan complete; `cached` is `true` when served from the scan cache):

```json
{
  "status": "complete",
  "groups": [
    {
      "canonical": "Machine Learning",
      "duplicates": [
        {"name": "machine learning", "type": "Concept", "similarity": 0.95, "mention_count": 12},
        {"name": "ML", "type": "Concept", "similarity": 0.87, "mention_count": 5}
      ],
      "similarity": 0.91
    }
  ],
  "total_groups": 2,
  "cached": true
}
```

### POST /api/entities/merge

Merge duplicate entities into a canonical entity. Transfers all relationships, chunk mentions, and community memberships. Merged names become aliases.

```bash
curl -X POST "{BASE_URL}/api/entities/merge" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"canonical": "Machine Learning", "merge": ["machine learning", "ML"]}'
```

**Response:**

```json
{
  "canonical": "Machine Learning",
  "merged": ["machine learning", "ML"],
  "relationships_transferred": 8,
  "mentions_transferred": 17,
  "aliases_added": ["machine learning", "ML"]
}
```

### GET /api/entities/merge-history

View past merge operations.

```bash
curl "{BASE_URL}/api/entities/merge-history?limit=20" -H "X-API-Key: {API_KEY}"
```

**Response:**

```json
{
  "entries": [
    {
      "canonical": "Machine Learning",
      "merged": ["machine learning", "ML"],
      "relationships_transferred": 8,
      "mentions_transferred": 17,
      "merged_at": "2026-03-18T14:30:00Z"
    }
  ],
  "total": 1
}
```

---

## Communities

### POST /api/graph/communities/detect

Start community detection (background task). Uses Leiden/Louvain algorithms.

```bash
curl -X POST "{BASE_URL}/api/graph/communities/detect" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"collection_id": "default", "min_community_size": 3}'
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `collection_id` | string | -- | Target collection |
| `min_community_size` | integer | 3 | Minimum entities per community |
| `force_regenerate` | boolean | false | Delete existing communities first |

**Response:**

```json
{
  "task_id": "task_abc123",
  "status": "pending",
  "message": "Community detection started"
}
```

### GET /api/graph/communities

List all communities.

### GET /api/graph/communities/{id}

Get community details including entities and documents.

### GET /api/graph/communities/{id}/documents

List documents in a community.

### POST /api/graph/communities/{id}/summarize

Generate an AI summary of a community.

### DELETE /api/graph/communities/{id}

Delete a specific community (entities are unlinked, not deleted).

### DELETE /api/graph/communities

Delete all communities.

---

## Tasks

### GET /api/tasks/{task_id}

Check background task progress (used for relationship analysis, community detection, etc.).

```bash
curl "{BASE_URL}/api/tasks/{task_id}" -H "X-API-Key: {API_KEY}"
```

**Response:**

```json
{
  "task_id": "task_abc123",
  "task_type": "community_detection",
  "status": "running",
  "progress_percent": 45.0,
  "message": "Analyzing graph structure..."
}
```

**Task statuses:** `pending`, `running`, `completed`, `failed`

---

## Cleanup

### POST /api/cleanup/orphaned-entities

Clean up orphaned entities and communities not referenced by any document.

```bash
curl -X POST "{BASE_URL}/api/cleanup/orphaned-entities" \
  -H "X-API-Key: {API_KEY}"
```

**Response:**

```json
{
  "message": "Cleanup completed",
  "orphaned_entities_removed": 42,
  "orphaned_communities_removed": 3
}
```

---

## x402 Micropayments (monetized keys)

On instances with x402 enabled, a **monetized public key** (`cortex_pub_…`, carries `price_per_query`) pays per query on the retrieval endpoints (`/api/search`, `/api/ask`, `/api/ask/stream`, `/api/ask/stream/thinking` — everything else 403s for these keys). Unpaid requests return **402** with a base64 `PAYMENT-REQUIRED` header (x402 v2 requirements); retry with a `PAYMENT-SIGNATURE` header (base64 PaymentPayload with a signed EIP-3009 authorization) and the settlement receipt arrives in the `PAYMENT-RESPONSE` response header. Paying clients should use `POST /api/ask/stream` (no server deadline) rather than `/api/ask`. Full handshake, signing code, and failure modes: the **`x402` skill** (`cortexskills.org/x402/SKILL.md`).

Admin (root `ADMIN_API_KEY`):

### GET /api/admin/x402/config

Current payment configuration + verification state (facilitator auth headers masked). `enabled` mirrors the instance's `X402_ENABLED` flag.

### PUT /api/admin/x402/config

Save the payment configuration (recipient wallet, facilitator URL, CAIP-2 network, asset). Any payment-relevant change — including `asset_name`, which is the token's EIP-712 domain name — resets `verified` until the verify suite passes again. 400 while `X402_ENABLED=false`.

```bash
curl -X PUT "{BASE_URL}/api/admin/x402/config" \
  -H "X-API-Key: {ADMIN_API_KEY}" -H "Content-Type: application/json" \
  -d '{
    "pay_to": "0xYourWallet",
    "facilitator_url": "https://facilitator.xpay.sh",
    "network": "eip155:8453",
    "asset_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "asset_name": "USD Coin",
    "asset_decimals": 6
  }'
```

### POST /api/admin/x402/verify

Run the verification suite: recipient/asset address format (EIP-55 / base58), facilitator reachability (`GET /supported`), and scheme+network support. All four passing stamps the config verified — the precondition for creating priced keys and serving paid requests.

### GET /api/admin/x402/earnings

Settled-payment totals (human units), overall and per key, each payment recorded with its on-chain tx hash.

Monetized keys are minted via the normal key endpoint with a price: `POST /api/admin/api-keys` with `{"name": "...", "permissions": ["read"], "price_per_query": "0.05", "research_multiplier": "10"}` (422 if combined with `manage`; on update, `price_per_query: ""` clears the price). Deep-research (agentic) queries bill at `price × research_multiplier` (default 10, quoted in the 402 challenge per request; `"0"` = research forbidden on the key).

---

## Admin

### POST /api/admin/reset

Full system reset with granular options. Requires admin permission.

```bash
curl -X POST "{BASE_URL}/api/admin/reset" \
  -H "X-API-Key: {ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "delete_documents": true,
    "delete_uploaded_files": true,
    "delete_custom_inputs": true,
    "delete_collections": true,
    "delete_api_keys": false
  }'
```

---

## SHA-256 Upload Tracking

Files synced by the agent are tracked locally in `~/.openclaw/skills/library/state/uploaded_files.json` using SHA-256 content hashes. This prevents duplicate uploads across sync sessions.

**Format:**

```json
{
  "/path/to/file.md": {
    "sha256": "a1b2c3d4e5f6...",
    "uploaded_at": "2026-03-15T10:00:00Z",
    "doc_id": "doc_abc123"
  }
}
```

The tracking file is updated immediately after each successful upload to survive interruptions. On subsequent syncs, the agent computes the SHA-256 of each local file and compares it against the stored hash. Files are re-uploaded only if the hash has changed or the file is new.
