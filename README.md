<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/cortex_banner_white.png">
    <img alt="Cortex" src="brand/cortex_banner_black.png" width="420">
  </picture>
</p>

<h1 align="center">CORTEXSKILLS</h1>

<p align="center">The missing knowledge layer between AI agents and the Cortex ecosystem.</p>

## What is this?

AI models often hallucinate or rely on stale training data when asked to write code for specific, rapidly evolving systems. **Cortex Skills** solves this by providing curated, up-to-date Markdown files (`SKILL.md`) that AI agents can fetch directly via HTTP. 

Instead of guessing how the Cortex API works, your agent simply reads the relevant skill file, gets the ground-truth knowledge, and builds the correct integration on the first try.

## What is Cortex?

[**Cortex**](https://github.com/mocaOS/cortex-app) is an agentic knowledge base — the long-term memory layer for the AI era. It ingests your documents (PDF, Office, markdown, images, audio, web pages, git repos), extracts entities and relationships with LLM-assisted workflows, and grows them into a **knowledge graph** stored in Neo4j. On top of that graph it offers hybrid search (vector + keyword + graph traversal), streaming Q&A with citations, and an agentic Deep Research mode — all exposed through a clean REST API with scoped read-only / read-write keys.

Where an agent's context window is short-term memory, Cortex is the store that survives crashes, redeployments, and framework migrations: agents dump what they learn into collections and recall synthesized, cited knowledge later. It's self-hostable with Docker in minutes and provider-agnostic (OpenAI, OpenRouter, Venice, or your own gateway).

- **Core repo:** [github.com/mocaOS/cortex-app](https://github.com/mocaOS/cortex-app)
- **Documentation:** [docs.cortex.eco](https://docs.cortex.eco)
- **Agent skills (this repo, served live):** [cortexskills.org](https://cortexskills.org)

## How to use

When prompting your AI agent (Claude, ChatGPT, Cursor, etc.), simply tell it to fetch the relevant skill file before starting the task:

> *"Fetch `https://cortexskills.org/upload/SKILL.md` and use it to write a Python script that batch-uploads a folder of PDFs."*

For a complete index, point your agent to the root:
> *"Read `https://cortexskills.org/SKILL.md` to understand how to build on Cortex, then write an integration plan."*

## Available Skills

### Core
* `/cortex` — Use a running instance: sync agent memory, hybrid search, agentic Q&A.
* `/setup` — Self-hosting Cortex via Docker, environment variables.
* `/auth` — API keys (read/manage + admin key), collection scoping, prompt security.
* `/admin` — Instance management, AgentSkills, export/import, system reset.

### Features
* `/upload` — Document ingestion, formats, chunking.
* `/search` — Hybrid search (vector + keyword + graph).
* `/ask` — RAG Q&A, streaming, agentic reasoning, conversation memory.
* `/graph` — Knowledge graph, entities, relationships.
* `/collections` — Scoping documents by project/tenant.
* `/communities` — Auto-clustering and summarization.
* `/git-integration` — Connect GitHub/GitLab/Gitea repos; agent opens PRs.
* `/web-import` — Harvest web pages into markdown via crawl4ai (MDHarvest).
* `/tasks` — Background task polling, cancellation, cleanup.

### Ecosystem
* `/hermes` — Long-term memory for the Hermes agent (nousresearch.com). Installs as `/cortex`; dump sessions and recall them via natural language.
* `/memory-hygiene` — Migrate a full local MEMORY.md into a Cortex collection: stay/go heuristic, verify-before-delete procedure, outbox template. Pairs with `/cortex`.
* `/mcp` — MCP server for Claude Desktop, Cursor, Windsurf, and any MCP client. The server itself lives in this repo under [`mcp-server/`](mcp-server/).
* `/integration` — LangChain, CrewAI, MCP, Slack, Webhooks.
* `/apps` — Source and workflow apps (YouTube, Notion).
* `/builder` — Build ON Cortex: turn any software's docs into an installable skill (`/builder/skill`), or build a web app that runs inside a Cortex instance (`/builder/app`, pairs with [cortex-app-template](https://github.com/mocaOS/cortex-app-template)).
* `/cortex-design` — The generative design principles for building Cortex UIs.

## MCP Server

The Cortex MCP server is maintained here under [`mcp-server/`](mcp-server/). It bridges any MCP-compatible client (Claude Desktop, Claude Code, Cursor, Windsurf, VS Code) to a running Cortex instance over its REST API. It is not published to npm — build it from source:

```bash
cd mcp-server
npm install
npm run build
```

See [`mcp-server/README.md`](mcp-server/README.md) or the [`/mcp` skill](public/mcp/SKILL.md) for client configuration.

## Development

The project is a minimalist Next.js application that serves the static markdown files and provides a terminal-like web interface to preview them.

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the web interface.

All skill definitions live in the `public/` directory so they can be served as raw static files with wide open CORS headers. The MCP server package in `mcp-server/` has its own independent toolchain and is excluded from the Next.js build.

## Credits

Inspired by [ethskills.com](https://ethskills.com/).

## License

MIT
