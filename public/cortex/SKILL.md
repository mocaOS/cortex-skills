---
name: cortex
description: >
  Sync agent memory files to a Cortex knowledge graph for enhanced retrieval,
  hybrid search (vector + keyword + graph), AI-powered Q&A with agentic deep research,
  and knowledge graph exploration. Use when uploading documents, searching knowledge,
  asking questions about accumulated memories, or syncing memory files to a knowledge base.
license: MIT
compatibility: >
  Requires curl, jq (or python3 as fallback), and network access to a Cortex instance.
  Works with any agent that can execute shell commands.
metadata:
  author: Cortex
  version: "2.0.0"
  category: knowledge
  emoji: "\U0001F4DA"
allowed-tools: Bash Read Write
---

# Cortex Skill

Sync your agent memory files to a **Cortex** knowledge graph. Upload documents, search your knowledge base, and ask AI-powered questions with agentic deep research capabilities.

All memory files are organized within a single dedicated collection (default: **OpenClaw**). If this collection doesn't exist, the skill automatically creates it.

## Skill Files

| File | Description |
|------|-------------|
| **SKILL.md** (this file) | Main skill documentation — self-contained; every workflow below runs with `curl` + `jq` |
| [references/API.md](references/API.md) | Full API reference (100+ endpoints) |
| [references/SYNC.md](references/SYNC.md) | Detailed sync workflow, heartbeat cadence, and troubleshooting |

---

## First-Time Setup

### Step 1: Get Your Base URL and API Key

You need **both** a base URL and an API key.

Ask your human to provide:

1. **Base URL** - The full URL to their Cortex instance (e.g., `https://cortex.example.com`)
2. **API Key** - From `YOUR_BASE_URL/admin` -> API Keys, with **READ** and **MANAGE** permissions

### Step 2: Configure Credentials

```bash
mkdir -p ~/.openclaw/skills/library/state
cat > ~/.openclaw/skills/library/state/credentials.json << 'EOF'
{
  "api_key": "YOUR_API_KEY_HERE",
  "base_url": "YOUR_BASE_URL_HERE",
  "collection_id": null
}
EOF
```

### Step 3: Validate the Connection

```bash
API_KEY=$(cat ~/.openclaw/skills/library/state/credentials.json | jq -r '.api_key')
API_BASE=$(cat ~/.openclaw/skills/library/state/credentials.json | jq -r '.base_url')

if [ -z "$API_KEY" ] || [ "$API_KEY" = "null" ] || [ -z "$API_BASE" ] || [ "$API_BASE" = "null" ]; then
  echo "Missing credentials. Both api_key and base_url are required."
  exit 1
fi

curl -s "$API_BASE/health" -H "X-API-Key: $API_KEY"
```

Expected: `{"status": "healthy", "neo4j_connected": true, "version": "1.0.0"}`

### Step 4: Find or Create Collection

```bash
API_KEY=$(cat ~/.openclaw/skills/library/state/credentials.json | jq -r '.api_key')
API_BASE=$(cat ~/.openclaw/skills/library/state/credentials.json | jq -r '.base_url')
COLLECTION_NAME="OpenClaw"

COLLECTIONS=$(curl -s "$API_BASE/api/collections" -H "X-API-Key: $API_KEY")
COLLECTION_ID=$(echo "$COLLECTIONS" | jq -r ".collections[] | select(.name == \"$COLLECTION_NAME\") | .id" | head -n1)

if [ -z "$COLLECTION_ID" ] || [ "$COLLECTION_ID" = "null" ]; then
  CREATE_RESULT=$(curl -s -X POST "$API_BASE/api/collections" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$COLLECTION_NAME\", \"description\": \"Memory files synced from agent\"}")
  COLLECTION_ID=$(echo "$CREATE_RESULT" | jq -r '.id')
fi

jq --arg cid "$COLLECTION_ID" '.collection_id = $cid' \
  ~/.openclaw/skills/library/state/credentials.json > ~/.openclaw/skills/library/state/credentials.json.tmp
mv ~/.openclaw/skills/library/state/credentials.json.tmp ~/.openclaw/skills/library/state/credentials.json
echo "Collection ID: $COLLECTION_ID"
```

---

## Memory Directories

Default memory locations scanned for sync:
- `~/.openclaw/memory/` - Primary memory storage
- `~/.openclaw/conversations/` - Conversation logs
- **QMD sessions**: `~/.openclaw/agents/main/qmd/sessions/` - When QMD is enabled

**Supported file types:** `.md`, `.txt`, `.json`

---

## Upload API

**CRITICAL:** Upload parameters (`collection_id`, `start_processing`) MUST be URL query parameters, NOT form fields:

```bash
# CORRECT:
curl -X POST "$API_BASE/api/upload?collection_id=$COLLECTION_ID&start_processing=true" \
  -H "X-API-Key: $API_KEY" \
  -F "file=@/path/to/file.md"

# WRONG (will not work):
# curl -X POST "$API_BASE/api/upload" -F "collection_id=$COLLECTION_ID" -F "file=@..."
```

### Single File Upload

```bash
curl -X POST "$API_BASE/api/upload?collection_id=$COLLECTION_ID&start_processing=true" \
  -H "X-API-Key: $API_KEY" \
  -F "file=@/path/to/memory.md"
```

### Bulk Upload (Recommended for Multiple Files)

