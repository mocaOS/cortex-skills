# Connecting Hermes to Cortex

Two ways to give your Hermes agent a cortex. Pick one, then everything in the main skill works the same.

- **[Path A — Connect to an existing instance](#path-a)** — you have (or are given) a base URL + API key. Zero infrastructure.
- **[Path B — Self-host and reuse your provider keys](#self-host)** — boot your own Cortex on the OpenRouter/Venice/OpenAI keys already in `~/.hermes/.env`.

Where credentials live is the same for both: `~/.hermes/.env`.

---

## Where credentials live

Hermes routes secrets to `~/.hermes/.env` and non-secrets to `~/.hermes/config.yaml`. This skill follows that split and matches the env-var names the Cortex MCP server already uses, so a single set of credentials serves both.

```bash
# ~/.hermes/.env
CORTEX_BASE_URL=https://cortex.example.com   # or http://localhost:8000 if self-hosted
CORTEX_API_KEY=cortex_rw_...                  # cortex_ro_ = recall only
CORTEX_COLLECTION=Hermes                       # optional; default "Hermes"
```

If your skill frontmatter declares `required_environment_variables: [CORTEX_API_KEY, CORTEX_BASE_URL]`, Hermes prompts for them on first load and writes them here automatically. `cortex.collection` is a non-secret `metadata.hermes.config` value, so it lands in `config.yaml`.

### State-file fallback

If env vars aren't available to your terminal backend (some Docker/SSH backends don't pass `.env` through), write a state file the scripts fall back to:

```bash
mkdir -p ~/.hermes/skills/state/cortex
cat > ~/.hermes/skills/state/cortex/credentials.json <<EOF
{ "base_url": "$CORTEX_BASE_URL", "api_key": "$CORTEX_API_KEY", "collection": "${CORTEX_COLLECTION:-Hermes}" }
EOF
chmod 600 ~/.hermes/skills/state/cortex/credentials.json
```

Every script in the main skill resolves **env var first, then this file**, so either works. For Docker/SSH terminal backends, add `CORTEX_BASE_URL` and `CORTEX_API_KEY` to `terminal.docker_forward_env` / `env_passthrough` in `config.yaml` to pass them through.

---

## Path A — Connect to an existing instance {#path-a}

1. **Get a base URL and key.** From a teammate's instance or a cloud deployment: the base URL (e.g. `https://cortex.example.com`) and an API key from `{BASE_URL}/admin → API Keys`.
   - **Recall only** → a read-only key (`cortex_ro_`, `read` permission).
   - **Recall + save** → a read/write key (`cortex_rw_`, `read` + `manage`).
2. **Store them** in `~/.hermes/.env` (above).
3. **Validate**: `curl -sf "$CORTEX_BASE_URL/health" -H "X-API-Key: $CORTEX_API_KEY"`.

That's it. Skip to the main skill.

---

## Path B — Self-host Cortex {#self-host}

Cortex is self-hosted via Docker (Neo4j + FastAPI backend + Next.js frontend). It's OpenAI-compatible, so it can run on the same provider keys your Hermes agent already uses.

The complete Docker walkthrough — clone, `.env`, `docker compose up -d`, health polling, all ~160 env vars — is the **Cortex setup skill**. Fetch it and let it drive:

> Fetch `https://cortexskills.org/setup/SKILL.md` and self-host Cortex on my VM using my existing `OPENROUTER_API_KEY` as the LLM provider. Then create a read/write API key and connect this `cortex` skill to `http://localhost:8000`.

Below is only the part unique to a Hermes user: **mapping the keys you already have.**

### Reuse your Hermes provider keys

Cortex reads its LLM provider from `OPENAI_*` env vars but accepts **any OpenAI-compatible endpoint**. Point those at whatever you already pay for:

**OpenRouter** (your `OPENROUTER_API_KEY`):

```bash
OPENAI_API_KEY=$OPENROUTER_API_KEY
OPENAI_API_BASE=https://openrouter.ai/api/v1
OPENAI_MODEL=google/gemini-2.5-flash        # any chat model OpenRouter serves
```

**Venice** (your Venice key) — Venice serves both chat and embeddings, so it's the smoothest single-provider self-host and it's what Cortex's minimal stack is bench-validated on:

```bash
OPENAI_API_KEY=$VENICE_API_KEY
OPENAI_API_BASE=https://api.venice.ai/api/v1
OPENAI_MODEL=google-gemma-4-26b-a4b-it
EMBEDDING_MODEL=text-embedding-qwen3-8b
EMBEDDING_DIMENSION=4096
```

**OpenAI** (your `OPENAI_API_KEY`): the default — no `OPENAI_API_BASE` override needed.

### The embeddings caveat — read this

Cortex needs **two** model capabilities: a **chat/LLM** model (Q&A, entity extraction) and an **embedding** model (vector search). Not every provider serves both:

| Provider | Chat | Embeddings | Notes |
|----------|:---:|:---:|-------|
| OpenAI | ✅ | ✅ | Simplest — one key does everything |
| Venice | ✅ | ✅ | `text-embedding-qwen3-8b`; bench-validated minimal stack |
| OpenRouter | ✅ | ⚠️ | Chat only in practice — **set a separate embedding provider** |

If you self-host on OpenRouter, give the embedding model its own credentials (OpenAI or Venice) via Cortex's `EMBEDDING_API_KEY` / `EMBEDDING_API_BASE` / `EMBEDDING_MODEL`:

```bash
# Chat on OpenRouter…
OPENAI_API_KEY=$OPENROUTER_API_KEY
OPENAI_API_BASE=https://openrouter.ai/api/v1
OPENAI_MODEL=google/gemini-2.5-flash
# …embeddings on OpenAI (or Venice)
EMBEDDING_API_KEY=$OPENAI_API_KEY
EMBEDDING_API_BASE=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536
```

The setup skill's "Recommended Minimal Stack" covers the full model matrix, context budgets, and the `EMBEDDING_DIMENSION` ceiling (Neo4j 5.26 supports up to 4096-dim indexes).

### After it's healthy

```bash
# Poll until Neo4j finishes initializing (30–60s on first boot)
until curl -sf http://localhost:8000/health >/dev/null; do sleep 5; done

# You set ADMIN_API_KEY in .env at boot — use it to mint a scoped read/write key for the agent
curl -sf -X POST "http://localhost:8000/api/admin/api-keys" \
  -H "X-API-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"hermes-agent","permissions":["read","manage"]}' | jq -r '.key'
```

Put that `cortex_rw_...` key and `http://localhost:8000` into `~/.hermes/.env`, and you're connected. Full key management (read-only keys, collection-scoped keys, rotation) is in the [auth skill](https://cortexskills.org/auth/SKILL.md).

> **Don't** hand your agent the `ADMIN_API_KEY`. Mint a least-privilege user key for day-to-day memory work; keep the admin key for instance management only.
