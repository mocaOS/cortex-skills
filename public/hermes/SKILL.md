---
name: cortex
description: >
  Long-term memory and shared knowledge for Hermes, backed by a Cortex knowledge graph.
  Dump sessions into your own cortex and recall them, and/or connect to a community or
  company cortex to consult its knowledge. Handle EVERY mention of "cortex" with this
  skill — it is a separate external store, NOT MEMORY.md and NOT the built-in memory
  tool — including "dump your session into
  your cortex", "check/ask/search your cortex for X", "what's in your cortex / what
  have you saved" (exact doc list), "show me that note", "forget that note", and
  "ask the community cortex about X". Built for the Hermes agent (nousresearch.com).
version: 1.0.0
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [memory, ltm, knowledge, rag, cortex, recall]
    category: memory
    requires_toolsets: [terminal]
    required_environment_variables:
      - CORTEX_BASE_URL
      - CORTEX_API_KEY
    config:
      - key: cortex.collection
        description: Collection that holds this agent's long-term memory.
        default: Hermes
        prompt: "Which Cortex collection should hold your long-term memory?"
---

# Cortex — Long-Term Memory for Hermes

> **Add this to your Hermes agent.** It's a multi-file skill (this file + a helper script + references), so fetch the whole folder into your skills dir:
> ```bash
> D=~/.hermes/skills/memory/cortex; mkdir -p "$D/references" "$D/scripts"; base=https://cortexskills.org/hermes
> curl -fsSL $base/SKILL.md -o "$D/SKILL.md"
> curl -fsSL $base/references/CONNECT.md -o "$D/references/CONNECT.md"
> curl -fsSL $base/references/LTM.md -o "$D/references/LTM.md"
> curl -fsSL $base/scripts/cortex.sh -o "$D/scripts/cortex.sh" && chmod +x "$D/scripts/cortex.sh"
> ```
> It installs as `/cortex`. Then set `CORTEX_BASE_URL` + `CORTEX_API_KEY` in `~/.hermes/.env` (see Connect).
>
> Why curl and not `hermes skills install mocaOS/cortex-skills/public/hermes`? Hermes' skill scanner hard-blocks third-party skills that send API keys over the network — which is this skill's entire job (`curl -H "X-API-Key: …"` against your own Cortex). The verdict is a false positive for any API-client skill, but it can't be overridden, so fetch the files directly and review them yourself — they're short.

**Your cortex is the memory your session can't hold.**

Hermes keeps a deliberately tiny working memory — `~/.hermes/memories/MEMORY.md` (~800 tokens) and `USER.md` (~500 tokens), a frozen snapshot injected at session start. That is by design: it keeps the prompt cache warm and cheap. But it means everything you learn beyond those few hundred tokens evaporates when the session compacts.

**Cortex** is where the rest goes. It ingests your sessions and memory files into a searchable knowledge graph — hybrid search (vector + keyword + graph), entity extraction, and agentic Q&A over everything you've ever saved. Hermes' `session_search` recalls *exact past messages*; your cortex recalls *synthesized knowledge* across all of them. Use both.

This skill turns the word **"cortex"** into your knowledge interface — for one cortex or several.

## What kind of cortex?

A "cortex" is any Cortex instance you connect to. The **same commands** serve three very different roles:

| Mode | The cortex holds… | You mostly… | Key | Talk to it as… |
|------|-------------------|-------------|-----|----------------|
| **Personal** | *your* agent's own long-term memory | save **and** recall | `cortex_rw_` | **"your cortex"** |
| **Community** | a curated shared body of knowledge (a scene's archive, a project's history, an open corpus) | recall | `cortex_ro_` | **"the community cortex"** — or whatever name you gave it |
| **Company / team** | internal shared knowledge | recall, and contribute if allowed | `ro` or `rw` | **"the team cortex"** |

You can connect to **several at once** and route each request by name — save this session to *your* cortex while consulting *the community* cortex in the same breath.

## The Language

Speak to a cortex in plain language — these phrases are the interface:

