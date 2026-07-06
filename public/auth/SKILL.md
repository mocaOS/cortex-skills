---
name: auth
description: Use this skill when implementing authentication, managing API keys, configuring permissions, or hardening security for a Cortex deployment. Covers the X-API-Key auth system, the read/manage permission model, collection scoping, key management endpoints, prompt injection protection, and security best practices.
---

# Auth — API Keys, Permissions, and Security

## What You Probably Got Wrong

1. **Two header styles work: `X-API-Key` or `Authorization: Bearer`.** Every request (except `GET /health`) must authenticate. `X-API-Key: {your_key}` is canonical; `Authorization: Bearer {your_key}` is also accepted. There is no OAuth.

2. **There are exactly two permissions: `read` and `manage`.** A key's `permissions` is an array holding any combination of these two. `read` = Ask AI, search, list, view graph/stats. `manage` = upload, edit, and delete documents and collections (it is a superset of read for write operations). There is no `write`, `delete`, or `admin` permission value. Full-instance/admin operations (API-key CRUD, system reset, config PATCH) are gated on the **root admin API key** — the `ADMIN_API_KEY` env value — which is not a permission tier.

3. **API key format uses a `cortex_` prefix.** User keys start with `cortex_user_`; the admin key starts with `cortex_admin_` and is set via the `ADMIN_API_KEY` environment variable, not created through the API. (Older builds used a `moca_` prefix.)

4. **Keys are hashed before storage.** The raw key is only shown once at creation time. Keys are hashed before being stored in Neo4j. You cannot retrieve a key after creation — only its `key_prefix`.

5. **Keys can be scoped to specific collections.** A key's `collection_scope` is either `all` (unrestricted) or `restricted`. A restricted key (`collection_scope: "restricted"` + `allowed_collections`) can only touch the collections you list. New collections are never auto-granted to existing restricted keys.

6. **Prompt injection protection is built-in**, not something you need to implement yourself. Set `PROMPT_SECURITY=true` and the backend handles pattern detection, input sanitization, and output filtering.

## Authentication Pattern

Every API request follows this pattern:

```bash
curl -X {METHOD} "{BASE_URL}/api/{endpoint}" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json"
```

Or with a Bearer token:

```bash
curl "{BASE_URL}/api/documents" \
  -H "Authorization: Bearer {API_KEY}"
```

The only unauthenticated endpoint is:
```bash
curl {BASE_URL}/health
```

## Permissions

A key's `permissions` is an array of any combination of these two values:

| Permission | Can Do |
|------------|--------|
| **read** | Ask AI, search, list documents, stats, view graph, list collections |
| **manage** | Everything in read, plus upload, edit, move, reprocess, and delete documents & collections |

Full-instance operations — API-key CRUD, system reset, config changes, skill management — are **not** a permission value. They require the root **admin API key** (the `ADMIN_API_KEY` env value), which is a distinct credential, not a tier you can grant to a user key.

Keys are additionally scoped by `collection_scope` (`all` or `restricted` + `allowed_collections`) — see below.

### Key Prefixes

| Key type | Prefix | Created via |
|----------|--------|-------------|
| User key | `cortex_user_` | `POST /api/admin/api-keys` |
| Admin key | `cortex_admin_` | `ADMIN_API_KEY` env var (at startup) |

### Permission Checks per Endpoint

| Endpoint | Required Permission |
|----------|---------------------|
| `GET /api/documents` | `read` |
| `POST /api/search` | `read` |
| `POST /api/ask` | `read` |
| `POST /api/upload` | `manage` |
| `POST /api/collections` | `manage` |
| `DELETE /api/documents/*` | `manage` |
| `POST /api/admin/api-keys` | admin API key |

Failing the `manage` check returns `403 Insufficient permissions: MANAGE access required`.

## API Key Management

### Create a key

```bash
curl -X POST "{BASE_URL}/api/admin/api-keys" \
  -H "X-API-Key: {ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production App",
    "permissions": ["read", "write"],
    "expires_at": "2026-12-31T23:59:59Z"
  }'
```

