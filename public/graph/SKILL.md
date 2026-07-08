---
name: graph
description: Use this skill when working with the Cortex knowledge graph — querying entities and relationships, traversing multi-hop connections, visualizing the graph, understanding the Neo4j schema, or configuring GraphRAG entity extraction and semantic resolution.
---

# Graph — Knowledge Graph Operations

## What You Probably Got Wrong

1. **The knowledge graph is not just embeddings in a vector store.** It is a full property graph in Neo4j with typed nodes (Document, Chunk, Entity, Community, Collection) and typed edges (HAS_CHUNK, MENTIONS, RELATED_TO, IN_COLLECTION, IN_COMMUNITY).

2. **Entity extraction happens automatically during document processing.** You do not need to call a separate endpoint. When you upload a document, the LLM extracts entities and relationships as part of the processing pipeline.

3. **There are 10 entity types, not a free-form string.** The types are: Person, Organization, Concept, Technology, Location, Event, Product, Document, System, Process.

4. **Semantic entity resolution merges duplicates automatically.** "OpenAI", "Open AI", and "openai" are merged into a single entity using embedding-based deduplication (cosine threshold 0.85).

5. **Graph traversal is one of three search methods.** It is automatically included in hybrid search (weight 0.2) and Ask AI queries when `use_graph: true`. You do not need to query the graph API separately for search — it is integrated.

6. **Entity names are case-sensitive in the API.** Use `GET /api/graph/search?query={query}` for fuzzy matching instead of exact name lookups.

## Neo4j Schema

### Nodes

```
(:Document {id, filename, file_type, file_size, upload_date, processing_status})
(:Chunk {id, content, embedding: float[1536], chunk_index, document_id})
(:Entity {name, type, description, created_at, embedding?, aliases?, community_id?, collection_id?})
(:Community {id, name, summary, entity_count, collection_id})
(:Collection {id, name, description, created_at})
```

### Relationships

```
(:Document)-[:HAS_CHUNK]->(:Chunk)
(:Chunk)-[:MENTIONS]->(:Entity)
(:Entity)-[:RELATED_TO {type, description, weight}]->(:Entity)
(:Document)-[:IN_COLLECTION]->(:Collection)
(:Entity)-[:IN_COMMUNITY]->(:Community)
```

### Indexes

- **Vector index** on `Chunk.embedding` — cosine similarity, 1536 dimensions
- **Full-text index** on `Entity.name` and `Entity.description`

## Entity Types

| Type | Description | Examples |
|------|-------------|----------|
| Person | Individual people | "John Smith", "CEO" |
| Organization | Companies, teams, groups | "OpenAI", "Engineering Team" |
| Concept | Abstract ideas, theories | "Machine Learning", "Supply Chain" |
| Technology | Software, hardware, tools | "Neo4j", "GraphRAG", "Python" |
| Location | Physical or virtual places | "San Francisco", "AWS us-east-1" |
| Event | Occurrences, meetings, dates | "Q4 Review", "Product Launch" |
| Product | Products, services, features | "GPT-4", "Cortex API" |
| Document | Referenced documents | "Q4 Report", "Employee Handbook" |
| System | Technical systems, platforms | "CRM System", "Data Pipeline" |
| Process | Workflows, procedures | "Onboarding", "Code Review" |

## Relationship Types

Relationships have a `type` field, a `description`, and a `weight` (0-10). The type is constrained to **14 standardized types** — extracted types are fuzzy-matched at an 80% threshold, falling back to `RELATED_TO`. `MENTIONS` is intentionally excluded from entity-to-entity relationships.

```
RELATED_TO, CREATED_BY, WORKS_FOR, PART_OF, USES, LOCATED_IN, IMPLEMENTS,
DEPENDS_ON, IS_A, HAS_PROPERTY, FOUNDED_BY, FEATURES, CONTAINS, INTERACTS_WITH
```

