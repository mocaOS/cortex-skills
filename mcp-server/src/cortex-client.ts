/**
 * HTTP client for the Cortex REST API.
 *
 * Contract mirrors cortex-app `backend/app/main.py` / `models.py`:
 * - Auth via `X-API-Key` header (read key for queries, manage key for uploads)
 * - List endpoints return envelopes ({results}, {documents}, {entities}, ...)
 * - Collection scoping on search goes through `filters.collection_id`
 * - Deep research (`use_agentic: true`) is only honored on the SSE streaming
 *   endpoint — the non-streaming /api/ask returns 400 `agentic_requires_streaming`
 */

export interface CortexConfig {
  baseUrl: string;
  apiKey: string;
}

export interface SearchResult {
  document_id: string;
  chunk_id: string;
  content: string;
  score: number;
  metadata?: {
    filename?: string;
    chunk_index?: number;
    rerank_score?: number;
    [key: string]: unknown;
  };
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total_results: number;
}

export interface GraphContext {
  entities?: Array<{ name?: string; type?: string; description?: string }>;
  relationships?: Array<{
    source?: string;
    target?: string;
    type?: string;
    description?: string;
  }>;
  [key: string]: unknown;
}

export interface AskResult {
  question?: string;
  answer: string;
  sources: SearchResult[];
  graph_context?: GraphContext | null;
  reasoning_steps?: string[] | null;
  sub_questions?: string[] | null;
  communities_used?: number[] | null;
  reranked?: boolean;
  collection_id?: string | null;
}

export interface Document {
  id: string;
  filename: string;
  file_type?: string;
  file_size?: number;
  upload_date?: string;
  chunk_count?: number;
  processing_status: string;
  error_message?: string;
  collection_id?: string | null;
  collection_name?: string | null;
  source?: string;
  entity_count?: number;
  [key: string]: unknown;
}

export interface DocumentContent extends Document {
  chunks?: Array<{ id: string; content: string; chunk_index: number }>;
  full_content?: string;
}

export interface Entity {
  name: string;
  type: string;
  description?: string;
  mention_count?: number;
}

export interface EntityContext {
  entities: Array<Record<string, unknown>>;
  relationships: Array<Record<string, unknown>>;
  chunks?: Array<Record<string, unknown>>;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  document_count?: number;
  [key: string]: unknown;
}

export interface Community {
  id: string | number;
  name?: string;
  summary?: string;
  entity_count?: number;
  sample_entities?: string[];
}

export interface Stats {
  document_count: number;
  chunk_count: number;
  entity_count: number;
  relationship_count: number;
  community_count: number;
  collection_count: number;
  pending_count?: number;
  processing_count?: number;
  completed_count?: number;
  failed_count?: number;
  entity_type_counts?: Record<string, number>;
  monthly_usage_used?: number;
  monthly_usage_limit?: number;
  disk_free_mb?: number;
  disk_total_mb?: number;
  [key: string]: unknown;
}

export interface UploadResult {
  document_id: string;
  filename: string;
  status: string;
  message: string;
  source?: string;
}

/** A single SSE frame from /api/ask/stream — exactly one key is set per event. */
interface AskStreamEvent {
  content?: string;
  sources?: SearchResult[];
  graph_context?: GraphContext;
  thinking?: string;
  sub_questions?: string[];
  retrieval?: string;
  retrieval_stats?: Record<string, unknown>;
  communities_used?: number[];
  done?: boolean;
  error?: string;
}

