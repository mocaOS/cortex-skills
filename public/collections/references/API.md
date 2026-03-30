# Collections API Reference

Complete API reference for all Collections endpoints. For conceptual overview, common patterns, and quick-start examples, see the [SKILL.md](../SKILL.md).

## Authentication

All endpoints require the `X-API-Key` header:

```
X-API-Key: your-api-key
```

---

## Endpoints Overview

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| `GET` | `/api/collections` | `read` | List all collections |
| `POST` | `/api/collections` | `write` | Create a collection |
| `GET` | `/api/collections/{collection_id}` | `read` | Get collection details |
| `PUT` | `/api/collections/{collection_id}` | `write` | Update a collection |
| `DELETE` | `/api/collections/{collection_id}` | `delete` | Delete a collection |
| `POST` | `/api/collections/{collection_id}/documents/{document_id}` | `write` | Add a document to a collection |
| `GET` | `/api/collections/{collection_id}/entities` | `read` | Get entities in a collection |
| `GET` | `/api/graph/visualization?collection_id={id}` | `read` | Get collection knowledge graph |
| `POST` | `/api/documents/move` | `write` | Move documents between collections |
| `GET` | `/api/documents?collection_id={id}` | `read` | List documents in a collection |
| `POST` | `/api/upload?collection_id={id}` | `write` | Upload directly to a collection |

---

## List Collections

```
GET /api/collections
```

Returns all collections with document and entity counts.

### Request

```bash
curl "http://localhost:8000/api/collections" \
  -H "X-API-Key: your-api-key"
```

### Response -- `200 OK`

```json
{
  "collections": [
    {
      "id": "coll_abc123",
      "name": "Research Papers",
      "document_count": 45,
      "entity_count": 892
    },
    {
      "id": "default",
      "name": "default",
      "document_count": 12,
      "entity_count": 156
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique collection identifier |
| `name` | `string` | Display name |
| `document_count` | `integer` | Number of documents in the collection |
| `entity_count` | `integer` | Number of extracted entities |

---

## Create a Collection

```
POST /api/collections
```

### Request Body

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `name` | `string` | Yes | 1--100 characters | Collection display name |
| `description` | `string` | No | Max 500 characters | Optional description |

```bash
curl -X POST "http://localhost:8000/api/collections" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Research Papers",
    "description": "Academic papers on AI and ML"
  }'