## API Endpoints

### Get graph status

```bash
curl "{BASE_URL}/api/graph/status" \
  -H "X-API-Key: {API_KEY}"
```

### Get graph visualization data

Returns all nodes and edges for rendering with a graph visualization library.

```bash
curl "{BASE_URL}/api/graph/visualization" \
  -H "X-API-Key: {API_KEY}"
```

Response:
```json
{
  "nodes": [
    {"id": "OpenAI", "label": "OpenAI", "type": "Organization", "description": "...", "community_id": "comm_1", "mention_count": 45},
    {"id": "GPT-4", "label": "GPT-4", "type": "Technology", "description": "...", "community_id": "comm_1", "mention_count": 30}
  ],
  "edges": [
    {"source": "OpenAI", "target": "GPT-4", "type": "CREATED_BY", "description": "...", "weight": 9}
  ]
}
```

### List entities

```bash
# All entities
curl "{BASE_URL}/api/graph/entities" \
  -H "X-API-Key: {API_KEY}"

# Filter by type
curl "{BASE_URL}/api/graph/entities?type=Person" \
  -H "X-API-Key: {API_KEY}"
```

### Get entity details

```bash
curl "{BASE_URL}/api/graph/entity/OpenAI" \
  -H "X-API-Key: {API_KEY}"
```

Response:
```json
{
  "name": "OpenAI",
  "type": "Organization",
  "description": "AI research company...",
  "relationships": [
    {"target": "GPT-4", "type": "CREATED_BY", "description": "...", "weight": 9},
    {"target": "Sam Altman", "type": "FOUNDED_BY", "description": "...", "weight": 8}
  ],
  "mentioned_in": ["doc_abc123", "doc_def456"]
}
```

### Multi-hop relationship traversal

```bash
# 1 hop (direct relationships)
curl "{BASE_URL}/api/graph/entity/OpenAI/relationships?max_hops=1" \
  -H "X-API-Key: {API_KEY}"

# 2 hops (relationships of relationships)
curl "{BASE_URL}/api/graph/entity/OpenAI/relationships?max_hops=2" \
  -H "X-API-Key: {API_KEY}"

# 3 hops (maximum depth)
curl "{BASE_URL}/api/graph/entity/OpenAI/relationships?max_hops=3" \
  -H "X-API-Key: {API_KEY}"
```

### Get a subgraph

Returns the subgraph connecting specific entities. The request body is a **bare JSON array** of entity names; use the `include_connections` query flag to add bridging entities.

```bash
curl -X POST "{BASE_URL}/api/graph/subgraph?include_connections=true" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '["OpenAI", "GPT-4", "Sam Altman"]'
```

### Search entities by name

Fuzzy search across entity names:

```bash
curl "{BASE_URL}/api/graph/search?query=open" \
  -H "X-API-Key: {API_KEY}"
```

## Entity Deduplication

Automatic resolution handles most duplicates during ingestion, but you can also find and merge duplicates manually:

### Find Duplicate Candidates

```bash
curl "{BASE_URL}/api/entities/duplicates?threshold=0.85&limit=50" \
  -H "X-API-Key: {API_KEY}"
```

Returns groups of entities that appear to be duplicates based on name similarity. Lower the threshold (min 0.5) to find more candidates at the cost of more false positives.

### Merge Duplicates

```bash
curl -X POST "{BASE_URL}/api/entities/merge" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"canonical": "Machine Learning", "merge": ["machine learning", "ML"]}'
```

When merged: all relationships and chunk mentions transfer to the canonical entity, merged names become aliases, and merged entity nodes are deleted.

### View Merge History

```bash
curl "{BASE_URL}/api/entities/merge-history" \
  -H "X-API-Key: {API_KEY}"
```

Returns the audit trail of all past merge operations with counts of transferred relationships and mentions.

---

## Entity Editing

Update an entity's name or description:

