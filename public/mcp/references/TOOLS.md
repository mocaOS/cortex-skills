# MCP Tools Reference

Detailed parameter schemas, response formats, and REST endpoint mappings for each Cortex MCP tool. Source: [`mcp-server/src/index.ts`](https://github.com/mocaOS/cortex-skills/blob/main/mcp-server/src/index.ts).

## search_knowledge

Hybrid search combining vector similarity, keyword/BM25, and metadata matches, merged with Reciprocal Rank Fusion.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `query` | string | Yes | — | Search query |
| `top_k` | integer | No | 10 | Results to return (1–50) |
| `collection_id` | string | No | — | Scope to a collection |

**Response:** Numbered list of matching chunks with filename, document ID, score, and content.

**Maps to:** `POST /api/search` — `collection_id` is sent as `filters.collection_id`; the API returns a `{query, results, total_results}` envelope.

---

## ask_question

RAG-powered Q&A using the knowledge graph and document chunks.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `question` | string | Yes | — | The question to ask |
| `mode` | `"chat"` \| `"deep_research"` | No | `chat` | `chat`: fast single-pass answer (seconds). `deep_research`: agentic researcher/writer pipeline (minutes) |
| `use_graph` | boolean | No | true | Include knowledge graph context (chat mode) |
| `collection_id` | string | No | — | Scope to a collection |
| `top_k` | integer | No | 5 | Chunks retrieved per search (1–20) |

**Response:** Answer text with a source list (filenames + document IDs + scores), graph-context entity summary, and — in deep research mode — the researched sub-questions.

**Maps to:** `chat` → `POST /api/ask` (`use_agentic: false`). `deep_research` → `POST /api/ask/stream` with `use_agentic: true`, aggregated server-side from the SSE stream (the non-streaming endpoint rejects agentic requests with `400 agentic_requires_streaming`).

---

## list_documents

List documents in the knowledge base.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `collection_id` | string | No | — | Filter by collection |
| `status` | string | No | — | Filter: `pending`, `processing`, `extracting`, `completed`, `failed` |
| `limit` | integer | No | 50 | Max results (1–500) |

**Response:** Bullet list with filename, ID, processing status, chunk count, and collection name. Notes how many of the total matches are shown.

**Maps to:** `GET /api/documents` — the endpoint takes no query parameters and returns everything visible to the key (`{documents, total}`); filtering and limiting happen client-side in the MCP server.

---

## get_document

Get details about a specific document.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `document_id` | string | Yes | The document ID |

**Response:** Full JSON document object (status, chunk/entity counts, collection, source, progress fields).

**Maps to:** `GET /api/documents/{document_id}`

---

## get_document_content

Read a document's full extracted text (all chunks concatenated).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `document_id` | string | Yes | The document ID |

**Response:** Markdown header (filename, status, chunk count) followed by the document's `full_content`.

**Maps to:** `GET /api/documents/{document_id}/content`

---

## list_entities

List entities in the knowledge graph with pagination and search.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `entity_type` | string | No | — | Entity type, e.g. Person, Organization, Concept, Technology, Location, Event, Product, System, Process |
| `search` | string | No | — | Search in entity names and descriptions |
| `limit` | integer | No | 50 | Max results (1–1000) |
| `skip` | integer | No | 0 | Pagination offset |

**Response:** Bullet list of entities with name, type, mention count, and description.

**Maps to:** `GET /api/graph/entities?entity_type=&search=&limit=&skip=` → `{entities, total}`

---

## get_entity

Get entity details including relationships. Requires the exact entity name — use `search_entities` to resolve it first.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | string | Yes | — | The exact entity name |
| `max_hops` | integer | No | 1 | Graph traversal depth (1–3) |

**Response:** JSON object with `entities` and `relationships` arrays from graph traversal.

**Maps to:** `GET /api/graph/entity/{name}?max_hops=`

---

## search_entities

Fuzzy-search entities by name.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Entity name or partial name |

**Response:** JSON array of matching entities with name, type, description, score, and connection count.

**Maps to:** `GET /api/graph/search?query=`

---

## list_collections

List all collections.

**Parameters:** None.

**Response:** Bullet list of collections with name, ID, description, and document count.

**Maps to:** `GET /api/collections` → `{collections, total}`

---

## list_communities

List auto-detected entity communities.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `search` | string | No | — | Search in community names, summaries, and member entities |
| `limit` | integer | No | 50 | Max results (1–1000) |

**Response:** Bullet list of communities with name, entity count, and summary.

**Maps to:** `GET /api/graph/communities?search=&limit=` → `{communities, total}`

---

## upload_document

Upload a local file into the knowledge base. **Requires an API key with `manage` permission** (`cortex_rw_...`).

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `file_path` | string | Yes | — | Absolute path to the file on the machine running the MCP server |
| `collection_id` | string | No | default | Target collection |
| `start_processing` | boolean | No | true | Start chunking/embedding/extraction immediately; set false for bulk uploads |

**Response:** Confirmation with filename, document ID, and status.

**Maps to:** `POST /api/upload?collection_id=&start_processing=` (multipart form)

---

## get_stats

Get knowledge base statistics.

**Parameters:** None.

**Response:** Document counts broken down by status, plus chunks, entities, relationships, communities, collections, and — when a quota is configured — monthly LLM-completion usage.

**Maps to:** `GET /api/stats`

---

## Resources

| URI | Maps to | Description |
|-----|---------|-------------|
| `cortex://stats` | `GET /api/stats` | Full statistics JSON |
| `cortex://health` | `GET /health` | `{status, neo4j_connected, schema_initialized, version}` |
