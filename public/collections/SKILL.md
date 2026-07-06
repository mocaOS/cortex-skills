---
name: collections
description: Use this skill when organizing documents into collections in Cortex. Collections scope documents into independent knowledge graphs with isolated search indexes. Covers CRUD operations, document assignment, scoped search, scoped Ask AI, and resource limits.
---

# Collections — Organize Knowledge by Team, Project, or Use Case

## What You Probably Got Wrong

1. **Collections are not just folders.** Each collection has its own independent knowledge graph and search index. Entities extracted from documents in Collection A do not appear when querying Collection B.

2. **Documents can only belong to one collection at a time.** Use the move endpoint to transfer documents between collections. Moving a document re-scopes its entities.

3. **How you scope queries depends on the endpoint.** For `/api/ask` (and its streaming variants), pass `collection_id` as a top-level field in the request body. For `/api/search`, `collection_id` lives *inside* the `filters` object (`filters.collection_id`) — there is no top-level `collection_id` on the search request.

4. **The default collection is implicit.** Documents uploaded without a `collection_id` go into a default/uncategorized pool. They are searchable globally but not scoped to any collection.

5. **`MAX_COLLECTIONS` is an environment variable**, not an API setting. Set to 0 for unlimited.

## API Endpoints

### List all collections

```bash
curl "{BASE_URL}/api/collections" \
  -H "X-API-Key: {API_KEY}"
```

Response:
```json
{
  "collections": [
    {
      "id": "col_abc123",
      "name": "Q4 Reports",
      "description": "All quarterly reports for Q4 2025",
      "created_at": "2026-01-15T10:00:00Z",
      "document_count": 12,
      "entity_count": 245
    }
  ],
  "total": 1
}
```

### Create a collection

```bash
curl -X POST "{BASE_URL}/api/collections" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Engineering Docs",
    "description": "Technical documentation for the engineering team"
  }'
```

- `name`: 1-100 characters, required
- `description`: max 500 characters, optional

### Get collection details

```bash
curl "{BASE_URL}/api/collections/{collection_id}" \
  -H "X-API-Key: {API_KEY}"
```

Returns the collection with `document_count` and `entity_count` stats.

### Delete a collection

```bash
curl -X DELETE "{BASE_URL}/api/collections/{collection_id}" \
  -H "X-API-Key: {API_KEY}"
```

Deleting a collection removes the collection scope from its documents but does not delete the documents themselves.

### Add a document to a collection

```bash
curl -X POST "{BASE_URL}/api/collections/{collection_id}/documents/{document_id}" \
  -H "X-API-Key: {API_KEY}"
```

### Get collection entities

```bash
curl "{BASE_URL}/api/collections/{collection_id}/entities" \
  -H "X-API-Key: {API_KEY}"
```

Returns entities that were extracted from documents in this collection.

## Upload Directly to a Collection

Pass `collection_id` as a query parameter when uploading:

```bash
curl -X POST "{BASE_URL}/api/upload?collection_id={collection_id}" \
  -H "X-API-Key: {API_KEY}" \
  -F "file=@document.pdf"
```

## Search Within a Collection

Pass `collection_id` inside the `filters` object in the search request body (not as a top-level field):

```bash
curl -X POST "{BASE_URL}/api/search" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "deployment architecture",
    "top_k": 10,
    "filters": {"collection_id": "col_abc123"}
  }'
```

Only documents in the specified collection will be searched.

## Ask AI Within a Collection

Pass `collection_id` in the ask request body:

```bash
curl -X POST "{BASE_URL}/api/ask" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is our deployment process?",
    "use_graph": true,
    "collection_id": "col_abc123"
  }'
```

This works with all three ask endpoints: `/api/ask`, `/api/ask/stream`, and `/api/ask/stream/thinking`.

## Move Documents Between Collections

```bash
curl -X POST "{BASE_URL}/api/documents/move" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "document_ids": ["doc_1", "doc_2"],
    "target_collection_id": "col_def456"
  }'
```

## Common Patterns

### Multi-tenant isolation

Use one collection per customer/tenant:

```bash
# Create tenant collection
curl -X POST "{BASE_URL}/api/collections" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"name": "Tenant: Acme Corp", "description": "Acme Corp knowledge base"}'

# Upload to tenant collection
curl -X POST "{BASE_URL}/api/upload?collection_id={tenant_collection_id}" \
  -H "X-API-Key: {API_KEY}" \
  -F "file=@acme-docs.pdf"

# Query scoped to tenant
curl -X POST "{BASE_URL}/api/ask" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"question": "What is our SLA?", "collection_id": "{tenant_collection_id}"}'
```

### Team-based organization

```
Engineering Docs (col_eng)  →  Technical specs, architecture, runbooks
Sales Docs (col_sales)      →  Case studies, battlecards, pricing
HR Docs (col_hr)            →  Policies, handbooks, onboarding
```

## Configuration

```bash
ENABLE_COLLECTIONS=true          # Enable collection feature
DEFAULT_COLLECTION=default       # Default collection name
MAX_COLLECTIONS=0                # Limit (0 = unlimited)
```

## Skill Files

| File | Description |
|------|-------------|
| [references/API.md](references/API.md) | Complete API endpoint reference |

## Resources

- [Collections Documentation](https://docs.cortex.eco/features/collections)
- [API Reference](https://docs.cortex.eco/api)
