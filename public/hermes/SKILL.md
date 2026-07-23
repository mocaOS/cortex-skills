---
name: cortex
description: >
  Long-term memory and shared knowledge for Hermes, backed by a Cortex knowledge graph.
  Dump sessions into your own cortex and recall them, and/or connect to a community or
  company cortex to consult its knowledge. Handle EVERY mention of "cortex" with this
  skill — it is a separate external store, NOT MEMORY.md and NOT the built-in memory
  tool — including "dump your session into
  your cortex", "check/ask/search your cortex for X", "what's in your cortex / what
  have you saved" (exact doc list), "show me that note", "forget that note",
  "ask the community cortex about X", and "free up / clean up your memory"
  (migrate MEMORY.md overflow into your cortex). Built for the Hermes agent
  (nousresearch.com).
version: 1.2.0
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [memory, ltm, knowledge, rag, cortex, recall]
    category: memory
    requires_toolsets: [terminal]
    required_environment_variables:
      - name: CORTEX_BASE_URL
        prompt: "Cortex instance URL (e.g. http://localhost:8000)"
        help: "No instance yet? Leave blank and tell the agent: 'set up a new cortex' — the skill self-hosts one via Docker (see Connect)."
      - name: CORTEX_API_KEY
        prompt: "Cortex API key (cortex_rw_… = read/write, cortex_ro_… = recall only)"
        help: "Mint one at {BASE_URL}/admin → API Keys, or let the setup flow mint it for you."
    config:
      - key: cortex.collection
        description: Collection that holds this agent's long-term memory.
        default: Hermes
        prompt: "Which Cortex collection should hold your long-term memory?"
    blueprint:
      schedule: "every 6h"
      prompt: >
        Load the cortex skill, then run the memory heartbeat: bash the skill's
        scripts/cortex.sh with `sync` to push changed memory files and outbox
        notes to your personal cortex. Report only if something new was synced
        or the sync failed; stay silent otherwise.
  openclaw:
    requires:
      bins: [jq, curl]
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
>
> **Not running Hermes?** This skill follows the open SKILL.md standard and runs on other runtimes too — for **OpenClaw** (install path, env via `openclaw.json`, cron heartbeat, state-dir overrides) see [cortexskills.org/openclaw/SKILL.md](https://cortexskills.org/openclaw/SKILL.md). Hermes remains the deepest integration (native memory-provider plugin, secure env prompts, blueprint heartbeat).

## When to use

Any request that mentions **"cortex"** — saving to it, recalling from it, listing/showing/forgetting what's in it, connecting one, or **setting up a new instance** ("set up a cortex for me"). Also when the human asks something that plausibly lives in past sessions or a connected knowledge cortex: check before answering from memory. Load this skill (`skill_view cortex`) **before** running `cortex.sh` — loading is also what registers the `CORTEX_*` env passthrough on sandboxed terminal backends.

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
| **"set up a cortex for me"** / **"self-host a cortex"** | boot a brand-new instance via Docker and connect it (`setup` → `setup-status`) |
| **"ask the community cortex about X"** / **"check the team cortex for X"** | same verbs, routed to a **named** source |
| **"share this to the team cortex"** | save to a named cortex you have write access to |

"your cortex" = your default (personal) source; name any other source to route there.

**The recall verbs are one intent, not three commands.** "Check", "search", "ask", "look in", "consult", "does your cortex know…" — the human wants *the answer*, found by researching the cortex. The verb only picks your opening move; the Recall section below has the playbook (formulate → escalate → answer). Never run one literal query, paste what came back, and stop.

## Connect

A **source** is one connection: a base URL + an API key (+ an optional collection). Your **default** source is your personal long-term memory; add more by name.

Every source has **two scopes** (the multi-memory model): **writes** go to the source's own collection (e.g. `Hermes`), so you never write into a sibling collection; **reads** span *every* collection in that instance by default. Self-host instances routinely hold sibling collections — a document archive, another tool's ingest pipeline — and "check your cortex for X" means *all of it*, not just your own notes. `status` shows both scopes.

### Hook into an existing cortex — the one-turn flow

The most common first contact: your human hands you a base URL + API key in one message ("hook into the cortex at X — key Y, call it Z"). Do the whole thing in that turn, no follow-up questions needed:

1. **Install** (top of this file) if the skill isn't present, then load it (`skill_view cortex`).
2. **Register** it as a named source — a `cortex_ro_` key, or any community/company cortex, belongs in sources, *not* in env:
   `bash ${HERMES_SKILL_DIR}/scripts/cortex.sh connect <name> <base_url> <key> "" ro "<label>"`
   Only a `cortex_rw_` key that is meant to be *your personal memory* goes into `~/.hermes/.env` instead (next section).
3. **Validate**: `cortex.sh --source <name> status` → expect `healthy` + the write/read scope lines.
4. **Prove recall**: `cortex.sh --source <name> check "<something the human would ask it>"` and present the answer cited.
5. **Seed the routing memory** (Validate, below) — include the source name and its access.
6. **Receipt**: tell your human the source name, access level, and how to query it ("ask the <name> cortex about …"). Never echo the key.

> ⚠️ **`~/.hermes/.env` is write-protected against your file tools** — `write_file`/`patch` on it are denied by design ("protected credential file"). That denial is *expected*, not an error worth reporting. If you genuinely need the env route (a personal rw default), append via the terminal instead — `printf 'CORTEX_BASE_URL=…\nCORTEX_API_KEY=…\n' >> ~/.hermes/.env` — or let Hermes' secure prompt fill it when the skill first loads interactively. For everything else, named sources are the primary path.

### Your personal cortex (the default)

Store it the Hermes-native way — env vars in `~/.hermes/.env` (same convention the Cortex MCP server uses):

```bash
# ~/.hermes/.env
CORTEX_BASE_URL=https://cortex.example.com
CORTEX_API_KEY=cortex_rw_your_key_here      # cortex_ro_ = recall only
CORTEX_COLLECTION=Hermes                     # WRITE scope: your private collection; defaults to "Hermes"
# CORTEX_COLLECTION_READ=Hermes              # optional READ scope; default "all" = recall spans every collection
```

No instance yet? Either connect to one you're given, or **set up a new one from scratch** (below). Provider-key mapping details and the embeddings caveat are in [references/CONNECT.md](references/CONNECT.md).

### Set up a new cortex from scratch ("set up a cortex for me")

The helper self-hosts a full Cortex stack (Neo4j + backend + frontend, via Docker) in **two calls** — the build/boot runs detached, so no terminal timeout can kill it:

```bash
bash ${HERMES_SKILL_DIR}/scripts/cortex.sh setup dir=~/cortex-app provider=venice key=$VENICE_API_KEY
# …then repeat until it reports connected (first build 5-15 min):
bash ${HERMES_SKILL_DIR}/scripts/cortex.sh setup-status dir=~/cortex-app
```

`setup` preflights (docker/git/ports), clones `mocaOS/cortex-app`, writes its `.env` with generated secrets, and boots detached. `setup-status` polls; once healthy it mints a least-privilege `cortex_rw_` key with the instance's admin key, writes `CORTEX_*` to `~/.hermes/.env`, and registers the source so it works immediately. If ports 8000/3000/7474/7687 are taken, add `offset=1` (shifts all ports by N, isolates container names).

Flags that save debugging later: **`host=<lan-ip-or-domain>`** if any human will open the dashboard from another machine (the frontend bakes the backend URL in at build time — localhost-built dashboards break off-box with "session expired"); **`tuning=fast|bench`** (auto: `fast` for ollama/custom — smaller extraction context, reasoning off; `bench` keeps upstream defaults for cloud providers); **`send_dims=false`** for fixed-dimension embedding models (auto-detected for `qwen3-vl-embedding*`, `bge-*`, `e5-*`, `gte-*`, `nomic-embed*` — wrong setting = HTTP 500 on first ask).

**Getting the credentials — ask, don't guess.** Cortex needs one thing from your human: an OpenAI-compatible **provider API key** (chat + embeddings). The right way to ask:

1. Check `~/.hermes/.env` for keys you already have (`VENICE_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, …). If one exists, **ask your human which to reuse** (a choice — `clarify` is fine): Venice and OpenAI serve chat *and* embeddings; OpenRouter is chat-only, so it additionally needs `emb_key=` from OpenAI/Venice (the helper refuses without it and says so).
2. If no key exists, **never ask them to paste a secret into chat.** Ask them to add it to `~/.hermes/.env` (e.g. `VENICE_API_KEY=…`) and tell you when done — then read it from the env like above.
   - **No cloud key at all?** `provider=ollama` runs the whole stack locally, zero keys: it needs a running [ollama](https://ollama.com) with a chat model and `nomic-embed-text` pulled (the preflight tells you exactly what to `ollama pull`). Default chat model is Nous' own Hermes-4-14B. Containers reach the host's ollama via `172.17.0.1` — the preset handles that.
3. Provider choice, ports, install dir, collection name = normal questions. Key **values** = env only.

**Setup safety rails — non-negotiable.** Setup touches ONLY the directory you pass as `dir=` and the containers/volumes it creates (project `cortex-hermes*`). Never `docker compose down`, remove containers, or delete volumes of a stack you didn't create in this flow — an existing cortex stack on the machine is somebody's knowledge base, and volumes hold the graph: deleting one destroys it. If an existing stack looks broken or in the way, STOP and tell your human what you found; don't "clean it up." If ports collide, use `offset=N` — never free ports by stopping things.

After `setup-status` reports connected: store the routing memory (Validate, below), then prove the loop — `status`, `save` a hello note, `wait`, `check` it back.

### Additional cortexes (community, company)

Register named sources with the helper (stored in `~/.hermes/skills/state/cortex/sources.json`, `chmod 600`):

```bash
S=${HERMES_SKILL_DIR}/scripts/cortex.sh
# read-only community cortex — empty collection = query the whole instance:
bash "$S" connect community https://cortex.example.org cortex_ro_xxx "" ro "our community's shared knowledge"
# company cortex scoped to one collection, with write access:
bash "$S" connect team https://cortex.acme.com cortex_rw_yyy Engineering rw "ACME internal"
bash "$S" sources          # list connected cortexes (* marks the default)
bash "$S" use team         # change which one is the default
```

The `ro|rw` argument is optional — when omitted, access is inferred from the key prefix, and a `cortex_ro_` key is always recorded read-only (the server would refuse its writes anyway). When you confirm a new connection to your human, name the source and its access — **don't echo the API key back**; they just gave it to you.

The `collection` argument is the **write scope** only — an empty collection (`""`) or `all` means writes land in the backend's default collection. **Reads always span every collection in the source** unless a `read_collection` field is set on that source in `sources.json` — so recall against a community/company cortex covers everything it has made visible to your key, and recall against your personal instance also sees sibling collections other tools ingest into.

### Validate

```bash
bash ${HERMES_SKILL_DIR}/scripts/cortex.sh status
```

Prints the resolved source, health, and both scopes — the write collection, and the read scope with a per-collection document breakdown when reading all (so you can see the real corpus composition, not just your own slice). A `503 degraded` means a self-hosted Neo4j is still warming up (30–60s) — wait and retry.

Once connected, store a one-line **native** memory (with your built-in memory tool) so every future session routes correctly. Adapt it to what's actually connected:

> Your cortex = the external Cortex knowledge base, reached through the cortex skill (load via skill_view cortex, then call cortex.sh). Any request mentioning "cortex" goes through that skill — the memory file is NOT the cortex. "Check/search/ask your cortex for X" = research it until answered (check → search reformulations → ask deep research), not one literal query. Connected: `<name>` (`ro|rw`, `<base_url>`) — query with `--source <name>`. \[If no personal cortex is wired: "No personal cortex configured yet."\]

This matters: without it, a future session may answer "what's in your cortex?" from MEMORY.md and never load this skill. The native memory is injected into every session start — it's the router. Keep it current: when you `connect`/`forget` a source later, update this memory too.

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
bash ${HERMES_SKILL_DIR}/scripts/cortex.sh status
```

`${HERMES_SKILL_DIR}` is substituted by Hermes when this skill loads. If you see it **literally** (template vars disabled), locate the script once with `find "$HOME/.hermes/skills" -name cortex.sh -path "*/scripts/*" | head -1` and use that path.

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
| "set up a new cortex" | `cortex.sh setup dir=~/cortex-app provider=… key=…` then `cortex.sh setup-status dir=~/cortex-app` |

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
   S=${HERMES_SKILL_DIR}/scripts/cortex.sh; bash "$S" save ~/.hermes/skills/state/cortex/outbox/session-<date>.md
   ```

Upload is async — chunking, embedding, and entity extraction run in the background. Use `cortex.sh wait <document_id>` before an immediate recall.

## Save: sync today's memory

"Save today's memory into your cortex" — push changed Hermes memory files (`~/.hermes/memories/*.md`) and anything in your outbox. Hash-guarded, so unchanged files are skipped:

```bash
bash ${HERMES_SKILL_DIR}/scripts/cortex.sh sync
```

The full workflow — bulk uploads, `process-pending`, dedup, cadence — is in [references/LTM.md](references/LTM.md).

## Recall: check / ask / search your cortex

**Goal first: the human wants an answer that lives in a cortex.** Whatever verb they used, your job is to research until you have it — or until you've genuinely established it isn't there. One thin query is not "not there".

Three moves, one ladder:

| Move | What it really does | Reach for it when |
|------|--------------------|-------------------|
| `check "<question>"` | quick research pass — server-side researcher, ~3 search iterations, synthesized answer + citations | simple, single-fact questions |
| `ask "<question>"` | **deep research** (streaming) — the researcher agent runs up to 8 search iterations, decomposes the question into sub-questions, and follows entities across documents | anything multi-part, comparative, cross-document, "everything about X", timelines — or when `check` came back thin |
| `search "<terms>" [top_k]` | raw top-matching chunks, no synthesis | exact wording/receipts, or probing whether *anything* matches a term |

```bash
bash ${HERMES_SKILL_DIR}/scripts/cortex.sh check "what did we decide about the auth rewrite?"
bash ${HERMES_SKILL_DIR}/scripts/cortex.sh ask "compare every approach we tried for SSE reconnects and what we settled on"
bash ${HERMES_SKILL_DIR}/scripts/cortex.sh search "SSE reconnect backoff" 15
```

**Formulate the query like a researcher, not a parrot.**

- Send a **self-contained natural-language question**. The cortex knows nothing about the current conversation — resolve pronouns and session context before querying: "check your cortex for that bug we discussed" → `check "root cause and fix of the cortex-app SSE reconnect bug"`.
- **Name entities.** Retrieval is entity-aware (graph traversal follows people, projects, tools through the knowledge graph): "what did René decide about the MCP server transport" beats "what was decided about transport".
- Full sentences beat keyword fragments for `check`/`ask` ("how does X handle Y?" > "X Y handler"); terse terms are fine for `search`.

**Escalate — never report "nothing found" after one query.**

1. `check` answered fully → done; present it cited.
2. `check` thin or empty → `search` 2–3 **reformulations** (synonyms, entity names, the filename you'd expect). Chunks found → `ask` a sharper question built from those terms. Still nothing → **check your scope**: reads span all collections by default, but a `read_collection` override narrows them (`status` shows the scope); the answer may also live in another connected source — route there before concluding it's absent.
3. Multi-part / broad / comparative question → skip `check`, go **straight to `ask`**; that's exactly what deep research is for. For "what do we know about X" at full breadth, pair `ask` with `list` to see which docs even exist.
4. Only after the ladder is exhausted, say plainly what you searched for and where, so the human can redirect you.

A human saying "search your cortex for X" almost never wants raw chunks — they want the answer, found by searching. Run the ladder; give them the answer with the receipts underneath.

**Inventory is not recall.** When the human asks *"what's in your cortex?"*, *"what have you saved?"*, or *"how many notes do you have?"*, run `cortex.sh list` — it returns the exact set of docs (filename, date, status, doc id), newest first, across **all collections** in the source (each row labeled with its collection), so the count matches what the dashboard shows — not just your own slice. Don't answer inventory questions with `check`: synthesis summarizes what retrieval surfaced, and will confidently under-count what's actually stored. `list` also gives you the doc ids that `show <doc_id>` (print a note's full content) and `forget <doc_id>` (delete a note) take.

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
- **A memory cleanup ends with a ledger, not a "done".** After migrating `MEMORY.md` entries into the cortex (see [references/LTM.md](references/LTM.md) → *Memory hygiene*), report what landed where (filenames + doc ids), memory usage before/after, and which entries stayed local — and never delete an entry before its content is verified recallable.
- **"Forget that" deserves the same care as "remember this."** When they ask you to delete something, `list` to find the doc, confirm which one you mean (filename + date), `forget` it, and give the receipt the helper prints. If several docs could match, ask before deleting.
- **Check before you answer from memory.** If they ask something that plausibly lives in past work or a connected community/company cortex, `check` it *first* and answer grounded + cited, instead of guessing. "Let me check your cortex" is a good opening move.
- **"Catch me up."** When they return cold, combine tiers: `session_search` for recent verbatim context + `cortex check`/`search` for synthesized history + `MEMORY.md`/`USER.md` for standing facts — then give a short briefing (what we worked on, decided, and left open). Say what's *empty* too, so they know the gaps.
- **Name the cortex you used.** With several sources connected, tell them where an answer came from — "per the **community** cortex…" vs "from **your** cortex" vs "the **team** cortex says…". Provenance is trust.

## Alternative: native MCP access

Hermes speaks MCP. Instead of these curl calls you can wire the Cortex MCP server into Hermes and get first-class `search` / `ask` / `upload` tools (they appear as an `mcp-cortex` toolset). Build it once, then add it to `~/.hermes/config.yaml`:

```bash
git clone https://github.com/mocaOS/cortex-skills.git ~/cortex-skills
cd ~/cortex-skills/mcp-server && npm install && npm run build
```

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  cortex:
    command: node
    args: ["/home/YOU/cortex-skills/mcp-server/dist/index.js"]
    env:
      CORTEX_BASE_URL: "http://localhost:8000"
      CORTEX_API_KEY: "cortex_rw_…"   # same creds as this skill
```

Details and the full tool list: [mcp skill](https://cortexskills.org/mcp/SKILL.md). The REST path in this file needs nothing but `curl` + `jq`, so it stays the zero-dependency default — MCP is worth it when you want Cortex calls as first-class tool calls instead of terminal round-trips.

## Alternative: go ambient — the memory-provider plugin

The deepest tier: Cortex as a native Hermes **memory provider** (same plugin class as Honcho/Mem0). Ambient recall prefetched into context each turn, plus always-present `cortex_search` / `cortex_ask` / `cortex_list` / `cortex_save` tools — no `skill_view`, no terminal. Stdlib-only, two files:

```bash
D=~/.hermes/plugins/memory/cortex; mkdir -p "$D"; base=https://cortexskills.org/hermes/plugin
curl -fsSL $base/__init__.py -o "$D/__init__.py"
curl -fsSL $base/plugin.yaml -o "$D/plugin.yaml"
# Hermes ≤ 0.18 scans ~/.hermes/plugins/<name>/ (no memory/ level): use D=~/.hermes/plugins/cortex
```

Then `hermes memory setup` (pick **cortex**) — or set `memory.provider: cortex` in `~/.hermes/config.yaml` with `CORTEX_*` already in `~/.hermes/.env`. Verify with `hermes memory status`. Full docs: [plugin/README.md](https://cortexskills.org/hermes/plugin/README.md).

Rule of thumb: plugin for your **personal** cortex (ambient), this skill for **named sources** (community/company routing, setup, sync) — they share credentials and coexist.

## Reference files

| File | What's in it |
|------|--------------|
| [references/CONNECT.md](references/CONNECT.md) | Both connection paths in depth: cloud key, self-host Docker, and mapping your OpenRouter/Venice keys onto Cortex's LLM + embedding env vars |
| [references/LTM.md](references/LTM.md) | The long-term-memory playbook: session-dump patterns, memory-file sync, memory hygiene (shrinking a full MEMORY.md into cortex pointers), collection strategy, heartbeat cadence, dedup, and troubleshooting |
| [plugin/README.md](plugin/README.md) | The memory-provider plugin: Cortex as native ambient Hermes memory (prefetch + first-class tools), install and activation |

## Beyond memory — the rest of Cortex

This skill wires Cortex up as Hermes' long-term memory. The same instance is a full knowledge-graph platform with many more capabilities. Fetch the **root skill** for the complete, always-current index, then pull only what you need:

- `cortexskills.org/SKILL.md` — **root skill**: architecture overview and the canonical list of every capability below.

| Sub-skill | Fetch | For |
|---|---|---|
| Setup | `cortexskills.org/setup/SKILL.md` | Self-host via Docker |
| Auth | `cortexskills.org/auth/SKILL.md` | API keys, collection scoping, injection defense |
| Admin | `cortexskills.org/admin/SKILL.md` | Instance management, registry, export/import, reset |
| Upload | `cortexskills.org/upload/SKILL.md` | Document ingestion (PDF, EPUB, DOCX, audio, images…) |
| Search | `cortexskills.org/search/SKILL.md` | Hybrid vector + keyword + graph search |
| Ask | `cortexskills.org/ask/SKILL.md` | RAG Q&A, streaming SSE, agentic deep research |
| Graph | `cortexskills.org/graph/SKILL.md` | Entities, relationships, subgraph queries |
| Collections | `cortexskills.org/collections/SKILL.md` | Scope documents and graphs by project or tenant |
| Communities | `cortexskills.org/communities/SKILL.md` | Entity clustering with LLM summaries |
| Git integration | `cortexskills.org/git-integration/SKILL.md` | Connect GitHub/GitLab/Gitea repos |
| Web import | `cortexskills.org/web-import/SKILL.md` | Crawl web pages into clean markdown |
| Tasks | `cortexskills.org/tasks/SKILL.md` | Background task polling, cancellation, cleanup |
| x402 | `cortexskills.org/x402/SKILL.md` | Pay-per-query micropayments (payer + operator) |
| MCP | `cortexskills.org/mcp/SKILL.md` | MCP server for Claude Desktop, Cursor, Windsurf… |
| Integration | `cortexskills.org/integration/SKILL.md` | LangChain, CrewAI, Slack, automation platforms |
| Apps | `cortexskills.org/apps/SKILL.md` | Source and workflow apps (YouTube, Notion, Web Crawler) |
| **Builder** | `cortexskills.org/builder/SKILL.md` | **Build ON Cortex** — turn any software's docs into an installable skill (`builder/skill/SKILL.md`), or ship a web app that runs inside an instance (`builder/app/SKILL.md`) |
| Design | `cortexskills.org/cortex-design/SKILL.md` | The Bold Typography design system for Cortex UIs |

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
| `check` says "exceeded the server-side deadline (28s)" | The LLM backend is busy or slow (common on self-hosted GPU boxes mid-ingestion) — switch to `ask` (streaming, no deadline) |
| First save on a fresh self-host takes many minutes | First-use model loading (Docling cache, GPU model load/queue). Normal. `wait` it out; later docs are fast |
| Connection refused | Instance down, or (self-host) `docker compose up -d` not run |
| Dashboard from another machine: "session expired" / console shows `ERR_CONNECTION_REFUSED` to `localhost:8000` | The frontend was built for localhost. Re-run setup with `host=<lan-ip>` — or on an existing install, override `NEXT_PUBLIC_API_URL` in a compose override, `rm -rf frontend/.next`, rebuild (see the setup skill's "Self-host on a LAN/remote box") |
| First `check`/`ask` → `500 UnsupportedParamsError: Setting dimensions is not supported` | The embedding model has a fixed output dimension. Set `EMBEDDING_SEND_DIMENSIONS=false` in the instance `.env` and `docker compose up -d --force-recreate --no-deps backend`. `setup` auto-detects the known ones; `send_dims=false` forces it |
| Edited the instance `.env` but the container still sees old values | `docker restart` keeps the env snapshot from create — use `docker compose up -d --force-recreate`. Also: never leave an inline `# comment` after a value (dotenv swallows it and bools silently fall back to defaults) |
| Graph extraction times out on a local/slow model | Re-run setup with `tuning=fast` (24k extraction context, reasoning off, capped concurrency) or append those knobs to `.env` — see the setup skill's Recommended Minimal Stack |