```

### Response -- `200 OK`

```json
{
  "id": "coll_abc123",
  "name": "Research Papers",
  "description": "Academic papers on AI and ML",
  "document_count": 0,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Errors

| Status | Condition |
|--------|-----------|
| `403 Forbidden` | `MAX_COLLECTIONS` limit exceeded |
| `422 Unprocessable Entity` | Missing `name` or constraint violation |

---

## Get Collection Details

```
GET /api/collections/{collection_id}
```

Returns full details including chunk counts, relationship counts, and size.

```bash
curl "http://localhost:8000/api/collections/coll_abc123" \
  -H "X-API-Key: your-api-key"
```

### Response -- `200 OK`

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

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Collection identifier |
| `name` | `string` | Display name |
| `description` | `string` | Description text |
| `document_count` | `integer` | Number of documents |
| `chunk_count` | `integer` | Total text chunks across all documents |
| `entity_count` | `integer` | Extracted entity count |
| `relationship_count` | `integer` | Discovered relationship count |
| `total_size_bytes` | `integer` | Total storage size in bytes |
| `created_at` | `string` | ISO 8601 creation timestamp |
| `updated_at` | `string` | ISO 8601 last-modified timestamp |

### Errors

| Status | Condition |
|--------|-----------|
| `404 Not Found` | Collection does not exist |

---

## Update a Collection

```
PUT /api/collections/{collection_id}
```

Rename a collection or update its description. Both fields are optional; only provided fields are changed.

### Request Body

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `name` | `string` | No | 1--100 characters | New display name |
| `description` | `string` | No | Max 500 characters | New description |

```bash
curl -X PUT "http://localhost:8000/api/collections/coll_abc123" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AI Research Papers",
    "description": "Updated description"
  }'
```

### Response -- `200 OK`

```json
{
  "id": "coll_abc123",
  "name": "AI Research Papers",
  "description": "Updated description",
  "document_count": 45,
  "entity_count": 892
}
```

### Errors

| Status | Condition |
|--------|-----------|
| `404 Not Found` | Collection does not exist |
| `422 Unprocessable Entity` | Constraint violation |

> The default collection cannot be renamed.

---

## Delete a Collection

```
DELETE /api/collections/{collection_id}
```

Deletes the collection and all documents and entities within it.

```bash
curl -X DELETE "http://localhost:8000/api/collections/coll_abc123" \
  -H "X-API-Key: your-api-key"
```

### Response -- `200 OK`

```json
{
  "message": "Collection deleted"
}
```

### Errors

| Status | Condition |
|--------|-----------|
| `404 Not Found` | Collection does not exist |

---

## Document Management

### Upload Directly to a Collection

```
POST /api/upload?collection_id={collection_id}
```

The `collection_id` and `start_processing` are **query parameters**, not form fields.

```bash
curl -X POST "http://localhost:8000/api/upload?collection_id=coll_abc123&start_processing=true" \
  -H "X-API-Key: your-api-key" \
  -F "file=@document.pdf"
```

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `collection_id` | `string` | none | Target collection (omit for default) |
| `start_processing` | `boolean` | `true` | Begin processing immediately |

### Add Existing Document to a Collection

```
POST /api/collections/{collection_id}/documents/{document_id}
```

Assigns an already-uploaded document to the specified collection.

```bash
curl -X POST "http://localhost:8000/api/collections/coll_abc123/documents/doc_xyz789" \
  -H "X-API-Key: your-api-key"
```

> Documents can only belong to one collection at a time. Adding a document to a new collection removes it from its previous collection.

### List Documents in a Collection

```
GET /api/documents?collection_id={collection_id}
```

```bash
curl "http://localhost:8000/api/documents?collection_id=coll_abc123" \
  -H "X-API-Key: your-api-key"
```

### Move Documents Between Collections

```
POST /api/documents/move
```

Moves one or more documents to a target collection. Re-scopes their entities to the new collection's knowledge graph.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `document_ids` | `string[]` | Yes | Array of document IDs to move |
| `target_collection_id` | `string` | Yes | Destination collection ID |

```bash
curl -X POST "http://localhost:8000/api/documents/move" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "document_ids": ["doc_1", "doc_2"],
    "target_collection_id": "coll_def456"
  }'
```

---

## Collection Entities

### Get Entities in a Collection

```
GET /api/collections/{collection_id}/entities
```

Returns entities that were extracted from documents in this collection.

```bash
curl "http://localhost:8000/api/collections/coll_abc123/entities" \
  -H "X-API-Key: your-api-key"
```

### Get Collection Knowledge Graph

```
GET /api/graph/visualization?collection_id={collection_id}
```

Returns the graph visualization data scoped to a specific collection.

```bash
curl "http://localhost:8000/api/graph/visualization?collection_id=coll_abc123" \
  -H "X-API-Key: your-api-key"
```

---

## Collection-Scoped Search

```
POST /api/search
```

Pass `collection_id` in the **request body** (not as a URL parameter) to restrict search to a single collection. When omitted, all collections are searched.

```bash
curl -X POST "http://localhost:8000/api/search" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "transformer architecture",
    "collection_id": "coll_abc123",
    "limit": 10,
    "search_type": "hybrid"
  }'
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | `string` | **required** | Search query |
| `limit` | `integer` | `10` | Max results |
| `collection_id` | `string \| null` | `null` | Scope to collection |
| `search_type` | `string` | `"hybrid"` | One of: `hybrid`, `vector`, `keyword`, `graph` |

When `collection_id` is provided, vector search, keyword search, and graph traversal are all filtered to that collection's data.

---

## Collection-Scoped Ask AI

Pass `collection_id` in the **request body** to scope Ask AI queries. This works with all three ask endpoints.

```bash
# Non-streaming
curl -X POST "http://localhost:8000/api/ask" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are the common themes in these papers?",
    "collection_id": "coll_abc123"
  }'

