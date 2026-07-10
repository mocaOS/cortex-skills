# Configuration Reference

Complete environment variable reference for Cortex. Every variable, its type, default value, and description, organized by category.

This file complements the main `setup/SKILL.md` which covers installation, service URLs, health checks, and troubleshooting. Refer here for the exhaustive variable list with full detail on each.

---

## Required Variables

These must be set for Cortex to start.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NEO4J_URI` | `string` | -- | Neo4j Bolt connection URI. Use `bolt://neo4j:7687` inside Docker Compose (service name), or `bolt://localhost:7687` from the host. |
| `NEO4J_USER` | `string` | -- | Neo4j username. Typically `neo4j`. |
| `NEO4J_PASSWORD` | `string` | -- | Neo4j password. Must be a strong, unique value in production. |
| `OPENAI_API_KEY` | `string` | -- | API key for the primary LLM provider. Despite the name, any OpenAI-compatible endpoint works (Anthropic via LiteLLM, local Ollama, etc.). |
| `ADMIN_EMAIL` | `string` | -- | Email address for the admin account used to log into the frontend web UI. |
| `ADMIN_PASSWORD` | `string` | -- | Password for the admin frontend login. Use a strong, unique value. |
| `ADMIN_API_KEY` | `string` | -- | Root admin API key, created at startup. Must start with `cortex_admin_`. This is the only way to create the admin key -- it cannot be created through the API. |
| `SESSION_SECRET` | `string` | -- | Secret used to sign JWT session tokens for frontend auth. Must be at least 32 characters. Generate with `openssl rand -base64 32`. |

---

## LLM Configuration

### Primary Model

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `OPENAI_API_KEY` | `string` | -- | API key for the primary LLM. Required. |
| `OPENAI_API_BASE` | `string` | `https://api.openai.com/v1` | Base URL for the primary LLM API. Change this to point at any OpenAI-compatible endpoint (LiteLLM, Ollama, vLLM, etc.). |
| `OPENAI_MODEL` | `string` | `google-gemma-4-26b-a4b-it` | Model ID for the primary LLM used for Q&A, research, and chat. |
| `OPENAI_MODEL_FAST_MODE` | `string` | `` (inherits `OPENAI_MODEL`) | Model ID for Fast Mode -- a cheaper/faster model used when the user selects fast search. Empty = falls back to `OPENAI_MODEL`. |
| `OPENAI_MAX_OUTPUT_TOKENS` | `integer` | `8000` | Floor of the output-token budget chain. Default output tokens for every LLM call. |
| `OPENAI_MAX_CONTEXT` | `integer` | `256000` | Floor of the input-context budget chain, sized to the recommended large-context primary. This budget serves chat/answers; the extraction window is governed separately by `GRAPH_EXTRACTION_MAX_CONTEXT` (the value it inherits from here is clamped at 48000, so the large floor never leaks into extraction batch sizing — see below). |
| `LLM_REQUEST_TIMEOUT_SECONDS` | `integer` | `360` | Explicit transport timeout on every LLM client the backend builds (the SDK default is 600s, which lets one hung provider connection pin an ingestion slot for 10 minutes). For streaming, the read component applies between chunks, so long answers are unaffected. `0` restores the SDK default. |

### Embedding Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `EMBEDDING_MODEL` | `string` | `openai/text-embedding-3-small` | Model ID for generating vector embeddings. |
| `EMBEDDING_DIMENSION` | `integer` | `1536` | Dimensionality of embedding vectors. Must match the model's output dimension. |
| `EMBEDDING_MAX_INPUT_TOKENS` | `integer` | `5400` | Maximum input tokens per embedding request. The client counts tokens with `cl100k`, but providers validate with their **own** tokenizer, which can count 1.2–1.4× higher on punctuation-heavy text — so chunks that pass an 8192 client-side check get 400-rejected upstream. `5400 × ~1.4 ≈ 7500` stays under every 8192-cap provider, including `text-embedding-3-small` (8191 cap). Smaller chunks also embed more precisely into 1536-dim vectors. |
| `EMBEDDING_SEND_DIMENSIONS` | `boolean` | `true` | Whether to send the `dimensions` parameter to the embedding API. Set to `false` for models with fixed output dimensions that do not accept this parameter. |
| `USE_OPENAI_EMBEDDINGS` | `boolean` | `true` | Use the OpenAI-compatible embedding endpoint. |
| `EMBEDDING_API_BASE` | `string` | value of `OPENAI_API_BASE` | API base URL for the embedding provider, if different from the primary LLM. |
| `EMBEDDING_API_KEY` | `string` | value of `OPENAI_API_KEY` | API key for the embedding provider, if different from the primary LLM. |

---

## Document Processing