Response (key shown only once):
```json
{
  "id": "key_abc123",
  "name": "Production App",
  "key": "cortex_user_abc123xyz789",
  "permissions": ["read", "write"],
  "expires_at": "2026-12-31T23:59:59Z",
  "created_at": "2026-03-15T10:30:00Z",
  "message": "Store this key securely - it won't be shown again"
}
```

`expires_at` is optional (ISO 8601). Expired keys return `401 API key has expired`.

### Create a collection-scoped (restricted) key

Limit a key to specific collections for multi-tenancy:

```bash
curl -X POST "{BASE_URL}/api/admin/api-keys" \
  -H "X-API-Key: {ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tenant A - Read Only",
    "permissions": ["read"],
    "collection_scope": "restricted",
    "allowed_collections": ["coll_abc123"]
  }'
```

Restricted keys get `403` when touching any collection (or its documents) not in `allowed_collections`. New collections are never auto-accessible to existing restricted keys. Update scope later via `PATCH /api/admin/api-keys/{key_id}` with `collection_scope` + `allowed_collections`.

### List all keys

```bash
curl "{BASE_URL}/api/admin/api-keys" \
  -H "X-API-Key: {ADMIN_KEY}"
```

### Get key details

```bash
curl "{BASE_URL}/api/admin/api-keys/{key_id}" \
  -H "X-API-Key: {ADMIN_KEY}"
```

### Update a key

```bash
curl -X PATCH "{BASE_URL}/api/admin/api-keys/{key_id}" \
  -H "X-API-Key: {ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"name": "Renamed Key", "permissions": ["read", "manage"]}'
```

### Revoke a key

```bash
curl -X POST "{BASE_URL}/api/admin/api-keys/{key_id}/revoke" \
  -H "X-API-Key: {ADMIN_KEY}"
```

### Activate a key

```bash
curl -X POST "{BASE_URL}/api/admin/api-keys/{key_id}/activate" \
  -H "X-API-Key: {ADMIN_KEY}"
```

### Delete a key

```bash
curl -X DELETE "{BASE_URL}/api/admin/api-keys/{key_id}" \
  -H "X-API-Key: {ADMIN_KEY}"
```

## Admin Authentication (Frontend)

The web UI uses session-based auth for human users, completely separate from API key auth. **There is no `/api/admin/login` or `/api/admin/logout` HTTP endpoint** — you cannot `curl` a login.

Login is a **Next.js server action** (`frontend/src/lib/auth.ts`, marked `"use server"`). It runs in the frontend layer: it validates the submitted email/password against the `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars, sets an HTTP-only session cookie (the Next.js session layer sets this, not the FastAPI backend), and returns the `ADMIN_API_KEY` value, which the client stores for subsequent API calls. Logout clears that cookie via the same server-action layer.

### Programmatic (non-browser) access

You do not log in for API access. Use the `ADMIN_API_KEY` value directly as the header:

```bash
curl "{BASE_URL}/api/admin/api-keys" \
  -H "X-API-Key: {ADMIN_API_KEY}"
