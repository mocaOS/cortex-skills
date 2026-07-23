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
CORTEX_COLLECTION=Hermes                       # optional WRITE scope; default "Hermes"
# CORTEX_COLLECTION_READ=Hermes                # optional READ scope; default "all" = recall spans every collection
```

If your skill frontmatter declares `required_environment_variables: [CORTEX_API_KEY, CORTEX_BASE_URL]`, Hermes prompts for them on first load and writes them here automatically. `cortex.collection` is a non-secret `metadata.hermes.config` value, so it lands in `config.yaml`.

### State-file fallback

If env vars aren't available to your terminal backend (some Docker/SSH backends don't pass `.env` through), register the connection as a named source instead — the helper stores it in `sources.json` and it becomes the default when no env cortex exists:

```bash
bash ${HERMES_SKILL_DIR}/scripts/cortex.sh connect mine-remote https://cortex.example.com cortex_rw_xxx Hermes rw "my long-term memory"
```

The helper resolves **env vars first, then named sources**, so either works. Note: loading this skill (`skill_view cortex`) auto-registers its declared `CORTEX_*` vars as env passthrough on sandboxed backends — load before you run.

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

**The helper does the whole thing in two calls** — preflight, clone, `.env` with generated secrets, detached boot, health polling, key minting, and wiring `~/.hermes/.env`:

```bash
bash ${HERMES_SKILL_DIR}/scripts/cortex.sh setup dir=~/cortex-app provider=venice key=$VENICE_API_KEY
bash ${HERMES_SKILL_DIR}/scripts/cortex.sh setup-status dir=~/cortex-app   # repeat until connected
```

Providers: `provider=ollama|venice|openai|openrouter|custom` — `ollama` is the fully-local zero-cloud-key path (needs ollama running with the chat + `nomic-embed-text` models pulled; the container reaches the host via `172.17.0.1`); openrouter additionally needs `emb_key=` (see the embeddings caveat below); custom needs `base=` `model=` `emb_model=`. Occupied ports? `offset=1` shifts all ports and container names. Humans browsing the dashboard from another machine? Pass `host=<lan-ip-or-domain>` — the frontend bakes its backend URL at build time, so a localhost build shows "session expired" from every other box. `tuning=fast` (auto for ollama/custom) writes local-model-friendly extraction/reasoning/concurrency knobs; `send_dims=false` handles fixed-dimension embedding models (auto-detected for the known ones — wrong setting = HTTP 500 on first ask). For deep tuning (~160 env vars, model matrix, hardening), fetch `https://cortexskills.org/setup/SKILL.md` after boot — the instance's `.env` lives in the setup dir.

Below is the part worth understanding either way: **mapping the keys you already have.**

### Reuse your Hermes provider keys

Cortex reads its LLM provider from `OPENAI_*` env vars but accepts **any OpenAI-compatible endpoint**. Point those at whatever you already pay for:

**OpenRouter** (your `OPENROUTER_API_KEY`):

```bash
OPENAI_API_KEY=$OPENROUTER_API_KEY
OPENAI_API_BASE=https://openrouter.ai/api/v1
OPENAI_MODEL=google/gemini-2.5-flash        # any chat model OpenRouter serves
```

**Venice** (your Venice key) — Venice serves both chat and embeddings, so it's the smoothest single-provider self-host. This is exactly the stack the repo's `.env.recommended` ships (and what `cortex.sh setup provider=venice` writes):

```bash
OPENAI_API_KEY=$VENICE_API_KEY
OPENAI_API_BASE=https://api.venice.ai/api/v1
OPENAI_MODEL=google-gemma-4-26b-a4b-it     # recommended primary agent model
GRAPH_EXTRACTION_MODEL=qwen3-6-27b         # recommended for knowledge-graph generation
VISION_MODEL=qwen3-6-27b                   # image analysis (same endpoint)
EMBEDDING_MODEL=text-embedding-3-small     # Venice serves it; 1536-dim code default
# Higher-dim alternative: EMBEDDING_MODEL=text-embedding-qwen3-8b + EMBEDDING_DIMENSION=4096
```

**OpenAI** (your `OPENAI_API_KEY`): the default — no `OPENAI_API_BASE` override needed.

### The embeddings caveat — read this

Cortex needs **two** model capabilities: a **chat/LLM** model (Q&A, entity extraction) and an **embedding** model (vector search). Not every provider serves both:

| Provider | Chat | Embeddings | Notes |
|----------|:---:|:---:|-------|
| OpenAI | ✅ | ✅ | Simplest — one key does everything. `text-embedding-3-small` / 1536 is the **recommended** embedding setup |
| Venice | ✅ | ✅ | Serves `text-embedding-3-small` / 1536 (**recommended**); `text-embedding-qwen3-8b` / 4096 as higher-dim alternative |
| OpenRouter | ✅ | ⚠️ | Chat only in practice — **set a separate embedding provider** |

If you self-host on OpenRouter, give the embedding model its own credentials (OpenAI or Venice) via Cortex's `EMBEDDING_API_KEY` / `EMBEDDING_API_BASE` / `EMBEDDING_MODEL`:

```bash
# Chat on OpenRouter…
OPENAI_API_KEY=$OPENROUTER_API_KEY
OPENAI_API_BASE=https://openrouter.ai/api/v1
OPENAI_MODEL=google/gemini-2.5-flash
# …embeddings on OpenAI (recommended: text-embedding-3-small / 1536)
EMBEDDING_API_KEY=$OPENAI_API_KEY
EMBEDDING_API_BASE=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536
EMBEDDING_MAX_INPUT_TOKENS=5400   # providers validate with their own tokenizer — 5400 stays under every 8192-cap provider
```

The setup skill's "Recommended Minimal Stack" covers the full model matrix, context budgets, and the `EMBEDDING_DIMENSION` ceiling (Neo4j 5.26 supports up to 4096-dim indexes).

### After it's healthy

`setup-status` already does this for you: it mints a least-privilege `cortex_rw_` key with the instance's admin key, writes `CORTEX_*` into `~/.hermes/.env`, and registers the source. If you booted Cortex some other way, the equivalent single call is `POST /api/admin/api-keys` with `{"name":"hermes-agent","permissions":["read","manage"]}` and the `ADMIN_API_KEY` from the instance's `.env` — put the returned `cortex_rw_…` key and base URL into `~/.hermes/.env`. Full key management (read-only keys, collection-scoped keys, rotation) is in the [auth skill](https://cortexskills.org/auth/SKILL.md).

> **Don't** hand your agent the `ADMIN_API_KEY` for day-to-day memory work — it stays in the setup dir's `.env`, used only for instance management.

### Asking your human for credentials — the etiquette

- Provider **choice**, install dir, ports, collection name → normal questions (the `clarify` tool with options is ideal).
- Key **values** → never via chat. Reuse what's already in `~/.hermes/.env` (with their OK), or ask them to add the key there and tell you when done. Hermes also prompts securely for this skill's declared `CORTEX_*` vars on first load — that's the sanctioned path for secrets.
- When you confirm the connection, name the source and access — don't echo any key back.
