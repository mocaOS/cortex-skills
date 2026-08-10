/** CortexClient — the official TypeScript client for the Cortex API.
 *
 * Design notes:
 * - Version-tolerant: requests send BOTH the unified `depth` dial and the
 *   equivalent legacy flags (they always agree, so new backends accept them
 *   and old backends simply ignore `depth`). Responses are read through the
 *   alias fields with fallbacks to the legacy names.
 * - Streaming: `askStream()` yields typed events; `ask()` with depth "deep"
 *   transparently uses the streaming endpoint (the only place the backend
 *   runs agentic research) and aggregates it.
 * - Threads: `client.thread(name)` carries conversation history plus the
 *   server-curated memory blob across asks. See threads.ts.
 */

import { collectAskStream, parseSSEStream } from "./sse.js";
import { CortexThread, MemoryThreadStore } from "./threads.js";
import type {
  AskOptions,
  AskResult,
  AskStreamEvent,
  Collection,
  ContextBundle,
  ContextOptions,
  CortexClientOptions,
  CortexDocument,
  IngestionStatus,
  ListDocumentsOptions,
  ListDocumentsResponse,
  SearchResponse,
  ThreadStore,
  UploadOptions,
  UploadResult,
  WebhookEndpoint,
} from "./types.js";

export class CortexApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly errorCode?: string;

  constructor(status: number, statusText: string, body: unknown) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? (body as { detail: unknown }).detail
        : body;
    const code =
      detail && typeof detail === "object" && "error" in detail
        ? String((detail as { error: unknown }).error)
        : undefined;
    const message =
      typeof detail === "string"
        ? detail
        : detail && typeof detail === "object" && "message" in detail
          ? String((detail as { message: unknown }).message)
          : statusText;
    super(`Cortex API error ${status}: ${message}`);
    this.name = "CortexApiError";
    this.status = status;
    this.body = body;
    this.errorCode = code;
  }
}

const DEFAULT_TIMEOUT_MS = 60_000;

