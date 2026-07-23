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
| **Community** | a curated public body — a scene's archive, a project's collected history, an open corpus | `cortex_ro_` | consult it as a domain expert; you read, you don't write |
| **Company / team** | an org's internal knowledge — runbooks, decisions, postmortems, docs | `ro` for consumers, `rw` for contributors | check "have we solved this before?"; contribute what you learn |

### Use-case patterns

- **Continuity (personal).** The agent dumps a curated note at each session boundary and recalls it days later — "what did we decide about the auth rewrite?" Memory that survives compaction.
- **Domain expert on tap (community).** Point a read-only key at a community cortex and the agent answers grounded, cited questions it otherwise couldn't — "ask the community cortex who pioneered this technique." The knowledge is the community's; the agent is just fluent in it.
- **Shared team brain (company).** Every employee's Hermes reads the same company cortex: onboarding, incident runbooks, architecture decisions. Contributors (`rw`) push postmortems and design notes; everyone else (`ro`) consults them. Institutional memory that doesn't live in one person's head.
- **Blended, in one session.** Read from a community/company cortex for domain facts, then save *your* synthesis to your personal cortex — noting provenance ("Source: community cortex"). Next week, recall your synthesis without re-querying the source. This is the pattern that compounds: consume shared knowledge, distill it, keep the distillation.
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

## Memory hygiene — when working memory is full

Sync (above) *copies* memory into your cortex. Hygiene is the other direction: **shrinking** `MEMORY.md` when it nears its ~800-token budget, or when the user says "free up memory" / "clean up your memory". The budget is tiny by design, so the steady state to aim for:

> `MEMORY.md` holds the **router** — service endpoints, connected cortex sources, the "your cortex = …" routing entry, hard conventions — plus one-line pointers. Everything episodic lives in your cortex.

This generalizes the routing-entry trick from the main skill: the native memory routes, the cortex remembers.

**Decision rule per entry:** *will the next turn need this to route a tool call or pick a model?* Yes → it stays. No → it migrates.

### The flow (order matters — nothing is deleted until recall is verified)

1. **Cluster and synthesize.** Group migrating entries by topic and write one cohesive note per cluster to the outbox (conventions above). Don't copy entries verbatim — five pasted fragments recall as five partial answers; one synthesized doc recalls as one.
2. **Pre-flight.** `cortex.sh status`, and don't start a migration into a backlogged instance (`GET /api/documents?status=pending` should be empty or draining).
3. **Save** each note — `cortex.sh save <note>` — and keep the `document_id`s. Then `cortex.sh wait <doc_id>`: an upload that returned 200 can still fail extraction.
4. **Verify recall before touching memory.** `check` a question each migrated fact should answer and confirm the new note comes back cited. If it doesn't, stop — leave `MEMORY.md` as is and say so.
5. **Shrink.** Delete pure-archive entries; turn still-referenced ones into one-line pointers:

   ```
   → plugin bugs: see cortex doc `topic-plugin-bugs.md`. Recall: "check your cortex for plugin bugs".
   ```

6. **Report the ledger** — what landed where (filenames + doc ids), memory before/after, what survived locally, anything that failed verification and stayed.