```bash
curl -X PATCH "{BASE_URL}/api/graph/entity/OpenAI" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"description": "AI research and deployment company"}'
```

---

## Generate Graph (One-Click 3-Step Chain)

The Knowledge Graph page exposes a single **Generate Graph / Regenerate Graph** button that runs three steps server-side as a chained background flow: entity extraction → relationship analysis → community detection. Trigger it via the `chain` query parameter (accepted on `/api/documents/reprocess`, `/api/documents/process-pending`, and `/api/graph/relationships/analyze`):

```bash
curl -X POST "{BASE_URL}/api/documents/reprocess?chain=relationship_analysis,community_detection" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"document_ids": ["doc_abc123"]}'
```

Each step produces its own task (`task_id`, `task_type`, progress messages). Step 1 stays `running` until background image analysis completes. The flow survives navigation/reload/browser close (resumed via a saved task id). Single-step buttons ("Extract Entities", "Analyze Relationships", "Detect Communities") never auto-chain.

**Full regenerate cleanup order:** `DELETE /api/graph/communities` → `DELETE /api/graph/relationships` → `DELETE /api/graph/entities` → reprocess all documents → relationship analysis (rebuild mode) → community detection.

## Cross-Document Relationship Analysis

After documents are processed with per-chunk entity and relationship extraction (Phase A), you can run a deeper cross-document analysis (Phase B) that discovers relationships between entities across different documents:

```bash
curl -X POST "{BASE_URL}/api/graph/relationships/analyze" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"mode": "incremental"}'
```

This runs as a background task. `mode: "incremental"` builds on existing relationships; `mode: "rebuild"` deletes cross-document Phase B relationships (everything with `extraction_method != "per_chunk"`) and re-analyzes from scratch, preserving per-chunk Phase A relationships.

Phase B relationships carry a `confidence` score (0.0-1.0). The default `targeted` mode tags them `extraction_method: "cross_collection"`; the legacy `llm_scan` mode tags them `extraction_method: "batch_analysis"`. Both distinguish Phase B relationships from per-chunk Phase A relationships (`extraction_method: "per_chunk"`).

---

## Deleting Graph Data

```bash
# Delete ALL entities (and their attached relationships)
curl -X DELETE "{BASE_URL}/api/graph/entities" \
  -H "X-API-Key: {API_KEY}"

# Delete ALL entity-to-entity relationships (preserving entity nodes)
curl -X DELETE "{BASE_URL}/api/graph/relationships" \
  -H "X-API-Key: {API_KEY}"

# Clean up orphaned entities and communities
curl -X POST "{BASE_URL}/api/cleanup/orphaned-entities" \
  -H "X-API-Key: {API_KEY}"
```

---

## Semantic Entity Resolution

When enabled (`ENABLE_SEMANTIC_ENTITY_RESOLUTION=true`), the system automatically merges entities that are semantically similar:

- Generates embeddings for entity names
- Compares against existing entities using cosine similarity
- Merges if similarity exceeds `ENTITY_SIMILARITY_THRESHOLD` (default 0.85)
- Preserves all aliases and relationships from both entities

Example: "OpenAI", "Open AI", "openai" all merge into a single entity.

## GraphRAG Extraction Pipeline

The extraction pipeline has two phases:

### Phase A: Per-Document Extraction (During Upload)

For each chunk in a document:

1. **Entity Extraction** — LLM identifies entities, returning compact `ENT|`/`REL|` lines (one record per line)
2. **Type Classification** — Each entity gets one of the 10 types (non-standard types are fuzzy-matched to the nearest allowed type)
3. **Per-Chunk Relationship Extraction** — LLM identifies relationships between entities within the same chunk, with types, descriptions, and weight scores
4. **Entity Resolution** — New entities are compared against existing ones and merged if similar
5. **Neo4j Storage** — Entities and relationships stored as graph nodes and edges

### Phase B: Cross-Document Relationship Analysis (On Demand)

