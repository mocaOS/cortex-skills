# Graph API Reference

Complete endpoint reference for the Cortex Knowledge Graph API. For conceptual overview, entity type table, and extraction pipeline summary, see `SKILL.md`.

## Authentication

All endpoints require an API key via the `X-API-Key` header:

```
X-API-Key: your-api-key
```

## Base URL

```
http://localhost:8000
```

---

## Statistics

### GET /api/stats

Returns aggregate counts for all graph data.

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

| Field | Type | Description |
|-------|------|-------------|
| `document_count` | integer | Total documents in the system |
| `chunk_count` | integer | Total text chunks |
| `entity_count` | integer | Total entity nodes |
| `relationship_count` | integer | Total entity-to-entity relationships (cross-document, from Phase B) |
| `per_chunk_relationship_count` | integer | Relationships extracted per-chunk during Phase A |
| `community_count` | integer | Total detected communities |
| `collection_count` | integer | Total collections |

---

## Graph Visualization

### GET /api/graph/visualization

Returns all entity nodes and relationship edges for graph rendering.

**Response:**

```json
{
  "nodes": [
    {"id": "ent_1", "label": "OpenAI", "type": "Organization"},
    {"id": "ent_2", "label": "GPT-4", "type": "Technology"}
  ],
  "edges": [
    {"source": "ent_1", "target": "ent_2", "type": "CREATED"}
  ]
}
```

**Node object:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Entity ID (e.g., `ent_1`) |
| `label` | string | Display name of the entity |
| `type` | string | One of the 10 entity types |

**Edge object:**

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | Source entity ID |
| `target` | string | Target entity ID |
| `type` | string | One of the 14 relationship types |

---

## Entities

### GET /api/graph/entities

List and search entities. Supports filtering by type and text search.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | string | - | Fuzzy search across entity names |
| `type` | string | - | Filter by entity type (e.g., `Person`, `Concept`) |
| `limit` | integer | 50 | Maximum results to return |

**Examples:**

```bash
# List all entities
curl "{BASE_URL}/api/graph/entities" \
  -H "X-API-Key: {API_KEY}"

# Search with type filter
curl "{BASE_URL}/api/graph/entities?search=neural&type=Concept&limit=20" \
  -H "X-API-Key: {API_KEY}"
```

### GET /api/graph/entities/{entity_id}

Get full details for a single entity by ID.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `entity_id` | string | Entity ID (e.g., `ent_abc123`) |

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
    {"target": "ChatGPT", "type": "CREATED"},
    {"target": "Sam Altman", "type": "LED_BY"}
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Entity ID |
| `name` | string | Canonical entity name |
| `type` | string | Entity type |
| `description` | string | LLM-generated description |
| `mention_count` | integer | Number of chunk mentions |
| `related_documents` | string[] | Document IDs where entity appears |
| `relationships` | object[] | Direct relationships to other entities |

### GET /api/graph/entities/{entity_id}/relationships

Get all relationships for a specific entity.

```bash
curl "{BASE_URL}/api/graph/entities/ent_abc123/relationships" \
  -H "X-API-Key: {API_KEY}"
```

### DELETE /api/graph/entities

Delete ALL entity nodes and their attached relationships (DETACH DELETE). This is destructive.

**Response:**

```json
{
  "entities_deleted": 1542
}
```

---

## Relationships

### DELETE /api/graph/relationships

Delete ALL entity-to-entity relationships. Useful before re-running relationship analysis. Entity nodes are preserved.

**Response:**

```json
{
  "relationships_deleted": 142
}
```

### POST /api/graph/relationships/analyze

Trigger Phase B cross-document relationship analysis as a background task. Discovers relationships between entities across documents using the relationship model.

**Request body (optional):**

