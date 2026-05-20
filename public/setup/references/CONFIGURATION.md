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
| `ADMIN_API_KEY` | `string` | -- | Root admin API key, created at startup. Must start with `moca_admin_`. This is the only way to create the admin key -- it cannot be created through the API. |
| `SESSION_SECRET` | `string` | -- | Secret used to sign JWT session tokens for frontend auth. Must be at least 32 characters. Generate with `openssl rand -base64 32`. |

---

## LLM Configuration

### Primary Model

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `OPENAI_API_KEY` | `string` | -- | API key for the primary LLM. Required. |
| `OPENAI_API_BASE` | `string` | `https://api.openai.com/v1` | Base URL for the primary LLM API. Change this to point at any OpenAI-compatible endpoint (LiteLLM, Ollama, vLLM, etc.). |
| `OPENAI_MODEL` | `string` | `gpt-4o-mini` | Model ID for the primary LLM used for Q&A, research, and chat. Recommended: powerful reasoning models (e.g. Minimax M2.7, GLM5, Kimi K2.5). |
| `OPENAI_MODEL_FAST_MODE` | `string` | `gpt-4o-mini` | Model ID for Fast Mode -- a cheaper/faster model used when the user selects fast search. Falls back to `OPENAI_MODEL` if not set. |

### Embedding Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `EMBEDDING_MODEL` | `string` | `openai/text-embedding-3-small` | Model ID for generating vector embeddings. |
| `EMBEDDING_DIMENSION` | `integer` | `1536` | Dimensionality of embedding vectors. Must match the model's output dimension. |
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
| `BATCH_PROCESSING_CONCURRENCY` | `integer` | `2` | Number of documents processed concurrently during batch operations (`POST /api/documents/process-pending`). |
| `PROCESSING_THREAD_WORKERS` | `integer` | `4` | Number of thread workers used for document processing tasks. |

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
| `GRAPH_EXTRACTION_MODEL` | `string` | value of `OPENAI_MODEL` | Model for entity extraction and community summarization. Recommended: instruction-following models (e.g. Mistral Small 24B, Ministral 14B). Can be a smaller, faster model than the primary. |
| `GRAPH_EXTRACTION_API_BASE` | `string` | value of `OPENAI_API_BASE` | API base URL for the extraction model, if different from primary. |
| `GRAPH_EXTRACTION_API_KEY` | `string` | value of `OPENAI_API_KEY` | API key for the extraction model, if different from primary. |
| `MAX_GRAPH_HOPS` | `integer` | `2` | Number of graph traversal hops during search context retrieval. Range: 1-3. Higher values pull in more distantly connected context at the cost of relevance. |
| `CONCURRENT_EXTRACTIONS` | `integer` | `3` | Number of parallel entity extraction operations during document processing. Increase if your LLM endpoint can handle higher concurrency. |
| `EXTRACTION_MAX_CONTEXT` | `integer` | `32768` | Maximum context window tokens for entity extraction batching. Increase if your extraction model supports a larger context window. Determines how many chunks are batched into a single LLM call. |

### Relationship Extraction Model

Optional dedicated model for relationship extraction (both per-chunk during Step 1 and batch cross-document analysis in Step 2). Runs on a separate rate limit from entity extraction.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RELATIONSHIP_EXTRACTION_MODEL` | `string` | value of `GRAPH_EXTRACTION_MODEL` | Model for relationship extraction. Falls back to extraction model, then primary model. Recommended: instruction-following models (e.g. OpenAI GPT OSS 120B). |
| `RELATIONSHIP_EXTRACTION_API_BASE` | `string` | value of `GRAPH_EXTRACTION_API_BASE` | API base URL for the relationship model. |
| `RELATIONSHIP_EXTRACTION_API_KEY` | `string` | value of `GRAPH_EXTRACTION_API_KEY` | API key for the relationship model. |
| `CONCURRENT_RELATIONS` | `integer` | `3` | Concurrent per-chunk relationship extractions per document during Step 1. |

### Relationship Analysis (Phase B / Step 2)

Cross-document relationship discovery using co-occurrence batching and multi-round analysis.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RELATIONSHIP_MAX_CONTEXT` | `integer` | `65536` | Maximum INPUT context window tokens for relationship analysis batching. Must match the context window of your `RELATIONSHIP_EXTRACTION_MODEL`. |
| `RELATIONSHIP_MAX_OUTPUT_TOKENS` | `integer` | `16000` | Maximum OUTPUT tokens for relationship analysis LLM responses. |
| `PARALLEL_RELATIONSHIP_BATCHES` | `integer` | `5` | Number of relationship analysis batches processed in parallel. |
| `RELATIONSHIP_TARGET_RATIO` | `float` | `1.0` | Target Entity-Relationship Ratio (ERR metric). Higher values cause the system to discover more relationships per entity. Displayed on the Knowledge Graph page as a quality indicator. |
| `RELATIONSHIP_MAX_ROUNDS` | `integer` | `3` | Maximum discovery rounds per batch for initial analysis. Re-analyze ("Find more") always does 1 round. Progress is tracked cumulatively across rounds. |
| `RELATIONSHIP_MAX_HOURS` | `integer` | `0` | Maximum hours for relationship analysis. `0` = no time limit. |
| `RELATIONSHIP_MAX_PER_ENTITY` | `integer` | `50` | Soft cap on relationships per entity. Prevents hub entities from accumulating disproportionate connections. `0` = no cap. Relationships are skipped when both endpoints exceed the cap. |
| `AUTO_RELATIONSHIP_ANALYSIS_AFTER_BATCH` | `boolean` | `false` | Automatically trigger cross-document relationship analysis after batch document processing completes. |
| `AUTO_COMMUNITY_DETECTION_AFTER_BATCH` | `boolean` | `false` | Automatically trigger community detection after relationship analysis completes. |

