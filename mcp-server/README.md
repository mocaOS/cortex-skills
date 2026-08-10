# @mocaos/cortex-mcp

MCP (Model Context Protocol) server for the [Cortex](https://github.com/mocaOS/cortex-app) knowledge base. Gives Claude Desktop, Claude Code, Cursor, Windsurf, and any MCP client native tools over your Cortex instance: hybrid search, unified ask (fast chat or agentic deep research) with **conversation threads**, documents, the knowledge graph, collections, communities, uploads, and stats.

Built on the official [`@mocaos/cortex-client`](https://www.npmjs.com/package/@mocaos/cortex-client) SDK.

## Run

```bash
CORTEX_BASE_URL=http://localhost:8000 CORTEX_API_KEY=cortex_ro_… npx @mocaos/cortex-mcp
```

### Claude Code

```bash
claude mcp add cortex -e CORTEX_BASE_URL=http://localhost:8000 -e CORTEX_API_KEY=<key> -- npx @mocaos/cortex-mcp
```

### Claude Desktop / Cursor / Windsurf (JSON config)

```json
{
  "mcpServers": {
    "cortex": {
      "command": "npx",
      "args": ["@mocaos/cortex-mcp"],
      "env": {
        "CORTEX_BASE_URL": "http://localhost:8000",
        "CORTEX_API_KEY": "cortex_ro_..."
      }
    }
  }
}
```

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `CORTEX_BASE_URL` | yes | Cortex instance URL |
| `CORTEX_API_KEY` | yes | API key (`cortex_ro_…` read-only, `cortex_rw_…` read/write) |
| `CORTEX_STATE_DIR` | no | Where conversation threads persist (default `~/.cortex-mcp`). Point at `~/.hermes/skills/state/cortex` to share threads with the Hermes skill's `cortex.sh --thread`. |

## Tools

`search_knowledge` · `ask_question` (modes `chat`/`deep_research`, optional `thread` for multi-turn memory) · `list_documents` · `get_document` · `get_document_content` · `list_entities` · `get_entity` · `search_entities` · `list_collections` · `list_communities` · `upload_document` (manage keys) · `get_stats` — plus `cortex://stats` and `cortex://health` resources.

Full reference: [cortexskills.org/mcp](https://cortexskills.org/mcp/SKILL.md).

## Development

```bash
npm install && npm run build   # from the cortex-skills repo root (npm workspaces)
node mcp-server/dist/index.js
```
