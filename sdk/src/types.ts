/** Shared types for the Cortex API client. */

export interface CortexClientOptions {
  /** Base URL of the Cortex instance, e.g. http://localhost:8000 */
  baseUrl: string;
  /** API key (cortex_rw_… read/write, cortex_ro_… read-only, cortex_pub_… monetized) */
  apiKey: string;
  /** Per-request timeout in ms for non-streaming calls (default 60000). */
  timeoutMs?: number;
  /** Custom fetch implementation (tests, polyfills). Defaults to global fetch. */
  fetch?: typeof fetch;
}

/** The unified research-depth dial (backend ≥ 2026-08-10; older backends get
 * the equivalent legacy flags automatically). */
export type AskDepth = "fast" | "standard" | "deep";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SearchResult {
  document_id: string;
  chunk_id: string;
  content: string;
  score: number;
  /** Human-readable label (filename). Populated on current backends; on older
   * ones fall back to metadata.filename. */
  document_title?: string | null;
  metadata: { filename?: string; chunk_index?: number; [k: string]: unknown };
  /** Conversation-stable source id (citation continuity across turns). */
  sid?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total_results: number;
  /** Alias of total_results on current backends. */
  total?: number;
}

export interface GraphEntity {
  name?: string;
  type?: string;
  description?: string;
  [k: string]: unknown;
}

export interface GraphContext {
  entities?: GraphEntity[];
  relationships?: { source?: string; target?: string; type?: string }[];
  chunks?: unknown[];
  communities?: unknown[];
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
  /** The collection scope that was actually applied. */
  collection_id?: string | null;
  /** Parsed JSON answer when response_format was set and parsing succeeded. */
  structured?: Record<string, unknown> | null;
  /** Updated conversation-memory blob (streaming asks that sent one). */
  memory_update?: Record<string, unknown>;
  /** Provider finish_reason of the answer ("stop", "length", …); non-streaming only. */
  finish_reason?: string | null;
  /** The answer hit the writer's output-token cap and is cut short (backends newer than v1.2.1). */
  truncated?: boolean;
  /** The answer is the canned prompt-injection refusal, not knowledge — rephrase as a plain question (backends newer than v1.2.1). */
  refused?: boolean;
}

/** One SSE frame from /api/ask/stream. Current backends stamp `type`; the
 * flat keys are always present, so key checks work against any version. */
export interface AskStreamEvent {
  type?: string;
  content?: string;
  status?: { stage?: string; message?: string };
  thinking?: string;
  reasoning?: string;
  retrieval?: string;
  retrieval_stats?: Record<string, unknown>;
  sub_questions?: string[];
  sources?: SearchResult[];
  graph_context?: GraphContext;
  communities_used?: number[];
  done?: boolean;
  /** On the done frame: a memory_update frame still follows — keep reading. */
  pending_memory?: boolean;
  /** On refusal content/done frames: the stream is a canned injection refusal, not an answer. */
  refused?: boolean;
  /** On the done frame: the writer hit its output-token cap. */
  truncated?: boolean;
  memory_update?: Record<string, unknown>;
  error?: string;
  [k: string]: unknown;
}

export interface AskOptions {
  /** Unified depth dial. Default "standard". "deep" streams (agentic research). */
  depth?: AskDepth;
  collection_id?: string;
  top_k?: number;
  use_graph?: boolean;
  use_reranking?: boolean;
  conversation_history?: ConversationMessage[];
  /** Opaque server-curated memory blob. Send {} to opt in on turn 1; replay
   * the memory_update you get back. (Streaming asks only.) */
  conversation_memory?: Record<string, unknown>;
  /** JSON Schema (root object) for a structured answer — non-streaming only. */
  response_format?: Record<string, unknown>;
}

export interface CortexDocument {
  id: string;
  filename?: string;
  file_type?: string;
  file_size?: number;
  upload_date?: string;
  chunk_count?: number;
  processing_status?: string;
  collection_id?: string | null;
  collection_name?: string | null;
  entity_count?: number;
  source?: string;
  [k: string]: unknown;
}

export interface ListDocumentsOptions {
  collection_id?: string;
  status?: string;
  /** upload_date|filename|file_size|chunk_count|processing_status|entity_count,
   * prefix "-" for descending. Requires a backend ≥ 2026-08-10 (older ones
   * ignore the params and return everything). */
  sort?: string;
  limit?: number;
  offset?: number;
}

export interface ListDocumentsResponse {
  documents: CortexDocument[];
  total: number;
  limit?: number | null;
  offset?: number | null;
}

export interface UploadOptions {
  collection_id?: string;
  /** Start the processing pipeline immediately (default true). */
  start_processing?: boolean;
  /** Provenance label, e.g. "my-agent". */
  source?: string;
}

export interface UploadResult {
  document_id: string;
  /** Alias of document_id on current backends. */
  id?: string;
  filename: string;
  status: string;
  message: string;
  source?: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string | null;
  document_count?: number;
  [k: string]: unknown;
}

export interface IngestionStatus {
  counts: Record<string, number>;
  active: {
    id: string;
    filename?: string;
    status?: string;
    queued: boolean;
    progress_current: number;
    progress_total: number;
    progress_message: string;
    live: boolean;
  }[];
  backlog: number;
  idle: boolean;
  total_documents: number;
}

export interface ContextOptions {
  collection_id?: string;
  /** Token budget for the assembled bundle (default 4000). */
  max_tokens?: number;
  top_k?: number;
  max_hops?: number;
  include_graph?: boolean;
  include_communities?: boolean;
  use_reranking?: boolean;
}

export interface ContextBundle {
  query: string;
  chunks: SearchResult[];
  graph_context?: GraphContext | null;
  communities: Record<string, unknown>[];
  /** Ready-to-inject text block (chunks cited [src_N], graph + community sections). */
  text: string;
  token_count: number;
  budget: Record<string, number>;
  collection_id?: string | null;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  description?: string;
  active: boolean;
  created_at?: string;
  delivery_count?: number;
  failure_count?: number;
  last_delivery_at?: string | null;
  last_status?: number | null;
  /** Returned ONCE at creation — store it. */
  secret?: string;
}

export interface ThreadState {
  history: ConversationMessage[];
  memory: Record<string, unknown>;
}

/** Pluggable persistence for conversation threads. */
export interface ThreadStore {
  load(name: string): Promise<ThreadState>;
  save(name: string, state: ThreadState): Promise<void>;
}