export class CortexClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private threadStore: ThreadStore;

  constructor(options: CortexClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? fetch;
    this.threadStore = new MemoryThreadStore();
  }

  /** True for read-only (cortex_ro_) keys — write calls will be refused server-side. */
  get isReadOnly(): boolean {
    return this.apiKey.startsWith("cortex_ro_");
  }

  /** Swap the thread persistence (e.g. FileThreadStore for cortex.sh interop). */
  useThreadStore(store: ThreadStore): this {
    this.threadStore = store;
    return this;
  }

  // -- HTTP core ------------------------------------------------------------

  private headers(extra?: Record<string, string>): Record<string, string> {
    return { "X-API-Key": this.apiKey, ...extra };
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    { timeoutMs }: { timeoutMs?: number } = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      timeoutMs ?? this.timeoutMs
    );
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: this.headers(init.headers as Record<string, string>),
        signal: controller.signal,
      });
      const text = await res.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        /* non-JSON body stays a string */
      }
      if (!res.ok) throw new CortexApiError(res.status, res.statusText, body);
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private json(body: unknown): RequestInit {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  // -- Health / stats ---------------------------------------------------------

  async health(): Promise<{ status: string; neo4j_connected: boolean; [k: string]: unknown }> {
    const res = await this.fetchImpl(`${this.baseUrl}/health`);
    if (!res.ok) throw new CortexApiError(res.status, res.statusText, await res.text());
    return res.json() as Promise<{ status: string; neo4j_connected: boolean }>;
  }

  async stats(): Promise<Record<string, unknown>> {
    return this.request("/api/stats");
  }

  async ingestionStatus(): Promise<IngestionStatus> {
    return this.request("/api/ingestion/status");
  }

  // -- Ask --------------------------------------------------------------------

  private buildAskBody(question: string, options: AskOptions): Record<string, unknown> {
    const depth = options.depth ?? "standard";
    const body: Record<string, unknown> = {
      question,
      // Unified dial + agreeing legacy flags: new backends take depth as
      // authoritative, old backends (no depth field) read the flags.
      depth,
      use_agentic: depth === "deep",
      use_fast_search: depth === "fast",
    };
    if (options.collection_id) body.collection_id = options.collection_id;
    if (options.top_k != null) body.top_k = options.top_k;
    if (options.use_graph != null) body.use_graph = options.use_graph;
    if (options.use_reranking != null) body.use_reranking = options.use_reranking;
    if (options.conversation_memory !== undefined) {
      body.conversation_history = options.conversation_history ?? [];
      body.conversation_memory = options.conversation_memory;
    } else if (options.conversation_history?.length) {
      body.conversation_history = options.conversation_history;
    }
    if (options.response_format) body.response_format = options.response_format;
    return body;
  }

  /** Ask a question and get the complete result.
   *
   * depth "fast"/"standard" use the non-streaming endpoint; "deep" (agentic
   * research, can take minutes) transparently runs over SSE and aggregates —
   * pass onContent to observe tokens as they stream.
   */
  async ask(
    question: string,
    options: AskOptions & { onContent?: (token: string) => void } = {}
  ): Promise<AskResult> {
    const { onContent, ...askOptions } = options;
    const wantsMemory = askOptions.conversation_memory !== undefined;
    if ((askOptions.depth ?? "standard") === "deep" || wantsMemory || onContent) {
      // Streaming path: required for deep research, and the only path that
      // returns a memory_update.
      if (askOptions.response_format) {
        throw new CortexApiError(400, "Bad Request", {
          detail: {
            error: "response_format_requires_non_streaming",
            message: "response_format only works with depth fast|standard and no streaming",
          },
        });
      }
      return collectAskStream(this.askStream(question, askOptions), { onContent });
    }
    return this.request<AskResult>("/api/ask", this.json(this.buildAskBody(question, askOptions)));
  }

  /** Stream a question — yields every typed SSE event (content, status,
   * thinking, sources, done, memory_update, …). Reads to stream end. */
  async *askStream(question: string, options: AskOptions = {}): AsyncGenerator<AskStreamEvent> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/ask/stream`, {
      method: "POST",
      headers: this.headers({
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      }),
      body: JSON.stringify(this.buildAskBody(question, options)),
    });
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* keep raw */
      }
      throw new CortexApiError(res.status, res.statusText, body);
    }
    yield* parseSSEStream(res.body);
  }

  /** Deep research (agentic multi-step retrieval + reasoning). Minutes, not
   * seconds — the thorough option for multi-part and cross-document questions. */
  async deepResearch(
    question: string,
    options: Omit<AskOptions, "depth"> & { onContent?: (token: string) => void } = {}
  ): Promise<AskResult> {
    return this.ask(question, { ...options, depth: "deep" });
  }

  /** A named conversation thread: carries history + the server-curated memory
   * blob across asks, so follow-up questions work. */
  thread(name: string): CortexThread {
    return new CortexThread(this, name, this.threadStore);
  }

  /** Assemble a token-budgeted context bundle (reranked chunks + graph +
   * community summaries) for injection into YOUR OWN prompt — retrieval
   * without Cortex writing the answer. Requires a backend with /api/context
   * (2026-08-10+); older instances return 404. */
  async getContext(query: string, options: ContextOptions = {}): Promise<ContextBundle> {
    return this.request<ContextBundle>(
      "/api/context",
      this.json({ query, ...options })
    );
  }

  // -- Search -------------------------------------------------------------------

  async search(
    query: string,
    options: { top_k?: number; collection_id?: string } = {}
  ): Promise<SearchResponse> {
    const body: Record<string, unknown> = { query };
    if (options.top_k != null) body.top_k = options.top_k;
    if (options.collection_id) {
      // filters placement works on every backend version
      body.filters = { collection_id: options.collection_id };
    }
    return this.request<SearchResponse>("/api/search", this.json(body));
  }

  // -- Documents -------------------------------------------------------------------

  async listDocuments(options: ListDocumentsOptions = {}): Promise<ListDocumentsResponse> {
    const qs = new URLSearchParams();
    if (options.collection_id) qs.set("collection_id", options.collection_id);
    if (options.status) qs.set("status", options.status);
    if (options.sort) qs.set("sort", options.sort);
    if (options.limit != null) qs.set("limit", String(options.limit));
    if (options.offset != null) qs.set("offset", String(options.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.request<ListDocumentsResponse>(`/api/documents${suffix}`);
  }

  async getDocument(documentId: string): Promise<CortexDocument> {
    return this.request(`/api/documents/${encodeURIComponent(documentId)}`);
  }

  async getDocumentContent(
    documentId: string
  ): Promise<CortexDocument & { full_content?: string; chunks?: unknown[] }> {
    return this.request(`/api/documents/${encodeURIComponent(documentId)}/content`);
  }

  async deleteDocument(documentId: string): Promise<unknown> {
    return this.request(`/api/documents/${encodeURIComponent(documentId)}`, {
      method: "DELETE",
    });
  }

  /** Poll until a document finishes processing (completed/failed). */
  async waitForDocument(
    documentId: string,
    { timeoutMs = 180_000, intervalMs = 3_000 }: { timeoutMs?: number; intervalMs?: number } = {}
  ): Promise<CortexDocument> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const doc = await this.getDocument(documentId);
      const status = (doc.processing_status ?? "").toLowerCase();
      if (status === "completed" || status === "failed") return doc;
      if (Date.now() >= deadline) {
        throw new CortexApiError(408, "Request Timeout", {
          detail: `Document ${documentId} still '${status}' after ${timeoutMs}ms`,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  // -- Upload ----------------------------------------------------------------------

  /** Upload a document. `content` may be a string, Blob, or Uint8Array. */
  async upload(
    filename: string,
    content: string | Blob | Uint8Array,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const form = new FormData();
    const blob =
      content instanceof Blob
        ? content
        : new Blob([content instanceof Uint8Array ? (content as BlobPart) : content]);
    form.append("file", blob, filename);
    const qs = new URLSearchParams();
    if (options.collection_id) qs.set("collection_id", options.collection_id);
    qs.set("start_processing", String(options.start_processing ?? true));
    if (options.source) qs.set("source", options.source);
    const result = await this.request<UploadResult>(`/api/upload?${qs}`, {
      method: "POST",
      body: form,
    });
    return result;
  }

  // -- Collections --------------------------------------------------------------------

  async listCollections(): Promise<Collection[]> {
    const res = await this.request<{ collections?: Collection[] } | Collection[]>(
      "/api/collections"
    );
    return Array.isArray(res) ? res : (res.collections ?? []);
  }

  async createCollection(name: string, description = ""): Promise<Collection> {
    return this.request<Collection>(
      "/api/collections",
      this.json({ name, description })
    );
  }

  /** Find a collection by name, creating it when missing (requires a manage key). */
  async ensureCollection(name: string, description = ""): Promise<Collection> {
    const existing = (await this.listCollections()).find((c) => c.name === name);
    if (existing) return existing;
    return this.createCollection(name, description);
  }

  // -- Knowledge graph ------------------------------------------------------------------

  async listEntities(
    options: { entity_type?: string; search?: string; limit?: number; skip?: number } = {}
  ): Promise<{ entities: Record<string, unknown>[]; total: number }> {
    const qs = new URLSearchParams();
    if (options.entity_type) qs.set("entity_type", options.entity_type);
    if (options.search) qs.set("search", options.search);
    if (options.limit != null) qs.set("limit", String(options.limit));
    if (options.skip != null) qs.set("skip", String(options.skip));
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.request(`/api/graph/entities${suffix}`);
  }

  /** Entity with its relationship neighborhood (max_hops 1-3). */
  async getEntity(name: string, maxHops = 1): Promise<Record<string, unknown>> {
    return this.request(
      `/api/graph/entity/${encodeURIComponent(name)}?max_hops=${maxHops}`
    );
  }

  async searchEntities(
    query: string
  ): Promise<{ query: string; results: Record<string, unknown>[] }> {
    return this.request(`/api/graph/search?query=${encodeURIComponent(query)}`);
  }

  async listCommunities(
    options: { search?: string; limit?: number; skip?: number } = {}
  ): Promise<{ communities: Record<string, unknown>[]; total: number }> {
    const qs = new URLSearchParams();
    if (options.search) qs.set("search", options.search);
    if (options.limit != null) qs.set("limit", String(options.limit));
    if (options.skip != null) qs.set("skip", String(options.skip));
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.request(`/api/graph/communities${suffix}`);
  }

  // -- Webhooks (admin key required) -----------------------------------------------------

  async listWebhooks(): Promise<WebhookEndpoint[]> {
    const res = await this.request<{ webhooks: WebhookEndpoint[] }>("/api/admin/webhooks");
    return res.webhooks;
  }

  /** Register a webhook endpoint. The returned `secret` is shown ONCE — store it. */
  async createWebhook(
    url: string,
    options: { events?: string[]; description?: string } = {}
  ): Promise<WebhookEndpoint> {
    return this.request<WebhookEndpoint>(
      "/api/admin/webhooks",
      this.json({ url, events: options.events ?? [], description: options.description ?? "" })
    );
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.request(`/api/admin/webhooks/${encodeURIComponent(webhookId)}`, {
      method: "DELETE",
    });
  }

  async testWebhook(webhookId: string): Promise<{ ok: boolean; status_code?: number; error?: string }> {
    return this.request(`/api/admin/webhooks/${encodeURIComponent(webhookId)}/test`, {
      method: "POST",
    });
  }
}