### Upload Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `UPLOAD_DIR` | `string` | `/app/uploads` | Directory where uploaded files are stored on disk. |
| `CUSTOM_INPUTS_DIR` | `string` | `/app/custom_inputs` | Directory where custom input files (Q&A, text, markdown) are stored. |
| `MAX_FILE_SIZE_MB` | `integer` | `50` | Maximum allowed file size for uploads in megabytes. |
| `MAX_REQUEST_BODY_MB` | `integer` | `32` | Global request-body ceiling for non-file-upload endpoints, enforced by middleware on both `Content-Length` and streamed bodies — oversized requests are rejected with HTTP `413` before they can pressure memory. File-upload routes get `MAX_FILE_SIZE_MB` + slack; library import gets `MAX_IMPORT_BODY_MB`. `0` disables the middleware. |
| `MAX_IMPORT_BODY_MB` | `integer` | `2048` | Body ceiling for the library-import routes (`/api/admin/import*`), which stream to disk rather than RAM. Returns HTTP `413` when exceeded. `0` = unlimited. |
| `MIN_FREE_DISK_MB` | `integer` | `500` | Free-space floor for the uploads filesystem. Uploads, reprocessing, and library-import sessions are refused with HTTP `507 Insufficient Storage` when accepting the data would leave less than this free — disk-full corrupts Neo4j checkpoints, so refusing new data early is strictly safer. `0` disables the guard. |

### Chunking Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CHUNK_SIZE` | `integer` | `500` | Number of tokens per chunk when using token-based chunking (`CHUNK_BY=token`). |
| `CHUNK_OVERLAP` | `integer` | `50` | Number of overlapping tokens between consecutive chunks. Provides continuity across chunk boundaries. |
| `CHUNK_BY` | `string` | `sentence` | Chunking strategy. `"sentence"` splits by sentence boundaries (recommended), `"token"` splits by token count. |
| `SENTENCES_PER_CHUNK` | `integer` | `5` | Number of sentences per chunk when using sentence-based chunking (`CHUNK_BY=sentence`). |

### Batch Processing

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `BATCH_PROCESSING_CONCURRENCY` | `integer` | `2` | Number of documents processed concurrently during batch operations (`POST /api/documents/process-pending`). `2` is the shipped default and the recommended value: live measurement showed 3 concurrent documents drop per-call decode speed (~70 → ~23 tok/s) and multiply timeouts, so 2 finishes builds *faster* than 3. |
| `PROCESSING_THREAD_WORKERS` | `integer` | `4` | Number of thread workers used for document processing tasks. |
| `AUTO_RESUME_PENDING_ON_STARTUP` | `boolean` | `true` | Automatically resume documents stranded mid-processing by a restart/redeploy (quota-guarded). Bulk uploads parked deliberately with `start_processing=false` stay parked. Set `false` to require a manual trigger after every redeploy. |
| `AUTO_RESUME_IMAGE_ANALYSIS` | `boolean` | `true` | Automatically resume image analysis killed by a restart. A restart leaves completed documents with frozen image counters (`current < total`) that would otherwise stick forever; on boot Cortex re-extracts their images via local Docling re-conversion (CPU only, no LLM cost) and analyzes **only** the images whose chunk isn't stored yet — already-paid vision/extraction work is never redone. Quota-guarded. Set `false` to require a manual reprocess. |

### Large PDF Processing

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PAGE_CHUNK_SIZE` | `integer` | -- | Number of pages to process at a time for large PDFs. Enables chunked PDF conversion to avoid out-of-memory errors. |
| `MAX_PAGES_PER_CHUNK` | `integer` | -- | Maximum pages per processing chunk for large PDFs. |

---

## GraphRAG Configuration

### Entity Extraction

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_GRAPH_EXTRACTION` | `boolean` | `true` | Master switch for the GraphRAG pipeline. When `false`, documents are chunked and embedded but no entities or relationships are extracted. |
| `GRAPH_EXTRACTION_MODEL` | `string` | value of `OPENAI_MODEL` | Model for entity extraction and community summarization. Recommended: `qwen3-6-27b` (Qwen3.6 27B). Can be a smaller, faster model than the primary. |
| `GRAPH_EXTRACTION_API_BASE` | `string` | value of `OPENAI_API_BASE` | API base URL for the extraction model, if different from primary. |
| `GRAPH_EXTRACTION_API_KEY` | `string` | value of `OPENAI_API_KEY` | API key for the extraction model, if different from primary. |
| `MAX_GRAPH_HOPS` | `integer` | `2` | Number of graph traversal hops during search context retrieval. Range: 1-3. Higher values pull in more distantly connected context at the cost of relevance. |
| `CONCURRENT_EXTRACTIONS` | `integer` | `3` | Number of parallel entity extraction operations during document processing. Increase if your LLM endpoint can handle higher concurrency. |
| `GRAPH_EXTRACTION_MAX_CONTEXT` | `integer` | `0` (=inherit) | Maximum context window tokens for entity extraction batching. `0` inherits `min(OPENAI_MAX_CONTEXT, 48000)` — note the 48K clamp. **Recommended: set it explicitly to `16000`.** Extraction is decode-bound (output scales with input), so at real provider decode speeds (~70 tok/s) full-window batches can't finish inside the request timeout — causing retries and silently lost entities. `16000` completes reliably (gateway-dependent — slower gateways favor smaller). It's a graph-density/cost dial, **not** "match the model's context window". Renamed from `EXTRACTION_MAX_CONTEXT` (deprecated alias honored one release with a startup WARN). |
| `EXTRACTION_MAX_OUTPUT_TOKENS` | `integer` | `12000` (recommend `16000`) | Output budget for entity-extraction LLM calls — a generous CEILING matched to `GRAPH_EXTRACTION_MAX_CONTEXT` (recommended `16000`), **not** a ½-ratio. Set `0` to inherit `OPENAI_MAX_OUTPUT_TOKENS` (8000). Entity-dense documents are kept under the cap by the terse-description extraction prompt (short descriptions; enrichment restores depth); 16000/16000 is validated zero-truncation, zero-entity-loss. The backend logs a one-shot "output budget looks too small" warning if overflows repeat. Caveat: on very slow gateways where the output can't decode inside the request window (`LLM_REQUEST_TIMEOUT_SECONDS`), lower `GRAPH_EXTRACTION_MAX_CONTEXT` instead of raising this. |