For the platform-generic version of this procedure (bigger memory files, anchor-based memory tools and their escaping traps), fetch the [memory-hygiene skill](https://cortexskills.org/memory-hygiene/SKILL.md).

---

## Heartbeat cadence

If your agent runs long-lived (gateway sessions, cron), sync on a heartbeat rather than constantly.

| Trigger | Cadence | Action |
|---------|---------|--------|
| Heartbeat | every **4+ hours** | Scan memory dirs, upload changed files |
| Session boundary | on demand | Dump a curated session note |
| Before a hard question | pre-query | `check` your cortex first if the answer might live in past work |

**Do not** sync every few minutes — it wastes LLM calls (extraction runs on every upload), and files may be mid-write.

**The Hermes-native heartbeat is a cron job with this skill attached.** The skill ships a `blueprint` (every 6h sync), so after install it appears as a *suggested* automation — accept it via `/suggestions`. Or create it explicitly, one line:

```bash
hermes cron create "every 6h" "Run the cortex memory heartbeat: sync changed memory files to my personal cortex; report only if something new was pushed." --skill cortex --name cortex-heartbeat
```

Cron sessions start with the skill preloaded, so the sync command resolves without discovery. `cortex.sh sync` stays hash-guarded — an idle heartbeat costs one API health-check and no LLM calls.

---

## Recall patterns

Every recall verb is the same intent — *find the answer in the cortex* — the verb only picks the opening move (the full playbook is the main skill's Recall section):

| Need | Opening move | Endpoint |
|------|-------------|----------|
| Fast answer with sources | "check your cortex for X" → `check` | `POST /api/ask` (`use_agentic:false`, ~3 researcher iterations) |
| Deep multi-step research — multi-part, comparative, cross-document questions | "ask your cortex about X" → `ask` | `POST /api/ask/stream` (`use_agentic:true`, up to 8 iterations, question decomposition) |
| Exact source passages / probing what matches | "search your cortex for X" → `search` | `POST /api/search` |

The judgment that matters more than the mapping:

- **Formulate a self-contained question.** The cortex can't see the current conversation — resolve pronouns and context, and name entities (retrieval is graph/entity-aware) before querying.
- **Escalate instead of giving up.** `check` empty → `search` 2–3 reformulations → `ask` (deep research). Broad or multi-part question → go straight to `ask`. Report "not found" only after the ladder — and after confirming you searched the right collection.
- **Writes are scoped, reads are not.** Saves always target your own collection (`collection_id`) so the graph stays about *this* agent's memory — but recall reads **all collections** in the instance by default, because a read scoped to your write collection silently misses sibling data (a document archive, another tool's ingest) and turns "it's in a sibling collection" into a confident "nothing was ever saved about X". If unscoped recall on a shared instance returns too much noise, narrow it deliberately (`CORTEX_COLLECTION_READ` / `read_collection`) — a narrowed miss then says nothing about the rest of the instance.

Multi-turn recall: pass prior turns via `conversation_history` on `/api/ask`. Full request/response schemas are in the [ask skill](https://cortexskills.org/ask/SKILL.md) and [search skill](https://cortexskills.org/search/SKILL.md).

### Recall before you answer

The highest-value move: when a user asks something that might live in past work, `check your cortex` *first*, fold the result into your reasoning, and cite it. That's the closed loop — save curated knowledge, recall it exactly when it's relevant.

---

## Collection strategy

Everything this agent saves goes into one collection (default `Hermes`) so recall is naturally scoped. Variations:

- **Per-project memory** → set `CORTEX_COLLECTION` per project (e.g. `Hermes-projectX`) and each keeps a clean graph.
- **Shared team brain** → point multiple agents at the same collection on a shared instance. Give contributors read/write keys and consumers read-only keys.
- **Read-only consumer** → an agent with a `cortex_ro_` key that only `check`s a curated team cortex it never writes to.

Collections are cheap. When in doubt, one collection per coherent body of knowledge.

### Multi-collection instances (the common self-host case)

Any instance fed by more than one tool holds multiple collections — your LTM plus a scanned-document archive, research notes, an email pipeline. The helper's defaults are built for this: **write scope** is your collection only (you never contaminate a sibling), **read scope** is the whole instance (recall sees everything your key can). "Check your cortex for the plumber's invoice" works even though the invoice lives in the archive collection, not your memory. To deliberately restrict recall to one collection, set `CORTEX_COLLECTION_READ=<name>` (env source) or a `read_collection` field on the source in `sources.json`; `status` always shows both scopes plus a per-collection document breakdown when reading all.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Sync runs, uploads nothing | Hashes match, or dirs empty | Expected if nothing changed; confirm files exist and aren't empty |
| Saved but recall finds nothing | Processing is async | Wait; check `GET /api/documents?status=pending` |
| `403 MANAGE access required` | Read-only key | Get a `cortex_rw_` key |
| Recall returns unrelated hits | Reads span all collections by default | Narrow deliberately: `CORTEX_COLLECTION_READ=<name>` / `read_collection` in `sources.json` (raw API: `collection_id` on ask, `filters.collection_id` on search) |
| Recall misses data you know exists | Read scope narrowed to one collection | `status` shows the read scope; clear `CORTEX_COLLECTION_READ` / `read_collection` (default reads all collections) |
| Duplicate entities | Tracking file lost, or manual re-upload | Run entity dedup (graph skill) |
| `429 Monthly usage limit reached` | Instance `MAX_QUERIES_PER_MONTH` quota | `Retry-After` = seconds to next UTC month; in-flight work still finishes |
