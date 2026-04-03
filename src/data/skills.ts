export interface Skill {
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: "core" | "features" | "ecosystem" | "design";
}

export const skills: Skill[] = [
  {
    slug: "setup",
    name: "Setup",
    description:
      "Deploy MOCA Library via Docker or Coolify. All 50+ environment variables, first steps, and health checks.",
    icon: "Settings",
    category: "core",
  },
  {
    slug: "auth",
    name: "Auth",
    description:
      "API key management with 4 permission tiers (read, manage, admin). X-API-Key auth, session security, and prompt injection protection.",
    icon: "Shield",
    category: "core",
  },
  {
    slug: "admin",
    name: "Admin",
    description:
      "Instance management — AgentSkills registry, export/import, system reset, admin session auth, and system statistics.",
    icon: "ShieldCheck",
    category: "core",
  },
  {
    slug: "upload",
    name: "Upload",
    description:
      "Document ingestion for PDF, DOCX, XLSX, PPTX, HTML, images, audio, and LaTeX. Chunking config, batch processing, custom inputs, and vision analysis.",
    icon: "Upload",
    category: "features",
  },
  {
    slug: "search",
    name: "Search",
    description:
      "Hybrid search combining vector similarity (0.5), keyword matching (0.3), and graph traversal (0.2). RRF fusion with cross-encoder re-ranking.",
    icon: "Search",
    category: "features",
  },
  {
    slug: "ask",
    name: "Ask",
    description:
      "RAG-powered Q&A with streaming SSE, agentic multi-step reasoning, deep research mode, conversation history, and collection scoping.",
    icon: "MessageSquare",
    category: "features",
  },
  {
    slug: "graph",
    name: "Graph",
    description:
      "Knowledge graph operations — 10 entity types, typed relationships, subgraph queries, multi-hop traversal, and semantic entity resolution.",
    icon: "GitFork",
    category: "features",
  },
  {
    slug: "collections",
    name: "Collections",
    description:
      "Organize documents by team, project, or use case. Scoped knowledge graphs, bulk operations, and document assignment.",
    icon: "FolderOpen",
    category: "features",
  },
  {
    slug: "communities",
    name: "Communities",
    description:
      "Automatic entity clustering via Louvain algorithm. LLM-generated community summaries that enrich RAG context and discovery.",
    icon: "Users",
    category: "features",
  },
  {
    slug: "turbo",
    name: "Turbo",
    description:
      "GPU-accelerated inference via Compute3. Start/stop dedicated B200 GPU jobs with per-second billing for massive document uploads.",
    icon: "Zap",
    category: "features",
  },
  {
    slug: "tasks",
    name: "Tasks",
    description:
      "Background task system — poll for completion, cancel long-running jobs, and clean up old tasks. Used by community detection, summarization, and bulk processing.",
    icon: "Clock",
    category: "features",
  },
  {
    slug: "mcp",
    name: "MCP",
    description:
      "Model Context Protocol server for Cortex. Give Claude Desktop, Cursor, Windsurf, and any MCP client native access to your knowledge base.",
    icon: "Plug",
    category: "ecosystem",
  },
  {
    slug: "integration",
    name: "Integration",
    description:
      "Connect Cortex to LangChain, CrewAI, AutoGen, LangGraph, ElizaOS, MCP, Slack bots, webhooks, and automation platforms.",
    icon: "Link",
    category: "ecosystem",
  },
  {
    slug: "apps",
    name: "Apps",
    description:
      "App ecosystem — YouTube Importer, Web Crawler, Notion Sync, Slack Archive Importer, Research Dashboard, API Playground, and custom builds.",
    icon: "LayoutGrid",
    category: "ecosystem",
  },
  {
    slug: "cortex-design",
    name: "Cortex Design",
    description:
      "The Bold Typography design system for Cortex-ecosystem UIs. Dark mode, orange accent, sharp edges, Inter Tight + JetBrains Mono, and full component specs.",
    icon: "Palette",
    category: "design",
  },
];

export const categories = [
  { id: "core" as const, label: "CORE", description: "Get started" },
  { id: "features" as const, label: "FEATURES", description: "API capabilities" },
  { id: "ecosystem" as const, label: "ECOSYSTEM", description: "Integrate & extend" },
  { id: "design" as const, label: "DESIGN", description: "Build UIs" },
];