### Relationship Extraction Model

Optional dedicated model for relationship extraction (both per-chunk during Step 1 and batch cross-document analysis in Step 2). Runs on a separate rate limit from entity extraction.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RELATIONSHIP_EXTRACTION_MODEL` | `string` | value of `GRAPH_EXTRACTION_MODEL` | Model for relationship extraction. Falls back to extraction model, then primary model. Recommended: `qwen3-6-27b` (Qwen3.6 27B). |
| `RELATIONSHIP_EXTRACTION_API_BASE` | `string` | value of `GRAPH_EXTRACTION_API_BASE` | API base URL for the relationship model. |
| `RELATIONSHIP_EXTRACTION_API_KEY` | `string` | value of `GRAPH_EXTRACTION_API_KEY` | API key for the relationship model. |
| `CONCURRENT_RELATIONS` | `integer` | `3` | Concurrent per-chunk relationship extractions per document during Step 1. |

### Relationship Analysis (Phase B / Step 2)

Cross-document relationship discovery. Two modes, selected by `RELATIONSHIP_DISCOVERY_MODE`:

- **`targeted`** (DEFAULT) — candidates are generated *without* the LLM (entity-embedding kNN + document co-mention), then the LLM only verifies/classifies ranked pairs in small batched calls. Orders of magnitude fewer/cheaper LLM calls than the legacy scan.
- **`llm_scan`** (legacy) — two-phase co-occurrence batching with multi-round analysis driven by `RELATIONSHIP_TARGET_RATIO` / `RELATIONSHIP_MAX_ROUNDS`.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RELATIONSHIP_DISCOVERY_MODE` | `string` | `targeted` | `targeted` (kNN + co-mention candidates, LLM verifies pairs) or `llm_scan` (legacy two-phase batch scan). |
| `RELATIONSHIP_MAX_CONTEXT` | `integer` | `0` (=inherit) | Maximum INPUT context window tokens for Phase 2 batch analysis (legacy `llm_scan` mode — the default `targeted` mode sizes its verification calls with `RELATIONSHIP_PAIR_CONTEXT_TOKENS` instead). `0` inherits `GRAPH_EXTRACTION_MAX_CONTEXT` → `OPENAI_MAX_CONTEXT`. **Recommended: leave `0`.** Bounded per-call output does not bound wall time — the prompt still has to be prefilled, and on self-hosted GPUs a 256k read takes minutes and times out. Only widen (e.g. `256000`) for `llm_scan` mode on fast-prefill hosted endpoints. |
| `RELATIONSHIP_MAX_OUTPUT_TOKENS` | `integer` | `0` (=inherit) | Output budget for **per-chunk + candidate scan** (was the Phase 2 batch budget in old releases — see migration note). `0` inherits `EXTRACTION_MAX_OUTPUT_TOKENS`. |
| `RELATIONSHIP_BATCH_MAX_OUTPUT_TOKENS` | `integer` | `16000` | Output budget for **Phase 2 batch** relationship analysis (standalone, NOT in the inheritance chain). Batch processes hundreds of entity pairs per call. |
| `PARALLEL_RELATIONSHIP_BATCHES` | `integer` | `5` | Number of relationship analysis batches processed in parallel. |
| `RELATIONSHIP_MAX_HOURS` | `integer` | `0` | Maximum hours for relationship analysis. `0` = no time limit. |
| `RELATIONSHIP_MAX_PER_ENTITY` | `integer` | `50` | Soft cap on relationships per entity. Prevents hub entities from accumulating disproportionate connections. `0` = no cap. Relationships are skipped when both endpoints exceed the cap. |
| `AUTO_RELATIONSHIP_ANALYSIS_AFTER_BATCH` | `boolean` | `false` | Automatically trigger cross-document relationship analysis after batch document processing completes. |
| `AUTO_COMMUNITY_DETECTION_AFTER_BATCH` | `boolean` | `false` | Automatically trigger community detection after relationship analysis completes. |

