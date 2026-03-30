# CORTEXSKILLS

The missing knowledge layer between AI agents and the Cortex ecosystem.

## What is this?

AI models often hallucinate or rely on stale training data when asked to write code for specific, rapidly evolving systems. **Cortex Skills** solves this by providing curated, up-to-date Markdown files (`SKILL.md`) that AI agents can fetch directly via HTTP. 

Instead of guessing how the Cortex API or MOCA Library works, your agent simply reads the relevant skill file, gets the ground-truth knowledge, and builds the correct integration on the first try.

Inspired by [ethskills.com](https://ethskills.com/).

## How to use

When prompting your AI agent (Claude, ChatGPT, Cursor, etc.), simply tell it to fetch the relevant skill file before starting the task:

> *"Fetch `https://cortexskills.org/upload/SKILL.md` and use it to write a Python script that batch-uploads a folder of PDFs."*

For a complete index, point your agent to the root:
> *"Read `https://cortexskills.org/SKILL.md` to understand how to build on Cortex, then write an integration plan."*

## Available Skills

### Core
* `/setup` — Deploying Cortex via Docker, environment variables.
* `/auth` — API keys, permissions, prompt security.

### Features
* `/upload` — Document ingestion, formats, chunking.
* `/search` — Hybrid search (vector + keyword + graph).
* `/ask` — RAG Q&A, streaming, agentic reasoning.
* `/graph` — Knowledge graph, entities, relationships.
* `/collections` — Scoping documents by project/tenant.
* `/communities` — Auto-clustering and summarization.
* `/turbo` — GPU acceleration via Compute3.

### Ecosystem
* `/integration` — LangChain, CrewAI, MCP, Slack, Webhooks.
* `/apps` — Source and workflow apps (YouTube, Notion).
* `/cortex-design` — The generative design principles for building Cortex UIs.

## Development

The project is a minimalist Next.js application that serves the static markdown files and provides a terminal-like web interface to preview them.

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the web interface.

All skill definitions live in the `public/` directory so they can be served as raw static files with wide open CORS headers.

## License

MIT
