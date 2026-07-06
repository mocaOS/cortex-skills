# Neo4j Property Graph Schema

Complete schema reference for the Cortex knowledge graph stored in Neo4j 5.x. For conceptual overview and entity type descriptions, see `SKILL.md`.

## Connection

```bash
NEO4J_URI=bolt://neo4j:7687    # Bolt protocol (port 7687)
NEO4J_USER=neo4j
NEO4J_PASSWORD=<your-password>
```

Neo4j Browser is available at `http://localhost:7474` for interactive queries.

---

## Node Labels

### :Document

Represents an uploaded file (PDF, DOCX, TXT, MD) or custom input.

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique document ID (e.g., `doc_abc123`) |
| `filename` | string | Original filename |
| `file_type` | string | MIME type or extension |
| `file_size` | integer | File size in bytes |
| `upload_date` | datetime | When the document was uploaded |
| `processing_status` | string | `pending`, `processing`, `completed`, `failed` |
| `chunk_count` | integer | Number of text chunks produced |
| `entity_count` | integer | Entities extracted from this document |
| `collection_id` | string | ID of the parent collection |
| `image_progress_current` | integer | Images analyzed so far |
| `image_progress_total` | integer | Total images to analyze |
| `image_progress_message` | string | Human-readable progress message |

### :Chunk

A text segment from a document, with an embedding vector for semantic search.

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique chunk ID |
| `content` | string | Raw text content |
| `embedding` | float[1536] | Vector embedding (dimension matches `EMBEDDING_DIMENSION`) |
| `chunk_index` | integer | Position within the document (0-based) |
| `document_id` | string | Parent document ID |

### :Entity

A named concept extracted from documents by the LLM.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Canonical entity name |
| `type` | string | One of the 10 enforced types (see below) |
| `description` | string | LLM-generated description |
| `created_at` | datetime | When the entity was first created |
| `embedding` | float[1536] | Optional. Vector embedding of entity name, used for semantic resolution |
| `aliases` | string[] | Alternative names merged into this entity (e.g., `["Open AI", "openai"]`) |
| `community_id` | string | ID of the community this entity belongs to (if assigned) |
| `collection_id` | string | Collection scope |
| `source_documents` | string[] | Document IDs where this entity was extracted |
| `extraction_count` | integer | Number of times this entity was independently extracted |
| `last_extracted_at` | datetime | Most recent extraction timestamp |
| `mention_count` | integer | Number of chunk mentions |

**Enforced entity types (10):**

| Type | Description |
|------|-------------|
| `Person` | Individual people: names, authors, researchers |
| `Organization` | Companies, institutions, teams, groups |
| `Concept` | Abstract ideas, theories, methodologies |
| `Technology` | Software, hardware, tools, frameworks |
| `Location` | Physical or virtual places, regions |
| `Event` | Conferences, releases, meetings, dates |
| `Product` | Products, services, offerings |
| `Document` | Referenced papers, reports, articles |
| `System` | Platforms, infrastructure, operating systems |
| `Process` | Workflows, procedures, methods |

Non-standard types extracted by the LLM are fuzzy-matched to the nearest allowed type (75% threshold, default fallback: `Concept`).

### :Community

A cluster of densely connected entities detected by graph algorithms.

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Community ID (e.g., `comm_1`) |
| `name` | string | LLM-generated descriptive name |
| `summary` | string | LLM-generated natural-language summary |
| `description` | string | Shorter description of the community |
| `entity_count` | integer | Number of member entities |
| `document_count` | integer | Number of associated documents |
| `collection_id` | string | Collection scope |
| `created_at` | datetime | When the community was detected |

### :Collection

A logical group of documents with isolated graph scope.

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Collection ID (e.g., `coll_abc123`) |
| `name` | string | Display name |
| `description` | string | User-provided description |
| `created_at` | datetime | Creation timestamp |

### :MergeHistory

Audit trail node for entity deduplication operations.

| Property | Type | Description |
|----------|------|-------------|
| `canonical` | string | Name of the kept entity |
| `merged` | string[] | Names of entities that were merged |
| `relationships_transferred` | integer | Count of relationships moved |
| `mentions_transferred` | integer | Count of MENTIONS links moved |
| `merged_at` | datetime | When the merge happened |

### :SystemMeta

Internal metadata for tracking staleness and pipeline state.

| Property | Type | Description |
|----------|------|-------------|
| `key` | string | Metadata key |
| `value` | string | Metadata value |
| `updated_at` | datetime | Last update timestamp |

---

## Relationship Types (Edges)

### Structural Relationships

These are system-managed edges that encode the document-to-graph topology:

| Pattern | Description |
|---------|-------------|
| `(:Document)-[:HAS_CHUNK]->(:Chunk)` | Document contains this text chunk |
| `(:Chunk)-[:MENTIONS]->(:Entity)` | Chunk text references this entity (created via fuzzy string matching with rapidfuzz) |
| `(:Document)-[:IN_COLLECTION]->(:Collection)` | Document belongs to this collection |
| `(:Entity)-[:IN_COMMUNITY]->(:Community)` | Entity is a member of this community |

### Entity-to-Entity Relationships

```
(:Entity)-[:RELATED_TO {type, description, weight, confidence, extraction_method, extracted_at, source_document_id}]->(:Entity)
```

