# Cortex MCP Server

MCP (Model Context Protocol) server for [Cortex](https://github.com/mocaOS/cortex-app) — the open-source agentic knowledge base.

Gives any MCP-compatible client (Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, etc.) native access to your Cortex instance: hybrid search, RAG Q&A (chat + agentic deep research), document management, and knowledge graph exploration.

> This package lives inside [cortex-skills](https://github.com/mocaOS/cortex-skills). It is not published to npm — install from source (below).

## Install

```bash
git clone https://github.com/mocaOS/cortex-skills.git
cd cortex-skills/mcp-server
npm install
npm run build
```

The server binary is now at `<clone-path>/mcp-server/dist/index.js`.

## Quick Start

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["/absolute/path/to/cortex-skills/mcp-server/dist/index.js"],
      "env": {
        "CORTEX_BASE_URL": "http://localhost:8000",
        "CORTEX_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Cursor / Windsurf

Add to `.cursor/mcp.json` or equivalent:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["/absolute/path/to/cortex-skills/mcp-server/dist/index.js"],
      "env": {
        "CORTEX_BASE_URL": "http://localhost:8000",
        "CORTEX_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add cortex \
  --env CORTEX_BASE_URL=http://localhost:8000 \
  --env CORTEX_API_KEY=your_api_key_here \
  -- node /absolute/path/to/cortex-skills/mcp-server/dist/index.js
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CORTEX_BASE_URL` | Yes | URL of your Cortex instance |
| `CORTEX_API_KEY` | Yes | API key with `read` permission (or `manage` for uploads) — create one at `{BASE_URL}/admin` → API Keys |

## Tools

| Tool | Description |
|------|-------------|
| `search_knowledge` | Hybrid search (vector + keyword + metadata, RRF-fused) across your knowledge base |
| `ask_question` | RAG Q&A with source citations — `chat` (fast) or `deep_research` (agentic, minutes) mode |
| `list_documents` | List documents, filter by collection or processing status |
| `get_document` | Get document details and processing status |
| `get_document_content` | Read a document's full extracted text |
| `list_entities` | Browse knowledge graph entities with type filter and search |
| `get_entity` | Get entity details and relationships (exact name) |
| `search_entities` | Fuzzy entity name lookup — resolve names before `get_entity` |
| `list_collections` | List document collections |
| `list_communities` | View auto-detected entity communities with summaries |
| `upload_document` | Upload a local file (requires `manage` key) |
| `get_stats` | Knowledge base statistics and monthly usage |

## Resources

| URI | Description |
|-----|-------------|
| `cortex://stats` | Live knowledge base statistics |
| `cortex://health` | Instance health (Neo4j connectivity, schema, version) |

## Development

```bash
cd mcp-server
npm install
npm run dev  # watch mode
```

## License

MIT