Triggered via `POST /api/graph/relationships/analyze`. The engine is selected by `RELATIONSHIP_DISCOVERY_MODE`.

**Targeted mode (`targeted`, the default):** candidate entity pairs are generated **without the LLM** using kNN embedding similarity plus document co-mention, then the LLM only verifies/classifies the ranked pairs. This replaces hundreds of near-context-window batch scans (hours) with a few hundred small verification calls (minutes):

1. **Candidate Generation** — kNN + co-mention produce ranked candidate pairs (no LLM)
2. **LLM Pair Verification** — pairs are grouped per call; the LLM confirms and classifies each relationship
3. **Confidence Scoring** — relationships below 0.5 confidence are filtered; degree caps applied
4. **Single Pass** — no multi-round loop (`RELATIONSHIP_MAX_ROUNDS` does not apply); relationships are stored with `extraction_method: "cross_collection"`

**Legacy mode (`llm_scan`):** the older two-phase batch scan — Union-Find co-occurrence clustering batches entities that share chunks, then multi-round LLM discovery runs until the ERR target is met or `RELATIONSHIP_MAX_ROUNDS` is reached. Relationships are stored with `extraction_method: "batch_analysis"`.

1. **Candidate Scanning** — groups co-occurring entities into batches
2. **LLM Relationship Proposals** — each batch is analyzed for cross-document relationships
3. **Confidence Scoring** — relationships below 0.5 confidence are filtered
4. **Early Stopping** — stops when the ERR (Entity-Relationship Ratio) target is met or max rounds are reached

The **ERR metric** (Entity-Relationship Ratio) measures graph density. Displayed on the Knowledge Graph UI page as a quality indicator. In legacy `llm_scan` mode the target is configurable via `RELATIONSHIP_TARGET_RATIO` (default 1.0).

### Configuration

```bash
ENABLE_GRAPH_EXTRACTION=true
MAX_GRAPH_HOPS=2
CONCURRENT_EXTRACTIONS=3              # Parallel entity extraction operations
CONCURRENT_RELATIONS=3                # Per-chunk relationship extractions per document
RELATIONSHIP_DISCOVERY_MODE=targeted  # Phase B engine: targeted (default) | llm_scan (legacy)
PARALLEL_RELATIONSHIP_BATCHES=5       # Batches processed in parallel during Phase B
RELATIONSHIP_TARGET_RATIO=1.0         # Target ERR (legacy llm_scan mode only)
RELATIONSHIP_MAX_ROUNDS=3             # Max discovery rounds per batch (legacy llm_scan mode only)
RELATIONSHIP_MAX_PER_ENTITY=50        # Soft cap to prevent hub domination
ENABLE_SEMANTIC_ENTITY_RESOLUTION=true
ENTITY_SIMILARITY_THRESHOLD=0.85
```

### Reasoning Control

Reasoning hurts structured extraction (drift, hidden-token cost, malformed JSON). Force it OFF so reasoning-capable models (GPT-5/5.1, Claude 4.x, Qwen3, DeepSeek-R1) can be used for ingestion. Values: `off | minimal | auto | low | medium | high`.

```bash
EXTRACTION_REASONING_MODE=off         # extraction, summaries, communities, query-entity extraction
RELATIONSHIP_REASONING_MODE=off       # candidate scan + relationship extraction
VISION_REASONING_MODE=off             # vision-model image descriptions
# REASONING_MODEL_OVERRIDES=gpt-5.8:none,custom:minimal
```

## Skill Files

| File | Description |
|------|-------------|
| [references/API.md](references/API.md) | Complete API endpoint reference |
| [references/SCHEMA.md](references/SCHEMA.md) | Neo4j graph schema and node types |

## Resources

- [Knowledge Graph Documentation](https://docs.cortex.eco/features/knowledge-graph)
- [API Reference](https://docs.cortex.eco/api)