| You say | What happens |
|---|---|
| **"dump your session into your cortex"** | Curate a markdown note of this session → upload to your personal cortex |
| **"save today's memory into your cortex"** | Sync `MEMORY.md`, `USER.md`, and today's notes |
| **"check your cortex for X"** | fast synthesized answer with sources (your personal cortex) |
| **"ask your cortex about X"** / **"what does it know about X"** | deep multi-step research (streaming) |
| **"search your cortex for X"** | raw top-matching chunks, no synthesis |
| **"what's in your cortex?"** / **"what have you saved?"** | exact inventory of saved docs (`list`) — never a guess |
| **"show me that note"** | print a saved doc's full content (`show`) |
| **"forget that"** / **"delete that note"** | remove a saved doc, with a receipt (`forget`) |
| **"ask the community cortex about X"** / **"check the team cortex for X"** | same verbs, routed to a **named** source |
| **"share this to the team cortex"** | save to a named cortex you have write access to |

"your cortex" = your default (personal) source; name any other source to route there.

## Connect

A **source** is one connection: a base URL + an API key (+ an optional collection). Your **default** source is your personal long-term memory; add more by name.

### Your personal cortex (the default)

Store it the Hermes-native way — env vars in `~/.hermes/.env` (same convention the Cortex MCP server uses):

```bash
# ~/.hermes/.env
CORTEX_BASE_URL=https://cortex.example.com
CORTEX_API_KEY=cortex_rw_your_key_here      # cortex_ro_ = recall only
CORTEX_COLLECTION=Hermes                     # your private collection; defaults to "Hermes"
```

No instance yet? Either connect to one you're given, or self-host and reuse the provider keys already in your `~/.hermes/.env` (OpenRouter / Venice / OpenAI). Both paths — and the OpenRouter/Venice→Cortex mapping and embeddings caveat — are in [references/CONNECT.md](references/CONNECT.md). Self-host in one ask:

> Fetch `https://cortexskills.org/setup/SKILL.md` and boot Cortex with my existing `OPENROUTER_API_KEY` (or Venice key), then connect this skill to `http://localhost:8000`.

### Additional cortexes (community, company)

Register named sources with the helper (stored in `~/.hermes/skills/state/cortex/sources.json`, `chmod 600`):

```bash
S="$(find "$HOME/.hermes/skills" -name cortex.sh -path "*/scripts/*" | head -1)"
# read-only community cortex — empty collection = query the whole instance:
bash "$S" connect community https://cortex.example.org cortex_ro_xxx "" ro "our community's shared knowledge"
# company cortex scoped to one collection, with write access:
bash "$S" connect team https://cortex.acme.com cortex_rw_yyy Engineering rw "ACME internal"
bash "$S" sources          # list connected cortexes (* marks the default)
bash "$S" use team         # change which one is the default
```

The `ro|rw` argument is optional — when omitted, access is inferred from the key prefix, and a `cortex_ro_` key is always recorded read-only (the server would refuse its writes anyway). When you confirm a new connection to your human, name the source and its access — **don't echo the API key back**; they just gave it to you.

An empty collection (`""`) or `all` means "query the whole instance" — right for a community/company cortex. A personal cortex scopes to its own collection so recall stays about *your* memory.

### Validate

```bash
bash "$(find "$HOME/.hermes/skills" -name cortex.sh -path "*/scripts/*" | head -1)" status
```

Prints the resolved source, health, and collection. A `503 degraded` means a self-hosted Neo4j is still warming up (30–60s) — wait and retry.

Once connected, store a one-line **native** memory (with your built-in memory tool) so every future session routes correctly:

> Your cortex = the external Cortex knowledge base, reached through the cortex skill (cortex.sh). Any request mentioning "cortex" goes through that skill — the memory file is NOT the cortex.

This matters: without it, a future session may answer "what's in your cortex?" from MEMORY.md and never load this skill. The native memory is injected into every session start — it's the router.

## Access: read vs read/write

Each source's key sets what you can do there:

