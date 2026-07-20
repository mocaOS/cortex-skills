# Auth API Reference

Full API endpoint reference for Cortex authentication, API key management, session auth, and admin operations. Includes request/response schemas, error codes, and curl examples.

This file complements the main `auth/SKILL.md` which covers the authentication pattern, the read/manage permission model, prompt injection protection, and security best practices. Refer here for exhaustive endpoint specifications.

---

## Authentication Header

All endpoints (except `GET /health`) require the `X-API-Key` header:

```
X-API-Key: {your_api_key}
```

Keys carry a `permissions` array holding any combination of exactly two values — `read` and `manage`. The prefix reflects the level at creation time — `cortex_ro_` for read-only keys, `cortex_rw_` when permissions include `manage`:

| Prefix | Key type | Created via |
|--------|----------|-------------|
| `cortex_ro_` | User key (read-only) | `POST /api/admin/api-keys` (`permissions: ["read"]`) |
| `cortex_rw_` | User key (read-write) | `POST /api/admin/api-keys` (permissions include `manage`) |
| `cortex_admin_` | Admin key | `ADMIN_API_KEY` env var at startup |

| Permission | Access Level |
|------------|-------------|
| `read` | Ask AI, search, list documents, stats, view graph, list collections |
| `manage` | Everything in read, plus upload, edit, move, reprocess, and delete documents & collections |

There is no `write`, `delete`, or `admin` permission value. Full-instance operations (API-key CRUD, system reset, config changes, skill management) are gated on the **root admin API key** — the `ADMIN_API_KEY` env value — not on a permission. Keys are also scoped by `collection_scope` (`all` or `restricted` + `allowed_collections`).

Authenticate with either `X-API-Key: {key}` or `Authorization: Bearer {key}`. (Older builds used a `moca_` prefix.)

---

## API Key Management Endpoints

All key management endpoints require the **root admin API key** (the `ADMIN_API_KEY` env value), not a `read`/`manage` permission.

### Create API Key

```
POST /api/admin/api-keys
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Human-readable name for the key. |
| `permissions` | `string[]` | Yes | Array of permission strings. Valid values: `"read"`, `"manage"`. |
| `expires_at` | `string` (ISO 8601) | No | Expiration datetime. Key becomes invalid after this time. |

**Example Request:**

```bash
curl -X POST "$CORTEX_URL/api/admin/api-keys" \
  -H "X-API-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production App",
    "permissions": ["read", "manage"],
    "expires_at": "2026-12-31T23:59:59Z"
  }'
```

**Response `201 Created`:**

```json
{
  "id": "key_abc123",
  "name": "Production App",
  "key": "cortex_rw_a1b2c3d4e5f6g7h8i9j0...",
  "key_prefix": "cortex_rw_a1b2",
  "permissions": ["read", "manage"],
  "is_active": true,
  "created_at": "2026-03-15T10:00:00Z",
  "expires_at": "2026-12-31T23:59:59Z"
}
```

**Important:** The `key` field is only returned once at creation time. Keys are SHA-256 hashed before storage in Neo4j. You cannot retrieve the raw key after this response.

---

### List API Keys

```
GET /api/admin/api-keys
```

Returns all API keys (without raw key values).

**Example Request:**

```bash
curl "$CORTEX_URL/api/admin/api-keys" \
  -H "X-API-Key: $ADMIN_KEY"
```

**Response `200 OK`:**

```json
[
  {
    "id": "key_abc123",
    "name": "Production App",
    "key_prefix": "cortex_rw_a1b2",
    "permissions": ["read", "manage"],
    "is_active": true,
    "created_at": "2026-03-15T10:00:00Z",
    "last_used_at": "2026-03-28T14:30:00Z",
    "expires_at": "2026-12-31T23:59:59Z"
  }
]
```

---

### Get API Key Details

```
GET /api/admin/api-keys/{key_id}
```

Returns detailed information for a single key, including usage statistics.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `key_id` | `string` | The key identifier (e.g., `key_abc123`). |

**Example Request:**

```bash
curl "$CORTEX_URL/api/admin/api-keys/key_abc123" \
  -H "X-API-Key: $ADMIN_KEY"