```json
{
  "collection_id": "default",
  "mode": "incremental"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `collection_id` | string | `"default"` | Target collection |
| `mode` | string | `"incremental"` | `"incremental"` builds on existing relationships; `"rebuild"` deletes batch-analysis relationships (preserving per-chunk) and re-analyzes |

**Response:**

```json
{
  "task_id": "task_abc123",
  "status": "pending",
  "message": "Relationship analysis started"
}
```

Track progress via `GET /api/tasks/{task_id}`.

**Relationship properties stored:**

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | One of 14 enforced types |
| `description` | string | LLM-generated description of the relationship |
| `weight` | float | Strength score (0-10) |
| `confidence` | float | LLM confidence score (0.0-1.0), only for Phase B relationships |
| `extraction_method` | string | `"per_chunk"` (Phase A) or `"batch_analysis"` (Phase B) |
| `extracted_at` | datetime | When the relationship was extracted |
| `source_document_id` | string | Source document for per-chunk relationships |

---

## Subgraph

### POST /api/graph/subgraph

Get a subgraph centered on a specific entity, traversing outward to a configurable depth.

**Request body:**

```json
{
  "entity_name": "Machine Learning",
  "max_depth": 2,
  "limit": 50
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `entity_name` | string | **required** | Starting entity name |
| `max_depth` | integer | 2 | Maximum traversal hops from starting entity |
| `limit` | integer | 50 | Maximum total nodes to return |

**Alternative form** (from SKILL.md style, multiple entities):

```json
{
  "entity_names": ["OpenAI", "GPT-4", "Sam Altman"]
}
```

Returns the subgraph connecting the specified entities with intermediate nodes and edges.

---

## Entity Search

### GET /api/graph/search

Fuzzy search across entity names using the full-text index. This is case-insensitive and tolerance of typos, unlike direct entity name lookups.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query |

```bash
curl "{BASE_URL}/api/graph/search?q=open" \
  -H "X-API-Key: {API_KEY}"
```

---

## Entity Deduplication

### GET /api/entities/duplicates

Find groups of entities that appear to be duplicates based on name similarity.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `threshold` | float | 0.85 | Similarity threshold (0.5-1.0). Lower = more candidates, more false positives |
| `limit` | integer | 50 | Maximum duplicate groups to return |

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

Merge duplicate entities into a single canonical entity.

**Request body:**

```json
{
  "canonical": "Machine Learning",
  "merge": ["machine learning", "ML"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `canonical` | string | Name of the entity to keep |
| `merge` | string[] | Names of entities to merge into the canonical |

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

When merged:
- All relationships transfer to the canonical entity
- All chunk MENTIONS links transfer
- Merged names are stored as aliases on the canonical entity
- Merged entity nodes are deleted from the graph

### GET /api/entities/merge-history

View the audit trail of past merge operations.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 20 | Maximum entries to return |

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

## Graph Cleanup

### POST /api/cleanup/orphaned-entities

Remove orphaned entities (entities not mentioned by any document) and orphaned communities (communities with no member entities).

**Response:**

```json
{
  "message": "Cleanup completed",
  "orphaned_entities_removed": 42,
  "orphaned_communities_removed": 3
}
```

---

## Multi-Hop Traversal

### GET /api/graph/entity/{name}/relationships

Traverse entity relationships to configurable depth.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Entity name (case-sensitive) |

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `max_hops` | integer | 1 | Traversal depth (1-3) |

```bash
# Direct relationships
curl "{BASE_URL}/api/graph/entity/OpenAI/relationships?max_hops=1" \
  -H "X-API-Key: {API_KEY}"

# 2 hops
curl "{BASE_URL}/api/graph/entity/OpenAI/relationships?max_hops=2" \
  -H "X-API-Key: {API_KEY}"

# Maximum depth
curl "{BASE_URL}/api/graph/entity/OpenAI/relationships?max_hops=3" \
  -H "X-API-Key: {API_KEY}"
```

---

## Graph Status

### GET /api/graph/status

Returns current status of the knowledge graph.

```bash
curl "{BASE_URL}/api/graph/status" \
  -H "X-API-Key: {API_KEY}"
```

---

## Configuration Reference

All environment variables that affect Graph API behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_GRAPH_EXTRACTION` | `true` | Master switch for entity extraction during upload |
| `GRAPH_EXTRACTION_MODEL` | `OPENAI_MODEL` | Model for entity extraction and community summarization |
| `GRAPH_EXTRACTION_API_BASE` | `OPENAI_API_BASE` | API base for extraction model |
| `GRAPH_EXTRACTION_API_KEY` | `OPENAI_API_KEY` | API key for extraction model |
| `RELATIONSHIP_EXTRACTION_MODEL` | `GRAPH_EXTRACTION_MODEL` | Model for relationship extraction (both per-chunk and batch) |
| `RELATIONSHIP_EXTRACTION_API_BASE` | `GRAPH_EXTRACTION_API_BASE` | API base for relationship model |
| `RELATIONSHIP_EXTRACTION_API_KEY` | `GRAPH_EXTRACTION_API_KEY` | API key for relationship model |
| `CONCURRENT_EXTRACTIONS` | `3` | Concurrent entity extraction operations |
| `CONCURRENT_RELATIONS` | `3` | Concurrent per-chunk relationship extractions per document |
| `EXTRACTION_MAX_CONTEXT` | `32768` | Max context tokens for entity extraction batching |
| `MAX_GRAPH_HOPS` | `2` | Default traversal depth for graph-augmented search |
| `GRAPH_WEIGHT` | `0.2` | Weight of graph results in hybrid search |
| `ENABLE_SEMANTIC_ENTITY_RESOLUTION` | `true` | Enable embedding-based entity dedup at storage time |
| `ENTITY_SIMILARITY_THRESHOLD` | `0.85` | Cosine similarity threshold for merging (0.0-1.0) |
| `ENTITY_EMBEDDING_MODEL` | `EMBEDDING_MODEL` | Model for entity name embeddings |
| `RELATIONSHIP_MAX_CONTEXT` | `65536` | Max input context for Phase B batching |
| `RELATIONSHIP_MAX_OUTPUT_TOKENS` | `16000` | Max output tokens for Phase B LLM responses |
| `PARALLEL_RELATIONSHIP_BATCHES` | `5` | Batches processed in parallel during Phase B |
| `RELATIONSHIP_TARGET_RATIO` | `1.0` | Target entity-to-relationship ratio (ERR) |
| `RELATIONSHIP_MAX_ROUNDS` | `3` | Max discovery rounds per batch (initial analysis) |
| `RELATIONSHIP_MAX_HOURS` | `0` | Max hours for relationship analysis (0 = no limit) |
| `RELATIONSHIP_MAX_PER_ENTITY` | `50` | Soft cap on relationships per entity (0 = no cap) |
| `AUTO_RELATIONSHIP_ANALYSIS_AFTER_BATCH` | `false` | Auto-trigger Phase B after batch processing |
| `AUTO_COMMUNITY_DETECTION_AFTER_BATCH` | `false` | Auto-trigger community detection after Phase B |

---

## Background Tasks

Relationship analysis and other long-running graph operations run as background tasks.

### GET /api/tasks/{task_id}

```json
{
  "task_id": "task_abc123",
  "task_type": "relationship_analysis",
  "status": "running",
  "progress_percent": 45.0,
  "message": "Analyzing batch 195/432..."
}
```

**Status values:** `pending`, `running`, `completed`, `failed`, `cancelled`

### GET /api/tasks

List all background tasks.

### DELETE /api/tasks/{task_id}

Cancel a running task.

### GET /api/tasks/{task_id}/result

Get the output of a completed task.

### POST /api/tasks/cleanup

Remove completed and failed tasks older than 24 hours.