**Targeted mode candidate generation** (`RELATIONSHIP_DISCOVERY_MODE=targeted`):

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RELATIONSHIP_KNN_K` | `integer` | `8` | Nearest neighbors per entity in the vector-index candidate scan. |
| `RELATIONSHIP_KNN_MIN_SIMILARITY` | `float` | `0.80` | Minimum vector-index score (Neo4j cosine index score, 0-1) for a kNN candidate pair. |
| `RELATIONSHIP_MIN_SHARED_DOCS` | `integer` | `2` | Minimum distinct documents co-mentioning a pair for the doc-co-mention generator. `0` = disable generator. |
| `RELATIONSHIP_DOC_FREQ_CAP` | `integer` | `30` | Skip entities mentioned in more than this many documents in the co-mention generator (hub guard). |
| `RELATIONSHIP_CANDIDATES_PER_ENTITY` | `integer` | `10` | Max candidate pairs any single entity may appear in (hub guard). |
| `RELATIONSHIP_MAX_CANDIDATE_PAIRS` | `integer` | `15000` | Total candidate-pair budget per analysis run (top-ranked pairs kept). |
| `RELATIONSHIP_PAIRS_PER_CALL` | `integer` | `40` | Candidate pairs verified per LLM call in targeted mode. |

**Legacy `llm_scan` mode only:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RELATIONSHIP_TARGET_RATIO` | `float` | `1.0` | Target Entity-Relationship Ratio (ERR metric). Higher values cause the system to discover more relationships per entity. Applies to `llm_scan` mode only. |
| `RELATIONSHIP_MAX_ROUNDS` | `integer` | `3` | Maximum discovery rounds per batch for initial analysis. Re-analyze ("Find more") always does 1 round. Applies to `llm_scan` mode only. |

### Semantic Entity Resolution

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_SEMANTIC_ENTITY_RESOLUTION` | `boolean` | `true` | Use embedding-based vector similarity (via Neo4j vector index) for entity deduplication during storage. Catches semantic matches like "Museum of Crypto Art" and "MOCA". Falls back to Levenshtein string matching when disabled. |
| `ENTITY_SIMILARITY_THRESHOLD` | `float` | `0.85` | Similarity threshold for merging entities. Range: 0.0-1.0. Lower values merge more aggressively. |
| `ENTITY_EMBEDDING_MODEL` | `string` | value of `EMBEDDING_MODEL` | Model used for entity embedding vectors during semantic resolution. |

### Reasoning Control (Ingestion)

Force reasoning OFF so reasoning-capable models (GPT-5/5.1, Claude 4.x, Qwen3, DeepSeek-R1, GLM-4.6, Kimi K2, MiniMax M3) can be used for structured extraction without drift or hidden-token cost. Provider auto-detected from `base_url`. Accepted values: `off | minimal | auto | low | medium | high`.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `EXTRACTION_REASONING_MODE` | `string` | `off` | Reasoning for entity extraction, summaries, communities, query-entity extraction. |
| `RELATIONSHIP_REASONING_MODE` | `string` | `off` | Reasoning for candidate scan, gleaning, per-chunk + batch relationship extraction. |
| `VISION_REASONING_MODE` | `string` | `off` | Reasoning for the vision-model image-description call (e.g. Qwen3-VL). |
| `DEFAULT_REASONING_MODE` | `string` | `auto` | Reasoning for the chat/answer path. Researcher/deep-research stays AUTO to preserve parallel tool calls. |
| `REASONING_MODEL_OVERRIDES` | `string` | -- | Per-model override. Format: `model1:mode1,model2:mode2` (e.g. `gpt-5.8:none,custom:minimal`). |

> Caveats: `gpt-5-pro` is pinned to `high`; `gpt-5-codex` downgrades `minimal`→`low`; Anthropic Opus 4.7+ uses adaptive thinking (manual `thinking` returns 400). On OpenAI GPT-5/o-series, `DEFAULT_REASONING_MODE=off` can disable parallel tool calls — set `auto` there.

### Budget Fallback Chain

Sub-tier token knobs default to `0` (= inherit from the next tier up), except `EXTRACTION_MAX_OUTPUT_TOKENS`, which ships a real default of `12000` (set `0` to restore inherit):

```
OUTPUT TOKENS:                          INPUT CONTEXT:
  OPENAI_MAX_OUTPUT_TOKENS=8000           OPENAI_MAX_CONTEXT=256000
       ↓                                       ↓ (clamped to 48000)
  EXTRACTION_MAX_OUTPUT_TOKENS=16000     GRAPH_EXTRACTION_MAX_CONTEXT
       ↓                                       ↓
  RELATIONSHIP_MAX_OUTPUT_TOKENS          RELATIONSHIP_MAX_CONTEXT
       ↓
  VISION_MAX_OUTPUT_TOKENS

  RELATIONSHIP_BATCH_MAX_OUTPUT_TOKENS=16000   (standalone, Phase 2 only)
