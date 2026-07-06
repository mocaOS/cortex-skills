# Admin API Reference

Complete endpoint reference for instance management, AgentSkills, export/import, and system operations.

All endpoints require authentication via `X-API-Key: {API_KEY}` header. Most admin endpoints require the root **admin API key** (the `ADMIN_API_KEY` env value) unless noted — this is a distinct credential, not a `read`/`manage` permission tier.

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

**There is no `POST /api/admin/login` or `POST /api/admin/logout` HTTP endpoint** — you cannot `curl` a login.

Web-UI login is a **Next.js server action** (`frontend/src/lib/auth.ts`, `"use server"`), not an API route. It validates the submitted email/password against the `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars in the frontend layer, sets an HTTP-only session cookie (via the Next.js session layer, not the FastAPI backend), and returns the `ADMIN_API_KEY` value for the client to store. Logout clears the cookie through the same layer.

**For programmatic/API access, skip login** and pass the `ADMIN_API_KEY` value directly as the `X-API-Key` header.

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

Selectively delete data from the system. Granular — each flag controls a data category independently; there is no `confirm` field.

**Request body:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `delete_documents` | `boolean` | `true` | Delete all documents, chunks, entities, relationships, communities, merge history, and system metadata. |
| `delete_uploaded_files` | `boolean` | `true` | Delete uploaded files from disk. |
| `delete_custom_inputs` | `boolean` | `true` | Delete custom input entries (Q&A, text, markdown). |
| `delete_collections` | `boolean` | `true` | Delete all non-default collections. |
| `delete_api_keys` | `boolean` | `false` | Delete all non-admin API keys. The admin key (from env var) is preserved. |

```json
{
  "delete_documents": true,
  "delete_uploaded_files": true,
  "delete_custom_inputs": true,
  "delete_collections": true,
  "delete_api_keys": false
}
```

**Response:** confirms completion and reports per-category deletion counts.

---

## System Configuration

### GET /api/admin/config

Returns the active configuration (environment variables) with sensitive values masked.
