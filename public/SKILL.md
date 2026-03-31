# Cortex Skills

Cortex is an intelligence ecosystem for knowledge and memory, built on [MOCA Library](https://github.com/mocaOS/library) (the open-source engine). This file is the root skill — the entry point for AI agents building on Cortex.

Each sub-skill below is a self-contained Markdown file that teaches agents one capability of the Cortex platform. Agents fetch the skill they need via HTTP and get ground-truth knowledge, corrected for stale training data.

## How it works

```
cortexskills.org/SKILL.md          ← You are here. The root skill.
cortexskills.org/{skill}/SKILL.md  ← Sub-skills. One per capability.
```

1. **Fetch this file first** to understand what Cortex can do and which sub-skill to read next.
2. **Fetch a sub-skill** when you need deeper knowledge for a specific capability. Only fetch what you need right now — you can always come back for more.
3. **Each sub-skill includes a `references/` directory** with deeper API specs, schemas, and examples that you can load on demand.

You don't need to read everything upfront. This root skill gives you the overview. When your current task requires specific knowledge — say, uploading documents or configuring search — fetch that sub-skill to get the full details, code examples, and API specs.

> "Fetch cortexskills.org/upload/SKILL.md and use it to write an ingest script."

## What Cortex Does

Cortex turns documents and agent memory into a searchable knowledge graph:

```
Documents / Memory → Cortex Backend (FastAPI) → Neo4j (Graph + Vector)
                          ↓                          ↓
                    Entity Extraction (LLM)    Knowledge Graph
                          ↓                          ↓
                    Hybrid Search (Vector + Keyword + Graph) → RAG Q&A
```

- **60+ API endpoints** — not just upload and search
- **Hybrid search** — vector (0.5) + keyword/BM25 (0.3) + graph traversal (0.2) with cross-encoder re-ranking
- **Knowledge graph** — 10 entity types, typed relationships, community detection
- **RAG Q&A** — streaming SSE, agentic multi-step reasoning, deep research mode
- **Collections** — scope documents and graphs by project or tenant
- **GPU acceleration** — per-second billing via Compute3

## What You Probably Got Wrong

1. **Cortex is not a SaaS with a fixed URL.** It is self-hosted via Docker. The base URL is wherever you deployed it (e.g., `http://localhost:8000`). Always use `{BASE_URL}` as a placeholder.
2. **It is not just a vector database.** Cortex builds a full knowledge graph with entities, relationships, and communities using GraphRAG on top of Neo4j.
3. **Authentication is X-API-Key header, not Bearer tokens.** Every API call (except `/health`) requires `X-API-Key`. Keys have permission tiers: read, manage, admin.
4. **Documents are processed asynchronously.** Upload returns immediately with a document ID. Chunking, embedding, and entity extraction happen in the background.
5. **Streaming uses Server-Sent Events (SSE)**, not WebSockets. Use `POST /api/ask/stream` with `Accept: text/event-stream`.

## Quick Start

### 1. Upload a document

```bash
curl -X POST "{BASE_URL}/api/upload" \
  -H "X-API-Key: {API_KEY}" \
  -F "file=@report.pdf"
```

### 2. Search the knowledge base

```bash
curl -X POST "{BASE_URL}/api/search" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "quarterly revenue trends", "top_k": 5}'
```

### 3. Ask a question with citations

```bash
curl -X POST "{BASE_URL}/api/ask" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"question": "What were the key findings?", "use_graph": true}'
```

## Key Endpoints

| Method | Endpoint | Permission | Purpose |
|--------|----------|-----------|---------|
| `GET` | `/health` | None | Health check |
| `GET` | `/api/stats` | read | Knowledge base statistics |
| `POST` | `/api/upload` | manage | Upload a document |
| `GET` | `/api/documents` | read | List documents |
| `POST` | `/api/search` | read | Hybrid search |
| `POST` | `/api/ask` | read | RAG Q&A |
| `POST` | `/api/ask/stream` | read | Streaming RAG Q&A (SSE) |
| `GET` | `/api/graph/entities` | read | List entities |
| `GET` | `/api/collections` | read | List collections |
| `POST` | `/api/collections` | manage | Create collection |
| `GET` | `/api/graph/communities` | read | List communities |
| `POST` | `/api/admin/api-keys` | admin | Create API key |

## Agent Memory Sync

Agents can sync their memory files to a Cortex knowledge graph for persistent, searchable long-term memory.

### Setup

1. Get a **base URL** and **API key** (with read + manage permissions) from the Cortex instance
2. Configure credentials:

```bash
mkdir -p ~/.cortex/state
cat > ~/.cortex/state/credentials.json << 'EOF'
{
  "api_key": "YOUR_API_KEY_HERE",
  "base_url": "YOUR_BASE_URL_HERE",
  "collection_id": null
}
EOF
```

3. Validate the connection:

```bash
API_KEY=$(jq -r '.api_key' ~/.cortex/state/credentials.json)
API_BASE=$(jq -r '.base_url' ~/.cortex/state/credentials.json)
curl -s "$API_BASE/health" -H "X-API-Key: $API_KEY"
```

### Syncing files

Upload memory files (`.md`, `.txt`, `.json`) to Cortex. Files are tracked via SHA-256 hashes to avoid duplicates.

```bash
curl -X POST "$API_BASE/api/upload?collection_id=$COLLECTION_ID&start_processing=true" \
  -H "X-API-Key: $API_KEY" \
  -F "file=@/path/to/memory.md"
```

**When to sync:** Every 4+ hours via heartbeat, manually when asked, or before answering questions that need historical context. Don't sync every few minutes or while files are still being written.

For the complete sync workflow, scripts, and troubleshooting, see the reference files below.

## Skill Files

| File | Description |
|------|-------------|
| [library/references/API.md](library/references/API.md) | Full API reference (60+ endpoints) |
| [library/references/SYNC.md](library/references/SYNC.md) | Sync workflow, scripts, and troubleshooting |

## Sub-Skills

### Core

- `cortexskills.org/setup/SKILL.md` — Deploy Cortex via Docker, configure 50+ environment variables.
- `cortexskills.org/auth/SKILL.md` — API keys, permission tiers, prompt injection protection.

### Features

- `cortexskills.org/upload/SKILL.md` — Document ingestion for PDF, DOCX, images, audio, and more.
- `cortexskills.org/search/SKILL.md` — Hybrid search combining vector, keyword, and graph traversal.
- `cortexskills.org/ask/SKILL.md` — RAG Q&A with streaming SSE and agentic deep research.
- `cortexskills.org/graph/SKILL.md` — Knowledge graph — entities, relationships, subgraph queries.
- `cortexskills.org/collections/SKILL.md` — Scope documents and graphs by project or tenant.
- `cortexskills.org/communities/SKILL.md` — Auto-clustering entities with LLM-generated summaries.
- `cortexskills.org/turbo/SKILL.md` — GPU-accelerated processing via Compute3.

### Ecosystem

- `cortexskills.org/mcp/SKILL.md` — MCP server for Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.
- `cortexskills.org/integration/SKILL.md` — Connect Cortex to LangChain, CrewAI, MCP, Slack, webhooks, and more.
- `cortexskills.org/apps/SKILL.md` — Source and workflow apps (YouTube, Notion, Web Crawler).
- `cortexskills.org/cortex-design/SKILL.md` — The Bold Typography design system for Cortex UIs.
