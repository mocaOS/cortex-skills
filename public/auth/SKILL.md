---
name: auth
description: Use this skill when implementing authentication, managing API keys, configuring permissions, or hardening security for a Cortex deployment. Covers the X-API-Key auth system, permission tiers, key management endpoints, prompt injection protection, and security best practices.
---

# Auth — API Keys, Permissions, and Security

## What You Probably Got Wrong

1. **Authentication is X-API-Key header, not Bearer tokens or OAuth.** Every request (except `GET /health`) must include `X-API-Key: {your_key}` in the header.

2. **There are three permission tiers, not four.** The tiers are `read`, `manage`, and `admin`. The Cortex marketing site mentions four levels for clarity, but the actual API uses three: read (search, ask, list), manage (upload, delete, create), and admin (key management, system config).

3. **API key format has a prefix indicating permission level.** Read-only keys start with `moca_ro_`, read-write keys with `moca_rw_`. The admin key is set via environment variable, not created through the API.

4. **Keys are hashed before storage.** The raw key is only shown once at creation time. Keys are SHA-256 hashed before being stored in Neo4j. You cannot retrieve a key after creation.

5. **Prompt injection protection is built-in**, not something you need to implement yourself. Set `PROMPT_SECURITY=true` and the backend handles pattern detection, input sanitization, and output filtering.

## Authentication Pattern

Every API request follows this pattern:

```bash
curl -X {METHOD} "{BASE_URL}/api/{endpoint}" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json"
```

The only unauthenticated endpoint is:
```bash
curl {BASE_URL}/health
```

## Permission Tiers

| Tier | Prefix | Can Do |
|------|--------|--------|
| **read** | `moca_ro_` | Search, ask, list documents, stats, view graph, list collections |
| **manage** | `moca_rw_` | Everything in read + upload, delete, create collections, move documents, reprocess |
| **admin** | `moca_admin_` | Everything in manage + API key CRUD, system reset, config view |

## API Key Management

### Create a key

```bash
curl -X POST "{BASE_URL}/api/admin/api-keys" \
  -H "X-API-Key: {ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Read-Only Key",
    "permissions": ["read"]
  }'
```

Response (key shown only once):
```json
{
  "id": "key_abc123",
  "name": "My Read-Only Key",
  "key": "moca_ro_a1b2c3d4e5f6...",
  "key_prefix": "moca_ro_a1b2",
  "permissions": ["read"],
  "is_active": true,
  "created_at": "2026-03-15T10:00:00Z"
}
```

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

The frontend uses session-based auth for human users, completely separate from API key auth.

### Login

```bash
curl -X POST "{BASE_URL}/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-password"}'
```

Credentials are validated against the `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables. On success, an encrypted JWT token is set as an HTTP-only cookie.

### Logout

```bash
curl -X POST "{BASE_URL}/api/admin/logout"
```

Clears the session cookie.

### How Session Auth and API Keys Coexist

| Mechanism | Used By | Transport | Scope |
|-----------|---------|-----------|-------|
| Session (JWT cookie) | Web UI / browser users | HTTP-only cookie | All frontend routes (except `/login`) protected by middleware |
| API key (`X-API-Key`) | Scripts, agents, integrations | Request header | All `/api/*` routes |

These are two independent auth systems. A valid session cookie does not grant API access, and an API key does not grant frontend access. For programmatic administration, use an `admin`-tier API key.

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

## Rate Limiting

The API returns rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705329600
```

Configure via:
```bash
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60   # seconds
```

## API Usage Tracking

Every request is tracked per API key. View usage via the admin dashboard or API:

```bash
curl "{BASE_URL}/api/admin/api-keys/{key_id}" \
  -H "X-API-Key: {ADMIN_KEY}"
```

Response includes `last_used_at` and usage statistics by endpoint category.

## Security Best Practices

1. **Use the strongest key you need, no more.** Read-only for search/ask, manage for upload/delete, admin only for key management.
2. **Rotate keys regularly.** Create a new key, update your integrations, revoke the old one.
3. **Set `PROMPT_SECURITY=true`** in production. Always.
4. **Restrict `CORS_ORIGINS`** to your specific domains in production.
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
