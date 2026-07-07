# Hermes LTM — The Long-Term Memory Playbook

How a Hermes agent uses Cortex as its long-term brain: what to save, how to curate it, how to recall it, and how often to do either. The main skill has the commands; this is the *judgment*.

---

## The two-tier memory model

| Tier | Where | Size | Recall | Good for |
|------|-------|------|--------|----------|
| **Working memory** | `~/.hermes/memories/MEMORY.md` + `USER.md` | ~800 + ~500 tokens | Injected into every prompt | Facts you need *every* session — who the user is, hard conventions |
| **Session recall** | `~/.hermes/state.db` (SQLite + FTS5) | All sessions | `session_search` tool, `hermes sessions list` | Finding the *exact message* where something was said |
| **Long-term memory (your cortex)** | Cortex knowledge graph | Unbounded | `check` / `ask` / `search` | *Synthesized* knowledge across everything you've ever saved |

Working memory is a frozen snapshot — deliberately tiny to keep the prefix cache warm. `session_search` gives you verbatim past messages. **Your cortex is the layer that scales**: it extracts entities and relationships from everything you dump, so "what have I learned about X across all my work" becomes a single question. The three tiers are complementary — reach for the cheapest one that answers the question, and fall through to cortex when the answer spans sessions.

---

## A cortex isn't only *yours* — three modes, one interface

The same `check` / `ask` / `search` / `save` verbs point at very different bodies of knowledge depending on which cortex you connect to. You can hold several connections at once (see "Connect" in the main skill) and route by name (`--source`).

| Mode | The cortex is… | Typical key | The move |
|------|----------------|-------------|----------|
| **Personal LTM** | your agent's private memory | `cortex_rw_` | dump sessions, recall your own past work |
| **Community** | a curated public body — e.g. the **Museum of Crypto Art** cortex, full of web3 & cryptoartist knowledge | `cortex_ro_` | consult it as a domain expert; you read, you don't write |
| **Company / team** | an org's internal knowledge — runbooks, decisions, postmortems, docs | `ro` for consumers, `rw` for contributors | check "have we solved this before?"; contribute what you learn |

### Use-case patterns

- **Continuity (personal).** The agent dumps a curated note at each session boundary and recalls it days later — "what did we decide about the auth rewrite?" Memory that survives compaction.
- **Domain expert on tap (community).** Point a read-only key at a community cortex and the agent answers grounded, cited questions it otherwise couldn't — "ask the MOCA cortex who pioneered on-chain generative art." The knowledge is the community's; the agent is just fluent in it.
- **Shared team brain (company).** Every employee's Hermes reads the same company cortex: onboarding, incident runbooks, architecture decisions. Contributors (`rw`) push postmortems and design notes; everyone else (`ro`) consults them. Institutional memory that doesn't live in one person's head.
- **Blended, in one session.** Read from a community/company cortex for domain facts, then save *your* synthesis to your personal cortex — noting provenance ("Source: MOCA cortex"). Next week, recall your synthesis without re-querying the source. This is the pattern that compounds: consume shared knowledge, distill it, keep the distillation.
- **Scoped multi-tenant (company).** One instance, many collections; a restricted `rw` key lets a team contribute to *its* collection while reading the shared one — the same skill, different `CORTEX_COLLECTION` / `--source`.

**Keep write-scope honest:** never `save` to a community or company cortex you're only meant to consult — use a read-only source for those (the helper refuses writes on `ro` sources). Contribute only where you're a contributor.

---

## What to save

Save things your future self will thank you for. Skip noise — Cortex extracts a knowledge graph from **everything** you send, so junk in means junk in the graph.

**Save:**
- Curated session notes at a natural boundary (task done, decision made, lesson learned)
- `MEMORY.md` / `USER.md` when they meaningfully change
- Durable artifacts: design decisions, runbooks, research findings, "how X works" write-ups

**Don't save:**
- Raw, unedited transcripts (curate first — see below)
- Half-finished scratch, temp files, or files still being written
- Secrets, tokens, or PII (Cortex indexes content; treat a dump like a commit)
- The same unchanged file every heartbeat (the hash guard prevents this)

---

## Curate, don't dump

"Dump your session into your cortex" is a figure of speech. The best memory is *curated*, not raw. You are the ideal summarizer of your own session — you know what mattered. A 300-word note that captures the decisions and gotchas is worth more than a 20-page transcript, and it produces a cleaner entity graph.

A good session note:

```markdown
# Session — <one-line topic> — 2026-07-07

## Context
Why this session happened; what the user wanted.

## What we did
- Concrete actions, in order.

## Decisions
- What was chosen and **why** (the why is what you'll want later).

## Learned / gotchas
- Non-obvious things. Failure modes. "It only works if…".

## Open threads
- What's unfinished, blocked, or worth revisiting.
```

Write it to `~/.hermes/skills/state/cortex/outbox/session-<date>-<topic>.md`, then upload (main skill → *Save: dump a session*). Keeping an `outbox/` gives you a local trail of what you've contributed.