```

**Response `200 OK`:**

```json
{
  "id": "key_abc123",
  "name": "Production App",
  "key_prefix": "cortex_rw_a1b2",
  "permissions": ["read", "manage"],
  "is_active": true,
  "created_at": "2026-03-15T10:00:00Z",
  "last_used_at": "2026-03-28T14:30:00Z",
  "expires_at": "2026-12-31T23:59:59Z",
  "usage_stats": {
    "total_requests": 1542,
    "by_category": {
      "ask": 890,
      "search": 412,
      "documents": 156,
      "graph": 52,
      "collections": 32
    }
  }
}
```

---

### Update API Key

```
PATCH /api/admin/api-keys/{key_id}
```

Update a key's name, permissions, or expiration. Partial updates supported.

**Request Body (all fields optional):**

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | New display name. |
| `permissions` | `string[]` | New permission set. Replaces existing permissions entirely. |
| `expires_at` | `string` (ISO 8601) | New expiration datetime. |

**Example Request:**

```bash
curl -X PATCH "$CORTEX_URL/api/admin/api-keys/key_abc123" \
  -H "X-API-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Renamed Key",
    "permissions": ["read", "manage"]
  }'
```

**Response `200 OK`:**

```json
{
  "id": "key_abc123",
  "name": "Renamed Key",
  "permissions": ["read", "manage"],
  "is_active": true
}
```

---

### Revoke API Key

```
POST /api/admin/api-keys/{key_id}/revoke
```

Deactivates a key. The key remains in the database but can no longer authenticate requests.

**Example Request:**

```bash
curl -X POST "$CORTEX_URL/api/admin/api-keys/key_abc123/revoke" \
  -H "X-API-Key: $ADMIN_KEY"
```

**Response `200 OK`:**

```json
{
  "id": "key_abc123",
  "is_active": false,
  "message": "API key revoked"
}
```

---

### Activate API Key

```
POST /api/admin/api-keys/{key_id}/activate
```

Re-activates a previously revoked key.

**Example Request:**

```bash
curl -X POST "$CORTEX_URL/api/admin/api-keys/key_abc123/activate" \
  -H "X-API-Key: $ADMIN_KEY"
```

**Response `200 OK`:**

```json
{
  "id": "key_abc123",
  "is_active": true,
  "message": "API key activated"
}
```

---

### Delete API Key

```
DELETE /api/admin/api-keys/{key_id}
```

Permanently removes a key from the database. This action is irreversible.

**Example Request:**

```bash
curl -X DELETE "$CORTEX_URL/api/admin/api-keys/key_abc123" \
  -H "X-API-Key: $ADMIN_KEY"
```

**Response `200 OK`:**

```json
{
  "message": "API key deleted"
}
```

---

## Frontend Session Authentication

Separate from API key auth. Used by the Next.js web UI for human users.

**There is no `POST /api/auth/login` (or `/api/admin/login`) HTTP endpoint** — you cannot `curl` a login. Login is a **Next.js server action** (`frontend/src/lib/auth.ts`, `"use server"`), not an API route:

- The action validates the submitted `email` / `password` against the `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars in the frontend layer. If either is missing in the frontend container, login answers "Admin authentication not configured" — there is no silent `admin@example.com` fallback.
- On success it sets an HTTP-only session cookie (set by the Next.js session layer, **not** the FastAPI backend) and returns the `ADMIN_API_KEY` value to the client for subsequent API calls.
- The cookie carries the `Secure` flag by default in production builds; over plain HTTP browsers silently drop it (login bounces back to `/login` with no error). `SESSION_COOKIE_SECURE=false` (runtime env var) disables the flag for TLS-less setups.
- Logout clears that cookie through the same server-action layer.

**Session Details:**
- The session cookie is set/cleared by the Next.js session layer, not the API.
- Session secret is derived from the `SESSION_SECRET` env var (must be 32+ characters).
- Frontend routes (except `/login`) are protected by `proxy.ts`.
- Sessions are not related to API keys — API keys are for programmatic access, the session is for the web UI.