1. Upload all files without processing:
```bash
curl -X POST "$API_BASE/api/upload?collection_id=$COLLECTION_ID&start_processing=false" \
  -H "X-API-Key: $API_KEY" \
  -F "file=@/path/to/file.md"
```

2. Trigger batch processing:
```bash
curl -X POST "$API_BASE/api/documents/process-pending" \
  -H "X-API-Key: $API_KEY"
```

---

## Search & Ask

### Hybrid Search

Combines vector (0.5), keyword (0.3), and graph traversal (0.2) with cross-encoder reranking.

```bash
curl -X POST "$API_BASE/api/search" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "your search query", "top_k": 10}'
```

**Collection-scoped search** - add `"collection_id": "col_xxx"` to search within a specific collection.

### Ask AI (RAG Query)

Two modes, selected with the `use_agentic` boolean (there is no `mode` field):
- **Chat mode** (`use_agentic: false`, the default): up to 3 research iterations, ~1200-token answers — fast.
- **Deep Research mode** (`use_agentic: true`): up to 8 agentic iterations with reasoning, ~4000-token answers.

```bash
curl -X POST "$API_BASE/api/ask" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"question": "What do I know about topic X?", "use_agentic": false}'
```

**Streaming** - use `/api/ask/stream` for real-time SSE responses:
```bash
curl -N "$API_BASE/api/ask/stream" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"question": "Summarize what I know about machine learning"}'
```

SSE events are flat-keyed JSON objects (switch on which key is present, there is no `type` field): `content` (answer tokens), `status`, `thinking`, `reasoning`, `retrieval`, `sources`, `graph_context`, `done` (carries `pending_memory: true` when memory compaction follows), `memory_update` (emitted after `done`), `error`.

---

## Knowledge Graph Features

Cortex builds a knowledge graph from your documents with:

- **Entity extraction** - 10 types: Person, Organization, Concept, Technology, Location, Event, Product, Document, System, Process
- **Relationship analysis** - 14 standard types with per-chunk and cross-document relationship discovery, confidence scoring (< 0.5 filtered)
- **Community detection** - Leiden/Louvain clustering with LLM-generated summaries
- **Entity deduplication** - Fuzzy matching (rapidfuzz) with merge/dismiss workflow
- **Graph visualization** - Interactive force-graph with dynamic expansion

### Pipeline (3 steps)

1. **Entity Extraction** - Per-document, with fuzzy entity resolution (rapidfuzz)
2. **Relationship Analysis** - Targeted discovery by default (kNN + co-mention candidate pairs, verified by an LLM); supports incremental or full rebuild. (A legacy full-scan `llm_scan` mode is still available.)
3. **Community Detection** - Weighted graph clustering (Leiden/Louvain) with automatic summarization

---

## Upload Tracking

Files are tracked in `~/.openclaw/skills/library/state/uploaded_files.json` using SHA-256 hashes to avoid duplicates. Tracking is updated immediately after each upload to survive interruptions.

---

## Collections

Organize documents into logical groups. Each collection has its own scoped search and entity graph.

```bash
# List collections
curl "$API_BASE/api/collections" -H "X-API-Key: $API_KEY"

# Create collection
curl -X POST "$API_BASE/api/collections" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Collection", "description": "Description"}'
```

---

## Custom Inputs

Add knowledge manually without uploading files (Q&A pairs, text, markdown):

Fields: `input_type` (`qa` | `text` | `markdown`), `content` (required — for a Q&A pair this holds the **question**), `answer` (Q&A only), optional `title`.

```bash
curl -X POST "$API_BASE/api/custom-input" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input_type": "qa", "content": "What is X?", "answer": "X is..."}'
```

---

## Authentication

All API requests require an API key via `X-API-Key` header.

**Permissions:** an API key holds one or both of two values — `read` (Ask AI, search, view graph/stats) and `manage` (upload, edit, delete documents and collections). There is no separate `write`/`delete`/`admin` permission. Full-instance operations (API-key management, system reset, config) require the root **admin API key** (`ADMIN_API_KEY`), not a permission tier. Keys can also be **collection-scoped** (`all` or `restricted` to specific collections).

---

## Error Handling

| Error | Action |
|-------|--------|
| Missing credentials | Ask human for both base URL and API key |
| 401 Unauthorized | API key invalid or expired, request a new one |
| Connection refused | Service may be down, retry later |
| Collection not found | Skill auto-creates the collection |
| Upload failed | File not tracked, retried on next sync |

---

## When to Sync

- **Automatic:** Every 4+ hours via heartbeat (see the cadence guidance in [references/SYNC.md](references/SYNC.md))
- **Manual:** When human says "sync memories" or before answering questions needing historical context
- **Don't sync:** Every few minutes, empty/temporary files, or files still being written

---

## Full API Reference

See [references/API.md](references/API.md) for the complete 100+ endpoint API reference.

## Detailed Sync Workflow

See [references/SYNC.md](references/SYNC.md) for the full sync workflow, QMD support, and troubleshooting.

---

## Version History

- **2.0.0** - Rewritten for AgentSkills open standard; renamed to Cortex; added deep research, collections, communities, custom inputs, image analysis, streaming, entity dedup
- **1.3.0** - Added QMD (Quick Memory Daemon) support
- **1.2.0** - Clarified API parameter format (URL query params)
- **1.1.0** - Added base_url configuration
- **1.0.0** - Initial release