---

## Memory-file sync (full workflow)

"Save today's memory into your cortex" pushes your Hermes memory files. Idempotent via SHA-256 content hashes — running it repeatedly only uploads what changed.

### Directories to scan

| Directory | Contents |
|-----------|----------|
| `~/.hermes/memories/` | `MEMORY.md`, `USER.md`, and any dated notes |
| `~/.hermes/skills/state/cortex/outbox/` | Curated session notes you've written |

Supported types: `.md`, `.txt`, `.json`.

### Bulk sync (10+ files)

Uploading many files with `start_processing=true` each floods the pipeline. Instead, upload all with processing off, then trigger one batch:

```bash
# 1. Upload everything without processing
for f in "$HOME/.hermes/memories/"*.md "$HOME/.hermes/skills/state/cortex/outbox/"*.md; do
  [ -f "$f" ] || continue
  curl -sf -X POST "$BASE_URL/api/upload?collection_id=$COLLECTION_ID&start_processing=false" \
    -H "X-API-Key: $API_KEY" -F "file=@$f" >/dev/null && echo "queued: $f"
done

# 2. Kick off one batch process
curl -sf -X POST "$BASE_URL/api/documents/process-pending" -H "X-API-Key: $API_KEY"

# 3. (optional) watch it drain
curl -sf "$BASE_URL/api/documents?status=pending" -H "X-API-Key: $API_KEY" | jq '.total'
```

Pair this with the hash-guard loop in the main skill (*Save: sync today's memory*) so unchanged files never re-upload. Persist the hash immediately after each upload so an interrupted sync resumes correctly.

### Dedup

Tracked in `~/.hermes/skills/state/cortex/uploaded.json` by absolute path → SHA-256. Decision per file: **not tracked** → upload; **hash differs** → re-upload; **hash matches** → skip. If duplicate entities appear in the graph (e.g. the tracking file was deleted), use Cortex's entity-dedup endpoints — see the [graph skill](https://cortexskills.org/graph/SKILL.md).

---

## Heartbeat cadence

If your agent runs long-lived (gateway sessions, cron), sync on a heartbeat rather than constantly.

| Trigger | Cadence | Action |
|---------|---------|--------|
| Heartbeat | every **4+ hours** | Scan memory dirs, upload changed files |
| Session boundary | on demand | Dump a curated session note |
| Before a hard question | pre-query | `check` your cortex first if the answer might live in past work |

**Do not** sync every few minutes — it wastes LLM calls (extraction runs on every upload), and files may be mid-write. A Hermes `cron/` job (`~/.hermes/cron/`) is a natural home for the heartbeat.

---

## Recall patterns

Match the verb to the need:

| Need | Command | Endpoint |
|------|---------|----------|
| Fast answer with sources | "check your cortex for X" | `POST /api/ask` (`use_agentic:false`) |
| Deep, multi-step synthesis | "ask your cortex about X" | `POST /api/ask` (`use_agentic:true`) |
| Exact source passages | "search your cortex for X" | `POST /api/search` |
| Live streaming answer | — | `POST /api/ask/stream` (SSE) |

**Always scope to your collection** (`collection_id`) so recall stays about *this* agent's memory, not everything on a shared instance. Multi-turn recall: pass prior turns via `conversation_history` on `/api/ask`. Full request/response schemas are in the [ask skill](https://cortexskills.org/ask/SKILL.md) and [search skill](https://cortexskills.org/search/SKILL.md).

### Recall before you answer

The highest-value move: when a user asks something that might live in past work, `check your cortex` *first*, fold the result into your reasoning, and cite it. That's the closed loop — save curated knowledge, recall it exactly when it's relevant.

---

## Collection strategy

Everything this agent saves goes into one collection (default `Hermes`) so recall is naturally scoped. Variations:

- **Per-project memory** → set `CORTEX_COLLECTION` per project (e.g. `Hermes-projectX`) and each keeps a clean graph.
- **Shared team brain** → point multiple agents at the same collection on a shared instance. Give contributors read/write keys and consumers read-only keys.
- **Read-only consumer** → an agent with a `cortex_ro_` key that only `check`s a curated team cortex it never writes to.

Collections are cheap. When in doubt, one collection per coherent body of knowledge.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Sync runs, uploads nothing | Hashes match, or dirs empty | Expected if nothing changed; confirm files exist and aren't empty |
| Saved but recall finds nothing | Processing is async | Wait; check `GET /api/documents?status=pending` |
| `403 MANAGE access required` | Read-only key | Get a `cortex_rw_` key |
| Recall returns unrelated hits | Not collection-scoped | Add `collection_id` (ask) / `filters.collection_id` (search) |
| Duplicate entities | Tracking file lost, or manual re-upload | Run entity dedup (graph skill) |
| `429 Monthly usage limit reached` | Instance `MAX_QUERIES_PER_MONTH` quota | `Retry-After` = seconds to next UTC month; in-flight work still finishes |