export class CortexClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: CortexConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
      ...((options.headers as Record<string, string>) || {}),
    };

    const res = await fetch(url, { ...options, headers });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Cortex API error ${res.status} ${res.statusText}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  async health(): Promise<{
    status: string;
    neo4j_connected: boolean;
    schema_initialized?: boolean;
    version: string;
  }> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json() as Promise<{
      status: string;
      neo4j_connected: boolean;
      schema_initialized?: boolean;
      version: string;
    }>;
  }

  async stats(): Promise<Stats> {
    return this.request<Stats>("/api/stats");
  }

  async search(
    query: string,
    options?: { top_k?: number; collection_id?: string }
  ): Promise<SearchResponse> {
    const body: Record<string, unknown> = { query };
    if (options?.top_k) body.top_k = options.top_k;
    if (options?.collection_id) {
      body.filters = { collection_id: options.collection_id };
    }

    return this.request<SearchResponse>("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /** Fast chat answer via the non-streaming endpoint (use_agentic must stay false). */
  async ask(
    question: string,
    options?: {
      top_k?: number;
      use_graph?: boolean;
      collection_id?: string;
    }
  ): Promise<AskResult> {
    const body: Record<string, unknown> = { question, use_agentic: false };
    if (options?.top_k) body.top_k = options.top_k;
    if (options?.use_graph !== undefined) body.use_graph = options.use_graph;
    if (options?.collection_id) body.collection_id = options.collection_id;

    return this.request<AskResult>("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /**
   * Deep research via the SSE streaming endpoint (the only place the backend
   * honors use_agentic). Aggregates the stream into one final result.
   */
  async askDeepResearch(
    question: string,
    options?: { top_k?: number; collection_id?: string }
  ): Promise<AskResult> {
    const body: Record<string, unknown> = { question, use_agentic: true };
    if (options?.top_k) body.top_k = options.top_k;
    if (options?.collection_id) body.collection_id = options.collection_id;

    const res = await fetch(`${this.baseUrl}/api/ask/stream`, {
      method: "POST",
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`Cortex API error ${res.status} ${res.statusText}: ${text}`);
    }

    const result: AskResult = { answer: "", sources: [] };
    const steps: string[] = [];

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handleEvent = (ev: AskStreamEvent) => {
      if (ev.error) throw new Error(`Cortex stream error: ${ev.error}`);
      if (ev.content) result.answer += ev.content;
      if (ev.sources) result.sources = ev.sources;
      if (ev.graph_context) result.graph_context = ev.graph_context;
      if (ev.thinking) steps.push(ev.thinking);
      if (ev.retrieval) steps.push(ev.retrieval);
      if (ev.sub_questions) result.sub_questions = ev.sub_questions;
      if (ev.communities_used) result.communities_used = ev.communities_used;
    };

    let done = false;
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines; payloads are on `data:` lines
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          let ev: AskStreamEvent;
          try {
            ev = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          handleEvent(ev);
          if (ev.done) done = true;
        }
      }
    }

    if (steps.length) result.reasoning_steps = steps;
    return result;
  }

  /**
   * GET /api/documents takes no query parameters — the API returns everything
   * visible to the key; filtering is done client-side here.
   */
  async listDocuments(options?: {
    collection_id?: string;
    status?: string;
    limit?: number;
  }): Promise<{ documents: Document[]; total: number }> {
    const res = await this.request<{ documents: Document[]; total: number }>(
      "/api/documents"
    );

    let docs = res.documents;
    if (options?.collection_id) {
      docs = docs.filter((d) => d.collection_id === options.collection_id);
    }
    if (options?.status) {
      docs = docs.filter((d) => d.processing_status === options.status);
    }
    const total = docs.length;
    if (options?.limit) docs = docs.slice(0, options.limit);

    return { documents: docs, total };
  }

  async getDocument(docId: string): Promise<Document> {
    return this.request<Document>(`/api/documents/${encodeURIComponent(docId)}`);
  }

  async getDocumentContent(docId: string): Promise<DocumentContent> {
    return this.request<DocumentContent>(
      `/api/documents/${encodeURIComponent(docId)}/content`
    );
  }

  async listEntities(options?: {
    entity_type?: string;
    search?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ entities: Entity[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.entity_type) params.set("entity_type", options.entity_type);
    if (options?.search) params.set("search", options.search);
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.skip) params.set("skip", String(options.skip));

    const qs = params.toString();
    return this.request<{ entities: Entity[]; total: number }>(
      `/api/graph/entities${qs ? `?${qs}` : ""}`
    );
  }

  async getEntity(name: string, maxHops = 1): Promise<EntityContext> {
    return this.request<EntityContext>(
      `/api/graph/entity/${encodeURIComponent(name)}?max_hops=${maxHops}`
    );
  }

  async searchEntities(
    query: string
  ): Promise<{ query: string; results: Array<Record<string, unknown>> }> {
    return this.request<{ query: string; results: Array<Record<string, unknown>> }>(
      `/api/graph/search?query=${encodeURIComponent(query)}`
    );
  }

  async listCollections(): Promise<{ collections: Collection[]; total: number }> {
    return this.request<{ collections: Collection[]; total: number }>(
      "/api/collections"
    );
  }

  async listCommunities(options?: {
    search?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ communities: Community[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.search) params.set("search", options.search);
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.skip) params.set("skip", String(options.skip));

    const qs = params.toString();
    return this.request<{ communities: Community[]; total: number }>(
      `/api/graph/communities${qs ? `?${qs}` : ""}`
    );
  }

  /** Requires an API key with `manage` permission. */
  async uploadDocument(
    filePath: string,
    options?: { collection_id?: string; start_processing?: boolean }
  ): Promise<UploadResult> {
    const { readFile } = await import("node:fs/promises");
    const { basename } = await import("node:path");

    const fileBuffer = await readFile(filePath);
    const fileName = basename(filePath);

    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(fileBuffer)]), fileName);

    const params = new URLSearchParams();
    if (options?.collection_id) params.set("collection_id", options.collection_id);
    if (options?.start_processing !== undefined) {
      params.set("start_processing", String(options.start_processing));
    }

    const qs = params.toString();
    return this.request<UploadResult>(`/api/upload${qs ? `?${qs}` : ""}`, {
      method: "POST",
      body: formData as unknown as BodyInit,
    });
  }
}