```

### How Session Auth and API Keys Coexist

| Mechanism | Used By | Transport | Scope |
|-----------|---------|-----------|-------|
| Session (cookie) | Web UI / browser users | HTTP-only cookie set by the Next.js session layer | Frontend routes (protected by `proxy.ts`) |
| API key (`X-API-Key`) | Scripts, agents, integrations | Request header | All `/api/*` routes |

These are two independent auth systems. A session cookie does not grant API access, and an API key does not grant browser-session access. For programmatic administration, use the `ADMIN_API_KEY`.

For full admin endpoint coverage (skills management, export/import, reset), see the [Admin skill](../admin/SKILL.md).

## Prompt Injection Protection

Enable with `PROMPT_SECURITY=true` (default). The system:

1. **Pattern detection** — Scans input for known jailbreak patterns, instruction injection, role manipulation
2. **Input sanitization** — Strips malicious formatting and control sequences
3. **Defensive prompting** — Adds security instructions to LLM system prompts
4. **Output filtering** — Removes harmful content from responses

When an attack is detected:
```json
{
  "answer": "I can't process that request. Please rephrase your question about the documents.",
  "security_flag": true
}
```

### Prompt Guard (ML classifier)

Beyond the pattern/output filtering above, Cortex can run a query-time **Prompt Guard** — an ML injection classifier that screens the user's question before retrieval and refuses flagged injections:

| Variable | Default | Description |
|----------|---------|-------------|
| `PROMPT_GUARD` | `true` | Enable the query-time guard (admin-overridable at runtime). Active only when a service URL or local model is available. |
| `PROMPT_GUARD_SERVICE_URL` | *(empty)* | Offload classification to the shared cortex-helper `/classify` endpoint. Empty = no remote guard. |
| `PROMPT_GUARD_LOCAL` | `false` | Load the classifier in-process instead (needs torch/transformers). Ignored when a service URL is set. |
| `PROMPT_GUARD_THRESHOLD` | `0.5` | Injection-probability cutoff for refusal. |

There is also an ingestion-time scan, `INGESTION_INJECTION_SCAN` (default `true`), which flags (never blocks) documents whose content carries injection attempts planted for a downstream AI assistant.

## Rate Limiting

Per-API-key rate limiting on the ask/upload endpoints is off by default. Enable it with a token-bucket limiter:

```bash
RATE_LIMIT_QPM=0      # requests/minute per API key (0 = off)
RATE_LIMIT_BURST=10   # token-bucket burst capacity
```

When exceeded, the API returns `429 Too Many Requests` with a `Retry-After` header.

## API Usage Tracking

Every request is tracked per API key. View usage via the admin dashboard or API:

```bash
curl "{BASE_URL}/api/admin/api-keys/{key_id}" \
  -H "X-API-Key: {ADMIN_KEY}"
```

Response includes `last_used_at` and usage statistics by endpoint category.

## Deployment Hardening

```bash
ENVIRONMENT=production            # fail fast on weak/default secrets at startup
CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
EXPOSE_API_DOCS=auto              # auto = docs on in dev, OFF in production
```

With `ENVIRONMENT=production`, startup refuses to boot if `NEO4J_PASSWORD` is empty or the default `password123`, or if `SESSION_SECRET` is shorter than 32 characters while `ADMIN_PASSWORD` is set. `CORS_ALLOWED_ORIGINS` defaults to `*` (credentials disabled, since auth is header-based) — set an explicit allowlist in production. Interactive API docs (`/docs`, `/redoc`, `/openapi.json`) auto-disable in production so a directly-exposed backend doesn't leak its schema; force with `EXPOSE_API_DOCS=true`/`false`.

Set `ENCRYPTION_KEY` (comma-separated Fernet keys; first encrypts, all decrypt) to encrypt git PATs and skill secrets at rest.

## Security Best Practices

1. **Use the least privilege you need.** Give a key `read` for search/ask; add `manage` only when it must upload/edit/delete. Keep the `ADMIN_API_KEY` (key management, reset, config) off client integrations entirely. Scope keys to collections for multi-tenancy.
2. **Rotate keys regularly.** Create a new key, update your integrations, revoke the old one.
3. **Set `PROMPT_SECURITY=true`** in production. Always.
4. **Set `ENVIRONMENT=production`** and an explicit `CORS_ALLOWED_ORIGINS` allowlist.
5. **Block Neo4j ports** (7474, 7687) from public access.
6. **Use HTTPS** via reverse proxy (nginx/Caddy).
7. **Set strong `SESSION_SECRET`** (32+ characters, randomly generated).

## Skill Files

| File | Description |
|------|-------------|
| [references/API.md](references/API.md) | Complete API endpoint reference |

## Resources

- [Authentication Guide](https://docs.cortex.eco/guides/authentication)
- [Security Guide](https://docs.cortex.eco/guides/security)
