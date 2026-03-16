---
name: ship
description: Use this skill when building anything on the Cortex intelligence ecosystem. It is the master orchestrator that routes you to the right skill at each phase of development — from deployment and document ingestion to querying, integration, and shipping.
---

# Ship — End-to-End Guide for Building on Cortex

## What You Probably Got Wrong

1. **Cortex is not a SaaS with a fixed URL.** It is built on MOCA Library, an open-source self-hosted system. The base URL is wherever the user deployed it (e.g., `http://localhost:8000` or their production domain). Always use `{BASE_URL}` as a placeholder.

2. **It is not just a vector database.** Cortex builds a full knowledge graph with entities, relationships, and communities using GraphRAG on top of Neo4j. It combines vector search, keyword search, and graph traversal — not just embeddings.

3. **Authentication is X-API-Key header, not Bearer tokens.** Every API call (except `/health`) requires an `X-API-Key` header. Keys have permission tiers: read, manage, admin.

4. **Documents are processed asynchronously.** Upload returns immediately with a document ID. Processing (chunking, embedding, entity extraction) happens in the background. You must poll for completion.

5. **There are 60+ API endpoints**, not just upload and search. The API covers documents, search, RAG Q&A, knowledge graph operations, collections, communities, background tasks, API key management, and GPU turbo mode.

6. **The streaming endpoints use Server-Sent Events (SSE)**, not WebSockets. Use `POST /api/ask/stream` with `Accept: text/event-stream`.

## Architecture Overview

Cortex is an intelligence ecosystem for knowledge and memory:

```
Documents → MOCA Library Backend (FastAPI + Haystack) → Neo4j (Graph + Vector)
                    ↓                                        ↓
              Entity Extraction (LLM)              Knowledge Graph
                    ↓                                        ↓
              Hybrid Search (Vector + Keyword + Graph) → RAG Q&A
```

**Tech stack:** FastAPI backend, Neo4j database, Next.js frontend, OpenAI/Anthropic/local LLMs.

## The Four Phases

### Phase 1: Plan & Deploy

Set up your MOCA Library instance and configure it for your use case.

| Task | Skill to Fetch |
|------|---------------|
| Deploy with Docker | `setup/SKILL.md` |
| Configure environment variables | `setup/SKILL.md` |
| Understand API authentication | `auth/SKILL.md` |
| Create API keys | `auth/SKILL.md` |

### Phase 2: Upload & Ingest

Get your documents into the knowledge graph.

| Task | Skill to Fetch |
|------|---------------|
| Upload documents (PDF, DOCX, etc.) | `upload/SKILL.md` |
| Configure chunking strategy | `upload/SKILL.md` |
| Batch process documents | `upload/SKILL.md` |
| Add custom Q&A pairs | `upload/SKILL.md` |
| Organize into collections | `collections/SKILL.md` |

### Phase 3: Query & Build

Search your knowledge base and build features on top of it.

| Task | Skill to Fetch |
|------|---------------|
| Hybrid search (vector + keyword + graph) | `search/SKILL.md` |
| RAG Q&A with citations | `ask/SKILL.md` |
| Streaming responses (SSE) | `ask/SKILL.md` |
| Agentic multi-step reasoning | `ask/SKILL.md` |
| Explore the knowledge graph | `graph/SKILL.md` |
| Entity and relationship queries | `graph/SKILL.md` |
| Community detection and summaries | `communities/SKILL.md` |
| Collection-scoped queries | `collections/SKILL.md` |

### Phase 4: Integrate & Ship

Connect Cortex to your agent framework, build your UI, and deploy.

| Task | Skill to Fetch |
|------|---------------|
| LangChain / CrewAI / AutoGen | `integration/SKILL.md` |
| MCP server for Claude | `integration/SKILL.md` |
| Slack bots, webhooks, Zapier | `integration/SKILL.md` |
| App ecosystem (YouTube, Notion, Slack) | `apps/SKILL.md` |
| GPU-accelerated processing | `turbo/SKILL.md` |
| Build a Cortex-style UI | `cortex-design/SKILL.md` |

## What to Fetch by Task

| Task | Recommended Skills |
|------|-------------------|
| Planning a new Cortex integration | `ship/`, `setup/` |
| Setting up authentication | `auth/` |
| Uploading and processing documents | `upload/`, `collections/` |
| Searching a knowledge base | `search/` |
| Building an AI Q&A feature | `ask/` |
| Exploring the knowledge graph | `graph/`, `communities/` |
| Connecting to an agent framework | `integration/` |
| Extending with apps | `apps/` |
| Accelerating with GPU | `turbo/` |
| Building a frontend UI | `cortex-design/` |

## Quick Start (3 Commands)

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
  -d '{"question": "What were the key findings in the report?", "use_graph": true}'
```

## API Authentication Pattern

Every request uses this pattern:

```bash
curl -X {METHOD} "{BASE_URL}/api/{endpoint}" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

- `{BASE_URL}` — Where the user deployed MOCA Library (e.g., `http://localhost:8000`)
- `{API_KEY}` — An API key with appropriate permissions (format: `moca_ro_...` or `moca_rw_...`)
- All responses are JSON unless streaming (SSE)

## Key Endpoints Summary

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
| `GET` | `/api/graph/visualization` | read | Graph data for visualization |
| `GET` | `/api/collections` | read | List collections |
| `POST` | `/api/collections` | manage | Create collection |
| `GET` | `/api/graph/communities` | read | List communities |
| `POST` | `/api/admin/api-keys` | admin | Create API key |

## Resources

- [MOCA Library GitHub](https://github.com/mocaOS/library)
- [API Documentation](https://docs-library.moca.qwellco.de/)
- [Cortex Product Page](https://cortex.moca.qwellco.de/)
- [Live Demo](https://library.moca.qwellco.de/)
