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

---

## Health and Stats

### GET /health

Check API health. Does not require authentication.

```bash
curl "{BASE_URL}/health"
```

**Response:**

```json
{
  "status": "healthy",
  "neo4j_connected": true,
  "version": "1.0.0"
}
```

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

---

## Document Upload

### POST /api/upload

Upload a single file. Parameters `collection_id` and `start_processing` MUST be URL query parameters, NOT form fields.

```bash
curl -X POST "{BASE_URL}/api/upload?collection_id={COLLECTION_ID}&start_processing=true" \
  -H "X-API-Key: {API_KEY}" \
  -F "file=@/path/to/file.md"
```

| Query Parameter | Type | Default | Description |
|----------------|------|---------|-------------|
| `collection_id` | string | default collection | Target collection |
| `start_processing` | boolean | `true` | Whether to begin processing immediately |

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

### GET /api/documents

List all documents. Supports filtering by collection and status.

```bash
curl "{BASE_URL}/api/documents?collection_id={COLLECTION_ID}&status=completed&limit=100" \
  -H "X-API-Key: {API_KEY}"
```

| Query Parameter | Type | Default | Description |
|----------------|------|---------|-------------|
| `collection_id` | string | -- | Filter by collection |
| `status` | string | -- | Filter: `pending`, `processing`, `completed`, `failed` |
| `limit` | integer | 100 | Max results |

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
  "status": "completed",
  "chunk_count": 42,
  "entity_count": 18,
  "created_at": "2024-01-15T10:30:00Z",
  "processed_at": "2024-01-15T10:32:15Z",
  "collection_id": "default",
  "image_progress_current": 3,
  "image_progress_total": 67,
  "image_progress_message": "Analyzed 3/67 images"
}
```

**Status values:** `pending` | `processing` | `completed` | `failed`

A document with `status: "completed"` may still have background image analysis running. Check `image_progress_current` vs `image_progress_total` to confirm.

### GET /api/documents/{doc_id}/file

Download the original uploaded file.

```bash
curl "{BASE_URL}/api/documents/{doc_id}/file" \
  -H "X-API-Key: {API_KEY}" -o document.pdf
```

### POST /api/documents/{doc_id}/reprocess

Reprocess a document (useful after changing extraction settings).

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

Hybrid search combining vector (0.5), keyword (0.3), and graph traversal (0.2) with cross-encoder reranking.

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

**Response:**

```json
{
  "results": [
    {
      "id": "chunk_abc123",
      "content": "Machine learning algorithms can be categorized...",
      "score": 0.92,
      "document_id": "doc_xyz789",
      "document_title": "ML Fundamentals.pdf",
      "metadata": {
        "page": 15,
        "chunk_index": 3
      }
    }
  ],
  "total": 45,
  "query_time_ms": 127,
  "graph_context": {
    "entities": [
      {"name": "Neural Networks", "type": "Concept"}
    ],
    "relationships": [
      {"source": "Neural Networks", "target": "Deep Learning", "type": "PART_OF"}
    ]
  }
}
```

---

## Ask AI (RAG)

### POST /api/ask

Non-streaming RAG query.

```bash
curl -X POST "{BASE_URL}/api/ask" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"question": "What do I know about topic X?", "use_agentic": false}'
```

### POST /api/ask/stream

Primary endpoint. Returns Server-Sent Events (SSE) with real-time answer tokens, sources, and graph context.

```bash
curl -N "{BASE_URL}/api/ask/stream" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"question": "Summarize what I know about machine learning"}'
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

**Response:**

```json
{
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
  "threshold": 0.85
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