# Streaming
curl -X POST "http://localhost:8000/api/ask/stream" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Summarize the key findings",
    "collection_id": "coll_abc123"
  }' --no-buffer

# Streaming with thinking
curl -X POST "http://localhost:8000/api/ask/stream/thinking" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Compare the methodologies",
    "collection_id": "coll_abc123",
    "use_agentic": true
  }' --no-buffer
```

Collection scoping works identically in both Chat and Deep Research modes. When `collection_id` is omitted (or `null`), all collections are searched.

---

## Error Responses

### Authentication Errors

**Missing API Key** -- `401 Unauthorized`

```json
{
  "detail": "API key required. Provide X-API-Key header or api_key query parameter."
}
```

**Invalid API Key** -- `401 Unauthorized`

```json
{
  "detail": "Invalid API key"
}
```

**Expired API Key** -- `401 Unauthorized`

```json
{
  "detail": "API key has expired"
}
```

**Insufficient Permissions** -- `403 Forbidden`

```json
{
  "detail": "Permission 'write' required for this operation"
}
```

### Resource Errors

**Collection Not Found** -- `404 Not Found`

```json
{
  "detail": "Collection not found"
}
```

**Collection Limit Exceeded** -- `403 Forbidden`

Returned when `MAX_COLLECTIONS` is set and the limit is reached.

```json
{
  "detail": "Collection limit exceeded"
}
```

**Validation Error** -- `422 Unprocessable Entity`

```json
{
  "detail": [
    {
      "loc": ["body", "name"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

**Concurrent Operation** -- `409 Conflict`

Returned when a conflicting operation is already in progress (e.g., concurrent import/export).

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_COLLECTIONS` | `true` | Enable the collections feature |
| `DEFAULT_COLLECTION` | `default` | Name for the default collection |
| `MAX_COLLECTIONS` | `0` | Maximum allowed collections (0 = unlimited) |

---

## Python Client Example

```python
import requests
from typing import Optional, List, Dict, Any

class CollectionsClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        })

    def list_collections(self) -> List[Dict[str, Any]]:
        r = self.session.get(f"{self.base_url}/api/collections")
        r.raise_for_status()
        return r.json()

    def create_collection(
        self, name: str, description: Optional[str] = None
    ) -> Dict[str, Any]:
        payload = {"name": name}
        if description:
            payload["description"] = description
        r = self.session.post(f"{self.base_url}/api/collections", json=payload)
        r.raise_for_status()
        return r.json()

    def get_collection(self, collection_id: str) -> Dict[str, Any]:
        r = self.session.get(f"{self.base_url}/api/collections/{collection_id}")
        r.raise_for_status()
        return r.json()

    def update_collection(
        self,
        collection_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload = {}
        if name is not None:
            payload["name"] = name
        if description is not None:
            payload["description"] = description
        r = self.session.put(
            f"{self.base_url}/api/collections/{collection_id}", json=payload
        )
        r.raise_for_status()
        return r.json()

    def delete_collection(self, collection_id: str) -> Dict[str, Any]:
        r = self.session.delete(f"{self.base_url}/api/collections/{collection_id}")
        r.raise_for_status()
        return r.json()

    def add_document(self, collection_id: str, document_id: str) -> Dict[str, Any]:
        r = self.session.post(
            f"{self.base_url}/api/collections/{collection_id}/documents/{document_id}"
        )
        r.raise_for_status()
        return r.json()

    def move_documents(
        self, document_ids: List[str], target_collection_id: str
    ) -> Dict[str, Any]:
        r = self.session.post(
            f"{self.base_url}/api/documents/move",
            json={
                "document_ids": document_ids,
                "target_collection_id": target_collection_id,
            },
        )
        r.raise_for_status()
        return r.json()

    def list_documents(self, collection_id: str) -> List[Dict[str, Any]]:
        r = self.session.get(
            f"{self.base_url}/api/documents",
            params={"collection_id": collection_id},
        )
        r.raise_for_status()
        return r.json()

    def upload_to_collection(
        self, collection_id: str, file_path: str
    ) -> Dict[str, Any]:
        from pathlib import Path

        path = Path(file_path)
        with open(path, "rb") as f:
            r = requests.post(
                f"{self.base_url}/api/upload",
                params={"collection_id": collection_id, "start_processing": "true"},
                headers={"X-API-Key": self.session.headers["X-API-Key"]},
                files={"file": (path.name, f, "application/octet-stream")},
            )
        r.raise_for_status()
        return r.json()

    def get_entities(self, collection_id: str) -> List[Dict[str, Any]]:
        r = self.session.get(
            f"{self.base_url}/api/collections/{collection_id}/entities"
        )
        r.raise_for_status()
        return r.json()

    def search_in_collection(
        self, collection_id: str, query: str, limit: int = 10
    ) -> Dict[str, Any]:
        r = self.session.post(
            f"{self.base_url}/api/search",
            json={"query": query, "collection_id": collection_id, "limit": limit},
        )
        r.raise_for_status()
        return r.json()

    def ask_in_collection(
        self, collection_id: str, question: str, **kwargs
    ) -> Dict[str, Any]:
        payload = {"question": question, "collection_id": collection_id, **kwargs}
        r = self.session.post(f"{self.base_url}/api/ask", json=payload)
        r.raise_for_status()
        return r.json()
```

### Usage

```python
client = CollectionsClient("http://localhost:8000", "your-api-key")

# Create
col = client.create_collection("Research Papers", "Academic papers on AI")
print(col["id"])

# Upload
client.upload_to_collection(col["id"], "paper.pdf")

# Search within collection
results = client.search_in_collection(col["id"], "transformer architecture")

# Ask within collection
answer = client.ask_in_collection(col["id"], "What are the key findings?")
print(answer["answer"])

# Move documents
client.move_documents(["doc_1", "doc_2"], col["id"])

# Update
client.update_collection(col["id"], name="AI Research Papers")

# Clean up
client.delete_collection(col["id"])
```

---

## JavaScript Example

```javascript
const BASE_URL = "http://localhost:8000";
const API_KEY = "your-api-key";

const headers = {
  "X-API-Key": API_KEY,
  "Content-Type": "application/json",
};

// List collections
const collections = await fetch(`${BASE_URL}/api/collections`, { headers }).then(
  (r) => r.json()
);

// Create collection
const newCol = await fetch(`${BASE_URL}/api/collections`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    name: "Research Papers",
    description: "Academic papers on AI",
  }),
}).then((r) => r.json());

