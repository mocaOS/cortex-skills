# Communities API Reference

Complete endpoint reference for the Cortex Communities API. For conceptual overview, common mistakes, typical workflow, and RAG integration, see `SKILL.md`.

## Authentication

All endpoints require an API key via the `X-API-Key` header:

```
X-API-Key: your-api-key
```

If `ENABLE_COMMUNITY_DETECTION=false`, all `/api/graph/communities/*` endpoints return `403 Forbidden`.

## Base URL

```
http://localhost:8000
```

---

## Community Detection

### POST /api/graph/communities/detect

Triggers community detection as a background task. The system projects the entity graph as undirected with weighted edges, then runs the Leiden (preferred), Louvain, or BFS connected-components algorithm.

**Request body (optional):**

```json
{
  "min_size": 5,
  "collection_id": "default"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `min_size` | integer | `3` | Minimum entities to form a community (range 2–20). Entities in smaller clusters are dropped |
| `collection_id` | string | `null` | Collection scope for detection. Omit to detect across all entities |

Existing communities are always cleaned up before re-detection (see the pipeline details below), so there is no separate `force_regenerate` flag.

**Response:**

```json
{
  "task_id": "task_abc123",
  "status": "pending",
  "message": "Community detection started"
}
```

**Important:** Results are NOT available immediately. Poll `GET /api/tasks/{task_id}` until status is `completed`.

### Detection Pipeline Details

1. **Cleanup** -- Old communities are deleted before re-detection to prevent stale data
2. **Graph projection** -- Entity-to-entity relationships projected as undirected, weighted edges. Co-mention edges (entities sharing a chunk) are added with weight 2.0
3. **Algorithm execution** -- Leiden > Louvain > BFS fallback. Weight-aware clustering uses relationship `weight` property (0-10 scale)
4. **Community assignment** -- Entities assigned to communities. Clusters below `min_community_size` are discarded
5. **Capping** -- Communities beyond `MAX_COMMUNITIES` are merged or discarded
6. **Distribution monitoring** -- Warnings logged for pathological distributions (e.g., one mega-community > 50% of entities)

### Algorithm Fallback Chain

| Algorithm | Requirement | Granularity |
|-----------|-------------|-------------|
| Leiden | Neo4j GDS plugin | Best -- fine-grained, non-overlapping |
| Louvain | Neo4j GDS plugin | Good -- similar to Leiden |
| BFS connected components | No plugin needed | Coarse -- large, less granular communities |

If communities seem too coarse, verify that the Neo4j Graph Data Science (GDS) plugin is installed.

---

## List Communities

### GET /api/graph/communities

Returns all detected communities with metadata.

**Response:**

```json
{
  "communities": [
    {
      "id": "comm_1",
      "name": "Machine Learning Fundamentals",
      "description": "Core ML concepts including neural networks, optimization, and training methods",
      "document_count": 12,
      "entity_count": 156,
      "top_entities": ["Neural Network", "Deep Learning", "Gradient Descent"],
      "has_summary": true,
      "created_at": "2026-03-15T10:30:00Z"
    }
  ],
  "total": 23
}
```

**Community list object:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Community ID (e.g., `comm_1`) |
| `name` | string | LLM-generated descriptive name |
| `description` | string | Short description |
| `document_count` | integer | Documents associated with community entities |
| `entity_count` | integer | Member entity count |
| `top_entities` | string[] | Names of the most prominent entities |
| `has_summary` | boolean | Whether an LLM summary has been generated |
| `created_at` | datetime | Detection timestamp |

---

## Get Community Details

### GET /api/graph/communities/{id}

Returns full details for a single community including all member entities, key relationships, and documents.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Community ID (e.g., `comm_1`) |

**Response:**

```json
{
  "id": "comm_1",
  "name": "Machine Learning Fundamentals",
  "description": "Core ML concepts including neural networks, optimization, and training methods",
  "summary": "This community covers the foundational aspects of machine learning, with a focus on neural network architectures, training algorithms, and optimization techniques...",
  "document_count": 12,
  "entity_count": 156,
  "entities": [
    {"name": "Neural Network", "type": "Concept", "mentions": 45},
    {"name": "Deep Learning", "type": "Concept", "mentions": 38}
  ],
  "key_relationships": [
    {"source": "Deep Learning", "target": "Neural Network", "type": "IS_A"},
    {"source": "Neural Network", "target": "Gradient Descent", "type": "USES"}
  ],
  "documents": [
    {"id": "doc_1", "title": "Deep Learning Fundamentals.pdf"},
    {"id": "doc_2", "title": "Neural Network Training.pdf"}
  ]
}
```

**Community detail object:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Community ID |
| `name` | string | LLM-generated name |
| `description` | string | Short description |
| `summary` | string | Full LLM-generated summary (empty string if not yet summarized) |
| `document_count` | integer | Associated document count |
| `entity_count` | integer | Member entity count |
| `entities` | object[] | All member entities with name, type, and mention count |
| `key_relationships` | object[] | Important relationships between member entities |
| `documents` | object[] | Associated documents with id and title |

---

## Summarization

### POST /api/graph/communities/summarize

Bulk summarize multiple or all communities as a background task.

**Request body:**

```json
{
  "community_ids": ["comm_01", "comm_02"],
  "force_regenerate": false
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `community_ids` | string[] | all | Specific communities to summarize. Omit to summarize all |
| `force_regenerate` | boolean | `false` | When `true`, regenerates summaries even for communities that already have one |

**Response:**

```json
{
  "task_id": "task_def456",
  "status": "pending",
  "message": "Summarization started for 2 communities"
}
```

This runs as a background task. Poll `GET /api/tasks/{task_id}` for progress.

**Summarization model:** Uses `GRAPH_EXTRACTION_MODEL` (falls back to `OPENAI_MODEL`). Can be overridden with `COMMUNITY_SUMMARY_MODEL`. Assistant prefill is used to enforce JSON output format.

---

## Search Communities

### GET /api/graph/communities/search

Search community names and summaries.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query |

**Response:**

```json
{
  "results": [
    {
      "id": "comm_01",
      "name": "Machine Learning Infrastructure",
      "summary": "A cluster of entities related to ML model training...",
      "score": 0.92
    }
  ],
  "total": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `results[].id` | string | Community ID |
| `results[].name` | string | Community name |
| `results[].summary` | string | Community summary text |
| `results[].score` | float | Relevance score |

---

## Community Management

### DELETE /api/graph/communities/{id}

Delete a single community. Member entities are unlinked (their `community_id` is cleared) but NOT deleted.

```bash
curl -X DELETE "{BASE_URL}/api/graph/communities/5" \
  -H "X-API-Key: {API_KEY}"
```

### DELETE /api/graph/communities

Delete ALL communities. Entities are preserved.

```bash
curl -X DELETE "{BASE_URL}/api/graph/communities" \
  -H "X-API-Key: {API_KEY}"
```

---

## Background Task Tracking

Community detection and summarization run as background tasks.

### GET /api/tasks/{task_id}

```json
{
  "task_id": "task_abc123",
  "task_type": "community_detection",
  "status": "running",
  "progress_percent": 65,
  "message": "Analyzing graph structure...",
  "started_at": "2026-03-15T10:30:00Z",
  "completed_at": null
}
```

**Task types:** `community_detection`, `community_summarization`

**Status values:** `pending`, `running`, `completed`, `failed`, `cancelled`

### GET /api/tasks

List all tasks.

### GET /api/tasks/{task_id}/result

Get the output of a completed task (e.g., the list of detected communities).

### DELETE /api/tasks/{task_id}

Cancel a running task.

### POST /api/tasks/cleanup

Remove completed and failed tasks older than 24 hours.

---

## Configuration Reference

All environment variables affecting Communities behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_COMMUNITY_DETECTION` | `true` | Master switch. When `false`, all community endpoints return 403 |
| `MIN_COMMUNITY_SIZE` | `3` | Minimum entities per community. Smaller clusters are dropped |
| `MAX_COMMUNITIES` | `50` | Maximum communities to retain. Excess are merged or discarded |
| `ENABLE_GRAPH_SUMMARIZATION` | `true` | Allow LLM summarization of communities |
| `COMMUNITY_SUMMARY_MODEL` | `GRAPH_EXTRACTION_MODEL` | Model for generating community summaries |
| `AUTO_COMMUNITY_DETECTION_AFTER_BATCH` | `false` | Auto-trigger detection after relationship analysis completes |
