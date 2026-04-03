---
name: setup
description: Use this skill when deploying or configuring MOCA Library (the engine behind Cortex). Covers Docker installation, all 50+ environment variables, service URLs, health checks, production deployment, and troubleshooting.
---

# Setup — Deploy and Configure MOCA Library

## What You Probably Got Wrong

1. **MOCA Library is self-hosted, not a hosted SaaS.** You deploy it yourself via Docker Compose. There is no cloud-hosted API to call without deploying first.

2. **Neo4j is required — it is the database for everything.** Chunks, entities, relationships, embeddings, and API keys all live in Neo4j. There is no Postgres or SQLite option.

3. **You need an LLM API key for GraphRAG features.** Entity extraction, relationship discovery, Q&A, and community summarization all require an LLM. OpenAI is the default, but any OpenAI-compatible endpoint works (Anthropic via LiteLLM, local Ollama, etc.).

4. **The admin API key is set via environment variable**, not created through the API. The `ADMIN_API_KEY` env var creates the root admin key at startup.

5. **Neo4j takes 30-60 seconds to initialize.** If the backend fails to connect on first boot, wait and restart the backend container.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Git](https://git-scm.com/)
- An OpenAI API key (or Anthropic/local LLM)

## Quick Installation

```bash
# Clone the repository
git clone https://github.com/mocaOS/library.git
cd library

# Copy environment template
cp .env.example .env

# Edit .env with your values (see Required Variables below)
nano .env

# Start all services
docker compose up -d
```

## Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Next.js web interface |
| Backend API | http://localhost:8000 | FastAPI REST API |
| Neo4j Browser | http://localhost:7474 | Database admin UI |
| Neo4j Bolt | bolt://localhost:7687 | Database connection |

## Health Check

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status": "healthy", "neo4j_connected": true, "version": "1.0.0"}
```

## Required Environment Variables

```bash
# Neo4j Database
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-secure-password-here

# LLM Provider (at least one required)
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# Admin Authentication
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-admin-password
ADMIN_API_KEY=moca_admin_your-secure-key-here
SESSION_SECRET=a-random-string-at-least-32-characters-long
```

Generate a secure session secret:
```bash
openssl rand -base64 32
```

## Optional Environment Variables

### LLM Configuration

```bash
OPENAI_MODEL=gpt-4o-mini              # Primary model
OPENAI_MODEL_FAST_MODE=gpt-4o-mini    # Faster/cheaper model for Fast Mode
OPENAI_API_BASE=https://api.openai.com/v1
```

### Embedding Configuration

```bash
EMBEDDING_MODEL=openai/text-embedding-3-small
EMBEDDING_DIMENSION=1536
USE_OPENAI_EMBEDDINGS=true
```

### Chunking Configuration

```bash
CHUNK_SIZE=500                 # Tokens per chunk (word-based mode)
CHUNK_OVERLAP=50               # Overlap tokens
CHUNK_BY=sentence              # "sentence" or "token"
SENTENCES_PER_CHUNK=5          # Sentences per chunk (sentence mode)
```

### GraphRAG Configuration

```bash
ENABLE_GRAPH_EXTRACTION=true
MAX_GRAPH_HOPS=2                          # Hops for context retrieval (1-3)
CONCURRENT_EXTRACTIONS=20                  # Parallel extraction operations
ENABLE_SEMANTIC_ENTITY_RESOLUTION=true     # Merge similar entities
ENTITY_SIMILARITY_THRESHOLD=0.85           # Merge threshold (0.0-1.0)
```

### Hybrid Search Configuration

```bash
ENABLE_HYBRID_SEARCH=true
VECTOR_WEIGHT=0.5     # Must sum to 1.0
KEYWORD_WEIGHT=0.3
GRAPH_WEIGHT=0.2
ENABLE_RERANKING=true
RERANKING_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2
```

### RAG Configuration

```bash
ENABLE_AGENTIC_RAG=true        # Multi-step reasoning
MAX_AGENTIC_STEPS=3            # Maximum reasoning steps
MAX_CONVERSATION_HISTORY=6     # Messages for context
STREAM_REASONING_STEPS=true    # Stream reasoning to client
SHOW_RETRIEVAL_STATS=true      # Include stats in response
```

### Community Detection

```bash
ENABLE_COMMUNITY_DETECTION=true
MIN_COMMUNITY_SIZE=3
MAX_COMMUNITIES=50
ENABLE_GRAPH_SUMMARIZATION=true
```

### Security

```bash
PROMPT_SECURITY=true           # Prompt injection protection
CORS_ORIGINS=*                 # Restrict in production
```

### Resource Limits

```bash
MAX_FILES=0            # 0 = unlimited
MAX_COLLECTIONS=0      # 0 = unlimited
MAX_FILE_SIZE_MB=50
```

### Vision Model (Optional)

```bash
VISION_MODEL=gpt-4o
VISION_MODEL_API_BASE=https://api.openai.com/v1
VISION_MODEL_API_KEY=sk-your-key
VISION_MAX_CONCURRENT=3    # Concurrent vision API calls system-wide
```

### Concurrency Tuning

```bash
BATCH_PROCESSING_CONCURRENCY=2     # Documents processed in parallel
CONCURRENT_EXTRACTIONS=3            # Entity extraction thread pool
CONCURRENT_RELATIONS=3              # Per-chunk relationship extractions per document
PARALLEL_RELATIONSHIP_BATCHES=5     # Phase B relationship analysis batches in parallel
PROCESSING_THREAD_WORKERS=4         # Thread workers for document processing
```

### Relationship Analysis (Phase B)

```bash
RELATIONSHIP_EXTRACTION_MODEL=gpt-4o-mini    # Dedicated model for relationship extraction
RELATIONSHIP_MAX_CONTEXT=65536                # Max input context for batching
RELATIONSHIP_MAX_OUTPUT_TOKENS=16000          # Max output tokens per LLM response
RELATIONSHIP_TARGET_RATIO=1.0                 # Target ERR (higher = more relationships)
RELATIONSHIP_MAX_ROUNDS=3                     # Max discovery rounds per batch
RELATIONSHIP_MAX_PER_ENTITY=50                # Soft cap to prevent hub entities
RELATIONSHIP_MAX_HOURS=0                      # Time limit (0 = no limit)
```

### Agent Skills

```bash
ENABLE_SKILLS=true                  # Master switch for AgentSkills system
SKILLS_DIR=.agents/skills           # Directory where skills are stored
ENABLE_SKILL_SCRIPTS=false          # Allow skills to execute local scripts (security-sensitive)
SKILL_SCRIPT_TIMEOUT=30             # Script timeout in seconds
SKILL_HTTP_TIMEOUT=15               # HTTP tool request timeout
MAX_SKILL_TOOLS=10                  # Max skill tools per researcher conversation
```

### Agent-Based Research Pipeline

```bash
ENABLE_AGENT_RESEARCH=true                    # Agent pipeline for Deep Research
ENABLE_AGENT_CHAT=false                       # Agent pipeline for standard Chat (opt-in)
RESEARCHER_MAX_ITERATIONS_SPEED=2             # Chat mode iterations
RESEARCHER_MAX_ITERATIONS_QUALITY=10          # Deep Research iterations
WRITER_MAX_TOKENS_SPEED=1200                  # Chat answer max tokens
WRITER_MAX_TOKENS_QUALITY=4000                # Deep Research answer max tokens
```

### Frontend Configuration

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_LOGO_URL=https://example.com/logo.png    # Custom logo
NEXT_PUBLIC_ACCENT_COLOR=#3b82f6                      # Custom accent color
```

### Turbo Mode / Compute3 (Optional)

```bash
COMPUTE3_API_KEY=your-c3-api-key
COMPUTE3_API_BASE=https://api.compute3.ai
COMPUTE3_GPU_TYPE=h100
COMPUTE3_GPU_COUNT=4
COMPUTE3_MODEL=MiniMaxAI/MiniMax-M2.1
COMPUTE3_DOCKER_IMAGE=vllm/vllm-openai:latest
COMPUTE3_DEFAULT_RUNTIME=3600
```

## Common Docker Commands

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View all logs
docker compose logs -f

# View backend logs only
docker compose logs -f backend

# Restart backend after config change
docker compose restart backend

# Rebuild after code changes
docker compose up -d --build
```

## Production Deployment

For production, use `docker-compose.prod.yml` or the Coolify template:

```bash
# Production build
docker compose -f docker-compose.prod.yml up -d
```

Key production considerations:
- Set `CORS_ORIGINS` to your specific domains
- Use strong, unique values for `NEO4J_PASSWORD`, `ADMIN_PASSWORD`, `SESSION_SECRET`
- Enable HTTPS via reverse proxy (nginx)
- Block direct access to Neo4j ports (7474, 7687) from public internet
- Set `PROMPT_SECURITY=true`

## Troubleshooting

### Container won't start

Check if ports are already in use:
```bash
lsof -i :3000   # Frontend
lsof -i :8000   # Backend
lsof -i :7687   # Neo4j
```

### Neo4j connection failed

Neo4j takes 30-60 seconds to fully initialize. Wait and restart:
```bash
docker compose restart backend
```

### OpenAI API errors

Verify your API key:
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Check system configuration

```bash
curl -H "X-API-Key: {ADMIN_KEY}" {BASE_URL}/api/admin/config
```

## Skill Files

| File | Description |
|------|-------------|
| [references/CONFIGURATION.md](references/CONFIGURATION.md) | Full configuration variable reference |

## Resources

- [Configuration Reference](https://docs-library.moca.qwellco.de/configuration)
- [Deployment Guide](https://docs-library.moca.qwellco.de/guides/deployment)
- [GitHub Repository](https://github.com/mocaOS/library)
