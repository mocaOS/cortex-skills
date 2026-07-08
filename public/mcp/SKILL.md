---
name: mcp
description: Use this skill when setting up or configuring the Cortex MCP server for Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, or any MCP-compatible client. Covers installation from source, tool descriptions, configuration examples, and troubleshooting.
---

# MCP — Cortex as a Model Context Protocol Server

## What This Is

The Cortex MCP server gives any MCP-compatible AI client native access to your Cortex knowledge base. Instead of copy-pasting search results or manually querying APIs, your AI assistant can directly search, ask questions (fast chat or agentic deep research), read documents, upload files, and explore your knowledge graph.

**Source:** [`mcp-server/`](https://github.com/mocaOS/cortex-skills/tree/main/mcp-server) inside the cortex-skills repo.

## What You Probably Got Wrong

1. **The server is NOT on npm.** There is no published `@cortex/mcp-server` package — `npx -y @cortex/mcp-server` will fail (the `cortex-mcp` package on npm is an unrelated third-party project). Install from source (below).
2. **The MCP server is a separate process, not part of Cortex.** It is a lightweight stdio bridge that calls the Cortex REST API. You need a running Cortex instance first.
3. **You need an API key with at least `read` permission.** Create one at `{YOUR_BASE_URL}/admin` → API Keys (`cortex_ro_...`). Use a `cortex_rw_...` key (includes `manage`) if you want the `upload_document` tool to work.
4. **The server communicates via stdio, not HTTP.** MCP uses JSON-RPC over stdin/stdout. You do not need to expose any ports.
5. **Deep research runs over SSE internally.** The Cortex API only honors `use_agentic: true` on its streaming endpoint — the MCP server handles this for you: `ask_question` with `mode: "deep_research"` consumes `/api/ask/stream` and returns the aggregated answer. Expect deep research calls to take minutes.
6. **AgentSkills are not MCP tools.** The AgentSkills system (installing skills from the skills.sh registry) is a separate admin feature that extends the built-in researcher agent. See the [Admin skill](../admin/SKILL.md).

## Installation

Build once from source (Node.js >= 18):

```bash
git clone https://github.com/mocaOS/cortex-skills.git
cd cortex-skills/mcp-server
npm install
npm run build
```

The server entry point is now at `<clone-path>/mcp-server/dist/index.js`. All client configs below point `node` at that file.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["/absolute/path/to/cortex-skills/mcp-server/dist/index.js"],
      "env": {
        "CORTEX_BASE_URL": "http://localhost:8000",
        "CORTEX_API_KEY": "cortex_ro_your_key_here"
      }
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add cortex \
  --env CORTEX_BASE_URL=http://localhost:8000 \
  --env CORTEX_API_KEY=cortex_ro_your_key_here \
  -- node /absolute/path/to/cortex-skills/mcp-server/dist/index.js
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["/absolute/path/to/cortex-skills/mcp-server/dist/index.js"],
      "env": {
        "CORTEX_BASE_URL": "http://localhost:8000",
        "CORTEX_API_KEY": "cortex_ro_your_key_here"
      }
    }
  }
}
```

### Windsurf

Add the same server block to `~/.windsurf/mcp.json`.

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json` (note: `servers`, not `mcpServers`):

```json
{
  "servers": {
    "cortex": {
      "command": "node",
      "args": ["/absolute/path/to/cortex-skills/mcp-server/dist/index.js"],
      "env": {
        "CORTEX_BASE_URL": "http://localhost:8000",
        "CORTEX_API_KEY": "cortex_ro_your_key_here"
      }
    }
  }
}
```

## Available Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `search_knowledge` | Hybrid search (vector + keyword + metadata, RRF-fused) | `query`, `top_k`, `collection_id` |
| `ask_question` | RAG Q&A with source citations | `question`, `mode` (`chat` \| `deep_research`), `use_graph`, `collection_id`, `top_k` |
| `list_documents` | List documents in the knowledge base | `collection_id`, `status`, `limit` |
| `get_document` | Get document details and processing status | `document_id` |
| `get_document_content` | Read a document's full extracted text | `document_id` |
| `list_entities` | Browse knowledge graph entities | `entity_type`, `search`, `limit`, `skip` |
| `get_entity` | Get entity details and relationships (exact name) | `name`, `max_hops` |
| `search_entities` | Fuzzy entity name lookup | `query` |
| `list_collections` | List document collections | — |
| `list_communities` | View auto-detected entity communities | `search`, `limit` |
| `upload_document` | Upload a local file (needs `manage` key) | `file_path`, `collection_id`, `start_processing` |
| `get_stats` | Knowledge base statistics and monthly usage | — |

## Resources

| URI | Description |
|-----|-------------|
| `cortex://stats` | Live knowledge base statistics (JSON) |
| `cortex://health` | Instance health: Neo4j connectivity, schema state, version (JSON) |

## Example Prompts

Once the MCP server is connected, try these prompts in your AI client:

- "Search my knowledge base for deployment architecture"
- "What do my documents say about authentication patterns?"
- "Run a deep research question: compare how my documents describe X vs Y"
- "List all entities of type Technology in my knowledge graph"
- "Read the full content of the onboarding document"
- "Upload ~/reports/q3.pdf into the research collection"

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CORTEX_BASE_URL` | Yes | Full URL to your Cortex instance (e.g., `http://localhost:8000`) |
| `CORTEX_API_KEY` | Yes | API key with at least `read` permission; `manage` needed for `upload_document` |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `npx @cortex/mcp-server` fails | The package is not on npm. Install from source and point `node` at `mcp-server/dist/index.js` |
| "Missing required environment variables" | Ensure both `CORTEX_BASE_URL` and `CORTEX_API_KEY` are set in your MCP client config |
| Connection refused | Verify your Cortex instance is running: `curl {BASE_URL}/health` |
| 401 Unauthorized | API key is invalid or expired — generate a new one from the admin panel |
| 403 on `upload_document` | Your key lacks `manage` permission — use a `cortex_rw_` key |
| Tools not appearing | Restart your MCP client after config changes; check client logs for connection errors |
| `ask_question` slow / times out | `deep_research` mode runs an agentic pipeline that can take minutes — use `chat` mode (the default) for quick answers, and raise your MCP client's tool timeout for deep research |

## Skill Files

| File | Description |
|------|-------------|
| [references/TOOLS.md](references/TOOLS.md) | Detailed tool schemas, response formats, and REST endpoint mappings |