**Programmatic access:** skip login entirely. Pass the `ADMIN_API_KEY` value as the `X-API-Key` header on `/api/*` requests.

---

## Admin Endpoints

### View System Configuration

```
GET /api/admin/config
```

Returns the current system configuration (env var values, active features). Admin only.

**Example Request:**

```bash
curl "$CORTEX_URL/api/admin/config" \
  -H "X-API-Key: $ADMIN_KEY"
```

`PATCH /api/admin/config` updates the admin-editable runtime toggles (`prompt_guard`, plus `ingestion_injection_scan` when the experimental ingestion scan is enabled via `ENABLE_INGESTION_INJECTION_SCAN=true`; otherwise that field is rejected with `400`) without a restart — covered in depth in the [Admin skill](../../admin/SKILL.md).

---

### System Reset

```
POST /api/admin/reset
```

Selectively delete data from the system. Admin only.

**Request Body:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `delete_documents` | `boolean` | `false` | Delete all documents and their chunks, entities, relationships, communities, merge history, and system metadata. |
| `delete_uploaded_files` | `boolean` | `false` | Delete uploaded files from disk. |
| `delete_custom_inputs` | `boolean` | `false` | Delete custom input entries (Q&A, text, markdown). |
| `delete_collections` | `boolean` | `false` | Delete all collections. |
| `delete_api_keys` | `boolean` | `false` | Delete all non-admin API keys. The admin key (from env var) is preserved. |

**Example Request:**

```bash
curl -X POST "$CORTEX_URL/api/admin/reset" \
  -H "X-API-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "delete_documents": true,
    "delete_uploaded_files": true,
    "delete_custom_inputs": true,
    "delete_collections": true,
    "delete_api_keys": false
  }'
```

---

### Skill Management (Admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/skills` | List all installed agent skills. |
| `POST` | `/api/admin/skills/install` | Install a skill from a URL or the skills.sh registry. |
| `PATCH` | `/api/admin/skills/{id}` | Enable or disable a skill. |
| `DELETE` | `/api/admin/skills/{id}` | Uninstall a skill. |
| `GET` | `/api/admin/skills/registry/search?q={query}` | Search the skills.sh registry. |

---

## Permission Requirements by Endpoint

### Read Permission (`read`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (no auth required). |
| `GET` | `/api/stats` | System statistics. |
| `POST` | `/api/search` | Hybrid search. |
| `POST` | `/api/ask/stream` | Ask AI (streaming SSE). |
| `GET` | `/api/documents` | List documents. |
| `GET` | `/api/documents/{id}` | Get document details. |
| `GET` | `/api/documents/{id}/file` | Download original file. |
| `GET` | `/api/collections` | List collections. |
| `GET` | `/api/collections/{id}` | Get collection details. |
| `GET` | `/api/graph/visualization` | Graph visualization data. |
| `GET` | `/api/graph/entities` | Search/list entities. |
| `GET` | `/api/graph/entities/{id}` | Entity details. |
| `GET` | `/api/graph/entities/{id}/relationships` | Entity relationships. |
| `POST` | `/api/graph/subgraph` | Query subgraph. |
| `GET` | `/api/graph/communities` | List communities. |
| `GET` | `/api/graph/communities/{id}` | Community details. |
| `GET` | `/api/entities/duplicates` | Find duplicate entity candidates. |
| `GET` | `/api/entities/merge-history` | View merge history. |
| `GET` | `/api/tasks` | List background tasks. |
| `GET` | `/api/tasks/{id}` | Get task status. |

### Manage Permission (`manage`)