All entity-to-entity edges use the Neo4j relationship type `RELATED_TO` and carry a `type` property that holds the semantic relationship type. There are exactly 14 enforced semantic types:

| Type | Description |
|------|-------------|
| `RELATED_TO` | Generic/fallback relationship |
| `CREATED_BY` | Creator/creation |
| `WORKS_FOR` | Employment |
| `PART_OF` | Containment/membership |
| `USES` | Utilization |
| `LOCATED_IN` | Geographic relationship |
| `IMPLEMENTS` | Implementation |
| `DEPENDS_ON` | Dependency |
| `IS_A` | Classification/taxonomy |
| `HAS_PROPERTY` | Attribute |
| `FOUNDED_BY` | Founding |
| `FEATURES` | Feature/capability |
| `CONTAINS` | Containment |
| `INTERACTS_WITH` | Interaction |

The `MENTIONS` type was intentionally excluded (lazy co-occurrence catch-all). Non-standard types are fuzzy-matched to the nearest allowed type (80% threshold, fallback: `RELATED_TO`).

**Relationship edge properties:**

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | One of the 14 semantic types above |
| `description` | string | LLM-generated description of the relationship |
| `weight` | float | Strength score (0-10 scale) |
| `confidence` | float | LLM confidence (0.0-1.0), Phase B only. Relationships with confidence < 0.5 are filtered |
| `extraction_method` | string | `"per_chunk"` (Phase A, high confidence), `"cross_collection"` (Phase B, default `targeted` mode) or `"batch_analysis"` (Phase B, legacy `llm_scan` mode) |
| `extracted_at` | datetime | Extraction timestamp |
| `source_document_id` | string | Source document, for per-chunk relationships |

Self-referential relationships (source == target) are automatically filtered at both extraction and storage levels.

Phase B discovery has two engines, selected by `RELATIONSHIP_DISCOVERY_MODE`. The default `targeted` mode (kNN + co-mention candidates verified pair-by-pair by the LLM) is a single pass and stores `extraction_method='cross_collection'`. The legacy `llm_scan` mode runs multi-round batch discovery and stores `extraction_method='batch_analysis'`; `RELATIONSHIP_MAX_ROUNDS` (and the `RELATIONSHIP_TARGET_RATIO`/ERR target) apply only to that legacy mode.

---

## Indexes

### Vector Index

- **Label:** `Chunk`
- **Property:** `embedding`
- **Similarity:** Cosine
- **Dimensions:** 1536 (configurable via `EMBEDDING_DIMENSION`)
- **Purpose:** Semantic similarity search for RAG retrieval

Entity nodes also have optional `embedding` properties used for semantic entity resolution via Neo4j's vector index.

### Full-Text Indexes

- **Entity name + description:** Full-text index on `Entity.name` and `Entity.description` for fuzzy entity search (`GET /api/graph/search?query=...` and `GET /api/graph/entities?search=...`)

---

## Graph Projection for Community Detection

When community detection runs, the graph is projected with these characteristics:

- **Direction:** Undirected (all relationships treated as bidirectional)
- **Weights:** Relationship `weight` property (0-10 scale) influences community membership
- **Co-mention edges:** Entities appearing in the same chunk are connected with synthetic edges (weight 2.0), providing structure even when direct entity-to-entity relationships are sparse
- **Algorithm:** Leiden (preferred) > Louvain > BFS connected components (fallback when Neo4j GDS plugin is unavailable)

---

## Data Cleanup Behavior

When a document is deleted, the following cascade occurs:

| Data | Behavior |
|------|----------|
| Active processing tasks | Cancelled immediately |
| Chunks | All chunks from the document removed |
| Orphaned entities | Removed if only mentioned by the deleted document |
| Shared entities | Preserved if mentioned by other documents |
| Relationships | Removed with their orphaned entities (DETACH DELETE) |
| Communities | Removed if no member entities remain |

When a full system reset occurs (`POST /api/admin/reset`), all node types are removed: Documents, Chunks, Entities, Relationships, Communities, MergeHistory, SystemMeta.

---

## Export Schema (NDJSON)

When exporting via `POST /api/admin/export`, the graph is serialized as:

```
cortex-export-YYYY-MM-DD.zip
  manifest.json
  documents.ndjson
  chunks.ndjson              # Includes vector embeddings
  entities.ndjson            # Entity nodes with embeddings
  relationships.ndjson       # Entity-to-entity relationships
  communities.ndjson         # Detected communities
  community_members.ndjson   # Community-entity memberships
  collections.ndjson         # Document collections
  collection_members.ndjson  # Collection-document assignments
  chunk_mentions.ndjson      # Chunk-entity MENTIONS links
  merge_history.ndjson       # Deduplication audit trail
  system_meta.ndjson         # System timestamps
  files/                     # Original document files
```

The `manifest.json` includes:

```json
{
  "version": "1.0",
  "export_date": "2026-03-27T14:18:32Z",
  "embedding_model": "openai/text-embedding-3-small",
  "embedding_dimension": 1536,
  "stats": {
    "document_count": 30,
    "chunk_count": 1250,
    "entity_count": 631,
    "relationship_count": 496,
    "community_count": 8,
    "collection_count": 1
  }
}
```