```

---

## Search and RAG Configuration

### Hybrid Search

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_HYBRID_SEARCH` | `boolean` | `true` | Enable hybrid search combining vector similarity, keyword matching, and graph traversal with Reciprocal Rank Fusion. |
| `VECTOR_WEIGHT` | `float` | `0.5` | Weight for vector (semantic) search in hybrid fusion. Must sum to 1.0 with the other two weights. |
| `KEYWORD_WEIGHT` | `float` | `0.3` | Weight for keyword (full-text) search in hybrid fusion. |
| `GRAPH_WEIGHT` | `float` | `0.2` | Weight for graph traversal search in hybrid fusion. |

### Re-ranking

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_RERANKING` | `boolean` | `true` | Enable cross-encoder re-ranking after initial retrieval for improved precision. |
| `RERANKING_MODEL` | `string` | `cross-encoder/ms-marco-MiniLM-L-6-v2` | Cross-encoder model for re-ranking. Runs locally on CPU. |

### Agentic RAG

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_AGENTIC_RAG` | `boolean` | `true` | Enable Deep Research mode with multi-step reasoning. When `false`, only standard Chat mode is available. |
| `MAX_AGENTIC_STEPS` | `integer` | `3` | Maximum reasoning steps in the legacy (non-agent) pipeline. Only used when `ENABLE_AGENT_RESEARCH=false`. |
| `MAX_CONVERSATION_HISTORY` | `integer` | `6` | Number of previous conversation messages to include for multi-turn context. |

### Agent-Based Research Pipeline

The agent pipeline replaces the legacy fixed-step agentic RAG with an LLM-driven researcher/writer architecture. Requires a model that supports function calling / tool use (OpenAI `tools` parameter).

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_AGENT_RESEARCH` | `boolean` | `true` | Use the agent pipeline for Deep Research mode. Set `false` to use the legacy fixed decompose-search-synthesize pipeline. |
| `ENABLE_AGENT_CHAT` | `boolean` | `true` | Use the agent pipeline for standard Chat mode. Enabled by default (required for skills in chat). |
| `RESEARCHER_MAX_ITERATIONS_SPEED` | `integer` | `3` | Maximum agent loop iterations in Chat (speed) mode. |
| `RESEARCHER_MAX_ITERATIONS_QUALITY` | `integer` | `8` | Maximum agent loop iterations in Deep Research (quality) mode. |
| `WRITER_MAX_TOKENS_SPEED` | `integer` | `1200` | Maximum output tokens for the writer LLM in Chat mode. |
| `WRITER_MAX_TOKENS_QUALITY` | `integer` | `4000` | Maximum output tokens for the writer LLM in Deep Research mode. |

### Reasoning Visibility

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `STREAM_REASONING_STEPS` | `boolean` | `true` | Stream reasoning/thinking steps to the client during Deep Research mode. Surfaces the researcher agent's thought process as SSE `thinking` events. |
| `SHOW_RETRIEVAL_STATS` | `boolean` | `true` | Include `retrieval_stats` events in the SSE stream with summary statistics (total sources, unique sources, communities used). |

---

## Community Detection

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_COMMUNITY_DETECTION` | `boolean` | `true` | Enable automatic community detection on the knowledge graph. |
| `MIN_COMMUNITY_SIZE` | `integer` | `3` | Minimum number of entities required to form a community. |
| `MAX_COMMUNITIES` | `integer` | `50` | Maximum number of communities to detect. |
| `ENABLE_GRAPH_SUMMARIZATION` | `boolean` | `true` | Enable automatic LLM-generated summaries for detected communities. |
| `COMMUNITY_SUMMARY_MODEL` | `string` | value of `GRAPH_EXTRACTION_MODEL` | Model used for community summarization. Uses the extraction model for consistent structured output. |

---