| Key prefix | recall (`check`/`ask`/`search`) | contribute (`save`/`sync`) |
|-----------|:---:|:---:|
| `cortex_ro_` | ✅ | ❌ — helper refuses; server returns `403` |
| `cortex_rw_` | ✅ | ✅ |

A **community** cortex is read-only for consumers. A **company** cortex hands out `ro` or `rw` keys depending on whether an employee should contribute. Your **personal** cortex is yours to write. (Cortex also strips secret-looking strings from stored content — never rely on that; just don't dump secrets.)

## How to run cortex — one clean call

**Never paste multi-line bash into the terminal.** Hermes flattens multi-line blocks into semicolon-joined one-liners and `eval`s them — heredocs and `{ … }` groups break with a syntax error. Every operation is a **single call** to the bundled helper `scripts/cortex.sh`, which carries all the API logic. Locate and run it in one command:

```bash
bash "$(find "$HOME/.hermes/skills" -name cortex.sh -path "*/scripts/*" | head -1)" status
```

Add `--source NAME` right after the script path to target a named cortex. **Omit `--source` to hit your personal cortex** — or, when you want to be explicit that you mean *your own* memory (e.g. saving while a community cortex is also connected), pass **`--source mine`** (aliases: `me`, `self`, `personal`). That's the same name the helper prints back (`source: mine`, `saved … to 'mine'`), so it always round-trips.

| Say this | Run this |
|----------|----------|
| "is my cortex up" | `cortex.sh status` |
| "dump this into your cortex" | `cortex.sh save <file>` (or `--source mine save`) |
| "save today's memory" | `cortex.sh sync` |
| "check your cortex for X" | `cortex.sh check "X"` |
| "ask your cortex about X" (deep) | `cortex.sh ask "X"` |
| "search your cortex for X" | `cortex.sh search "X"` |
| "ask the community cortex about X" | `cortex.sh --source community ask "X"` |
| "share this to the team cortex" | `cortex.sh --source team save <file>` |
| "which cortexes am I connected to" | `cortex.sh sources` (`*` marks the active default) |
| "what's in your cortex" / "what have you saved" | `cortex.sh list` — the exact inventory (newest first, with doc ids) |
| "show me that note" | `cortex.sh show <doc_id>` (ids come from `list` or a save receipt) |
| "forget that" / "delete that note" | `cortex.sh forget <doc_id>` |
| (wait for a save to be searchable) | `cortex.sh wait <doc_id>` |

`check` is the fast answer (non-streaming `/api/ask`); `ask` is deep agentic research — the helper uses the **streaming** endpoint because non-streaming `/api/ask` rejects `use_agentic:true` (`400 agentic_requires_streaming`). Credentials/collection resolve from the source (env for the default, `sources.json` for named). The exact REST calls live in `scripts/cortex.sh`.

## Save: dump a session

"Dump your session into your cortex" — **curate**, don't dump raw. You are the best summarizer of your own session; a tight note beats a big transcript.

1. Write a curated markdown note **with your file-writing tool** (not a heredoc in the terminal) to, e.g., `~/.hermes/skills/state/cortex/outbox/session-<date>.md`:

   ```markdown
   # Session — <topic> — <date>
   ## What we did / ## Decisions / ## Learned / ## Open threads
   - ...
   ```
2. Save it (prints the `document_id`), and optionally wait until it's searchable:

   ```bash
   S="$(find "$HOME/.hermes/skills" -name cortex.sh -path "*/scripts/*" | head -1)"; bash "$S" save ~/.hermes/skills/state/cortex/outbox/session-<date>.md
   ```

Upload is async — chunking, embedding, and entity extraction run in the background. Use `cortex.sh wait <document_id>` before an immediate recall.

## Save: sync today's memory

"Save today's memory into your cortex" — push changed Hermes memory files (`~/.hermes/memories/*.md`) and anything in your outbox. Hash-guarded, so unchanged files are skipped:

```bash
bash "$(find "$HOME/.hermes/skills" -name cortex.sh -path "*/scripts/*" | head -1)" sync
```

The full workflow — bulk uploads, `process-pending`, dedup, cadence — is in [references/LTM.md](references/LTM.md).

## Recall: check / ask / search your cortex

"Check your cortex for X" — a fast, synthesized answer scoped to your collection:

```bash
bash "$(find "$HOME/.hermes/skills" -name cortex.sh -path "*/scripts/*" | head -1)" check "what do I know about X?"
```

"Ask your cortex about X" / "what does your cortex know about X" — deeper agentic research (`ask`). "Search your cortex for X" — raw top chunks (`search`), best as a fallback when `check` synthesizes "nothing found" but you expect a hit:

```bash
bash "$(find "$HOME/.hermes/skills" -name cortex.sh -path "*/scripts/*" | head -1)" search "X"
```

**Inventory is not recall.** When the human asks *"what's in your cortex?"*, *"what have you saved?"*, or *"how many notes do you have?"*, run `cortex.sh list` — it returns the exact set of saved docs (filename, date, status, doc id), newest first. Don't answer inventory questions with `check`: synthesis summarizes what retrieval surfaced, and will confidently under-count what's actually stored. `list` also gives you the doc ids that `show <doc_id>` (print a note's full content) and `forget <doc_id>` (delete a note) take.

**Citations come back with the answer.** `check` and `ask` print a numbered `sources:` footer (filename + doc id) *below* the answer; the numbers line up with the `[src_N]` markers Cortex embeds in the text. So when a human asks **"cite your sources"**, **"where did that come from?"**, or **"which document?"**, you already have it — map each `[src_N]` to the footer's `[N]` filename; don't re-query. For the *exact passage* behind a claim, run `search` on that claim and quote the chunk. To hand over the whole source doc, use its doc id (`GET /api/documents/{id}`).

> If `check` returns "nothing found" but you expect a hit: run `search` (raw retrieval), and confirm the doc landed in the collection. The `/api/ask` response always echoes `"collection_id": null` even when scoping worked — don't read that as failure. For a live streaming answer, `POST /api/ask/stream` (SSE) — see the [ask skill](https://cortexskills.org/ask/SKILL.md).

## When to save (and when not to)

- **On a natural boundary** — task finished, a decision was made, something worth keeping was learned. That's the moment to "dump your session."
- **On a heartbeat** — sync memory files every 4+ hours if the agent runs long. See [references/LTM.md](references/LTM.md).
- **Not every few minutes**, not empty/temp files, not files still mid-write. Cheap curation beats noisy volume — Cortex extracts entities and relationships from everything you send, so noise pollutes the graph.

## Working with your human — give them the flow

Your human doesn't see the API calls; they see what you say back. Cortex should feel like shared memory, not a database. Etiquette that makes it feel that way:

- **Confirm every save with a receipt.** After a `save`, tell them plainly *what* you kept and *how they'd recall it* — e.g. "Saved a decision note to your cortex (collection Hermes). Next week just say *'check your cortex for the naming policy.'*" A save they can't see is a save they won't trust. It also helps to put a one-line "how to recall me" inside the note itself.
- **Present recall readably — never dump raw output.** Synthesize what `check`/`ask`/`search` returns into a tight, skimmable answer. Lead with the answer; keep the receipts underneath.
- **Cite by default, and be ready when they ask.** `check`/`ask` return a numbered `sources:` footer that lines up with the `[src_N]` markers in the answer. Surface it — even a compact "(source: `decision-notes.md`)" builds trust. When the human asks **"cite your sources"**, **"where's that from?"**, **"which doc?"**, or **"how do you know?"**, resolve each `[src_N]` to its filename/doc from the footer you already have — don't re-query. For the exact wording behind a claim, `search` that claim and quote the chunk; to hand over the whole document, reference its doc id. If an answer has *no* sources, say so plainly rather than implying confidence.
- **Offer to save at natural boundaries.** When a task wraps, a decision lands, or something non-obvious is learned, ask: "Want me to dump this into your cortex so we don't lose it?" Don't make them remember to remember.
- **Answer inventory questions from `list`, not from synthesis.** "What do you remember?" deserves the true count and the actual filenames — `check` will happily tell your human "that's the whole corpus" while missing half of it. Run `list`, then group/describe the docs yourself.
- **"Forget that" deserves the same care as "remember this."** When they ask you to delete something, `list` to find the doc, confirm which one you mean (filename + date), `forget` it, and give the receipt the helper prints. If several docs could match, ask before deleting.
- **Check before you answer from memory.** If they ask something that plausibly lives in past work or a connected community/company cortex, `check` it *first* and answer grounded + cited, instead of guessing. "Let me check your cortex" is a good opening move.
- **"Catch me up."** When they return cold, combine tiers: `session_search` for recent verbatim context + `cortex check`/`search` for synthesized history + `MEMORY.md`/`USER.md` for standing facts — then give a short briefing (what we worked on, decided, and left open). Say what's *empty* too, so they know the gaps.
- **Name the cortex you used.** With several sources connected, tell them where an answer came from — "per the **community** cortex…" vs "from **your** cortex" vs "the **team** cortex says…". Provenance is trust.

## Alternative: native MCP access

Hermes speaks MCP. Instead of these curl calls you can wire the Cortex MCP server into Hermes and get first-class `search` / `ask` / `upload` tools. Same env vars (`CORTEX_BASE_URL`, `CORTEX_API_KEY`). See the [mcp skill](https://cortexskills.org/mcp/SKILL.md). The REST path in this file needs nothing but `curl` + `jq`, so it's the zero-dependency default.

## Reference files

| File | What's in it |
|------|--------------|
| [references/CONNECT.md](references/CONNECT.md) | Both connection paths in depth: cloud key, self-host Docker, and mapping your OpenRouter/Venice keys onto Cortex's LLM + embedding env vars |
| [references/LTM.md](references/LTM.md) | The long-term-memory playbook: session-dump patterns, memory-file sync, collection strategy, heartbeat cadence, dedup, and troubleshooting |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Not connected` | Set `CORTEX_BASE_URL` + `CORTEX_API_KEY` in `~/.hermes/.env`, or run `/cortex connect` |
| `unknown cortex source 'mine'` | Old helper. Re-fetch `scripts/cortex.sh` — the current one accepts `mine`/`me`/`self`/`personal` as your personal cortex. (Or just omit `--source`.) |
| Saved to the wrong cortex (a community one) | You had a community source as the default. Write with `--source mine`; a read-only source now refuses writes and never auto-becomes the default. |
| `401 Unauthorized` | Key invalid or expired — get a new one |
| `403 MANAGE access required` | You have a read-only (`cortex_ro_`) key; saving needs read/write (`cortex_rw_`) |
| `503 degraded` | Self-hosted Neo4j still initializing (30–60s) — wait and retry |
| `hermes skills install` says BLOCKED / "exfiltration" | Expected: the scanner flags any skill that curls with an API key — this skill's core function. Use the multi-file curl install at the top instead |
| `show` prints "no readable content yet" | The doc is still processing — `cortex.sh wait <doc_id>`, then `show` again |
| Human asks "what have you saved?" and the answer feels partial | You answered from `check` synthesis — run `cortex.sh list` for the exact inventory |
| Saved but not searchable yet | Processing is async; give it a moment, or check `GET /api/documents?status=pending` |
| Saved, but recall finds nothing | Likely the upload had an empty `collection_id` (you split the block across terminal calls, so `$CID` was lost). Re-run the **whole** dump block as one command. Confirm with `GET /api/documents/{id}` → `collection_id`. |
| `collection_id=&…` in the upload URL | Same fresh-shell cause — `$CID` was empty. Never split a block; the preamble must run in the same shell as the action. |
| `ask` says "nothing found" but it's there | `ask` synthesis can miss what raw retrieval has — fall back to **search**. Also check you're scoped to the right collection. |
| `500 "Inference processing failed"` | Cortex's LLM/embedding provider is erroring (down, bad key, wrong model) — a server-side inference failure, not your request. On a self-host, check the backend logs and provider keys. |
| Connection refused | Instance down, or (self-host) `docker compose up -d` not run |