Everything in read, plus all write/edit/delete operations below (there is no separate `write` or `delete` value — `manage` covers them):

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload a document. Query params: `collection_id`, `start_processing`. |
| `DELETE` | `/api/documents/{id}` | Delete a document. |
| `DELETE` | `/api/documents` | Delete all documents. |
| `POST` | `/api/documents/delete` | Bulk delete documents. |
| `POST` | `/api/documents/download-zip` | Bulk download as ZIP. |
| `POST` | `/api/documents/{id}/reprocess` | Reprocess a document. |
| `POST` | `/api/documents/process-pending` | Process all pending documents. |
| `POST` | `/api/documents/move` | Move documents between collections. |
| `POST` | `/api/custom-input` | Create a custom input (Q&A, text, markdown). |
| `POST` | `/api/collections` | Create a collection. |
| `PUT` | `/api/collections/{id}` | Update a collection. |
| `DELETE` | `/api/collections/{id}` | Delete a collection. |
| `POST` | `/api/graph/relationships/analyze` | Trigger cross-document relationship analysis. |
| `POST` | `/api/graph/communities/detect` | Trigger community detection. |
| `POST` | `/api/graph/communities/{id}/summarize` | Summarize a community. |
| `DELETE` | `/api/graph/communities/{id}` | Delete a community. |
| `DELETE` | `/api/graph/communities` | Delete all communities. |
| `DELETE` | `/api/graph/entities` | Delete all entities. |
| `DELETE` | `/api/graph/relationships` | Delete all relationships. |
| `POST` | `/api/entities/merge` | Merge duplicate entities. |
| `POST` | `/api/cleanup/orphaned-entities` | Clean orphaned entities and communities. |
| `DELETE` | `/api/tasks/{id}` | Cancel a background task. |

### Root Admin API Key

Not a permission value — these endpoints require the root **admin API key** (the `ADMIN_API_KEY` env value):

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/api-keys` | List all API keys. |
| `POST` | `/api/admin/api-keys` | Create an API key. |
| `GET` | `/api/admin/api-keys/{id}` | Get key details with usage stats. |
| `PATCH` | `/api/admin/api-keys/{id}` | Update a key. |
| `POST` | `/api/admin/api-keys/{id}/revoke` | Revoke a key. |
| `POST` | `/api/admin/api-keys/{id}/activate` | Activate a key. |
| `DELETE` | `/api/admin/api-keys/{id}` | Delete a key. |
| `GET` | `/api/admin/config` | View system configuration. |
| `PATCH` | `/api/admin/config` | Update runtime toggles (`prompt_guard`; `ingestion_injection_scan` only when the experimental scan is enabled). |
| `POST` | `/api/admin/reset` | System reset. |
| `GET` | `/api/admin/skills` | List skills. |
| `POST` | `/api/admin/skills/install` | Install a skill. |
| `PATCH` | `/api/admin/skills/{id}` | Enable/disable a skill. |
| `DELETE` | `/api/admin/skills/{id}` | Uninstall a skill. |
| `GET` | `/api/admin/skills/registry/search` | Search skill registry. |

---

## Rate Limiting

Per-API-key rate limiting on the ask/upload endpoints is off by default (token-bucket):

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_QPM` | `0` | Requests/minute per API key on ask/upload (0 = off). |
| `RATE_LIMIT_BURST` | `10` | Token-bucket burst capacity. |

When the limit is exceeded, the API returns `429 Too Many Requests` with a `Retry-After` header.

There are **two distinct `429` sources** — tell them apart by the `Retry-After` horizon and the detail text:

| Source | Trigger | `Retry-After` | Detail text |
|--------|---------|---------------|-------------|
| Per-key burst | `RATE_LIMIT_QPM` token bucket on ask/upload | Seconds (short) | `Rate limit exceeded (N requests/minute). Slow down.` |
| Monthly unit quota | `MAX_QUERIES_PER_MONTH` (internal LLM completions) | Seconds until the next UTC month (long) | `Monthly usage limit reached (max: N LLM completions). ...` |

The monthly quota gates query endpoints *and* the start of new processing work — upload, reprocess, web import, git sync, and graph builds all draw from the same pool. In-flight work always finishes; the gate only blocks starting new work.

---

## Error Responses

All error responses follow this schema:

```json
{
  "detail": "Human-readable error message"
}
```