## Collections

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_COLLECTIONS` | `boolean` | `true` | Enable the collections feature for organizing documents into groups. |
| `DEFAULT_COLLECTION` | `string` | `default` | Name of the default collection for documents uploaded without specifying a collection. |

---

## Vision Model Configuration

Configure image analysis capabilities for extracting and understanding images from documents.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `VISION_MODEL` | `string` | -- (disabled) | Vision model for image analysis (e.g., `gpt-4o`, `claude-3-5-sonnet`). If not set, Docling's built-in SmolDocling is used for image descriptions. |
| `VISION_MODEL_API_BASE` | `string` | value of `OPENAI_API_BASE` | API endpoint for the vision model. |
| `VISION_MODEL_API_KEY` | `string` | value of `OPENAI_API_KEY` | API key for the vision model. |
| `VISION_MAX_CONCURRENT` | `integer` | `2` | Maximum number of concurrent vision API calls system-wide. `2` is the shipped default and the recommended value: each in-flight image spawns a multi-call chain, and ~20 concurrent slots per provider key is the binding limit (not RPM) — raising this saturates the key's slots rather than speeding things up. |
| `VISION_MAX_OUTPUT_TOKENS` | `integer` | `0` (=inherit) | Output budget for image analysis. Inherits `RELATIONSHIP_MAX_OUTPUT_TOKENS` → extraction → primary. |
| `VISION_MAX_IMAGE_SIDE` | `integer` | `1568` | Caps the longer image side (Lanczos downscale) before the vision call. `0` disables. |
| `VISION_JPEG_QUALITY` | `integer` | `85` | JPEG recompression quality before vision call (RGBA stays PNG). |
| `VISION_REASONING_MODE` | `string` | `off` | Force reasoning OFF on the vision-model call (lets Qwen3-VL etc. be used without `<think>` tokens). |

---

## Security & Deployment Hardening

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PROMPT_SECURITY` | `boolean` | `true` | Master switch for the heuristic layer: 25+ jailbreak/injection pattern detectors, input sanitization, defensive prompting, untrusted-content fencing, and output filtering. Always enable in production. |
| `PROMPT_GUARD` | `boolean` | `true` | Enable the query-time Prompt Guard ML classifier (PIGuard) that scores each incoming question and refuses likely injections before retrieval. Only active when a service URL or `PROMPT_GUARD_LOCAL` is set; fails open if the guard is unreachable. |
| `PROMPT_GUARD_SERVICE_URL` | `string` | -- | Offload the classifier to the shared `cortex-helper` service (`/classify`). Empty = no remote guard. The remote path wins when both this and `PROMPT_GUARD_LOCAL` are set. |
| `PROMPT_GUARD_LOCAL` | `boolean` | `false` | Run the classifier in-process instead of via a service URL (needs torch; adds resident RAM). |
| `PROMPT_GUARD_THRESHOLD` | `float` | `0.5` | Injection-class probability at/above which a question is refused (lower = stricter). |
| `PROMPT_GUARD_MODEL` | `string` | `leolee99/PIGuard` | HuggingFace model id for the in-process (local) classifier. |
| `INGESTION_INJECTION_SCAN` | `boolean` | `true` | Scan ingested document text for embedded injection attempts during processing (flag, does not block ingestion). |
| `ENVIRONMENT` | `string` | `development` | `production` makes startup fail fast on weak/default secrets (empty/`password123` `NEO4J_PASSWORD`, or `SESSION_SECRET` < 32 chars when `ADMIN_PASSWORD` is set). |
| `CORS_ALLOWED_ORIGINS` | `string` | `*` | Comma-separated CORS allowlist. Default `*` (credentials disabled, since auth is header-based). Restrict to your domains in production. |
| `EXPOSE_API_DOCS` | `string` | `auto` | Interactive API docs (`/docs`, `/redoc`, `/openapi.json`). `auto` = on in development, off in production. Set `true`/`false` to force. |
| `ENCRYPTION_KEY` | `string` | -- | At-rest encryption for git PATs + skill secrets. Comma-separated Fernet keys (first encrypts, all decrypt). |
| `ENABLE_AUDIT_LOG` | `boolean` | `false` | Append-only JSONL audit log: authentication failures, key-attributed mutating requests (uploads, deletions, config changes, key CRUD), and search/ask activity, each with acting key, outcome, and request ID. **Metadata only** — document content and query text are never written. Size-rotated and fail-open. Server-side file only — there is no API endpoint to read it. |
| `AUDIT_LOG_PATH` | `string` | `./logs/audit.log` | Filesystem path for the audit log. |

### Rate Limiting

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RATE_LIMIT_QPM` | `integer` | `0` | Per-API-key requests/minute on ask/upload endpoints (0 = off). Returns `429` + `Retry-After` on excess. |
| `RATE_LIMIT_BURST` | `integer` | `10` | Token-bucket burst capacity for `RATE_LIMIT_QPM`. |

### Observability & Resilience

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_FORMAT` | `string` | `plain` | `plain` keeps the legacy format; `json` emits structured lines with `request_id` (from/echoed as `X-Request-ID`). |
| `METRICS_ENABLED` | `boolean` | `true` | Prometheus metrics at `GET /metrics` (admin API key required; not exposed through prod nginx). |
| `HELPER_STRICT_REMOTE` | `boolean` | `false` | With `DOCLING_SERVICE_URL` set: conversion failure marks the document failed instead of falling back to local docling. |
| `INSTANCE_ID` | `string` | hostname | Stack identity sent to cortex-helper (`X-Tenant-ID`) for fair queuing. |
| `NEO4J_MAX_POOL_SIZE` | `integer` | `100` | Neo4j driver connection pool size. |
| `NEO4J_CONNECTION_TIMEOUT` | `integer` | `10` | Neo4j TCP connect timeout (seconds). |
| `NEO4J_CONNECTION_ACQUISITION_TIMEOUT` | `integer` | `60` | Max wait for a pooled connection (seconds). |
| `CORTEX_NEO4J_TX_TIMEOUT` | `string` | `300s` | Server-side Neo4j transaction timeout so a runaway query can't pin a connection and an API worker forever. **Compose-level tunable, not a backend var**: the deploy composes (prod overlay, Coolify, Dokploy) map it onto the neo4j service as `NEO4J_db_transaction_timeout=${CORTEX_NEO4J_TX_TIMEOUT:-300s}`. |

