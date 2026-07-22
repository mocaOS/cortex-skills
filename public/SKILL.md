# Cortex Skills

Cortex is an intelligence ecosystem for knowledge and memory, powered by the open-source [Cortex engine](https://github.com/mocaOS/cortex-app). This file is the root skill — the entry point for AI agents building on Cortex.

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

- **100+ API endpoints** — not just upload and search
- **Hybrid search** — vector (0.5) + keyword/BM25 (0.3) + graph traversal (0.2) with cross-encoder re-ranking
- **Knowledge graph** — 10 entity types, 14 relationship types, community detection
- **RAG Q&A** — streaming SSE, agentic multi-step reasoning, deep research mode
- **Collections** — scope documents and graphs by project or tenant
- **Ingestion sources** — file upload, git repos (GitHub/GitLab/Gitea), and web import (crawl4ai)
- **Prompt-injection defense** — a query-time Prompt Guard classifier, pattern detection, and content fencing
- **Metering** — optional unit-denominated monthly quota (`MAX_QUERIES_PER_MONTH`, counted in LLM completions)
- **Monetization** — optional pay-per-query [x402](https://github.com/x402-foundation/x402) micropayments: monetized public keys charge agents per retrieval query in stablecoins, revenue flows to the operator's wallet

## Two Ways to Use Cortex

1. **Connect to a running instance** (you have a base URL + API key). Start with the **`cortex`** skill (memory sync, search, ask) and the feature skills (`upload`, `search`, `ask`, `graph`, …). This is the fastest path — no infrastructure to run.
2. **Self-host your own instance** (on your machine or VM). Start with the **`setup`** skill: clone the repo, set a handful of env vars, `docker compose up -d`. Then use it exactly like case 1 against `http://localhost:8000`.

## What You Probably Got Wrong

1. **Cortex is not a SaaS with a fixed URL.** It is self-hosted via Docker. The base URL is wherever you deployed it (e.g., `http://localhost:8000`). Always use `{BASE_URL}` as a placeholder.
2. **It is not just a vector database.** Cortex builds a full knowledge graph with entities, relationships, and communities using GraphRAG on top of Neo4j.
3. **Authentication is the `X-API-Key` header (or `Authorization: Bearer`).** Every API call (except `/health`) requires a key. A key holds one or both of two permissions — `read` (Ask AI, search, view) and `manage` (upload, edit, delete) — and can be scoped to specific collections. There is no `write`/`delete`/`admin` permission tier; full-instance operations (key management, reset, config) use the root **admin API key** (`ADMIN_API_KEY`).
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
| `POST` | `/api/admin/api-keys` | admin key | Create API key (root `ADMIN_API_KEY`) |

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
| [cortex/references/API.md](cortex/references/API.md) | Full API reference (100+ endpoints) |
| [cortex/references/SYNC.md](cortex/references/SYNC.md) | Sync workflow, heartbeat cadence, and troubleshooting |

## Sub-Skills

### Core

- `cortexskills.org/cortex/SKILL.md` — **Use a running instance**: sync agent memory, search, and ask with agentic deep research. The primary skill for connecting to an existing Cortex.
- `cortexskills.org/setup/SKILL.md` — **Self-host**: deploy Cortex via Docker and configure its 160+ environment variables.
- `cortexskills.org/auth/SKILL.md` — API keys (`read`/`manage` + admin key), collection scoping, prompt-injection protection.
- `cortexskills.org/admin/SKILL.md` — Instance management, AgentSkills registry, export/import, system reset.

### Features

- `cortexskills.org/upload/SKILL.md` — Document ingestion for PDF, EPUB, DOCX, images, audio, and more. Upload the source format, not a PDF rendering of it — only PDF/images pay per-page ML analysis (books → EPUB, office files → .docx/.pptx, web → HTML/Web Import).
- `cortexskills.org/search/SKILL.md` — Hybrid search combining vector, keyword, and graph traversal.
- `cortexskills.org/ask/SKILL.md` — RAG Q&A with streaming SSE, agentic deep research, and conversation memory.
- `cortexskills.org/graph/SKILL.md` — Knowledge graph — entities, relationships, subgraph queries.
- `cortexskills.org/collections/SKILL.md` — Scope documents and graphs by project or tenant.
- `cortexskills.org/communities/SKILL.md` — Auto-clustering entities with LLM-generated summaries.
- `cortexskills.org/git-integration/SKILL.md` — Connect GitHub/GitLab/Gitea repos; agent opens pull requests.
- `cortexskills.org/web-import/SKILL.md` — Harvest web pages into clean markdown via crawl4ai (MDHarvest).
- `cortexskills.org/tasks/SKILL.md` — Background task polling, cancellation, and cleanup.
- `cortexskills.org/x402/SKILL.md` — Pay-per-query x402 micropayments: the 402 → EIP-3009 → receipt handshake for paying agents, and config/verification/earnings for operators monetizing an instance.

### Ecosystem

- `cortexskills.org/hermes/SKILL.md` — **Long-term memory for the Hermes agent** (nousresearch.com). Installs as `/cortex`; "dump your session into your cortex" to save, "check your cortex for X" to recall. Connect to a cloud instance or self-host on your existing OpenRouter/Venice keys.
- `cortexskills.org/memory-hygiene/SKILL.md` — **Migrate a full local memory file into Cortex**: which entries stay local (routing facts) vs go to Cortex (episodic), synthesize → save → verify recall → shrink to pointers. For any agent with a MEMORY.md-style working memory.
- `cortexskills.org/mcp/SKILL.md` — MCP server for Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.
- `cortexskills.org/integration/SKILL.md` — Connect Cortex to LangChain, CrewAI, MCP, Slack, automation platforms, and more.
- `cortexskills.org/apps/SKILL.md` — Source and workflow apps (YouTube, Notion, Web Crawler).
- `cortexskills.org/builder/SKILL.md` — **Build ON Cortex**: turn any software's docs into an installable skill (`builder/skill`), or build a web app that runs inside a Cortex instance (`builder/app`). Start here when the user wants a custom integration or interface.
- `cortexskills.org/cortex-design/SKILL.md` — The Bold Typography design system for Cortex UIs.
