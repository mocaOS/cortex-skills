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

6. **Entity names are case-sensitive in the API.** Use `GET /api/graph/search?q={query}` for fuzzy matching instead of exact name lookups.

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

Relationships have a `type` field (string), a `description` field, and a `weight` (0-10) indicating strength.

Common types extracted by the LLM:
- `WORKS_FOR`, `LOCATED_IN`, `USES`, `RELATED_TO`, `PART_OF`
- `CREATED_BY`, `MANAGES`, `DEPENDS_ON`, `COMPETES_WITH`
- `MENTIONED_IN`, `PRECEDED_BY`, `FOLLOWED_BY`

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
    {"id": "entity_1", "name": "OpenAI", "type": "Organization", "description": "..."},
    {"id": "entity_2", "name": "GPT-4", "type": "Technology", "description": "..."}
  ],
  "edges": [
    {"source": "entity_1", "target": "entity_2", "type": "CREATED_BY", "weight": 9}
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
    {"target": "Sam Altman", "type": "MANAGES", "description": "...", "weight": 8}
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

Returns the subgraph connecting specific entities.

```bash
curl -X POST "{BASE_URL}/api/graph/subgraph" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"entity_names": ["OpenAI", "GPT-4", "Sam Altman"]}'
```

### Search entities by name

Fuzzy search across entity names:

```bash
curl "{BASE_URL}/api/graph/search?q=open" \
  -H "X-API-Key: {API_KEY}"
```

## Semantic Entity Resolution

When enabled (`ENABLE_SEMANTIC_ENTITY_RESOLUTION=true`), the system automatically merges entities that are semantically similar:

- Generates embeddings for entity names
- Compares against existing entities using cosine similarity
- Merges if similarity exceeds `ENTITY_SIMILARITY_THRESHOLD` (default 0.85)
- Preserves all aliases and relationships from both entities

Example: "OpenAI", "Open AI", "openai" all merge into a single entity.

## GraphRAG Extraction Pipeline

During document processing, for each chunk:

1. **Entity Extraction** — LLM identifies entities using XML-formatted prompts
2. **Type Classification** — Each entity gets one of the 10 types
3. **Relationship Extraction** — LLM identifies relationships between entities with types, descriptions, and weight scores
4. **Entity Resolution** — New entities are compared against existing ones and merged if similar
5. **Neo4j Storage** — Entities and relationships stored as graph nodes and edges

Configuration:
```bash
ENABLE_GRAPH_EXTRACTION=true
MAX_GRAPH_HOPS=2
CONCURRENT_EXTRACTIONS=20
ENABLE_SEMANTIC_ENTITY_RESOLUTION=true
ENTITY_SIMILARITY_THRESHOLD=0.85
```

## Resources

- [Knowledge Graph Documentation](https://docs-library.moca.qwellco.de/features/knowledge-graph)
- [API Reference](https://docs-library.moca.qwellco.de/api)