> ⚠️ **Scope `NEO4J_*` vars to the backend service only.** The bare `NEO4J_MAX_POOL_SIZE` / `NEO4J_CONNECTION_TIMEOUT` / `NEO4J_CONNECTION_ACQUISITION_TIMEOUT` tunables above are legitimate **backend-app** settings — but on PaaS deployments (Dokploy, Coolify) that inject env vars project-wide, any bare `NEO4J_*` var also lands on the **neo4j container**, which interprets every `NEO4J_*` env as server configuration and can fail to boot. Never put `NEO4J_*` tunables in project-wide env; set them in the backend service's `environment:` block only, and prefer the `CORTEX_NEO4J_*` passthroughs (like `CORTEX_NEO4J_TX_TIMEOUT`) where available.

---

## Resource Limits

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MAX_FILES` | `integer` | `0` | Maximum number of documents allowed. `0` = unlimited. Returns HTTP `403` when exceeded. |
| `MAX_COLLECTIONS` | `integer` | `0` | Maximum number of collections allowed (the default collection counts as 1). `0` = unlimited. Returns HTTP `403` when exceeded. |
| `MAX_ENTITIES` | `integer` | `0` | Maximum total entities across the graph. `0` = unlimited. |
| `MAX_QUERIES_PER_MONTH` | `integer` | `0` | Monthly quota, **unit-denominated**: counted in internal LLM completions (every Q&A loop call + document/graph processing call; embeddings excluded), instance-wide, per UTC calendar month. Returns HTTP `429` + `Retry-After` (seconds until the next UTC month) when exhausted; gates queries *and* the start of new processing work (upload, reprocess, web import, git sync, graph builds) — in-flight work always finishes. `0` = unlimited. |
| `MAX_FILE_SIZE_MB` | `integer` | `50` | Maximum upload file size in megabytes. |

---

## Agent Skills

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_SKILLS` | `boolean` | `true` | Master switch for the agent skills system. When `false`, the researcher agent has no access to external skills. |
| `SKILLS_DIR` | `string` | `.agents/skills` | Directory path where skill directories are stored. Each skill has a `SKILL.md` and optional `tools.json`. |
| `ENABLE_SKILL_SCRIPTS` | `boolean` | `false` | Allow skills to execute local scripts. **Security-sensitive** -- disabled by default. Only enable if you trust all installed skills. |
| `SKILL_SCRIPT_TIMEOUT` | `integer` | `30` | Timeout in seconds for skill script execution. |
| `SKILL_HTTP_TIMEOUT` | `integer` | `15` | Timeout in seconds for skill HTTP tool requests. |
| `MAX_SKILL_TOOLS` | `integer` | `10` | Maximum number of skill tools available to the researcher agent in a single conversation. |

---

## Re-ranking Lifecycle & Shared Model Services

The local cross-encoder pulls ~780 MB into the process. Lazy-loaded by default; offload to a shared `cortex-helper` service to keep many tenant stacks lean.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RERANKER_PRELOAD` | `boolean` | `false` | Eager-load the cross-encoder at startup. Off = lazy, leaner idle instances. |
| `RERANKER_IDLE_TTL_SECONDS` | `integer` | `0` | Unload idle reranker to reclaim ~1 GB after N idle seconds. `0` = never unload (default). |
| `RERANKER_SERVICE_URL` | `string` | -- | Offload reranking to cortex-helper (no local cross-encoder loaded when set). |
| `DOCLING_SERVICE_URL` | `string` | -- | Offload Docling conversion to cortex-helper's warm service. |
| `HELPER_SERVICE_TOKEN` | `string` | -- | Shared secret → `X-Helper-Token` (match helper's `HELPER_TOKEN`). |

---

## Git Integration (Optional)

Connect GitHub/GitLab/Gitea repositories as a knowledge source; optionally let the agent open pull requests.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_GIT_INTEGRATION` | `boolean` | `false` | Master switch (connector, endpoints, scheduler, agent `git_repo` tool). |
| `GIT_WORK_DIR` | `string` | `./git_repos` | Where clone working copies are cached (mount a volume in production). |
| `GIT_CLONE_DEPTH` | `integer` | `1` | Shallow-clone depth. |
| `GIT_MAX_REPO_SIZE_MB` | `integer` | `500` | Abort a sync above this repo size (0 = unlimited). |
| `GIT_SYNC_MAX_FILE_SIZE_MB` | `integer` | `5` | Skip individual files larger than this (0 = no limit). |
| `GIT_SYNC_POLL_INTERVAL` | `integer` | `5` | Minutes between scheduled-sync checks. |
| `GIT_HTTP_TIMEOUT` | `integer` | `30` | Timeout (seconds) for git provider REST calls. |
| `GIT_HTTP_INSECURE_HOSTS` | `string` | -- | Comma-separated hosts allowed to skip TLS verification (self-hosted self-signed). |

---

## Web Import / Crawl4ai (Optional)

