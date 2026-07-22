---
name: memory-hygiene
description: >
  Migrate an agent's local memory file (MEMORY.md or equivalent) into a Cortex
  knowledge graph when it approaches capacity or the user asks for cleanup.
  Sorts entries into "stays local" (system-relevant routing facts) vs "goes to
  Cortex" (episodic knowledge), synthesizes topic-organized outbox notes,
  saves them, verifies recall, and only then shrinks local entries to one-line
  pointers. Pairs with the /cortex skill for the Cortex REST API itself.
  Triggers on "memory is full", "free up memory", "move stuff to long-term",
  "archive old memory", "clean up my memory file", or whenever the local
  memory file exceeds ~85% of its size budget.
license: MIT
compatibility: >
  Requires curl, jq (or python3 as fallback), and network access to a Cortex
  instance. Works with any agent that can execute shell commands and has a
  writable local memory file.
metadata:
  author: Cortex
  version: "1.0.0"
  category: operations
  emoji: "\U0001F9F9"
allowed-tools: Bash Read Write
---

# Memory Hygiene — Local Memory → Cortex LTM

The standing "agent memory is too full" workflow. Local working memory (a `MEMORY.md`, memory-tool entries, whatever your platform injects into every session) is a scarce, always-loaded resource. Cortex is unbounded, searchable long-term memory. When the local file approaches its budget, this skill tells you which entries must stay local, which belong in Cortex, and how to migrate the latter **without losing data**.

Requires a running Cortex instance reachable via the `/cortex` skill (load `/setup` first if you don't have one).

## The one invariant

> **Nothing leaves local memory until it is confirmed recallable from Cortex.**

The order is always: synthesize → save → **verify recall** → shrink/remove locally. If verification fails at any point, stop — leave the local entry untouched and report the failure. A migration that loses a fact is worse than a full memory file.

## The 4-step procedure

### Step 1 — Sort entries into two buckets

**Stays local (system-relevant):** anything the *next turn* needs to route a tool call without an extra round-trip — active service endpoints/ports, credential *locations* (never values), model aliases, tool/plugin wiring, current fix-status of known bugs, standing user-profile facts and hard conventions.

**Goes to Cortex (episodic):** anything you'd want *recalled on demand* rather than always loaded — project notes, post-mortems and lesson-learned write-ups, historical timelines (only the current status stays local), reasoning narratives once a decision is stable, deep specs when only the alias matters, one-off discovery breadcrumbs.

**Decision rule:** *"Will the next assistant turn need this fact to route a tool call or pick a model?"* Yes → stays. No → Cortex. When your local budget is very small (some platforms allow < 1000 tokens), most of the "stays" bucket becomes pointers too — keep only the router.

### Step 2 — Synthesize outbox notes (don't copy-paste)

Migrating five related entries verbatim yields five disconnected chunks and fragmented recall. Instead, group entries into topic clusters and write **one cohesive source-of-truth note per cluster** to an outbox directory your context-loader does not read (e.g. `~/.hermes/skills/state/cortex/outbox/`, `~/.openclaw/skills/library/state/cortex/outbox/`).

Name notes `topic-<slug>.md` (one topic across sessions) or `session-<YYYY-MM-DD>.md` (a day's decisions). Every note carries a clear title, topic-organized sections, all critical payload (numeric specs, paths, fix statuses, dates), and a one-line recall hint. Start from [templates/outbox-note.md](templates/outbox-note.md).

### Step 3 — Save to Cortex, with health checks

Pre-flight — never migrate into a backlogged instance:

```bash
curl -sf -H "X-API-Key: $CORTEX_API_KEY" "$CORTEX_BASE_URL/api/stats" \
  | jq '{pending: .pending_count, processing: .processing_count, failed: .failed_count}'
```

If `pending > 0` or `failed_count` is climbing, wait or load `/admin` to investigate first.

Then save each note (the `/cortex` skill's `cortex.sh` helper, or `POST /api/upload` directly — see `/upload`). Log every returned `document_id`. Saves are independent — run them in parallel; one failure must not block the others.

Post-flight — upload returning 200 does **not** mean extraction succeeded. Wait for processing to finish (`cortex.sh wait <doc_id>`, or re-poll `/api/stats` after ~30s) and confirm `failed_count` did not rise. If it did, see `/upload` for reprocess troubleshooting.

### Step 4 — Verify recall, then shrink local memory

Ask Cortex a question each migrated fact should answer (`check`/`ask` via `/cortex`) and confirm the new doc comes back cited. Only then edit local memory:

- **Archive entries** → delete them.
- **Entries someone may still reach for** → replace with a one-line pointer:

  ```
  → <topic>: see Cortex doc `topic-<slug>.md` (collection <name>). Recall via /cortex ask.
  ```

Edit mechanics depend on your platform. Plain file → normal file edits. Anchor-based memory tool (`old_text`/`str_replace` style) → read [references/ANCHOR-EDITING.md](references/ANCHOR-EDITING.md) first; it covers the batching and escaping traps that cause most failed migrations.

## After the pass — report

Give the user a ledger, not a "done":

- What landed in Cortex (filenames + `document_id`s)
- Local memory usage before/after
- Which entries became pointers, which were archived, which stayed local (so they see the surviving system context)
- Anything that failed verification and was therefore left in place

## Precise directives ("move all X to Cortex")

When the user names a topic instead of asking for general cleanup: audit the **whole** memory file for every entry touching that topic (clusters often span 3–5 entries), build one source-of-truth doc with the full payload, save, verify with a query that would have failed before, then pointer-ize each source entry. Details and a worked example: [references/PROCEDURE.md](references/PROCEDURE.md).

## Pitfalls

- **Don't migrate the router.** Endpoints, key locations, tool wiring stay local — recalling them from Cortex costs a round-trip every turn.
- **Don't delete before verifying recall.** The invariant above.
- **Don't trust HTTP 200 as ingestion success.** Extraction is async and can fail silently — re-check stats.
- **Don't migrate verbatim.** Synthesize per topic, or recall comes back fragmented.
- **Don't start against a backlogged instance.** Check `pending_count` first.
- **Don't skip the after-pass report.** The user needs to know what moved where.

## Pairing notes

- `/cortex` — the Cortex REST API and `cortex.sh` helper this workflow drives.
- `/upload` — direct upload endpoint + reprocess troubleshooting.
- `/admin` — `/api/stats`, instance health, unblocking a backlog.
- `/setup` — self-host a Cortex instance if you don't have one.
- `/hermes` — Hermes agents: the calibrated version of this workflow (tiny ~800-token working memory) lives in that skill's `references/LTM.md`.

## Skill files

| File | Description |
|------|-------------|
| **SKILL.md** (this file) | The procedure and the invariant — self-contained |
| [references/PROCEDURE.md](references/PROCEDURE.md) | Detailed bucket heuristics, worked example, edge cases |
| [references/ANCHOR-EDITING.md](references/ANCHOR-EDITING.md) | Editing anchor-based memory tools safely (batching, escaping) |
| [templates/outbox-note.md](templates/outbox-note.md) | Starter skeleton for a curated outbox note |

## Version history

- **1.0.0** — Initial release. Generic agent-memory → Cortex migration procedure.
