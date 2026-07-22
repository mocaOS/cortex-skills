# Memory Hygiene — Detailed Procedure

Depth behind the 4-step procedure in [SKILL.md](../SKILL.md): the full bucket heuristic, curation guidance, a worked example, and edge cases. SKILL.md has the procedure itself and the invariant (verify recall before deleting anything); this file doesn't repeat them.

## Step 1 — The bucket heuristic, in full

### Bucket A — stays local (system-relevant)

Facts the next turn routes on. If the agent must query Cortex to learn "which port does my gateway run on", the latency benefit of local memory is gone.

| Category | Examples |
|---|---|
| Active service endpoints | `http://<host>:<port>/v1`, base URLs |
| Credential *locations* (never values) | `<TOKEN>` lives in `<env-file>`, env-var names |
| Current versions + commit hashes | `v0.18.2`, commit `569b912` |
| Tool wiring | dispatch order, plugin kinds, chokepoints |
| Plugin paths + opt-in keys | `<plugin-path>`, `plugins.enabled: [...]` |
| Active config tuning | env vars, capacities, batch sizes |
| Hardware specs that gate decisions | VRAM, power limits |
| Known bugs — **current fix status only** | "fixed in v0.19; workaround X until then" |
| User-profile facts | name, language, hard conventions |

### Bucket B — goes to Cortex (episodic)

Facts you might need five turns — or five weeks — from now, too verbose to always load. They survive in Cortex and surface only when relevant.

| Category | Examples |
|---|---|
| One-off project notes | "user is researching X for an event in May" |
| Long technical write-ups | post-mortems, deployment recipes |
| Historical timelines | how an upstream PR got resolved, step by step |
| Preference lists (when not load-bearing) | music taste, contact names |
| Discovery breadcrumbs | "found the flag via `--help-all`" — useful once |
| Deep specs | full model card when only alias + endpoint matter |
| Reasoning narratives | the *why* of a decision, once it's stable |
| Lessons learned | bug lists, workarounds, quirks |

### The size-budget caveat

The tables above assume a memory file of several KB. On platforms with a very small working memory (Hermes injects ~800 tokens), Bucket A shrinks to **the router only**: endpoints, source names, the "how to reach my cortex" entry, hard conventions. Everything else — including most of the table above — becomes a pointer.

### Split entries

Some entries straddle both buckets: a bug entry with a long investigation narrative *and* a current fix status. Split it — status line stays local, narrative goes into the topic note.

## Step 2 — Curation detail

### Why synthesized notes beat verbatim migration

Five copy-pasted entries become five disconnected chunks; "what do we know about X" returns five partial answers. One synthesized source-of-truth doc with clear sections returns one coherent, citable answer — and produces a cleaner entity graph.

### Filename conventions

- `topic-<slug>.md` — one topic across multiple sessions (preferred for migrations)
- `session-<YYYY-MM-DD>.md` — a day's decisions, chronological
- `episodic-<YYYY-MM-DD>.md` — user-side projects, preferences, context

### What must survive, what to drop

**Must survive:** numeric specs, paths, dates, IDs, fix statuses, verification sources — anything you'd be unable to reconstruct.
**Drop:** prose connective tissue, "then we tried…" walkthroughs (unless the sequence itself is the lesson), ephemeral state.

Skeleton: [templates/outbox-note.md](../templates/outbox-note.md).

## Step 3 — Save detail

Health checks (pre-flight `/api/stats`, post-flight `wait`/re-poll) are in SKILL.md. Two additions:

- **Many notes (10+):** upload with `start_processing=false`, then trigger one `POST /api/documents/process-pending` batch instead of flooding the pipeline. The `/cortex` skill documents this bulk pattern.
- **Log every `document_id`** as it returns — you need them for the after-pass report and for `reprocess` if extraction fails.

## Step 4 — Verification detail

Verify with a question, not a lookup: ask (`/cortex` `check` or `ask`) something the migrated content should answer, phrased as your future self would phrase it cold — self-contained, entities named. Confirm the *new* doc appears in the citations. A `search` on a distinctive phrase from the note is a good fallback when synthesis is ambiguous.

Only after that, shrink local memory (pointer format in SKILL.md; anchor-tool mechanics in [ANCHOR-EDITING.md](ANCHOR-EDITING.md)).

## Worked example

**Scenario:** `MEMORY.md` is at 18.5 KB of a 20 KB limit (92%). User says *"free up memory."*

1. **Sort** — 40 entries: ~20 system-relevant (endpoints, aliases, plugin paths), ~20 episodic (post-mortems, preference lists, an upstream changelog).
2. **Synthesize 3 notes** — `session-2026-07-22.md` (today's decisions), `topic-plugin-bugs.md` (3 install bugs + statuses), `topic-host-topology.md` (network/service inventory).
3. **Save** — stats clean → 3 parallel saves → `document_id`s `abc-123`, `def-456`, `ghi-789` → wait → `failed_count` unchanged.
4. **Verify** — `check "what plugin install bugs do we know and their fix status?"` cites `topic-plugin-bugs.md`. Same for the other two.
5. **Shrink** — 15 entries deleted, 5 became pointers (their fix-status lines stayed local).

**Report:** 3 docs in Cortex (ids above); memory 92% → 58%; 20 system entries survived; no verification failures.

## Edge cases

- **No outbox directory exists** — create one anywhere your context-loader does not read. Platform conventions: `~/.hermes/skills/state/cortex/outbox/` (Hermes), `~/.openclaw/skills/library/state/cortex/outbox/` (OpenClaw).
- **Cortex is LAN-only** — `http://<lan-ip>:<port>` works fine; see `/setup` for the self-host recipe.
- **Verification finds the old chunks but not the new doc** — processing may still be running (`wait`), or the save landed in the wrong collection — check `collection_id` scoping before assuming failure.
- **User asks to migrate something from Bucket A** — do it, but say what it costs ("recalling the endpoint will take a round-trip each session") and leave a pointer.

## Recall hints for this doc

Once this procedure itself lives in a cortex: *"what is the memory hygiene procedure?"*, *"what stays in local memory vs Cortex?"*, *"how do I safely shrink my memory file?"*