Harvest web pages into clean markdown via a self-hosted crawl4ai service (MDHarvest).

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_WEB_CRAWL` | `boolean` | `false` | Master switch — Web Import appears only when true AND `CRAWL_SERVICE_URL` is set. |
| `CRAWL_SERVICE_URL` | `string` | -- | crawl4ai service base URL (e.g. `http://crawl4ai:11235`). Empty = feature off. |
| `CRAWL_SERVICE_TOKEN` | `string` | -- | Optional bearer token (must match crawl4ai's `security.api_token`). |
| `CRAWL_CONTENT_FILTER` | `string` | `fit` | Default content filter: `fit` (readable) \| `raw` (full page) \| `bm25` (ranked). |
| `CRAWL_HTTP_TIMEOUT` | `integer` | `60` | Per-page crawl timeout (seconds). |
| `CRAWL_CONCURRENCY` | `integer` | `5` | Concurrency within one import job. |
| `CRAWL_MAX_URLS_PER_JOB` | `integer` | `100` | Maximum URLs accepted per import (0 = unlimited). |
| `CRAWL_DISCOVER_MAX_LINKS` | `integer` | `200` | Cap on links returned by the Discover sub-flow. |

---

## Efficiency Flags (v-next)

All default **off** (except `RESEARCHER_STABLE_PROMPT`); enable per stack after an A/B bench run. None change API shapes or graph semantics.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENTITY_DEDUP_PREFILTER` | `boolean` | `false` | Levenshtein dedup scores only the top-50 fulltext-index candidates instead of scanning every entity. |
| `ENABLE_BATCHED_KG_WRITES` | `boolean` | `false` | Write entities/links/relationships via UNWIND batches (~10 Neo4j round trips per doc). |
| `ENABLE_BATCHED_CHUNK_RELATIONSHIPS` | `boolean` | `false` | Pack several chunks into one per-chunk relationship LLM call. |
| `RELATIONSHIP_CHUNKS_PER_CALL` | `integer` | `4` | Max chunks per batched relationship-extraction call. |
| `ENABLE_PHASEB_CHECKPOINTING` | `boolean` | `false` | Persist Phase B batch progress — crash/redeploy resumes. |
| `ENABLE_REPROCESS_DELTA` | `boolean` | `false` | Skip reprocessing when file bytes + extraction config are unchanged. |
| `RESEARCHER_STABLE_PROMPT` | `boolean` | `true` | Keep the researcher system prompt byte-stable for provider prefix-cache hits. |
| `ENABLE_PROMPT_CACHE_CONTROL` | `boolean` | `false` | Anthropic `cache_control` breakpoints when routed via OpenRouter to `anthropic/*` models. |

---

## Frontend Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `string` | `http://localhost:8000` | Backend API URL used by the Next.js frontend for client-side requests. Must be reachable from the user's browser. |
| `NEXT_PUBLIC_LOGO_URL` | `string` | -- (uses default logo) | URL to a custom logo image. When set, replaces the default Cortex logo in the frontend. Supports any image URL. |
| `ACCENT_COLOR` | `string` | -- (uses default) | Custom accent color for the frontend UI. Read server-side from `process.env` at runtime (no rebuild needed). Accepts any valid CSS color value: hex (`#3b82f6`), rgb (`rgb(59, 130, 246)`), hsl, oklch, etc. |

---

## Model Fallback Chain

Several variable groups follow a fallback chain where a more-specific variable falls back to a less-specific one:

```
RELATIONSHIP_EXTRACTION_MODEL  ->  GRAPH_EXTRACTION_MODEL  ->  OPENAI_MODEL
RELATIONSHIP_EXTRACTION_API_BASE  ->  GRAPH_EXTRACTION_API_BASE  ->  OPENAI_API_BASE
RELATIONSHIP_EXTRACTION_API_KEY  ->  GRAPH_EXTRACTION_API_KEY  ->  OPENAI_API_KEY
COMMUNITY_SUMMARY_MODEL  ->  GRAPH_EXTRACTION_MODEL  ->  OPENAI_MODEL
ENTITY_EMBEDDING_MODEL  ->  EMBEDDING_MODEL
EMBEDDING_API_BASE  ->  OPENAI_API_BASE
EMBEDDING_API_KEY  ->  OPENAI_API_KEY
VISION_MODEL_API_BASE  ->  OPENAI_API_BASE
VISION_MODEL_API_KEY  ->  OPENAI_API_KEY
```

This means you can run the entire system with just `OPENAI_API_KEY`, `OPENAI_API_BASE`, and `OPENAI_MODEL` set, and every subsystem will inherit those values. Override individual variables only when you want a subsystem to use a different model or endpoint.

---

## Validation

Verify your configuration after deployment:

```bash
# Health check (unauthenticated)
curl http://localhost:8000/health

# Full stats (requires API key)
curl -H "X-API-Key: your-api-key" http://localhost:8000/api/stats

# View active configuration (admin only)
curl -H "X-API-Key: your-admin-key" http://localhost:8000/api/admin/config
```