Every response echoes an `X-Request-ID` header — honored if you send one, minted otherwise. In production, 5xx bodies are **sanitized** to a generic message plus the request ID (exception internals like connection URIs or provider error bodies never reach clients):

```json
{"detail": "Internal server error. Check server logs for details.", "request_id": "<id>"}
```

Correlate failures with server logs via the request ID instead of parsing error bodies.

### Common HTTP Status Codes

| Code | Meaning | Common Cause |
|------|---------|-------------|
| `400` | Bad Request | Invalid request body, missing required fields, malformed JSON. |
| `401` | Unauthorized | Missing `X-API-Key` header, invalid key, expired key, revoked key. |
| `403` | Forbidden | Valid key but insufficient permissions for the endpoint. Also returned when resource limits (`MAX_FILES`, `MAX_COLLECTIONS`) are exceeded. |
| `404` | Not Found | Resource does not exist (document, key, collection, entity, task). |
| `409` | Conflict | Resource already exists or operation conflicts with current state. |
| `413` | Payload Too Large | Request-body ceilings: `MAX_REQUEST_BODY_MB` (default 32) globally, `MAX_FILE_SIZE_MB` + slack on upload routes, `MAX_IMPORT_BODY_MB` (default 2048) on library import. Body: `{"detail": "Request body too large. Maximum size: NMB"}`. |
| `422` | Unprocessable Entity | Request body validation failed (wrong types, out-of-range values). |
| `429` | Too Many Requests | Per-key burst limit (`RATE_LIMIT_QPM`) **or** monthly unit quota (`MAX_QUERIES_PER_MONTH`) — distinguish by `Retry-After` horizon and detail text (see Rate Limiting above). |
| `500` | Internal Server Error | Server-side error. Sanitized in production (generic detail + `request_id`); check backend logs via `X-Request-ID`. |
| `507` | Insufficient Storage | Free-disk guardrail (`MIN_FREE_DISK_MB`, default 500) refused an upload, reprocess, or library import that would leave the uploads filesystem too full. |

### Authentication-Specific Errors

**Missing API key:**
```json
{"detail": "X-API-Key header is required"}
```

**Invalid API key:**
```json
{"detail": "Invalid API key"}
```

**Expired API key:**
```json
{"detail": "API key has expired"}
```

**Revoked API key:**
```json
{"detail": "API key has been revoked"}
```

**Insufficient permissions:** (e.g. a `read`-only key hitting a `manage` endpoint)
```json
{"detail": "Insufficient permissions: MANAGE access required"}
```

### Prompt Security Error

When prompt injection is detected (`PROMPT_SECURITY=true`):

```json
{
  "answer": "I can't process that request. Please rephrase your question about the documents.",
  "security_flag": true
}
```

---

## API Key Lifecycle

```
Create (POST /api/admin/api-keys)
  |
  v
Active (is_active: true)  <---+
  |                            |
  | Revoke                     | Activate
  v                            |
Revoked (is_active: false) ---+
  |
  | Delete
  v
Permanently Removed (DELETE /api/admin/api-keys/{id})
```

Key storage details:
- Raw key is SHA-256 hashed before storage in Neo4j
- The `key_prefix` (first 8 chars) is stored in plaintext for identification
- The raw key is shown exactly once in the creation response
- Admin key (`ADMIN_API_KEY` env var) is persisted in Neo4j at startup for usage tracking
- Every authenticated request is tracked per key, categorized by endpoint type

---

## Usage Tracking

Every API request is automatically tracked per API key. Categories tracked:

| Category | Endpoints Included |
|----------|-------------------|
| `ask` | `/api/ask/*` |
| `search` | `/api/search` |
| `upload` | `/api/upload` |
| `documents` | `/api/documents/*` |
| `graph` | `/api/graph/*` |
| `collections` | `/api/collections/*` |
| `admin` | `/api/admin/*` |

View usage via `GET /api/admin/api-keys/{key_id}` (see response schema above) or the admin dashboard's API Key Analytics panel.
