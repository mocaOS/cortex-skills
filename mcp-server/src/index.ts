#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  CortexClient,
  type GraphContext,
  type SearchResult,
} from "./cortex-client.js";

const CORTEX_BASE_URL = process.env.CORTEX_BASE_URL;
const CORTEX_API_KEY = process.env.CORTEX_API_KEY;

if (!CORTEX_BASE_URL || !CORTEX_API_KEY) {
  console.error(
    "Missing required environment variables: CORTEX_BASE_URL and CORTEX_API_KEY"
  );
  process.exit(1);
}

const client = new CortexClient({
  baseUrl: CORTEX_BASE_URL,
  apiKey: CORTEX_API_KEY,
});

const server = new McpServer({
  name: "cortex",
  version: "0.2.0",
});

// --- Formatting helpers ---

function formatSources(sources: SearchResult[]): string {
  return sources
    .map((s, i) => {
      const filename = s.metadata?.filename ?? s.document_id;
      return `${i + 1}. ${filename} (doc:${s.document_id}, score: ${s.score?.toFixed(3) ?? "N/A"})`;
    })
    .join("\n");
}

function formatGraphContext(ctx: GraphContext): string {
  const parts: string[] = [];
  if (ctx.entities?.length) {
    const names = ctx.entities
      .slice(0, 15)
      .map((e) => (e.name ? `${e.name}${e.type ? ` (${e.type})` : ""}` : null))
      .filter(Boolean);
    if (names.length) parts.push(`Entities: ${names.join(", ")}`);
  }
  if (ctx.relationships?.length) {
    parts.push(`Relationships: ${ctx.relationships.length}`);
  }
  return parts.join("\n");
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

// --- Tools ---

server.tool(
  "search_knowledge",
  "Search the Cortex knowledge base using hybrid search (vector + keyword + metadata with reciprocal rank fusion). Returns the most relevant document chunks for a query.",
  {
    query: z.string().describe("The search query"),
    top_k: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Number of results to return (default: 10)"),
    collection_id: z
      .string()
      .optional()
      .describe("Scope search to a specific collection"),
  },
  async ({ query, top_k, collection_id }) => {
    const res = await client.search(query, { top_k, collection_id });
    const formatted = res.results
      .map((r, i) => {
        const filename = r.metadata?.filename ?? r.document_id;
        return `[${i + 1}] ${filename} (doc:${r.document_id}, score: ${r.score?.toFixed(3) ?? "N/A"})\n${r.content}`;
      })
      .join("\n\n---\n\n");

    return textResult(formatted || "No results found.");
  }
);

server.tool(
  "ask_question",
  "Ask a question to the Cortex RAG engine. Uses the knowledge graph and document chunks to generate an answer with source citations. Chat mode answers in seconds; deep_research runs an agentic multi-step researcher/writer pipeline and can take minutes.",
  {
    question: z.string().describe("The question to ask"),
    mode: z
      .enum(["chat", "deep_research"])
      .optional()
      .default("chat")
      .describe(
        "chat: fast single-pass answer; deep_research: agentic multi-step research (thorough but slow)"
      ),
    use_graph: z
      .boolean()
      .optional()
      .default(true)
      .describe("Include knowledge graph context (chat mode, default: true)"),
    collection_id: z
      .string()
      .optional()
      .describe("Scope the question to a specific collection"),
    top_k: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Number of chunks to retrieve per search (default: 5)"),
  },
  async ({ question, mode, use_graph, collection_id, top_k }) => {
    const result =
      mode === "deep_research"
        ? await client.askDeepResearch(question, { collection_id, top_k })
        : await client.ask(question, { use_graph, collection_id, top_k });

    let text = result.answer || "No answer generated.";
    if (result.sources?.length) {
      text += `\n\n**Sources:**\n${formatSources(result.sources)}`;
    }
    if (result.graph_context) {
      const ctx = formatGraphContext(result.graph_context);
      if (ctx) text += `\n\n**Graph context:**\n${ctx}`;
    }
    if (result.sub_questions?.length) {
      text += `\n\n**Sub-questions researched:**\n${result.sub_questions.map((q) => `- ${q}`).join("\n")}`;
    }

    return textResult(text);
  }
);

server.tool(
  "list_documents",
  "List documents in the Cortex knowledge base. Optionally filter by collection or processing status (filtering happens client-side).",
  {
    collection_id: z.string().optional().describe("Filter by collection ID"),
    status: z
      .enum(["pending", "processing", "extracting", "completed", "failed"])
      .optional()
      .describe("Filter by processing status"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .default(50)
      .describe("Max results (default: 50)"),
  },
  async ({ collection_id, status, limit }) => {
    const { documents, total } = await client.listDocuments({
      collection_id,
      status,
      limit,
    });
    const list = documents
      .map((d) => {
        const col = d.collection_name ? `, collection: ${d.collection_name}` : "";
        return `- **${d.filename}** (${d.id}) — status: ${d.processing_status}, chunks: ${d.chunk_count ?? 0}${col}`;
      })
      .join("\n");

    const suffix =
      total > documents.length
        ? `\n\n(${documents.length} of ${total} shown)`
        : "";
    return textResult(list ? list + suffix : "No documents found.");
  }
);

server.tool(
  "get_document",
  "Get details about a specific document including its processing status and metadata.",
  {
    document_id: z.string().describe("The document ID"),
  },
  async ({ document_id }) => {
    const doc = await client.getDocument(document_id);
    return textResult(JSON.stringify(doc, null, 2));
  }
);

server.tool(
  "get_document_content",
  "Get the full text content of a document (all chunks concatenated). Use after search or list_documents to read a whole document.",
  {
    document_id: z.string().describe("The document ID"),
  },
  async ({ document_id }) => {
    const doc = await client.getDocumentContent(document_id);
    const header = `# ${doc.filename} (${doc.id})\nStatus: ${doc.processing_status}, chunks: ${doc.chunks?.length ?? doc.chunk_count ?? 0}\n\n`;
    return textResult(header + (doc.full_content || "(no content extracted)"));
  }
);

server.tool(
  "list_entities",
  "List entities in the knowledge graph, with optional type filter and name/description search. Entities are extracted from documents: people, organizations, concepts, technologies, etc.",
  {
    entity_type: z
      .string()
      .optional()
      .describe(
        "Filter by entity type, e.g. Person, Organization, Concept, Technology, Location, Event, Product, System, Process"
      ),
    search: z
      .string()
      .optional()
      .describe("Search in entity names and descriptions"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .default(50)
      .describe("Max results (default: 50)"),
    skip: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Pagination offset"),
  },
  async ({ entity_type, search, limit, skip }) => {
    const { entities, total } = await client.listEntities({
      entity_type,
      search,
      limit,
      skip,
    });
    const list = entities
      .map(
        (e) =>
          `- **${e.name}** (${e.type}, ${e.mention_count ?? 0} mentions)${e.description ? `: ${e.description}` : ""}`
      )
      .join("\n");

    const suffix =
      total > entities.length ? `\n\n(${entities.length} of ${total} shown)` : "";
    return textResult(list ? list + suffix : "No entities found.");
  }
);

server.tool(
  "get_entity",
  "Get detailed information about a specific entity by exact name, including its relationships in the knowledge graph. Use search_entities first if you are unsure of the exact name.",
  {
    name: z.string().describe("The exact entity name"),
    max_hops: z
      .number()
      .int()
      .min(1)
      .max(3)
      .optional()
      .default(1)
      .describe("Graph traversal depth (default: 1)"),
  },
  async ({ name, max_hops }) => {
    const ctx = await client.getEntity(name, max_hops);
    return textResult(JSON.stringify(ctx, null, 2));
  }
);

server.tool(
  "search_entities",
  "Fuzzy-search knowledge graph entities by name. Use this to resolve an entity's exact name before calling get_entity.",
  {
    query: z.string().describe("Entity name or partial name to search for"),
  },
  async ({ query }) => {
    const { results } = await client.searchEntities(query);
    return textResult(
      results.length
        ? JSON.stringify(results, null, 2)
        : "No matching entities found."
    );
  }
);

server.tool(
  "list_collections",
  "List all collections in the knowledge base. Collections organize documents by project or tenant.",
  {},
  async () => {
    const { collections } = await client.listCollections();
    const list = collections
      .map(
        (c) =>
          `- **${c.name}** (${c.id})${c.description ? `: ${c.description}` : ""}${c.document_count !== undefined ? ` — ${c.document_count} docs` : ""}`
      )
      .join("\n");

    return textResult(list || "No collections found.");
  }
);

server.tool(
  "list_communities",
  "List auto-detected entity communities (clusters) in the knowledge graph. Communities group related entities with LLM-generated summaries.",
  {
    search: z
      .string()
      .optional()
      .describe("Search in community names, summaries, and member entities"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .default(50)
      .describe("Max results (default: 50)"),
  },
  async ({ search, limit }) => {
    const { communities, total } = await client.listCommunities({ search, limit });
    const list = communities
      .map(
        (c) =>
          `- **${c.name || `Community ${c.id}`}** (${c.entity_count ?? "?"} entities)${c.summary ? `\n  ${c.summary}` : ""}`
      )
      .join("\n");

    const suffix =
      total > communities.length
        ? `\n\n(${communities.length} of ${total} shown)`
        : "";
    return textResult(list ? list + suffix : "No communities found.");
  }
);

server.tool(
  "upload_document",
  "Upload a local file into the Cortex knowledge base. Requires an API key with `manage` permission. Processing (chunking, embedding, entity extraction) starts immediately unless start_processing is false.",
  {
    file_path: z.string().describe("Absolute path to the file to upload"),
    collection_id: z
      .string()
      .optional()
      .describe("Collection to add the document to (default collection if omitted)"),
    start_processing: z
      .boolean()
      .optional()
      .default(true)
      .describe("Start processing immediately (set false for bulk uploads)"),
  },
  async ({ file_path, collection_id, start_processing }) => {
    const res = await client.uploadDocument(file_path, {
      collection_id,
      start_processing,
    });
    return textResult(
      `Uploaded **${res.filename}** (${res.document_id}) — status: ${res.status}\n${res.message}`
    );
  }
);

server.tool(
  "get_stats",
  "Get knowledge base statistics: document counts by status, chunks, entities, relationships, communities, collections, and monthly usage.",
  {},
  async () => {
    const stats = await client.stats();
    const lines = [
      `Documents: ${stats.document_count} (completed: ${stats.completed_count ?? "?"}, pending: ${stats.pending_count ?? "?"}, processing: ${stats.processing_count ?? "?"}, failed: ${stats.failed_count ?? "?"})`,
      `Chunks: ${stats.chunk_count}`,
      `Entities: ${stats.entity_count}`,
      `Relationships: ${stats.relationship_count}`,
      `Communities: ${stats.community_count}`,
      `Collections: ${stats.collection_count}`,
    ];
    if (stats.monthly_usage_limit && stats.monthly_usage_limit > 0) {
      lines.push(
        `Monthly usage: ${stats.monthly_usage_used ?? 0}/${stats.monthly_usage_limit} LLM completions`
      );
    }
    return textResult(lines.join("\n"));
  }
);

// --- Resources ---

server.resource(
  "knowledge-base-stats",
  "cortex://stats",
  {
    description: "Current knowledge base statistics",
    mimeType: "application/json",
  },
  async () => {
    const stats = await client.stats();
    return {
      contents: [
        {
          uri: "cortex://stats",
          mimeType: "application/json",
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }
);

server.resource(
  "instance-health",
  "cortex://health",
  {
    description: "Cortex instance health (Neo4j connectivity, schema, version)",
    mimeType: "application/json",
  },
  async () => {
    const health = await client.health();
    return {
      contents: [
        {
          uri: "cortex://health",
          mimeType: "application/json",
          text: JSON.stringify(health, null, 2),
        },
      ],
    };
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
