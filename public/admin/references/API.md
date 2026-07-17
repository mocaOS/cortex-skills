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
| `monthly_usage_used` | integer | LLM completions consumed this UTC month (queries + processing) |
| `monthly_usage_limit` | integer | Monthly LLM-completion quota (`0` = unlimited) |
| `monthly_usage_query` | integer | Portion of monthly usage consumed by Q&A/search |
| `monthly_usage_processing` | integer | Portion of monthly usage consumed by document/graph processing |
| `disk_free_mb` | integer | Free MB on the uploads filesystem |
| `disk_total_mb` | integer | Total MB on the uploads filesystem |

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

**Query parameter:** `mode` — `clean` (default; requires the target instance to be empty) or `replace` (wipes existing data first).

The system validates:
- Manifest version compatibility
- Embedding model match (dimension mismatch would corrupt vector search)
- Data integrity

The request body is capped by `MAX_IMPORT_BODY_MB` (default 2048). For large archives behind a reverse proxy with a body-read timeout (Traefik v3 defaults to 60s), use the chunked upload endpoints below instead.

### Chunked Import Upload

Uploads a library export ZIP in small sequential requests (~8MB each) so no single request outlives a proxy body-read timeout, then starts the same import task as `POST /api/admin/import`. Abandoned sessions are swept hourly.

#### POST /api/admin/import/upload/start

Open an upload session. Runs the free-disk guard up front — `507 Insufficient Storage` if assembling the archive would leave the disk nearly full.

**Request body:**

```json
{
  "total_size": 123456789
}
```

**Response:** `{"upload_id": "...", "received": 0}`

#### PUT /api/admin/import/upload/{upload_id}/chunk?offset=N

Append one chunk (raw bytes body) at the given offset. Offsets must be contiguous.

**Response:** `{"received": <total bytes stored>}`

**Errors:**
- `409` with `{"received": <int>, "message": "Offset mismatch"}` — e.g. a retried chunk that already landed; resume from the server's `received`
- `404` — upload session not found or expired
- `400` — upload exceeds the declared `total_size` (session is discarded)

#### POST /api/admin/import/upload/{upload_id}/finish?mode=clean|replace

Validate the assembled ZIP is complete and start the import task.

**Response:** `{"task_id": "...", "status": "pending", "message": "Import started (mode: clean)"}`

**Errors:** `400` if incomplete (`received` != `total_size`), `404` if the session expired.

#### DELETE /api/admin/import/upload/{upload_id}

Abort a chunked upload and discard the partial file.

**Response:** `{"status": "aborted"}`

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

### PATCH /api/admin/config

Update admin-editable runtime settings. Persisted as overrides over the env defaults and effective without a restart. Returns the full updated configuration (same shape as `GET /api/admin/config`).

**Request body** (all fields optional — only provided fields are updated):

| Field | Type | Description |
|-------|------|-------------|
| `ingestion_injection_scan` | `boolean` | Enable/disable the LLM prompt-injection scan on ingested documents (**experimental** — rejected with `400` unless the instance sets `ENABLE_INGESTION_INJECTION_SCAN=true`) |
| `prompt_guard` | `boolean` | Enable/disable the query-time prompt-injection classifier — each guarded question costs one extra unit against the monthly quota |

---

## x402 Payments

Available when the instance sets `X402_ENABLED=true`; the config itself is runtime state in Neo4j (survives redeploys, excluded from export/reset). All admin-key gated.

### GET /api/admin/x402/config

Current payment configuration + verification state. Facilitator auth headers are never returned (only `facilitator_auth_headers_set`). `enabled` mirrors the env flag, so clients can gate UI on the response.

### PUT /api/admin/x402/config

Save the configuration. Returns 400 while `X402_ENABLED=false`.

**Request body:**

| Field | Type | Description |
|-------|------|-------------|
| `pay_to` | `string` | Recipient wallet (global payout for the instance) |
| `facilitator_url` | `string` | Any spec-compliant x402 facilitator (`/supported`, `/verify`, `/settle`) |
| `network` | `string` | CAIP-2, e.g. `eip155:8453` (Base mainnet) |
| `asset_address` | `string` | Token contract / mint |
| `asset_name` | `string` | **The token's EIP-712 domain name** (contract `name()`), not a display label — `"USD Coin"` on Base/Avalanche mainnets, `"USDC"` on Base Sepolia; a mismatch reverts every settlement |
| `asset_decimals` | `number` | Default 6 |
| `asset_eip712_version` | `string` | Default `"2"` |
| `max_timeout_seconds` | `number` | Default 60 |
| `service_name` | `string?` | Optional discovery metadata (max 32 chars) |
| `facilitator_auth_headers` | `object?` | Static auth headers, stored encrypted — omit/null = unchanged, `{}` = clear |

Changing any payment-relevant field (including `asset_name`) resets `verified` until the verify suite passes again.

### POST /api/admin/x402/verify

Runs the verification suite and returns per-check results (`payto_format`, `asset_format`, `facilitator_reachable`, `scheme_network_supported`). All passing stamps the config verified — the precondition for minting priced keys and serving paid requests. 400 if the config is incomplete or the flag is off.

### GET /api/admin/x402/earnings

Settled-payment totals in human units: `{asset_name, payment_count, total_amount, by_key: [{key_id, key_name, payment_count, total_amount}]}`. Every payment is stored with its on-chain tx hash.

### Monetized keys

`POST /api/admin/api-keys` accepts `price_per_query` (decimal string, human units, e.g. `"0.05"`) — requires a verified x402 config and read-only permissions (`422` when combined with `manage`). `PATCH` accepts it too; `""` clears the price. Priced keys mint with the `cortex_pub_` prefix and are restricted to the retrieval endpoints. See the `x402` skill for the payer-side protocol.