// Get details
const details = await fetch(
  `${BASE_URL}/api/collections/${newCol.id}`,
  { headers }
).then((r) => r.json());

// Update
await fetch(`${BASE_URL}/api/collections/${newCol.id}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ name: "AI Research Papers" }),
});

// Search within collection
const results = await fetch(`${BASE_URL}/api/search`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    query: "transformer architecture",
    collection_id: newCol.id,
    limit: 10,
  }),
}).then((r) => r.json());

// Ask within collection
const answer = await fetch(`${BASE_URL}/api/ask`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    question: "What are the key findings?",
    collection_id: newCol.id,
  }),
}).then((r) => r.json());

// Move documents
await fetch(`${BASE_URL}/api/documents/move`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    document_ids: ["doc_1", "doc_2"],
    target_collection_id: newCol.id,
  }),
});

// Delete
await fetch(`${BASE_URL}/api/collections/${newCol.id}`, {
  method: "DELETE",
  headers,
});
```

---

## Permissions

| Endpoint | Required Permission |
|----------|---------------------|
| `GET /api/collections` | `read` |
| `POST /api/collections` | `write` |
| `GET /api/collections/{id}` | `read` |
| `PUT /api/collections/{id}` | `write` |
| `DELETE /api/collections/{id}` | `delete` |
| `POST /api/collections/{id}/documents/{doc_id}` | `write` |
| `GET /api/collections/{id}/entities` | `read` |
| `POST /api/documents/move` | `write` |
| `POST /api/upload?collection_id={id}` | `write` |
| `POST /api/search` (with `collection_id`) | `read` |
| `POST /api/ask` (with `collection_id`) | `read` |
