---
name: admin
description: Use this skill when managing a Cortex instance — installing AgentSkills from the registry, exporting/importing data for migration, resetting the system, viewing stats, or authenticating as an admin user via session login. Covers the full /api/admin/* surface and the AgentSkills system.
---

# Admin — Instance Management, Skills, and System Operations

## What You Probably Got Wrong

1. **Admin login is a Next.js server action, not an API endpoint.** There is no `POST /api/admin/login` to `curl`. The web UI login (`frontend/src/lib/auth.ts`, `"use server"`) validates email/password against `ADMIN_EMAIL`/`ADMIN_PASSWORD` in the frontend layer, sets a session cookie, and returns the `ADMIN_API_KEY`. API keys (`X-API-Key` header) are for programmatic access. They are two independent auth systems.

2. **AgentSkills are not MCP tools.** They are Markdown instruction files (with optional tool definitions) installed from the [skills.sh](https://skills.sh) registry or local directories. The researcher agent uses them during deep research, not MCP clients.

3. **Export produces a ZIP, not JSON.** `POST /api/admin/export` returns a ZIP64 archive containing NDJSON data files, a manifest, and original document files. Import expects the same format.

4. **System reset is granular.** You can reset documents only, graph only, or everything. It's not all-or-nothing.

5. **The stats endpoint only requires `read` permission.** You don't need the admin key to check `GET /api/stats`. The API-key CRUD, system reset, and config endpoints, by contrast, require the root **admin API key** (the `ADMIN_API_KEY` env value) — that is a distinct credential, not an `admin` permission tier.

---

## System Statistics

```bash
curl "{BASE_URL}/api/stats" \
  -H "X-API-Key: {API_KEY}"
```

Response:
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

The `relationship_count` field shows cross-document relationships (Phase B). The `per_chunk_relationship_count` shows relationships extracted during document processing (Phase A).

---

## Admin Session Authentication

The web UI uses session-based auth, separate from API keys. **There is no `/api/admin/login` or `/api/admin/logout` HTTP endpoint** — you cannot `curl` a login.

### Login / Logout (web UI)

Login is a **Next.js server action** (`frontend/src/lib/auth.ts`, `"use server"`), not an API route. It validates the submitted email/password against the `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars in the frontend layer, sets an HTTP-only session cookie (via the Next.js session layer, not the FastAPI backend), and returns the `ADMIN_API_KEY` for the client to store. Logout clears the cookie through the same layer.

### Programmatic access

Skip login entirely. Use the `ADMIN_API_KEY` value as the header:

```bash
curl "{BASE_URL}/api/admin/skills" \
  -H "X-API-Key: {ADMIN_API_KEY}"
```

### How Session Auth and API Keys Coexist

| Mechanism | Used By | Transport | Lifetime |
|-----------|---------|-----------|----------|
| Session (cookie) | Web UI / browser | HTTP-only cookie (set by the Next.js session layer) | Until logout or expiry |
| API key (`X-API-Key`) | Scripts, agents, integrations | Request header | Until revoked |

Frontend routes (except `/login`) are protected by `proxy.ts`, which checks the session cookie. All API routes check the `X-API-Key` header.

---

## AgentSkills System

AgentSkills extend the researcher agent with external knowledge and tools. Each skill is a directory containing a `SKILL.md` file (with optional frontmatter and config schema). Enabled skills are **automatically activated** at the start of every research session, in both Deep Research and Chat modes (Chat requires `ENABLE_AGENT_CHAT=true`, the default). Installed skills are **disabled by default** — toggle them on in Settings → Agent Skills.

Skills call external APIs via the built-in `http_request` tool (`method`, `url`, optional `body`). Auth is **hostname-scoped**: a skill's auth header is applied only when the request URL matches the hostname derived from that skill's `base_url`. The LLM never sees tokens — only `auth_header` templates are used to build headers, secrets are masked as `********` in API responses, and tool results are capped at 4000 characters. Failed calls are surfaced (e.g. `API call failed: POST .../tickets → HTTP 403`), never silent.

### List Installed Skills

```bash
curl "{BASE_URL}/api/admin/skills" \
  -H "X-API-Key: {ADMIN_KEY}"
```

### Install a Skill from URL

```bash
curl -X POST "{BASE_URL}/api/admin/skills/install" \
  -H "X-API-Key: {ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://skills.sh/weather/SKILL.md"}'
```

### Search the skills.sh Registry

```bash
curl "{BASE_URL}/api/admin/skills/registry/search?q=weather" \
  -H "X-API-Key: {ADMIN_KEY}"
```

### Enable/Disable a Skill

```bash
curl -X PATCH "{BASE_URL}/api/admin/skills/{skill_id}" \
  -H "X-API-Key: {ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

### Configure a Skill

Skills can define configuration schemas (e.g., API keys, base URLs). Use the LLM-powered analyzer to extract configuration requirements:

```bash
# Analyze skill to discover config schema
curl -X POST "{BASE_URL}/api/admin/skills/{skill_id}/analyze" \
  -H "X-API-Key: {ADMIN_KEY}"

# Get config schema
curl "{BASE_URL}/api/admin/skills/{skill_id}/config" \
  -H "X-API-Key: {ADMIN_KEY}"

# Save config values
curl -X PUT "{BASE_URL}/api/admin/skills/{skill_id}/config" \
  -H "X-API-Key: {ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"api_key": "sk-...", "base_url": "https://api.example.com"}'
```

### Uninstall a Skill

```bash
curl -X DELETE "{BASE_URL}/api/admin/skills/{skill_id}" \
  -H "X-API-Key: {ADMIN_KEY}"
```

### Rescan Skills Directory

```bash
curl -X POST "{BASE_URL}/api/admin/skills/discover" \
  -H "X-API-Key: {ADMIN_KEY}"
```

Rescans the `SKILLS_DIR` directory for new or changed skills.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_SKILLS` | `true` | Master switch for the skills system |
| `SKILLS_DIR` | `.agents/skills` | Directory where skill directories are stored |
| `ENABLE_SKILL_SCRIPTS` | `false` | Allow skills to execute local scripts (security-sensitive) |
| `SKILL_SCRIPT_TIMEOUT` | `30` | Timeout in seconds for skill script execution |
| `SKILL_HTTP_TIMEOUT` | `15` | Timeout in seconds for skill HTTP tool requests |
| `MAX_SKILL_TOOLS` | `10` | Max skill tools available to the researcher agent |

---

## Export and Import

### Export Full Instance

```bash
curl -X POST "{BASE_URL}/api/admin/export" \
  -H "X-API-Key: {ADMIN_KEY}" \
  --output cortex-export.zip
```

Returns a ZIP64 archive containing:
- `manifest.json` — version, export date, embedding model, stats
- `documents.ndjson`, `chunks.ndjson`, `entities.ndjson`, `relationships.ndjson`, `communities.ndjson` — all graph data
- `collections.ndjson`, `collection_members.ndjson`, `community_members.ndjson`, `chunk_mentions.ndjson` — relationships
- `merge_history.ndjson`, `system_meta.ndjson` — audit trail and metadata
- `files/` — original uploaded document files

### Import from ZIP

```bash
curl -X POST "{BASE_URL}/api/admin/import" \
  -H "X-API-Key: {ADMIN_KEY}" \
  -F "file=@cortex-export.zip"
```

The system validates the manifest (including embedding model compatibility) before importing. Two modes:
- **Clean import** — merges with existing data
- **Replace import** — wipes existing data first

---

## System Reset

```bash
curl -X POST "{BASE_URL}/api/admin/reset" \
  -H "X-API-Key: {ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "delete_documents": true,
    "delete_uploaded_files": true,
    "delete_custom_inputs": true,
    "delete_collections": true,
    "delete_api_keys": false
  }'
```

Reset is **granular** — each flag controls a data category independently. It removes Documents, Chunks, Entities, Relationships, Communities, and also cleans `MergeHistory` nodes, `SystemMeta` nodes (staleness timestamps), and client cache (dismissed dedup suggestions, regeneration flow state). This is **destructive and irreversible**.

---

## Skill Files

| File | Description |
|------|-------------|
| [references/API.md](references/API.md) | Complete admin API endpoint reference |
