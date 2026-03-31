# MCP Tools Reference

Detailed parameter schemas and response formats for each Cortex MCP tool.

## search_knowledge

Hybrid search combining vector similarity (0.5), keyword/BM25 (0.3), and graph traversal (0.2) with cross-encoder re-ranking.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `query` | string | Yes | — | Search query |
| `top_k` | integer | No | 10 | Results to return (1–50) |
| `collection_id` | string | No | — | Scope to a collection |

**Response:** Numbered list of matching chunks with scores and document IDs.

**Maps to:** `POST /api/search`

---

## ask_question

RAG-powered Q&A using the knowledge graph and document chunks.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `question` | string | Yes | — | The question to ask |
| `use_graph` | boolean | No | true | Include knowledge graph context |
| `collection_id` | string | No | — | Scope to a collection |
| `mode` | "speed" \| "quality" | No | "speed" | speed: 2 iterations, 1200 tokens; quality: up to 10 iterations, 4000 tokens |

**Response:** Answer text with source citations and optional graph context.

**Maps to:** `POST /api/ask`

---

## list_documents

List documents in the knowledge base.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `collection_id` | string | No | — | Filter by collection |
| `status` | string | No | — | Filter: pending, processing, completed, failed |
| `limit` | integer | No | 50 | Max results (1–500) |

**Response:** Bullet list of documents with filename, ID, status, and chunk count.

**Maps to:** `GET /api/documents`

---

## get_document

Get details about a specific document.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `document_id` | string | Yes | The document ID |

**Response:** Full JSON document object.

**Maps to:** `GET /api/documents/{doc_id}`

---

## list_entities

List entities in the knowledge graph.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `type` | string | No | — | Entity type: Person, Organization, Concept, Technology, Location, Event, Product, Document, System, Process |
| `limit` | integer | No | 50 | Max results (1–500) |

**Response:** Bullet list of entities with name, type, and description.

**Maps to:** `GET /api/graph/entities`

---

## get_entity

Get entity details including relationships.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | The entity name |

**Response:** Full JSON entity object with relationships array.

**Maps to:** `GET /api/graph/entity/{name}`

---

## list_collections

List all collections.

**Parameters:** None.

**Response:** Bullet list of collections with name, ID, description, and document count.

**Maps to:** `GET /api/collections`

---

## list_communities

List auto-detected entity communities.

**Parameters:** None.

**Response:** Bullet list of communities with title, entity count, and summary.

**Maps to:** `GET /api/graph/communities`

---

## get_stats

Get knowledge base statistics.

**Parameters:** None.

**Response:** Line-by-line counts: documents, chunks, entities, relationships, communities, collections.

**Maps to:** `GET /api/stats`