### Semantic Entity Resolution

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_SEMANTIC_ENTITY_RESOLUTION` | `boolean` | `true` | Use embedding-based vector similarity (via Neo4j vector index) for entity deduplication during storage. Catches semantic matches like "Museum of Crypto Art" and "MOCA". Falls back to Levenshtein string matching when disabled. |
| `ENTITY_SIMILARITY_THRESHOLD` | `float` | `0.85` | Similarity threshold for merging entities. Range: 0.0-1.0. Lower values merge more aggressively. |
| `ENTITY_EMBEDDING_MODEL` | `string` | value of `EMBEDDING_MODEL` | Model used for entity embedding vectors during semantic resolution. |

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
| `ENABLE_AGENT_CHAT` | `boolean` | `false` | Use the agent pipeline for standard Chat mode. Off by default -- opt in for adaptive chat behavior. |
| `RESEARCHER_MAX_ITERATIONS_SPEED` | `integer` | `2` | Maximum agent loop iterations in Chat (speed) mode. |
| `RESEARCHER_MAX_ITERATIONS_QUALITY` | `integer` | `10` | Maximum agent loop iterations in Deep Research (quality) mode. |
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
| `VISION_MAX_CONCURRENT` | `integer` | `3` | Maximum number of concurrent vision API calls system-wide. Increase for faster image-heavy document processing. With 200 images at ~30s each: 3 concurrency ~33 min, 10 concurrency ~10 min. |

---

## Security

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PROMPT_SECURITY` | `boolean` | `true` | Enable built-in prompt injection protection. Scans for jailbreak patterns, sanitizes input, adds defensive prompts, and filters harmful output. Always enable in production. |
| `CORS_ORIGINS` | `string` | `*` | Comma-separated list of allowed CORS origins. Use `*` for development. Restrict to your specific domains in production (e.g., `https://cortex.yourdomain.com,https://app.yourdomain.com`). |

### Rate Limiting

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RATE_LIMIT_REQUESTS` | `integer` | `100` | Maximum number of API requests per window per API key. |
| `RATE_LIMIT_WINDOW` | `integer` | `60` | Rate limit window duration in seconds. |

### Audit Logging

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_AUDIT_LOG` | `boolean` | -- | Enable audit logging for compliance. Logs API key usage, document operations, search queries, config changes, and auth events. |
| `AUDIT_LOG_PATH` | `string` | `/var/log/moca/audit.log` | File path for audit log output. |

---

## Resource Limits

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MAX_FILES` | `integer` | `0` | Maximum number of documents allowed. `0` = unlimited. Returns HTTP `403` when exceeded. |
| `MAX_COLLECTIONS` | `integer` | `0` | Maximum number of collections allowed. `0` = unlimited. Returns HTTP `403` when exceeded. |
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

## Compute3 Turbo Mode (Optional)

GPU-accelerated inference via the Compute3 platform. When enabled and a turbo job is running, Cortex routes LLM calls through the Compute3 GPU cluster. Falls back to the standard LLM provider if the turbo job is not running.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `COMPUTE3_API_KEY` | `string` | -- | Compute3 API key. Obtain from [console.compute3.ai](https://console.compute3.ai). |
| `COMPUTE3_API_BASE` | `string` | `https://api.compute3.ai` | Compute3 API base URL. |
| `COMPUTE3_GPU_TYPE` | `string` | `h100` | GPU type to provision. Options: `h100`, `a100`. |
| `COMPUTE3_GPU_COUNT` | `integer` | `4` | Number of GPUs to allocate per turbo job. |
| `COMPUTE3_MODEL` | `string` | `MiniMaxAI/MiniMax-M2.1` | Model to serve on the Compute3 GPU cluster. Supports open-source models like Llama, Mistral, etc. |
| `COMPUTE3_DOCKER_IMAGE` | `string` | `vllm/vllm-openai:latest` | Docker image for the vLLM inference server running on Compute3. |
| `COMPUTE3_DEFAULT_RUNTIME` | `integer` | `3600` | Default job runtime in seconds (maximum duration before auto-shutdown). |

---

## Frontend Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `string` | `http://localhost:8000` | Backend API URL used by the Next.js frontend for client-side requests. Must be reachable from the user's browser. |
| `NEXT_PUBLIC_LOGO_URL` | `string` | -- (uses default logo) | URL to a custom logo image. When set, replaces the default Cortex logo in the frontend. Supports any image URL. |
| `NEXT_PUBLIC_ACCENT_COLOR` | `string` | -- (uses default) | Custom accent color for the frontend UI. Accepts any valid CSS color value: hex (`#3b82f6`), rgb (`rgb(59, 130, 246)`), hsl, oklch, etc. |

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
