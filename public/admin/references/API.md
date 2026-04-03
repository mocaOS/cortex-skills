# Admin API Reference

Complete endpoint reference for instance management, AgentSkills, export/import, and system operations.

All endpoints require authentication via `X-API-Key: {API_KEY}` header. Most admin endpoints require `admin` permission unless noted.

---

## System Statistics

### GET /api/stats

**Permission:** `read`

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
| `document_count` | integer | Total documents |
| `chunk_count` | integer | Total text chunks |
| `entity_count` | integer | Total entity nodes |
| `relationship_count` | integer | Cross-document relationships (Phase B) |
| `per_chunk_relationship_count` | integer | Per-chunk relationships (Phase A) |
| `community_count` | integer | Detected communities |
| `collection_count` | integer | Collections |

---

## Admin Session Auth

### POST /api/admin/login

**Permission:** None (unauthenticated)

Authenticate as admin for the web UI.

**Request body:**

```json
{
  "email": "admin@example.com",
  "password": "your-password"
}
```

Credentials validated against `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables.

**Response:** Sets an HTTP-only JWT cookie.

### POST /api/admin/logout

**Permission:** Authenticated session

Clears the session cookie.

---

## AgentSkills

### GET /api/admin/skills

List all installed skills with metadata, enabled status, and tool counts.

### GET /api/admin/skills/{id}

Get full details for a single skill including its instructions and tool definitions.

### POST /api/admin/skills/install

Install a skill from a URL.

**Request body:**

```json
{
  "url": "https://skills.sh/weather/SKILL.md"
}
```

### PATCH /api/admin/skills/{id}

Enable or disable a skill.

**Request body:**

```json
{
  "enabled": false
}
```

### DELETE /api/admin/skills/{id}

Uninstall a skill and remove its directory.

### POST /api/admin/skills/discover

Rescan the skills directory for new or changed skills.

### POST /api/admin/skills/{id}/analyze

Use LLM to analyze the skill's SKILL.md and extract configuration requirements.

### GET /api/admin/skills/{id}/config

Get the configuration schema for a skill.

### PUT /api/admin/skills/{id}/config

Save configuration values for a skill (API keys, base URLs, etc.).

**Request body:**

```json
{
  "api_key": "sk-...",
  "base_url": "https://api.example.com"
}
```

### GET /api/admin/skills/registry/search

Search the skills.sh registry for available skills.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query |

---

## Export / Import

### POST /api/admin/export

Export the full instance as a ZIP64 archive. Response is streamed as `application/zip`.

The archive contains:
- `manifest.json` with version, export date, embedding model, and stats
- NDJSON data files for all graph components
- `files/` directory with original uploaded documents

### POST /api/admin/import

Import an instance from a ZIP archive.

**Request:** `multipart/form-data` with file field.

The system validates:
- Manifest version compatibility
- Embedding model match (dimension mismatch would corrupt vector search)
- Data integrity

---

## System Reset

### POST /api/admin/reset

Full system reset. Removes all documents, chunks, entities, relationships, communities, merge history, and system metadata.

**Request body:**

```json
{
  "confirm": true
}
```

**Response:**

```json
{
  "message": "System reset complete",
  "deleted": {
    "documents": 156,
    "chunks": 4280,
    "entities": 1542,
    "relationships": 3891,
    "communities": 23
  }
}
```

---

## System Configuration

### GET /api/admin/config

Returns the active configuration (environment variables) with sensitive values masked.
