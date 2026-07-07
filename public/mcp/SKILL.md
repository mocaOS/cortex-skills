---
name: mcp
description: Use this skill when setting up or configuring the Cortex MCP server for Claude Desktop, Cursor, Windsurf, VS Code, or any MCP-compatible client. Covers installation, tool descriptions, configuration examples, and troubleshooting.
---

# MCP — Cortex as a Model Context Protocol Server

## What This Is

The Cortex MCP server gives any MCP-compatible AI client native access to your Cortex knowledge base. Instead of copy-pasting search results or manually querying APIs, your AI assistant can directly search, ask questions, and explore your knowledge graph.

**Repo:** [github.com/mocaOS/cortex-mcp](https://github.com/mocaOS/cortex-mcp)

## What You Probably Got Wrong

1. **The MCP server is a separate package, not part of Cortex.** It is a lightweight bridge that calls the Cortex REST API. You need a running Cortex instance first.
2. **Authentication uses environment variables, not config files.** Set `CORTEX_BASE_URL` and `CORTEX_API_KEY` in your MCP client config.
3. **You need an API key with at least `read` permission.** Get one from `{YOUR_BASE_URL}/admin` → API Keys. Add `manage` permission if you also want upload/mutation capabilities.
4. **The server communicates via stdio, not HTTP.** MCP uses JSON-RPC over stdin/stdout. You do not need to expose any ports.
5. **AgentSkills are not MCP tools.** The AgentSkills system (installing skills from the skills.sh registry) is a separate admin feature that extends the built-in researcher agent. It has nothing to do with the MCP server. See the [Admin skill](../admin/SKILL.md) for AgentSkills management.

## Installation

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "cortex": {
      "command": "npx",
      "args": ["-y", "@cortex/mcp-server"],
      "env": {
        "CORTEX_BASE_URL": "http://localhost:8000",
        "CORTEX_API_KEY": "cortex_ro_your_key_here"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "npx",
      "args": ["-y", "@cortex/mcp-server"],
      "env": {
        "CORTEX_BASE_URL": "http://localhost:8000",
        "CORTEX_API_KEY": "cortex_ro_your_key_here"
      }
    }
  }
}
```

### Windsurf

Add to `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "npx",
      "args": ["-y", "@cortex/mcp-server"],
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
claude mcp add cortex -- npx -y @cortex/mcp-server
```

Set environment variables in your shell or pass them via `--env`:

```bash
export CORTEX_BASE_URL="http://localhost:8000"
export CORTEX_API_KEY="cortex_ro_your_key_here"
```

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "cortex": {
      "command": "npx",
      "args": ["-y", "@cortex/mcp-server"],
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
| `search_knowledge` | Hybrid search (vector + keyword + graph traversal) | `query`, `top_k`, `collection_id` |
| `ask_question` | RAG Q&A with source citations | `question`, `use_graph`, `use_agentic`, `collection_id` |
| `list_documents` | List documents in the knowledge base | `collection_id`, `status`, `limit` |
| `get_document` | Get document details and processing status | `document_id` |
| `list_entities` | Browse knowledge graph entities | `type`, `limit` |
| `get_entity` | Get entity details and relationships | `name` |
| `list_collections` | List document collections | — |
| `list_communities` | View auto-detected entity communities | — |
| `get_stats` | Knowledge base statistics | — |

## Resources

| URI | Description |
|-----|-------------|
| `cortex://stats` | Live knowledge base statistics (JSON) |

## Example Prompts

Once the MCP server is connected, try these prompts in your AI client:

- "Search my knowledge base for deployment architecture"
- "What do my documents say about authentication patterns?"
- "List all entities of type Technology in my knowledge graph"
- "How many documents are in my knowledge base?"
- "Show me the entity communities and their summaries"

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CORTEX_BASE_URL` | Yes | Full URL to your Cortex instance (e.g., `http://localhost:8000`) |
| `CORTEX_API_KEY` | Yes | API key with at least `read` permission |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Missing required environment variables" | Ensure both `CORTEX_BASE_URL` and `CORTEX_API_KEY` are set in your MCP client config |
| Connection refused | Verify your Cortex instance is running: `curl {BASE_URL}/health` |
| 401 Unauthorized | API key is invalid or expired — generate a new one from the admin panel |
| Tools not appearing | Restart your MCP client after config changes; check client logs for connection errors |
| Slow responses on `ask_question` | Leave `use_agentic: false` (the default) for faster answers; `use_agentic: true` runs slower multi-step research |

## Skill Files

| File | Description |
|------|-------------|
| [references/TOOLS.md](references/TOOLS.md) | Detailed tool schemas and response formats |
