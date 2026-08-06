---
name: setup
description: Use this skill when deploying or configuring Cortex, including self-hosting a full instance on your own machine or VM. Covers Docker installation, the 160+ environment variables, service URLs, health checks, production deployment, and troubleshooting.
---

# Setup — Deploy and Configure Cortex

## What You Probably Got Wrong

1. **Cortex is self-hosted, not a hosted SaaS.** You deploy it yourself. There is no cloud-hosted API to call without deploying first. The whole thing is now one command — `npx @mocaos/cortex`, published on npm, which installs *and then manages* the instance ([Install with the installer](#installer)). The Compose paths below are for building from source or driving the stack with your own tooling.

2. **Neo4j is required — it is the database for everything.** Chunks, entities, relationships, embeddings, and API keys all live in Neo4j. There is no Postgres or SQLite option.

3. **You need an LLM API key for GraphRAG features.** Entity extraction, relationship discovery, Q&A, and community summarization all require an LLM. OpenAI is the default, but any OpenAI-compatible endpoint works (Anthropic via LiteLLM, local Ollama, etc.).

4. **The admin API key is set via environment variable**, not created through the API. The `ADMIN_API_KEY` env var creates the root admin key at startup.

5. **Neo4j takes 30-60 seconds to initialize.** If the backend fails to connect on first boot, wait and restart the backend container.

6. **The dashboard breaks from any browser that isn't on the host itself** unless you override `NEXT_PUBLIC_API_URL`. The shipped `docker-compose.yml` hardcodes `http://localhost:8000` in the frontend's `environment:` block, which beats your `.env` — browsers on other machines then call *their own* localhost and get "session expired" / `ERR_CONNECTION_REFUSED`. See [Self-host on a LAN/remote box](#self-host-on-a-lanremote-box). The [release stack](#release-install) doesn't have this trap — pick a `COMPOSE_FILE` mode and the URLs and cookie flags are already correct — and the [installer](#installer) picks the mode for you.

7. **`docker restart` does NOT reload `.env`.** Containers keep the env snapshot from `create`. After any `.env` change run `docker compose up -d --force-recreate` (add `--no-deps <service>` to scope it).

8. **Never put inline comments after `.env` values.** dotenv parses `KEY=false  # comment` as the string `false  # comment`; bool coercion fails silently and the field falls back to its default. Comments go on their own line.

## Prerequisites

- **[Docker](https://docs.docker.com/get-docker/) with the Compose v2 plugin** — verify with `docker compose version`. On Linux, `apt install docker.io` does **not** include Compose v2; install Docker's official packages or Docker Desktop.
- `curl` and `tar` for the installer path — `git`, `jq`, and `openssl` too for the manual paths, and a minimal server image ships none of them.
- **~20 GB free disk, ~8 GB RAM**, `linux/amd64` or `linux/arm64`. Images pull ~1.7 GB total (backend ~1.2 GB, Neo4j ~340 MB, frontend and chat ~70–75 MB each, Caddy ~23 MB in domain mode).
- **An OpenAI-compatible API key.** Chat needs `/v1/chat/completions` and embeddings need `/v1/embeddings` — but **not necessarily from the same provider**. Groq serves chat and has no embedding endpoint at all; Ollama users routinely embed elsewhere. See [Embedding Configuration](#embedding-configuration).
- Only relevant to the installer: `npx` brings its own Node, but if one is already on your `PATH` it must be **20.12 or newer** (the floor comes from the installer's prompt library; 18 is rejected by its first check).

## Install with the installer — `npx @mocaos/cortex` (recommended) {#installer}

```bash
npx @mocaos/cortex
```

One command brings up the whole stack — Cortex, Cortex Chat, Neo4j, a nightly backup sidecar, and Caddy for automatic HTTPS in domain mode — from prebuilt, version-pinned images. Nothing to clone, nothing to build, no Compose file to edit. It runs in this order and stops at the first thing that would waste your time:

1. **Environment preflight** — Docker daemon, Compose v2, architecture, free disk, RAM, and the ports it is about to bind.
2. **Live credential validation** — a real chat completion *and* a real embedding call. Nothing is written to disk and no image is pulled until both succeed, so a wrong key costs seconds instead of a 1.7 GB pull. This holds on every path, interactive or `--yes`.
3. **Interactive configuration** — localhost or a public domain (it resolves both hostnames and warns if DNS doesn't point here yet, since Let's Encrypt validates over HTTP), project name, setup depth (Quick or Advanced — Advanced overrides the graph-extraction and vision models separately and can configure SMTP for chat password resets), provider and models, admin identity, and secrets.
4. **Pull, start, verify** — writes `.env` at mode `0600`, fetches that release's Compose files, pulls the pinned images, and waits for every service to report healthy before printing your login.

**The embedding dimension is measured from a live probe, never assumed** — it gets baked into the Neo4j vector index on first use, and changing it later means re-embedding the whole corpus.

It manages the instance afterwards too, so you rarely touch Compose directly:

```bash
npx @mocaos/cortex status     # service state, health, URLs
npx @mocaos/cortex doctor     # one pasteable diagnostic block
npx @mocaos/cortex backup     # verified backup now
npx @mocaos/cortex update     # move to the latest tested stack
npx @mocaos/cortex logs       # follow logs
```

`start`, `stop`, `restart`, `config`, `restore` and `uninstall` complete the set (twelve verbs). Data lives in Docker volumes, so `stop` and `uninstall` never touch it — removing volumes takes a confirmation *and* a typed phrase.

`update` is the one worth understanding before you run it: it fetches the latest release manifest, diffs every component that would move (backend, frontend, chat, Neo4j, Caddy), offers a backup first, re-fetches that release's Compose files *and* `ops/` directory so stack-level changes come along, and rewrites **only the image and version pin lines in `.env`** — comments, custom additions and every secret are preserved byte for byte. If the post-update health check times out it prints the exact five pin lines to restore for a rollback (also recorded as `previous` in `cortex.json`), followed by `start`.

**It never adopts data it didn't create.** The default project name is `cortex`; if Docker already holds `cortex_*` volumes from an earlier install, the wizard stops and offers **rename** (recommended), **reuse** (only if you know that data is yours), or **abort**. This matters because Neo4j applies `NEO4J_AUTH` only when its data volume is *first* created — silently reusing a project name would write a freshly generated password Neo4j never adopts, and the backend would then retry the wrong credentials until Neo4j rate-limits it.

### Two `npx` failures that aren't what they look like {#npx-failures}

Both happen before the installer gets to run, and neither message points at its real cause:

- **`could not determine executable to run`** — there is no `install` subcommand. `npx` already means "fetch and run", so `npx install @mocaos/cortex` asks npm to run a package literally named `install`. The command is just `npx @mocaos/cortex`.
- **`ENOVERSIONS — No versions available for @mocaos/cortex`** — the package is public and fine; npm is hiding it. An `.npmrc` with `min-release-age` set (a publish cooldown, increasingly common after the npm supply-chain compromises of recent months, and worth keeping) filters out every version published inside that window, so a release that is hours old has none left. Confirm with `npm config get min-release-age`, then override it for the one command rather than disabling the policy:

```bash
npx --min-release-age=0 @mocaos/cortex
```

The flag works on any verb (`npx --min-release-age=0 @mocaos/cortex status`). npm has no way to exempt a single package, so it is the flag or the wait.

### Non-interactive install (`--yes`) {#yes-install}

`--yes` runs the identical sequence — same probes, same collision check — sourced from environment variables instead of prompts:

```bash
CORTEX_ADMIN_EMAIL=you@example.com \
CORTEX_OPENAI_API_KEY=sk-... \
CORTEX_OPENAI_API_BASE=https://api.venice.ai/api/v1 \
CORTEX_OPENAI_MODEL=google-gemma-4-26b-a4b-it \
CORTEX_EMBEDDING_MODEL=text-embedding-3-small \
CORTEX_EMBEDDING_DIMENSION=1536 \
npx @mocaos/cortex --yes
```

Note the `CORTEX_` prefix on every one — these configure the *installer*, which then renders the instance's `.env` with the unprefixed names (`OPENAI_API_KEY`, …) documented in the rest of this skill. `CORTEX_OPENAI_API_BASE` is optional and defaults to OpenAI's endpoint.

- **Embeddings default to the chat provider.** To point them elsewhere set `CORTEX_EMBEDDING_API_BASE` *and* `CORTEX_EMBEDDING_API_KEY` together — **both or neither**. A base URL on its own is rejected rather than paired with the chat key, which would send one vendor's credential to another vendor's endpoint. The wizard asks the same question interactively.
- Add `CORTEX_MODE=domain` with `CORTEX_APP_DOMAIN`, `CORTEX_CHAT_DOMAIN`, and `CORTEX_ACME_EMAIL` for a public deployment.
- All five secrets are generated unless you supply `CORTEX_ADMIN_PASSWORD`, `CORTEX_NEO4J_PASSWORD`, `CORTEX_ADMIN_API_KEY`, `CORTEX_SESSION_SECRET`, or `CORTEX_CHAT_ENCRYPTION_KEY`. No secret is ever written to the installer's own state file.
- A project-name collision under a name you did *not* set explicitly is a hard failure here (`--yes` can't prompt); setting `CORTEX_PROJECT_NAME` yourself is treated as deliberate reuse.

> **`update` needs a recent-enough installer.** Each release's `stack.json` carries `minInstaller`, and the v1.0.1 stack requires **1.0.2** — the corrected `ops/backup/restore.sh` reaches the backup sidecar only on an installer that passes `--build` to `compose up`, because that sidecar is built locally and Compose will not rebuild an existing image just because its build context changed. On an older installer the fix lands on disk and never runs.

## Build from source

```bash
# Clone the repository
git clone https://github.com/mocaOS/cortex-app.git
cd cortex-app

# Copy the RECOMMENDED config — the lowest-friction way to start
cp .env.recommended .env

# Edit .env: fill the secrets block at the top + your LLM API key — that's it
nano .env

# Start all services
docker compose up -d
```

`.env.recommended` is the bench-validated starting point: secrets at the top, the recommended model stack below, and everything else running on production-tuned code defaults. Any model from any OpenAI-compatible API works, but the recommendation is **Gemma4 26B A4B** (`google-gemma-4-26b-a4b-it`) as the primary agent model and **Qwen3.6 27B** (`qwen3-6-27b`) for knowledge-graph generation (extraction + vision). Use `.env.example` only when you need the full 160+ variable reference.

### Autonomous install (for an agent self-hosting on its own VM)

**Prefer `npx @mocaos/cortex --yes`** ([Non-interactive install](#yes-install) above) — it needs no editor, no clone and no build, validates the credentials before spending a 1.7 GB pull, and won't adopt somebody else's volumes. Use the source build below only when you specifically need to run modified code or track `main`.

No interactive editor needed there either — write `.env` directly, bring the stack up, then poll health until Neo4j finishes initializing (30–60s):

```bash
git clone https://github.com/mocaOS/cortex-app.git && cd cortex-app
cp .env.recommended .env

# Overwrite the placeholder secrets non-interactively (last occurrence wins).
# ENCRYPTION_KEY (a Fernet key: urlsafe-base64 of 32 random bytes) encrypts
# git PATs + skill secrets at rest — without it they're stored plaintext.
cat >> .env <<EOF
OPENAI_API_KEY=${OPENAI_API_KEY:?export your LLM API key first}
SERVICE_PASSWORD_NEO4J=$(openssl rand -base64 24)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=$(openssl rand -base64 18)
ADMIN_API_KEY=cortex_admin_$(openssl rand -hex 24)
SESSION_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32 | tr '+/' '-_')
EOF

docker compose up -d

# Wait for the backend to report healthy (Neo4j needs ~30-60s on first boot)
until curl -sf http://localhost:8000/health >/dev/null; do sleep 5; done
echo "Cortex is up at http://localhost:8000"

# Grab the admin key you just generated — use it as X-API-Key for all calls
grep '^ADMIN_API_KEY=' .env
```

> `.env.recommended` already carries the recommended model stack (Venice API base, Gemma4 26B A4B primary, Qwen3.6 27B extraction + vision) and leaves every other knob on production-tuned code defaults; only the secrets above are required to boot. Using a different provider? Also append `OPENAI_API_BASE=` (and `OPENAI_MODEL=` / `OPENAI_MAX_CONTEXT=` for a different primary). After it's healthy, drive the instance with the `cortex` + feature skills against `http://localhost:8000`.

### Release install by hand — prebuilt images, no build step (v1.0.0+) {#release-install}

Everything the [installer](#installer) does, done manually. Use this when you want to see each step, script it yourself, or manage the stack with existing tooling — the two are kept in sync, so this also describes the files the installer writes.

The clone-and-build path above compiles the frontend and a torch-bearing backend locally (slow on a small VM, and it moves whenever `main` moves). Since **v1.0.0** there is a pinned release track: multi-arch images on GHCR plus a static Compose stack under `selfhost/` that you configure entirely through `.env` and never edit.

`stack.json` on the GitHub release is the version manifest — it names the stack version, the component versions tested together, and the minimum installer those versions need:

```bash
curl -fsSL https://github.com/mocaOS/cortex-app/releases/latest/download/stack.json -o stack.json
# {"stack":"1.0.1","components":{"backend":"1.0.1","frontend":"1.0.1","chat":"1.0.0",
#  "neo4j":"5.26-community","caddy":"2-alpine"},"minInstaller":"1.0.2", ...}

git clone --depth 1 --branch "v$(jq -r .stack stack.json)" \
  https://github.com/mocaOS/cortex-app.git /tmp/cortex-src

mkdir -p cortex && cd cortex
cp -r /tmp/cortex-src/selfhost/. .
cp -r /tmp/cortex-src/ops ./ops
cp Caddyfile.template Caddyfile
cp .env.example .env && chmod 600 .env
# fill the secrets block + LLM block in .env, then:
docker compose up -d
```

Needs `git`, `jq`, and `openssl` on the host (a minimal server image has none of them), Docker Engine 24+ with the Compose **v2 plugin**, ~20 GB disk and ~8 GB RAM. Images are `ghcr.io/mocaos/cortex-backend`, `-frontend`, `-chat`, pinned by the three `CORTEX_*_IMAGE` lines in `.env`. This stack ships **Cortex Chat** alongside Cortex; both share one identity (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), and Chat mints its own scoped backend keys using `ADMIN_API_KEY` — which also powers its personality generator via the backend's `POST /api/llm/completions`. Chat is a full team workspace (AI personalities as portable SOUL.md files, shared projects with realtime multi-user conversations, voice dictation/read-aloud, per-user history); the feature tour lives at [docs.cortex.eco/features/cortex-chat](https://docs.cortex.eco/features/cortex-chat).

`COMPOSE_FILE` picks the topology — and this is where the `NEXT_PUBLIC_API_URL` and cookie traps listed below are already solved for you:

| Mode | `COMPOSE_FILE` | Notes |
|---|---|---|
| Localhost (default) | `docker-compose.yml:docker-compose.ports.yml` | Ports bound to `BIND_ADDR` (`127.0.0.1`). The overlay sets `SESSION_COOKIE_SECURE=false`, so admin login works over plain HTTP. |
| Public domain | `docker-compose.yml:docker-compose.caddy.yml` | Caddy terminates TLS automatically. Set `APP_DOMAIN`, `CHAT_DOMAIN`, `ACME_EMAIL`, `CHAT_BASE_URL`, `CORS_ALLOWED_ORIGINS`; point both A records at the host **before** first boot or ACME issuance fails. Only Caddy publishes ports — the API and Neo4j browser stay on the Compose network. |

Rules that bite if ignored: put local changes in `docker-compose.override.yml` (Compose merges it, updates never touch it), and **never rename the `backend` service** — the published frontend image bakes `API_URL=http://backend:8000` into its rewrite manifest at build time. Cortex Chat has no `SESSION_COOKIE_SECURE` equivalent, so its cookie is always `Secure`: it works at `http://localhost:3001` (browsers trust `localhost`) but silently fails to log in if you point `BIND_ADDR` at a LAN IP over plain HTTP — use domain mode for remote access.

To update: re-fetch `stack.json`, bump the three `CORTEX_*_IMAGE` lines, back up, then `docker compose pull && docker compose up -d --build`. **Pass `--build`** — the backup sidecar is built locally from the release's `ops/backup` directory, and Compose does not rebuild an existing image just because its build context changed, so without it a release that ships corrected backup or restore scripts writes them to disk and keeps running the old ones. (`npx @mocaos/cortex update` does this for you; that is why the v1.0.1 stack requires installer ≥ 1.0.2.)

Note that the component versions move independently: `chat` is pinned in `stack.json` rather than derived from this repo's version, so a chat-only patch ships without a new backend image — read the manifest rather than assuming all three tags match.

`selfhost/README.md` in the repo is the authoritative manual runbook, kept in sync with the installer.

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
{"status": "healthy", "neo4j_connected": true, "schema_initialized": true, "version": "1.0.0"}
```

A degraded instance (Neo4j unreachable or schema not yet confirmed) answers **HTTP 503** with `"status": "degraded"` — healthchecks and deploy gates key off the status code, and `schema_initialized` stays `false` until constraints/indexes are confirmed.

> **`version` says `1.0.0` on every release so far — including 1.0.1.** It was a hardcoded string, verified against a live stack whose backend was `ghcr.io/mocaos/cortex-backend:1.0.1` and which still answered `1.0.0`. It becomes the real release version in the **first release after v1.0.1** (a `CORTEX_VERSION` constant, held in step with the published version by a release-time guard), so the example above is what a current instance returns, not a statement about which release it is. To confirm what is actually running, read the image tags — `docker compose images`, or the `CORTEX_*_IMAGE` lines in `.env`. Unrelated: the FastAPI schema's own `version: "2.0.0"` is the API contract's version, not the product's.

## Required Environment Variables

```bash
# Neo4j Database
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-secure-password-here

# LLM Provider (at least one required — any OpenAI-compatible endpoint)
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=google-gemma-4-26b-a4b-it

# Admin Authentication
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-admin-password
ADMIN_API_KEY=cortex_admin_your-secure-key-here
SESSION_SECRET=a-random-string-at-least-32-characters-long
```

Generate a secure session secret:
```bash
openssl rand -base64 32
```

## Recommended Minimal Stack (bench-validated)

This is exactly what `.env.recommended` ships — a 2-model setup where relationship analysis + vision inherit from the extraction model, api_base/api_key cascade from `OPENAI_*`, and the token budgets run on production-tuned code defaults:

```bash
# Primary — agentic Q&A / researcher (Gemma4 26B A4B: fast MoE, 256K window)
OPENAI_API_KEY=your-venice-api-key
OPENAI_API_BASE=https://api.venice.ai/api/v1
OPENAI_MODEL=google-gemma-4-26b-a4b-it
OPENAI_MAX_CONTEXT=256000            # set to YOUR primary model's input window

# Embeddings — text-embedding-3-small (1536-dim; both are code defaults)
EMBEDDING_MODEL=text-embedding-3-small

# Vision — image analysis (api_base/api_key inherit from OPENAI_*;
# must be set explicitly — empty disables vision → Docling fallback)
VISION_MODEL=qwen3-6-27b

# Knowledge-graph generation — drives relationship analysis via inheritance
GRAPH_EXTRACTION_MODEL=qwen3-6-27b
```

> **You do NOT need to set context windows for the extraction or vision models.** Ingestion runs on its own fine-tuned budgets — `GRAPH_EXTRACTION_MAX_CONTEXT=16000` and `EXTRACTION_MAX_OUTPUT_TOKENS=16000` are the code defaults (validated zero-truncation, zero entity loss) — because extraction is decode-bound: sized to provider decode speed, not the model window. Only `OPENAI_MAX_CONTEXT` should match the primary model's real window. **Leave `RELATIONSHIP_MAX_CONTEXT` unset** — it inherits the extraction budget; a full-window value (256000) prefills for minutes and times out on self-hosted GPUs, and the default `targeted` discovery mode doesn't use this budget for verification calls anyway (only widen it for legacy `llm_scan` mode on fast-prefill hosted endpoints).
> **`EMBEDDING_MAX_INPUT_TOKENS` defaults to 5400**: the client counts tokens with cl100k, but providers validate with their own tokenizer (1.2–1.4× higher on punctuation-heavy text), so 8192-passing chunks get 400-rejected upstream. 5400 × ~1.4 ≈ 7500 stays under every 8192-cap provider. The embedding model inherits `OPENAI_API_BASE`/`OPENAI_API_KEY` unless overridden (`EMBEDDING_API_BASE`/`EMBEDDING_API_KEY`). Venice-only alternative: `EMBEDDING_MODEL=text-embedding-qwen3-8b` + `EMBEDDING_DIMENSION=4096` (Neo4j 5.26 supports 4096-dim vector indexes).

## Optional Environment Variables

### LLM Configuration

```bash
OPENAI_MODEL=google-gemma-4-26b-a4b-it       # Primary model (Q&A, research, chat)
OPENAI_MODEL_FAST_MODE=google-gemma-4-26b-a4b-it   # Faster/cheaper model for Fast Mode
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MAX_OUTPUT_TOKENS=8000         # Floor of the output-token budget chain
OPENAI_MAX_CONTEXT=256000             # Floor of the input-context budget chain (code default; set to your primary model's window)
```

### Embedding Configuration {#embedding-configuration}

```bash
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536
EMBEDDING_MAX_INPUT_TOKENS=5400       # default 5400 — providers re-count with their own tokenizer (1.2-1.4x on punctuation-heavy text); 5400 stays under every 8192-cap provider
EMBEDDING_SEND_DIMENSIONS=true        # set false for models with fixed output dim
USE_OPENAI_EMBEDDINGS=true
# EMBEDDING_API_BASE=                 # defaults to OPENAI_API_BASE
# EMBEDDING_API_KEY=                  # defaults to OPENAI_API_KEY
```

> **Embeddings may come from a different provider than chat — and often must.** Plenty of OpenAI-compatible endpoints serve `/v1/chat/completions` but no `/v1/embeddings` (Groq has none at all), so `EMBEDDING_API_BASE` + `EMBEDDING_API_KEY` are not an exotic override: they are the normal shape for those providers. Set **both or neither** — a base URL on its own inherits the chat provider's key and sends one vendor's credential to another vendor's endpoint. The installer asks this as a question and rejects a half-set pair outright (`CORTEX_EMBEDDING_API_BASE` / `CORTEX_EMBEDDING_API_KEY` under `--yes`), and it probes whichever endpoint ends up serving embeddings to *measure* `EMBEDDING_DIMENSION` rather than assume it — that dimension is baked into the Neo4j vector index on first use, and changing it later means re-embedding the corpus.

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
CONCURRENT_EXTRACTIONS=3                   # Parallel extraction operations
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

### Security & Deployment Hardening

```bash
PROMPT_SECURITY=true                  # Prompt injection protection (heuristic detector + filters)
PROMPT_GUARD=true                     # Query-time Prompt Guard classifier gate (active only when a service URL or local guard is set)
PROMPT_GUARD_SERVICE_URL=             # Offload classification to cortex-helper /classify (remote path wins when set)
PROMPT_GUARD_LOCAL=false              # Run the guard in-process instead (needs torch)
PROMPT_GUARD_THRESHOLD=0.5            # Injection-probability cutoff
ENABLE_INGESTION_INJECTION_SCAN=false # EXPERIMENTAL: ingestion-time injection scan (flag, never block); off & hidden by default
INGESTION_INJECTION_SCAN=true         # LLM-classifier default once the scan is enabled (admin-toggleable at runtime)
ENVIRONMENT=production                # Fail fast on weak/default secrets at startup
CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
EXPOSE_API_DOCS=auto                  # auto = docs on in dev, OFF in production
ENCRYPTION_KEY=                       # At-rest encryption for git PATs + skill secrets (Fernet keys)
```

### Resource Limits

```bash
MAX_FILES=0            # 0 = unlimited
MAX_COLLECTIONS=0      # 0 = unlimited
MAX_ENTITIES=0         # Max total entities (global). 0 = unlimited
MAX_QUERIES_PER_MONTH=0   # Monthly quota, unit-denominated: counts internal LLM completions
                          # (Q&A loop calls + document/graph processing calls; embeddings excluded),
                          # instance-wide, UTC calendar month. 0 = unlimited
MAX_FILE_SIZE_MB=50
MAX_REQUEST_BODY_MB=32    # Global request-body ceiling → 413 (0 disables the middleware)
MAX_IMPORT_BODY_MB=2048   # Library-import body ceiling → 413 (0 = unlimited)
MIN_FREE_DISK_MB=500      # Refuse uploads/reprocess/imports with 507 below this free-disk floor (0 disables)
```

### Vision Model (Optional)

```bash
VISION_MODEL=gpt-4o
VISION_MODEL_API_BASE=https://api.openai.com/v1
VISION_MODEL_API_KEY=sk-your-key
VISION_MAX_CONCURRENT=2    # Concurrent vision API calls system-wide (default 2 — each image spawns a multi-call chain; ~20 in-flight slots per provider key is the binding limit)
```

### Concurrency Tuning

```bash
BATCH_PROCESSING_CONCURRENCY=2     # Documents processed in parallel (default 2 — 3 drops per-call decode ~70→~23 tok/s and multiplies timeouts)
CONCURRENT_EXTRACTIONS=3            # Entity extraction thread pool
CONCURRENT_RELATIONS=3              # Per-chunk relationship extractions per document
PARALLEL_RELATIONSHIP_BATCHES=5     # Phase B relationship analysis batches in parallel
PROCESSING_THREAD_WORKERS=4         # Thread workers for document processing
```

### Relationship Analysis (Phase B)

```bash
RELATIONSHIP_EXTRACTION_MODEL=qwen3-6-27b     # Dedicated model (inherits GRAPH_EXTRACTION_MODEL → OPENAI_MODEL)
RELATIONSHIP_MAX_CONTEXT=0                     # leave 0 (= inherit GRAPH_EXTRACTION_MAX_CONTEXT). Bounded output ≠ bounded prefill: a 256k window prefills for minutes and times out on self-hosted GPUs; only widen for legacy llm_scan mode on fast-prefill hosted endpoints
RELATIONSHIP_MAX_OUTPUT_TOKENS=0              # 0 = inherit; feeds per-chunk + candidate scan
RELATIONSHIP_BATCH_MAX_OUTPUT_TOKENS=16000    # Phase 2 batch budget (standalone, NOT in chain)
RELATIONSHIP_DISCOVERY_MODE=targeted          # DEFAULT: kNN + co-mention candidates, LLM verifies pairs ('llm_scan' = legacy)
RELATIONSHIP_MAX_PER_ENTITY=50                # Soft cap to prevent hub entities
RELATIONSHIP_MAX_HOURS=0                      # Time limit (0 = no limit)
RELATIONSHIP_TARGET_RATIO=1.0                 # Legacy 'llm_scan' only: target ERR (higher = more relationships)
RELATIONSHIP_MAX_ROUNDS=3                     # Legacy 'llm_scan' only: max discovery rounds per batch
```

> `RELATIONSHIP_DISCOVERY_MODE=targeted` is now the default: candidates come from entity-embedding kNN + document co-mention, and the LLM only verifies ranked pairs (orders of magnitude fewer/cheaper calls). `RELATIONSHIP_TARGET_RATIO` and `RELATIONSHIP_MAX_ROUNDS` apply only to the legacy `llm_scan` mode.

> **Budget fallback chain.** Sub-tier token knobs default to `0` (= inherit from the next tier up) — except the two extraction budgets, which ship production-tuned real defaults of `16000` (`GRAPH_EXTRACTION_MAX_CONTEXT`, `EXTRACTION_MAX_OUTPUT_TOKENS`; set `0` explicitly to restore inherit). A multi-model stack therefore needs only the model names.
> Output: `OPENAI_MAX_OUTPUT_TOKENS` → `EXTRACTION_MAX_OUTPUT_TOKENS` → `RELATIONSHIP_MAX_OUTPUT_TOKENS` → `VISION_MAX_OUTPUT_TOKENS`.
> Input: `OPENAI_MAX_CONTEXT` → `GRAPH_EXTRACTION_MAX_CONTEXT` (explicit-0 inherit is clamped to 48000 — extraction output scales with input, so this window stays small) → `RELATIONSHIP_MAX_CONTEXT` (leave `0` = inherit — bounded output does not bound prefill time; wide values time out on self-hosted GPUs).
> `RELATIONSHIP_BATCH_MAX_OUTPUT_TOKENS` (16000) is standalone (Phase 2 batch only). Migration: `EXTRACTION_MAX_CONTEXT` was renamed to `GRAPH_EXTRACTION_MAX_CONTEXT` (legacy name honored one release with a startup WARN).

### Reasoning Control for Ingestion

Force reasoning OFF so reasoning-capable models (GPT-5/5.1, Claude 4.x, Qwen3, DeepSeek-R1, GLM-4.6, Kimi K2, MiniMax M3) can be used for structured extraction without drift, hidden-token cost, or malformed JSON. Provider auto-detected from `base_url`. Values: `off | minimal | auto | low | medium | high`.

```bash
EXTRACTION_REASONING_MODE=off        # extraction, summaries, communities, query-entity extraction
RELATIONSHIP_REASONING_MODE=off      # candidate scan, gleaning, per-chunk + batch relationships
VISION_REASONING_MODE=off            # vision-model image descriptions (e.g. Qwen3-VL)
DEFAULT_REASONING_MODE=off           # chat/answer path; deep-research stays AUTO
# REASONING_MODEL_OVERRIDES=gpt-5.8:none,custom-llm:minimal   # escape hatch
```

> Caveats: `gpt-5-pro` is pinned to `high`; `gpt-5-codex` downgrades `minimal`→`low`; Anthropic Opus 4.7+ uses adaptive thinking. On OpenAI GPT-5/o-series, `DEFAULT_REASONING_MODE=off` can disable parallel tool calls — set `auto` there.

### Performance Tuning (Venice-validated)

Crank ingestion throughput on Venice or large self-hosted vLLM endpoints. Dial back for stock OpenAI or smaller hosts to avoid rate limits.

```bash
BATCH_PROCESSING_CONCURRENCY=2    # docs processed in parallel (the shipped default — live measurement showed 3 drops per-call decode ~70→~23 tok/s and multiplies timeouts; 2 finishes builds faster)
CONCURRENT_EXTRACTIONS=4          # entity-extraction threads per doc (default 3 — biggest multiplier)
CONCURRENT_RELATIONS=4            # per-chunk relationship threads per doc (default 3)
VISION_MAX_CONCURRENT=2           # system-wide vision-API semaphore (default 2 — each image spawns a multi-call chain; ~20 in-flight slots per key is the binding limit, not RPM)
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
ENABLE_AGENT_CHAT=true                        # Agent pipeline for standard Chat (required for skills in chat)
RESEARCHER_MAX_ITERATIONS_SPEED=3             # Chat mode iterations
RESEARCHER_MAX_ITERATIONS_QUALITY=8           # Deep Research iterations
WRITER_MAX_TOKENS_SPEED=1200                  # Chat answer max tokens
WRITER_MAX_TOKENS_QUALITY=8000                # Deep Research answer max tokens (4000 in v1.0.0 — see below)

# Deep Research quality + latency guards — shipped in v1.0.1; absent in the 1.0.0 images.
# All default on; 0 disables the numeric ones.
RESEARCHER_FORCE_REFLECTION=true              # Force a reasoning step after a search round the model didn't reflect on
RESEARCHER_NOVELTY_MIN_NEW_RATIO=0.35         # Search round below this share of previously-unseen sources counts as stale
RESEARCHER_NOVELTY_STALE_ROUNDS=2             # Consecutive stale rounds before the writer takes over
RESEARCHER_WALL_CLOCK_SECONDS=120             # Research time budget (0 = unlimited); default was 0 in v1.0.0
RESEARCHER_GIT_TOOL=auto                      # git_repo tool: auto = read/write connections only | always | off
```

> The block above describes **v1.0.1 and later**. On a **v1.0.0** install, `WRITER_MAX_TOKENS_QUALITY` is `4000`, `RESEARCHER_WALL_CLOCK_SECONDS` defaults to `0` (unlimited), and the reflection/novelty/git-tool flags do not exist — setting them changes nothing. Update to get them; the `ask` and `git-integration` skills describe what each one does.

> In v1.0.1, `RESEARCHER_WALL_CLOCK_SECONDS` defaults to **120**, not unlimited. Healthy gathering finishes in 30–60s, so the budget normally only fires on provider queue spikes — but slow self-hosted inference can trip it legitimately and cut research short. Raise it (or set `0`) on a GPU box that takes minutes per completion.

### Frontend Configuration

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
LOGO_URL=https://example.com/logo.png                 # Custom logo (server-side, read at runtime — no rebuild needed)
ACCENT_COLOR=#3b82f6                                  # Custom accent color (server-side, read at runtime — no rebuild needed)
```

> Use **`LOGO_URL`**, not `NEXT_PUBLIC_LOGO_URL`, on prebuilt images. The header is a Client Component, so a `NEXT_PUBLIC_*` value is inlined at build time and can never be re-branded in a published image. `LOGO_URL` is read server-side in the root layout (same pattern as `ACCENT_COLOR`) and applies on restart. `NEXT_PUBLIC_LOGO_URL` still works as a fallback for deploys that build their own frontend.

### Self-host on a LAN/remote box {#self-host-on-a-lanremote-box}

`NEXT_PUBLIC_API_URL` is the URL **browsers** use to reach the backend — it must be the host's LAN IP or domain, not `localhost`, whenever anyone opens the dashboard from another machine. Two traps stack on top of each other here:

1. The shipped compose file hardcodes it under the frontend's `environment:`, which **overrides `.env`**. Fix with a compose override:

```yaml
# docker-compose.override.yml
services:
  frontend:
    environment:
      NEXT_PUBLIC_API_URL: http://192.168.1.50:8000
```

2. `NEXT_PUBLIC_*` is baked into the bundle at **build time**, and the repo's `frontend/.next` build cache is COPY'd into the image — it survives `docker compose build --no-cache` and silently serves the old URL. Purge it and keep it out of the build context:

```bash
rm -rf frontend/.next
grep -qxF '.next' frontend/.dockerignore 2>/dev/null || echo '.next' >> frontend/.dockerignore
docker compose build --no-cache frontend && docker compose up -d --force-recreate --no-deps frontend
```

(The hermes skill's `cortex.sh setup` does all of this for you when you pass `host=<lan-ip-or-domain>`.)

3. Serving the dashboard over **plain HTTP** (no TLS termination in front)? The session cookie carries the `Secure` flag by default in production builds, and browsers silently drop `Secure` cookies over HTTP — login succeeds server-side but immediately bounces back to `/login` with no error. Set `SESSION_COOKIE_SECURE=false` in `.env` (read at container runtime — no rebuild) for the TLS-less interim, and remove it once HTTPS is in front.

Related: if the frontend container starts **without** `ADMIN_EMAIL`/`ADMIN_PASSWORD` (wrong `--env-file` path, secrets not wired), login answers "Admin authentication not configured" and the server log names the missing variable at startup — there is no silent `admin@example.com` fallback in the code (the compose files supply that default visibly at the env layer).

### Git Integration (Optional)

Connect GitHub/GitLab/Gitea repos as a knowledge source. See the [git-integration skill](../git-integration/SKILL.md).

```bash
ENABLE_GIT_INTEGRATION=true
GIT_WORK_DIR=/data/git_repos      # Mount a volume in production
GIT_CLONE_DEPTH=1
GIT_MAX_REPO_SIZE_MB=500
GIT_SYNC_MAX_FILE_SIZE_MB=5
GIT_SYNC_POLL_INTERVAL=5          # Minutes between scheduled-sync checks
GIT_HTTP_TIMEOUT=30
```

### Web Import / Crawl4ai (Optional)

Harvest web pages into markdown via a self-hosted crawl4ai service. See the [web-import skill](../web-import/SKILL.md).

```bash
ENABLE_WEB_CRAWL=true
CRAWL_SERVICE_URL=http://crawl4ai:11235
CRAWL_SERVICE_TOKEN=
CRAWL_CONTENT_FILTER=fit          # fit (readable) | raw (full) | bm25 (ranked)
CRAWL_CONCURRENCY=5
CRAWL_MAX_URLS_PER_JOB=100
```

### Apps — In-Instance App Hosting (Optional)

Host self-contained web apps inside the instance — installed from a zip or from the public registry, sandboxed, with least-privilege API access. Building one? Fetch the [builder/app skill](../builder/app/SKILL.md).

```bash
ENABLE_APPS=true                  # Master switch (backend default false: all app routes 404 —
                                  # but the selfhost/ release stack defaults it to true)
APPS_DIR=.agents/apps             # Bundles + per-app storage + task state (persist as a volume)
APP_REGISTRY_URL=https://raw.githubusercontent.com/mocaOS/cortex-registry/main/index.json
                                  # The Browse Registry catalog; fork it to curate, empty to hide
APP_MAX_PACKAGE_MB=50
APP_TOKEN_TTL_SECONDS=900
APP_HTTP_TIMEOUT=30               # Platform apps' server-side external calls
APP_STORAGE_MAX_MB=50             # Per-app KV quota (+ APP_STORAGE_MAX_VALUE_KB=1024)
APP_TASKS_GLOBAL_CONCURRENCY=8    # Cross-app cap on background task items
                                  # (more APP_TASK_* caps: items, per-task concurrency,
                                  #  schedule floor, llm calls/run, step output size)
```

### Cortex Chat SSO — OIDC (Optional)

Single Sign-On for the Cortex Chat component (the stack's multi-tenant chat frontend, enabled with `COMPOSE_PROFILES=chat`). Works with ANY OpenID Connect IdP with discovery — Entra ID, ADFS 2016+, Okta, Auth0, Google Workspace, Keycloak, Authentik, Zitadel. Set in the stack `.env` (the selfhost compose passes these through to the chat container); register the client at the IdP with redirect URI `{CHAT_BASE_URL}/api/auth/oidc/callback`.

```bash
OIDC_ISSUER_URL=https://id.example.com/realms/myrealm   # presence enables SSO; unset = feature invisible
OIDC_CLIENT_ID=cortex-chat
OIDC_CLIENT_SECRET=...
# Optional:
OIDC_SCOPES="openid profile email"        # default
OIDC_BUTTON_LABEL="Sign in with Entra ID" # default: localized "Single Sign-On"
OIDC_DEFAULT_GROUP=                       # chat group JIT-created users join; unset = group-less until an admin assigns
OIDC_ONLY=false                           # true = password login + self-registration off; superadmin break-glass at /login?password=1
```

Rules that bite: `CHAT_BASE_URL` is REQUIRED when the issuer is set (it builds the redirect URI — chat refuses to boot without it); the issuer must be `https://` (plain http only for localhost dev); existing password accounts are auto-linked on first SSO login ONLY when the IdP marks the email verified (Entra ID never emits `email_verified`, so pre-existing password accounts won't auto-link there — provision via SSO from the start); the chat superadmin (`ADMIN_EMAIL`) is excluded from SSO entirely and always keeps password login. LDAP/SAML-only stacks: bridge with Authentik or Dex in front and point `OIDC_ISSUER_URL` at the bridge.

### x402 Payments (Optional)

Monetize the retrieval endpoints with pay-per-query micropayments. See the [x402 skill](../x402/SKILL.md).

```bash
X402_ENABLED=true   # The ONLY x402 env var — wallet, facilitator, network,
                    # and asset are configured at runtime in Settings →
                    # x402 Payments (stored in Neo4j, survive redeploys).
```

### Shared Model Services (cortex-helper)

Offload the cross-encoder reranker and Docling converter to a per-machine service so many tenant stacks don't each load their own copy. Falls back to local automatically when unset. Since August 2026 only the Docling lane (scans, image-rich PDFs, images, audio) reaches the helper — office formats and text-based PDFs convert in-process via the anydoc fast path (`ENABLE_ANYDOC`, default true; see the CONFIGURATION reference).

```bash
RERANKER_SERVICE_URL=http://cortex-helper:3030
DOCLING_SERVICE_URL=http://cortex-helper:3030
HELPER_SERVICE_TOKEN=             # shared secret (match helper's HELPER_TOKEN)
RERANKER_PRELOAD=false            # eager-load reranker at startup
RERANKER_IDLE_TTL_SECONDS=0       # 0 = never unload (default); set >0 to unload idle reranker after N seconds
```

### Observability, Limits & Resilience

```bash
LOG_FORMAT=plain                  # plain | json (json adds request_id correlation)
METRICS_ENABLED=true              # Prometheus metrics at GET /metrics (admin key)
RATE_LIMIT_QPM=0                  # Per-key requests/minute on ask/upload (0 = off)
RATE_LIMIT_BURST=10               # Token-bucket burst capacity
NEO4J_MAX_POOL_SIZE=100           # ⚠️ scope to the backend service only — see warning below
NEO4J_CONNECTION_TIMEOUT=10       # ⚠️ scope to the backend service only — see warning below
LLM_REQUEST_TIMEOUT_SECONDS=360   # Explicit transport timeout on every LLM client (0 = SDK default 600s)
AUTO_RESUME_PENDING_ON_STARTUP=true  # Auto-resume docs stranded mid-processing by a restart (quota-guarded)
AUTO_RESUME_IMAGE_ANALYSIS=true   # Auto-resume image analysis killed by a restart — re-extracts images (no LLM cost) and analyzes only the ones not yet stored
ENABLE_AUDIT_LOG=false            # Append-only JSONL audit log (metadata only; server-side file, no API endpoint)
```

> ⚠️ **Never put `NEO4J_*` tunables in project-wide env.** On PaaS deployments (Dokploy, Coolify) that inject env vars project-wide, a bare `NEO4J_*` var also lands on the neo4j container — which interprets **every** `NEO4J_*` env as server configuration and can fail to boot. Scope `NEO4J_MAX_POOL_SIZE` / `NEO4J_CONNECTION_TIMEOUT` / `NEO4J_CONNECTION_ACQUISITION_TIMEOUT` to the backend service's `environment:` block only, and use the `CORTEX_NEO4J_*` passthroughs (like `CORTEX_NEO4J_TX_TIMEOUT`) where available.

> **Slim image:** build with `--build-arg INSTALL_LOCAL_ML=false` for a torch-free backend (~1.2 GB) when reranking + the Docling conversion lane are offloaded to cortex-helper. Requires OpenAI embeddings; pair with `HELPER_STRICT_REMOTE=true`. The anydoc fast path is torch-free and ships in the slim image too, so office formats and text-based PDFs convert locally even without a helper. The published release image already builds with `TORCH_VARIANT=cpu` (no CUDA wheels — containerized deploys run Docling's CPU path regardless), so there is nothing for a self-hoster to set there.

> **Error tracking is off on the self-host stack.** The dev/prod/Coolify/Dokploy compose files default `SENTRY_DSN_BACKEND`/`SENTRY_DSN_FRONTEND` to the project's own GlitchTip, but `selfhost/docker-compose.yml` deliberately inverts that to empty — a self-hoster's stack traces never leave their box unless they opt in with their own DSN. Set the vars to enable it; leave them unset to stay silent.

### Efficiency Flags (v-next, default off)

Enable per stack after an A/B bench run. None change API shapes or graph semantics.

```bash
ENTITY_DEDUP_PREFILTER=false              # score only top-50 fulltext candidates for dedup
ENABLE_BATCHED_KG_WRITES=false            # UNWIND batch writes (~10 round trips/doc)
ENABLE_BATCHED_CHUNK_RELATIONSHIPS=false  # pack several chunks per relationship LLM call
RELATIONSHIP_CHUNKS_PER_CALL=4
ENABLE_PHASEB_CHECKPOINTING=false         # resume Phase B after crash/redeploy
ENABLE_REPROCESS_DELTA=false              # skip reprocess when bytes + config unchanged
RESEARCHER_STABLE_PROMPT=true             # byte-stable researcher prompt for prefix caching
ENABLE_PROMPT_CACHE_CONTROL=false         # Anthropic cache_control via OpenRouter
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

# Apply a .env change — restart is NOT enough (containers keep the env
# snapshot from create); force-recreate re-reads compose + .env
docker compose up -d --force-recreate --no-deps backend

# Rebuild after code changes
docker compose up -d --build

# Rebuild after changing NEXT_PUBLIC_* (frontend env is baked at build time,
# and a stale frontend/.next cache survives --no-cache)
rm -rf frontend/.next && docker compose build --no-cache frontend && docker compose up -d --force-recreate --no-deps frontend
```

## Production Deployment

The shortest production path is the installer in **domain mode** — `npx @mocaos/cortex` with a public domain gets you Caddy terminating TLS with automatic certificates, correct cookie flags and CORS, and only Caddy publishing ports (the API and the Neo4j browser stay on the Compose network). Most of the checklist below is already applied there.

To build and run it yourself, use `docker-compose.prod.yml` or the Coolify template:

```bash
# Production build
docker compose -f docker-compose.prod.yml up -d
```

Key production considerations:
- Set `ENVIRONMENT=production` (fails fast on weak/default secrets at startup)
- Set `CORS_ALLOWED_ORIGINS` to your specific domains (defaults to `*`)
- Use strong, unique values for `NEO4J_PASSWORD`, `ADMIN_PASSWORD`, `SESSION_SECRET`
- Enable HTTPS via reverse proxy (nginx)
- Block direct access to Neo4j ports (7474, 7687) from public internet
- Set `PROMPT_SECURITY=true`; interactive API docs auto-disable in production (`EXPOSE_API_DOCS`)

**Backups:** the self-host, prod overlay, Coolify, and Dokploy stacks include a nightly backup sidecar with a verified server-side graph export (`graph.cypher.gz` + `SHA256SUMS`, stamped `.complete`/`LAST_SUCCESS` only after row counts check out), retention that never deletes the newest complete backup, a compose healthcheck that goes unhealthy when the newest verified backup is older than 2× the interval, and a tested `/restore.sh <timestamp>` runbook.

The file tarball covers **uploads, custom inputs, chat data, installed skills, and installed apps** — the last two were silently excluded before v1.0.0, and user-installed AgentSkills and apps have no other copy, so verify a backup taken on an older stack actually contains them. Two things to internalize:

- **Restoring is six steps, not one command.** `/restore.sh <timestamp>` replays only the graph (and requires `RESTORE_WIPE=yes`, which wipes first — see below). The file volumes must be untarred separately — the sidecar mounts them read-only, so that step runs in a throwaway container. Then start the backend (boot recreates the vector indexes the logical export doesn't carry) and verify counts on `GET /api/stats`. The authoritative runbook is the header comment in `ops/backup/restore.sh`. `npx @mocaos/cortex restore` handles only the first two steps (picking the timestamp, and a typed confirmation) and then **prints** the remaining commands instead of running them — steps 3–5 need host-level `docker` access to volumes the sidecar can only read, and wrapping some but not all of them would leave a half-restored instance with no signal about it.
- **A backups volume on the same disk is not disaster recovery.** Ship them off-host.

> ⚠️ **Graph restore was destructive on v1.0.0 — fixed in v1.0.1.** `RESTORE_WIPE=yes` ran its `DETACH DELETE`, then the replay aborted, leaving an **empty database**. The cause: `apoc.export.cypher.all({ifNotExists: true})` emits `IF NOT EXISTS` for constraints and plain indexes but **not** for fulltext ones, so the export contains a bare `CREATE FULLTEXT INDEX chunk_content …`; the backend creates that schema at startup, so the replay hit "An equivalent index already exists" and rolled back its whole transaction — after the wipe. Restore therefore only ever worked against a schema-less database, which is never the situation anyone restores in. **Do not run a restore on a 1.0.0 stack; update first.** Nothing is wrong with the backups themselves — they stayed checksum-verified throughout and replay correctly under the fixed script, so none need re-taking.
>
> On **v1.0.1+** the wipe drops constraints and indexes as well, making the replay authoritative for the schema it carries. **Vector indexes are deliberately left alone**: the logical export never carried them, the backend rebuilds them at startup, and dropping them would force a full re-embed of every chunk. A failed replay now states where you stand — that it wiped, that the graph is empty, that the backup is intact and verified, and that re-running the same command finishes the job — instead of surfacing as a bare shell error.
>
> Getting the fix onto an existing install needs `--build` on `compose up` (or installer ≥ 1.0.2): the sidecar is a locally built image, so an update without it writes the corrected script to disk and keeps running the old one.

## Troubleshooting

On an installer-managed instance, start with `npx @mocaos/cortex doctor` — one pasteable diagnostic block covering the environment preflight plus service state and health, and it still reports on a half-broken stack rather than dying on the first failed check.

> `FAIL Disk: could not determine free disk space` on a healthy macOS or Windows machine is an old-installer bug, not your disk: `docker info` reports `DockerRootDir=/var/lib/docker`, a path that only exists inside the Docker Desktop VM, so `df` failed on every non-Linux host. Fixed — it now measures the first path it can actually resolve, preferring Docker's own root dir (on Linux that is often a separate, smaller partition, which is the right thing to measure).

### Container won't start

Check if ports are already in use:
```bash
lsof -i :3000   # Frontend
lsof -i :8000   # Backend
lsof -i :7687   # Neo4j
```

### Login fails or silently bounces back

Two distinct symptoms, two distinct causes:

- **"Admin authentication not configured"** — the frontend container is missing `ADMIN_EMAIL` or `ADMIN_PASSWORD` (typical cause: `--env-file` pointing at the wrong path, or secrets not wired into a standalone deployment). Verify with `docker exec <frontend-container> printenv ADMIN_EMAIL`; the startup log also names the missing variable.
- **Form empties and returns to `/login` with no error** — you are serving over plain HTTP and the browser is dropping the `Secure` session cookie. Set `SESSION_COOKIE_SECURE=false` (see [Self-host on a LAN/remote box](#self-host-on-a-lanremote-box)) or put TLS in front.

A plain **"Invalid email or password"** with both of the above ruled out means exactly what it says — the submitted credentials don't match the container's `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

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

- [Configuration Reference](https://docs.cortex.eco/configuration)
- [Deployment Guide](https://docs.cortex.eco/guides/deployment)
- [GitHub Repository](https://github.com/mocaOS/cortex-app)
