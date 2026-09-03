---
version: 1.4.0
name: ask
description: Use this skill when retrieving knowledge from a Cortex ("ask the cortex", "find X in the cortex") or building RAG-powered Q&A on it. For agents there is one ask path — a streaming Deep Research query (POST /api/ask/stream with use_agentic true) aggregated into {answer, sources}; ready-made aggregators for bash, Python and TypeScript are included. Also covers the decision tree (search vs whole-document content vs ask), the SSE event schema, refusal/truncation flags, conversation history and memory, collection scoping, and the non-streaming fast-chat endpoint as an appendix.
---

# Ask — RAG-Powered Q&A with Streaming and Agentic Reasoning

## Which call do I need?

| You need… | Call | Why |
|---|---|---|
| Passages, titles, document ids — to triage what exists | `POST /api/search` — [search skill](../search/SKILL.md) | Sub-second, deterministic, no LLM in the loop. |
| One whole document, not chunks | `GET /api/documents/{id}/content` → `full_content` — [below](#reading-a-whole-document) | The cheapest way to read a source end to end; ids come from search hits and `sources`. |
| A synthesized, cited answer | `POST /api/ask/stream` with `use_agentic: true` — **the only ask path for agents** | Deep Research over SSE: multi-step retrieval, long reports with `[src_N]` citations, heartbeats keep it alive. [Aggregators below](#aggregate-the-stream-into-answer-sources). |
| A one-line chat answer from a client that cannot read SSE | `POST /api/ask` (non-streaming) — [appendix](#appendix-fast-chat-non-streaming-post-apiask) | Best-effort: ~28s deadline, 1,200-token cap, fails under load where the stream succeeds. Not for research. |

Cortex answers from prose. Counts, per-item attributes and tables ("how many X per type", "every X's Y") are not document questions — if the underlying data has a structured API, fetch it there and use Cortex for the narrative around it.

## What You Probably Got Wrong

1. **Streaming uses Server-Sent Events (SSE), not WebSockets.** Use `POST /api/ask/stream` with standard HTTP. The response is a stream of `data:` lines, not a WebSocket upgrade.

2. **There are three separate endpoints**, not one with a mode flag. Non-streaming (`/api/ask`), streaming (`/api/ask/stream`), and streaming with visible reasoning (`/api/ask/stream/thinking`).

3. **`conversation_history` is an array of `{role, content}` objects**, not a session ID. The client is responsible for maintaining and sending history. Max 6 messages.

4. **`use_agentic` and `use_fast_search` are independent toggles.** Agentic mode does multi-step reasoning. Fast search skips graph traversal and re-ranking for speed. You can combine them.

5. **Answers always include source citations.** The `sources` array in the response contains chunk references with document IDs, content, and scores — each carries a conversation-stable `sid`. Never present an answer without showing its sources.

6. **Collection scoping applies to every endpoint.** Pass `collection_id` to restrict retrieval to documents in that collection. Pass a community id as `collection_id` (e.g. `"comm_1"`) to scope to a community.

7. **Conversation memory is opt-in and client-carried — the backend stays stateless.** Send an opaque `conversation_memory` blob, read the updated blob back from the `memory_update` SSE event, and replay it next turn. Follow-ups answerable from memory can skip retrieval entirely (memory fast-path).

8. **Injection refusals look like normal streams — check the flag, then rephrase.** A question flagged by the prompt-injection defenses returns a safe-refusal `content` frame followed by `done` — no `error` frame, no HTTP error. On backends newer than v1.2.1 both frames carry `refused: true` (non-streaming: a top-level `refused: true`); older backends give no field, so match the canned text, which starts `I'm here to help with questions about your documents`. Never quote it as a finding. What trips the filter is instruction-shaped phrasing — "you are…", "respond only with…", output contracts like "give me N examples with names, ids and quirks" — so rephrase as a plain question about the content ("Which DeCC0s are described, and what makes each distinctive?"). There are also two 429 flavors: the per-key burst limit (seconds-scale `Retry-After`) and the monthly unit quota (`Retry-After` = seconds until the next UTC month) — see [references/API.md](references/API.md#error-responses).

9. **A 402 means your key is monetized, not broken.** Keys with the `cortex_pub_` prefix pay per query via x402 micropayments: decode the `PAYMENT-REQUIRED` header, sign the EIP-3009 authorization, retry with `PAYMENT-SIGNATURE`. Note that `use_agentic: true` bills at the key's **deep-research rate** (`price × research_multiplier`, default 10×) — the challenge's `amount` already reflects the mode you requested, so always read it rather than assuming the flat price. When paying, always use `/api/ask/stream` — the non-streaming `/api/ask` has a ~28s deadline that can expire *after* your payment settled. Full handshake: the [x402 skill](../x402/SKILL.md).

10. **Don't use `/api/ask` as a raw LLM.** It always retrieves, always answers in RAG voice, and the injection defenses will deflect instruction-shaped meta-prompts ("You are a…", output contracts) with a canned response. For plain completions on the instance's configured model there is `POST /api/llm/completions` — **admin-key-only** (it bypasses prompt security, so user keys can never reach it), OpenAI-style chunks over SSE terminated by `data: [DONE]`, body `{messages, temperature?, max_tokens?, stream}`, metered against the monthly quota like every other completion. Built for trusted first-party services (Cortex Chat's personality generator is the reference consumer).

11. **Non-streaming `/api/ask` is best-effort — never your research path.** It buffers the whole answer behind a ~28s deadline (`504 deadline_exceeded`), caps the answer at 1,200 tokens, and rejects `use_agentic: true`. Under load it fails where the stream succeeds. On backends newer than v1.2.1 a cut-off answer carries `truncated: true` (+ `finish_reason: "length"`) and a failure returns a structured `500 {"detail": {"error": "ask_failed", "use_endpoint": "/api/ask/stream"}}`; on older backends a truncated answer looks complete and a failure is a bare `500 Internal server error` with a `request_id`. Treat **any** 5xx from `/api/ask` as "switch to `/api/ask/stream`".

12. **When a hit is not enough, fetch the document.** `GET /api/documents/{id}/content` returns `full_content` (every chunk concatenated, in order) plus `chunks[]` and metadata. Chunks are fragments; for a whole essay, transcript or spec, read the document — it is one cheap GET, and it works with a read-only key. See [Reading a whole document](#reading-a-whole-document).

## Endpoints

**The ask path for agents is one call:** `POST /api/ask/stream` with `use_agentic: true` — Deep Research over SSE. Aggregate its `content` frames into the answer, keep the `sources` frame, stop at `done`; the snippets below do exactly that. `/api/ask/stream/thinking` is the same stream plus reasoning events. The non-streaming `/api/ask` is a fast-chat [appendix](#appendix-fast-chat-non-streaming-post-apiask), not an alternative.

### Streaming Deep Research: POST /api/ask/stream

Returns answer tokens in real time via Server-Sent Events. `use_agentic: true` selects Deep Research (the default `false` is chat mode: one retrieval round, a 1,200-token answer).

```bash
curl -N -X POST "{BASE_URL}/api/ask/stream" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "question": "Summarize the main themes across all documents",
    "use_graph": true,
    "use_agentic": true
  }'
```

SSE event stream (each event is a flat-keyed JSON object — switch on which key is present; current backends also stamp a `type` field):
```
data: {"thinking": "Searching: main themes, recurring topics"}
data: {"sources": [{"document_id": "doc_1", "content": "...", "metadata": {"filename": "report.pdf", "chunk_index": 5, "rerank_score": 0.91}}]}
data: {"graph_context": {"entities": [...], "relationships": [...]}}
data: {"content": "The"}
data: {"content": " main"}
data: {"content": " themes"}
...
data: {"done": true, "communities_used": [1, 4]}
```

Use `curl -N` (no buffering) when piping. Blank lines and `: ping` comment lines are keep-alives — skip anything that does not start with `data: `. Two frames deserve a check on backends newer than v1.2.1: a prompt-injection refusal arrives as a `content` frame with the canned text and `refused: true` on it and on `done` (gotcha 8); a writer that hit its token cap ends with a visible note and `truncated: true` on `done`.

### Aggregate the stream into `{answer, sources}`

Three ready-made aggregators — pick the one for your runtime instead of writing a fourth.

**Bash (any agent with `bash` + `jq`).** The helper shipped with the Hermes skill is runtime-agnostic; it only needs `CORTEX_BASE_URL` and `CORTEX_API_KEY` in the environment:

```bash
curl -fsSL https://cortexskills.org/hermes/scripts/cortex.sh -o cortex.sh && chmod +x cortex.sh
export CORTEX_BASE_URL={BASE_URL} CORTEX_API_KEY={API_KEY}
./cortex.sh ask "What were the key findings?"     # deep research → answer + numbered sources footer
./cortex.sh search "key findings" 10              # raw top chunks, one line each
./cortex.sh show <doc_id>                         # a whole document (full_content)
```

It prints a hint instead of passing a refusal or a truncated report off as the answer. Every verb: [hermes skill](../hermes/SKILL.md).

**Python (`requests`).** Returns `{answer, sources, refused, truncated}`; run several questions from a thread pool, each stream is independent:

```python
import json, requests

def ask(base_url, api_key, question, collection_id=None):
    """Deep Research over SSE -> {"answer", "sources", "refused", "truncated"}."""
    r = requests.post(
        f"{base_url}/api/ask/stream", stream=True, timeout=(10, 600),
        headers={"X-API-Key": api_key, "Content-Type": "application/json",
                 "Accept": "text/event-stream"},
        json={"question": question, "use_agentic": True, "collection_id": collection_id},
    )
    r.raise_for_status()
    out = {"answer": "", "sources": [], "refused": False, "truncated": False}
    for line in r.iter_lines(decode_unicode=True):
        if not line.startswith("data: "):
            continue                                  # keep-alives, blank lines
        ev = json.loads(line[6:])
        if "error" in ev:
            raise RuntimeError(ev["error"])
        if "content" in ev:
            out["answer"] += ev["content"]
        if "sources" in ev:
            out["sources"] = ev["sources"]
        out["refused"] |= bool(ev.get("refused"))
        out["truncated"] |= bool(ev.get("truncated"))
        if ev.get("done") and not ev.get("pending_memory"):
            break
    canned = "i'm here to help with questions about your documents"
    if out["answer"].strip().strip('"').lower().startswith(canned):
        out["refused"] = True                         # older backends: no flag, match the text
    return out
```

`refused` means rephrase (gotcha 8) — the canned line is not a finding. `sources[i]` carries `document_id`, `content`, `metadata.filename`, and a `sid` that `[src_N]` markers in the answer refer to.

**TypeScript.** `npm i @mocaos/cortex-client`, then `await new CortexClient({ baseUrl, apiKey }).deepResearch(question)` resolves to the same `{answer, sources, refused?, truncated?}` shape with the SSE handled inside ([SDK](https://www.npmjs.com/package/@mocaos/cortex-client)).

### Streaming with Reasoning: POST /api/ask/stream/thinking

Same as streaming but also emits reasoning steps for agentic mode.

```bash
curl -X POST "{BASE_URL}/api/ask/stream/thinking" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "question": "How does the Q3 strategy compare to Q4 results?",
    "use_graph": true,
    "use_agentic": true
  }'
```

SSE event stream with reasoning (flat-keyed; the `thinking` key carries each reasoning step):
```
data: {"thinking": "Decomposing question into sub-questions..."}
data: {"thinking": "Searching: Q3 strategy, Q4 results, strategy vs results comparison"}
data: {"retrieval": "Found 8 sources"}
data: {"sources": [...]}
data: {"graph_context": {"entities": [...], "relationships": [...]}}
data: {"content": "Comparing"}
data: {"content": " the"}
...
data: {"done": true, "communities_used": [1, 4]}
```

## SSE Event Reference

The streaming endpoint emits these event keys. Current instances additionally stamp every frame with a `type` field naming the event (`{"type": "content", "content": "..."}`) — new clients can switch on `type`; older instances lack it, so key-presence switching remains the portable approach:

| Event | Mode | Description |
|-------|------|-------------|
| `status` | All (if `STREAM_REASONING_STEPS`) | Stage updates: `analyzing` → `searching` → `reranking` → `generating` |
| `content` | All | Answer token. A prompt-injection refusal is one `content` frame with the canned text (`refused: true` on backends newer than v1.2.1) |
| `sources` | All | `SearchResult[]` with scores; each source has a stable `sid` |
| `graph_context` | All | Entities / relationships / community data |
| `thinking` | Deep Research | Reasoning step status |
| `sub_questions` | Deep Research | Decomposed sub-questions |
| `retrieval` | Deep Research | Per-sub-question retrieval progress |
| `retrieval_stats` | Deep Research | `total_sources`, `unique_sources`, `communities_used` |
| `done` | All | `{"done": true}` when complete. Deep Research adds `communities_used`. When memory is active, this frame carries `pending_memory: true` to signal one more frame follows. On backends newer than v1.2.1: `refused: true` when the stream was a refusal, `truncated: true` when the writer hit its token cap |
| `memory_update` | When `conversation_memory` sent | Updated memory blob to replay next turn — emitted **after** the `done` frame |
| `error` | All | Error message |

- **Chat sequence:** `sources` → `graph_context` → `content` (many) → `done`.
- **Deep Research sequence:** `thinking` → `retrieval` → `sources` → `graph_context` → `retrieval_stats` → `content` → `done`.
- **With conversation memory** (default `EMIT_DONE_BEFORE_MEMORY=true`): the `done` frame is emitted first as `{"done": true, "pending_memory": true}` so clients can finalize the turn immediately, then a final `{"memory_update": {...}}` frame follows before the stream closes.
- During silent windows (≥ 8s with no event), the server emits SSE comment keep-alives (`: ping`) to prevent proxy idle-timeouts.

## Request Body Schema

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `question` | string | required | The question to ask |
| `top_k` | integer | 5 | Number of chunks to retrieve (1-20) |
| `use_graph` | boolean | true | Include graph traversal in retrieval |
| `max_hops` | integer | 2 | Graph traversal depth (1-3) |
| `conversation_history` | array | null | Previous messages: `[{role, content}]` |
| `conversation_memory` | object | null | Opt-in client-carried memory blob (see below) |
| `use_reranking` | boolean | true | Apply cross-encoder re-ranking |
| `use_agentic` | boolean | false | Legacy flag ≡ `depth: "deep"` (permanently supported) |
| `depth` | string | null | **The unified dial**: `fast` (vector-only) \| `standard` (default) \| `deep` (agentic research, streaming only). Authoritative when present — contradicting legacy flags → `400 depth_conflict`. Older instances ignore it, so send agreeing legacy flags too |
| `use_fast_search` | boolean | false | Vector-only search (skip graph + reranking) |
| `collection_id` | string | null | Scope to a specific collection or community id |
| `session_id` | string | null | Server-side session (from `POST /api/sessions`; requires `ENABLE_SESSIONS`). Backend keeps history + memory — mutually exclusive with `conversation_history`/`conversation_memory` (`400 session_conflict`); not with fast search. Older instances 422/ignore |
| `response_format` | object | null | JSON Schema (root `type: "object"`) for a structured answer — **non-streaming `POST /api/ask` only** (streaming endpoints 400; incompatible with `use_agentic`). The parsed object returns in the `structured` response field; raw text stays in `answer` |

## Structured Answers (`response_format`, non-streaming only)

Pass a JSON Schema and `POST /api/ask` answers as JSON conforming to it — for apps and agents that consume answers programmatically instead of parsing prose:

```json
{
  "question": "List the deployment options with their trade-offs",
  "response_format": {
    "type": "object",
    "properties": {
      "options": {"type": "array", "items": {"type": "object", "properties": {
        "name": {"type": "string"}, "tradeoff": {"type": "string"}}}}
    },
    "required": ["options"]
  }
}
```

The response carries the parsed object in `structured` (null if the model's output didn't parse — the raw text is always in `answer`). Root must be `type: "object"`; schema max 20k chars serialized. The non-streaming response also echoes the **applied** `collection_id` (request or key restriction). Older instances don't support `response_format` and ignore unknown fields — check `structured` is present before relying on it.

## Conversation History

Pass previous messages to maintain context across turns:

```json
{
  "question": "What about their pricing?",
  "conversation_history": [
    {"role": "user", "content": "Tell me about Acme Corp"},
    {"role": "assistant", "content": "Acme Corp is a technology company..."},
    {"role": "user", "content": "What products do they offer?"},
    {"role": "assistant", "content": "Acme offers three main products..."}
  ]
}
```

The backend keeps the most recent messages via `MAX_CONVERSATION_HISTORY` (default 6) and automatically manages context window size.

## Server-Side Sessions (opt-in, `ENABLE_SESSIONS`)

When the instance advertises `enable_sessions` (via `GET /api/features`), you can skip the client-carried contract entirely:

```bash
SID=$(curl -s -X POST "{BASE_URL}/api/sessions" -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" -d '{"name": "research"}' | jq -r .id)
curl -N -X POST "{BASE_URL}/api/ask/stream" -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" -H "Accept: text/event-stream" \
  -d "{\"question\": \"how does auth work?\", \"session_id\": \"$SID\", \"depth\": \"deep\"}"
# follow-ups just work — the backend kept the conversation:
#   {"question": "expand on the caching part", "session_id": "$SID", ...}
```

Manage with `GET /api/sessions`, `GET/DELETE /api/sessions/{id}`. Sessions are private to your API key, capped per key, and expire after idle TTL. `POST /api/sessions` accepts optional `history` + `memory` to migrate an existing blob-mode conversation. Don't send `conversation_history`/`conversation_memory` together with `session_id`.

## Conversation Memory (opt-in)

Memory lets multi-turn chats carry compacted context without the backend storing anything. The blob is **opaque** — treat it as a token to round-trip:

1. Turn 1: send `"conversation_memory": {}` (or omit it).
2. Read the `memory_update` SSE event from the response and keep its payload.
3. Next turn: send that payload back as `conversation_memory` (along with the full `conversation_history`).

The `memory_update` payload includes: `version`, `transcript` (`summary`, `summarized_count`), `facts[]`, `open_questions[]`, `intent`, `source_ledger[]` (`sid`/`filename`/`gist`), and `kg_context` (`entities`/`communities`). Compaction runs after the answer streams via a cheap fast-model call. Questions answerable from memory skip retrieval (memory fast-path); toggle with `ENABLE_MEMORY_FAST_PATH`.

## Agentic Mode (Deep Research)

When `use_agentic: true`, the system uses a **researcher/writer agent architecture**:

1. A **Researcher Agent** iteratively gathers information using these tools:
   - `knowledge_search` — hybrid RRF search (vector + keyword + graph) + cross-encoder rerank; up to 3 queries per call
   - `community_search` — search entity community summaries
   - `entity_lookup` — look up entities by name
   - `reasoning` — plan the next step (streamed as `thinking` events)
   - `done` — signal completion with a summary
   - `http_request` — call an active skill's API (only when skills are enabled)
   - `git_repo` — act on a connected repository. Since v1.0.1 it is offered only when a repo is connected **read/write** (`RESEARCHER_GIT_TOOL=auto`, the default): a read-only connection's files are already ingested, so `knowledge_search` is the read path. On v1.0.0 it is offered for any connection. See the `git-integration` skill.
2. A **Writer LLM** synthesizes the gathered context into a streamed answer

The researcher decides dynamically how many searches to perform and when to stop (up to `RESEARCHER_MAX_ITERATIONS_QUALITY` iterations — default 5 on backends newer than v1.2.1, 8 before). This is fundamentally different from legacy fixed-step reasoning. Deep Research requires `ENABLE_AGENTIC_RAG=true` AND `ENABLE_AGENT_RESEARCH=true`.

Best for complex, multi-part questions that span multiple documents or require cross-referencing.

#### The loop enforces reflection and convergence

> **Version:** the guards in this section and the writer-budget change below shipped in **v1.0.1**. They are absent from the `1.0.0` images: there the vars below don't exist, `WRITER_MAX_TOKENS_QUALITY` is `4000`, and `RESEARCHER_WALL_CLOCK_SECONDS` defaults to `0` (unlimited).

Research quality depends on the model reasoning *between* search rounds — summarizing what it found and naming the gap the next queries target. Models that skip that step degrade into rephrased-query volleys that burn every iteration and dilute the writer's context. The loop now enforces the rhythm structurally rather than trusting the model:

| Guard | Env var (default) | Behaviour |
|---|---|---|
| Forced reflection | `RESEARCHER_FORCE_REFLECTION` (`true`) | A search round that arrives with no reflection — neither a `reasoning` call nor prose alongside the tool calls — is followed by one micro-call pinned to the `reasoning` tool. Models that reflect on their own never trigger it; providers that reject a named `tool_choice` disarm it for the run. |
| Convergence stop | `RESEARCHER_NOVELTY_MIN_NEW_RATIO` (`0.35`), `RESEARCHER_NOVELTY_STALE_ROUNDS` (`2`) | Tracks previously-unseen sources per round; consecutive stale rounds end research early instead of re-fetching covered ground. Each round the agent is also *told* its last round's novelty, so a well-behaved model calls `done` first. `0` disables. |
| Time budget | `RESEARCHER_WALL_CLOCK_SECONDS` (`60` on backends newer than v1.2.1; `120` in v1.0.1–v1.2.1; `0` = unlimited in v1.0.0) | On expiry the loop stops gathering and the writer synthesizes from what it has — so an answer always arrives even when the provider is queueing. `0` = unlimited; raise it on slow self-hosted inference. |

Two consequences for clients: prose reflections (models that think in text alongside their tool calls, instead of calling `reasoning`) now surface as `thinking` events too, and a `Planning the next research step` status event precedes each researcher LLM call — so a slow provider call no longer shows a stale "Searching the knowledge base" from the previous round.

#### Answers are not silently truncated

The writer runs with reasoning **suppressed** in Deep Research as well as chat. On thinking models the hidden trace bills against the same output budget as the visible answer, which used to cut long reports off mid-word — or return nothing at all when the trace consumed the whole allowance. The writer only composes prose from context the researcher already gathered, so nothing is lost. `WRITER_MAX_TOKENS_QUALITY` also moved `4000` → **`8000`**. (Both shipped in v1.0.1 — on a v1.0.0 install, raise `WRITER_MAX_TOKENS_QUALITY` yourself if long reports come back clipped.)

If an answer does hit the cap, the stream ends with a visible note saying it was cut short (ordinary answer content) and the backend logs which mode, cap, and env var to raise. On backends newer than v1.2.1 the `done` frame additionally carries `truncated: true`, and the non-streaming response `truncated: true` with `finish_reason: "length"`. Don't treat a completed stream as proof of a complete answer on older versions.

### Research Modes

There are two operational modes that affect iteration depth and output length:

| Mode | Trigger | Max Iterations | Max Output Tokens | Use Case |
|------|---------|----------------|-------------------|----------|
| **Chat (Speed)** | `use_agentic: false` or standard chat | 3 (5 when skills active) | 1,200 | Quick answers, conversational Q&A |
| **Deep Research (Quality)** | `use_agentic: true` | 5 on backends newer than v1.2.1 (8 in v1.0.1–v1.2.1), capped by `RESEARCHER_WALL_CLOCK_SECONDS` (60s / 120s; unlimited on v1.0.0) | 8,000 (4,000 on v1.0.0) | Comprehensive analysis, cross-document comparison |

The `POST /api/ask/stream/thinking` endpoint streams the researcher's reasoning steps as `thinking` events, giving visibility into the research process. Use this when building UIs that surface the "thought process."

### Fast Search Mode

Set `use_fast_search: true` to use vector-only search, bypassing hybrid search, graph traversal, and cross-encoder re-ranking. This dramatically reduces latency at the cost of result diversity.

When `use_fast_search` is `true`, `use_reranking` and `use_graph` are effectively ignored.

### Agent vs Legacy Pipeline

The agent pipeline (`ENABLE_AGENT_RESEARCH=true`, default) requires a model that supports function calling (OpenAI `tools` parameter). If your model doesn't support this, set `ENABLE_AGENT_RESEARCH=false` to fall back to the legacy fixed decompose-search-synthesize pipeline.

| | Agent Pipeline | Legacy Pipeline |
|---|---|---|
| **Token usage** | 3-5x higher (multiple researcher iterations) | Lower (2 LLM calls) |
| **Latency** | 15-30s typical (4-8 LLM round-trips) | 5-10s typical |
| **Research depth** | Adaptive — agent decides when to dig deeper | Fixed — always decomposes into N sub-questions |
| **Compatible models** | GPT-4o, Claude, Mistral Large, Command R+ | Any OpenAI-compatible endpoint |

## Parsing SSE in JavaScript

```javascript
const response = await fetch(`${BASE_URL}/api/ask/stream`, {
  method: "POST",
  headers: {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ question: "What is GraphRAG?" }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const event = JSON.parse(line.slice(6));
      // Events are flat-keyed — switch on which key is present, not event.type
      if ("content" in event) process.stdout.write(event.content);
      if ("sources" in event) console.log("\nSources:", event.sources);
      if ("done" in event) console.log("\nDone.");
    }
  }
}
```

## Parsing SSE in Python

```python
import requests
import json

response = requests.post(
    f"{BASE_URL}/api/ask/stream",
    headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
    json={"question": "What is GraphRAG?", "use_graph": True},
    stream=True,
)

for line in response.iter_lines(decode_unicode=True):
    if line.startswith("data: "):
        event = json.loads(line[6:])
        # Events are flat-keyed — switch on presence of a key, not event["type"]
        if "content" in event:
            print(event["content"], end="", flush=True)
        elif "sources" in event:
            print(f"\n\nSources: {len(event['sources'])} chunks")
        elif "done" in event:
            print("\n--- Done ---")
```

## Reading a whole document

Every search hit and every `sources` entry carries a `document_id`. When a chunk is not enough — you need the full essay, transcript or spec — fetch it (read permission suffices):

```bash
curl -s "{BASE_URL}/api/documents/{document_id}/content" -H "X-API-Key: {API_KEY}" | jq -r .full_content
```

Response: `{id, filename, file_type, file_size, upload_date, chunk_count, collection_id, chunks: [{id, content, chunk_index}], full_content}`. `full_content` is the chunks concatenated in order; it is empty while the document is still processing. The original uploaded file is at `GET /api/documents/{id}/file`. Document-level details: [upload skill](../upload/SKILL.md).

## Appendix: fast chat (non-streaming `POST /api/ask`)

For callers that cannot consume SSE and only need a short conversational answer. Not a research path — see gotcha 11.

```bash
curl -X POST "{BASE_URL}/api/ask" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the key findings in the Q4 report?", "top_k": 10, "use_graph": true, "use_agentic": false}'
```

Response (fields marked † exist on backends newer than v1.2.1):
```json
{
  "question": "What are the key findings in the Q4 report?",
  "answer": "The Q4 report highlights three key findings: ...",
  "sources": [{"document_id": "doc_abc123", "chunk_id": "chunk_001", "content": "Revenue increased 23%...", "score": 0.92, "metadata": {"filename": "q4-report.pdf", "chunk_index": 5}}],
  "graph_context": {"entities": [{"name": "Q4 Report", "type": "Document"}], "relationships": [], "communities": []},
  "reranked": true,
  "reasoning_steps": null,
  "collection_id": null,
  "structured": null,
  "finish_reason": "stop",
  "truncated": false,
  "refused": false
}
```
(`finish_reason`, `truncated`, `refused` are the † fields.)

- **Deadline:** ~28s server-side (`ASK_DEADLINE_SECONDS`) → `504 {"detail": {"error": "deadline_exceeded", ...}}`. Retry on the stream, not here.
- **Cap:** 1,200 output tokens (`WRITER_MAX_TOKENS_SPEED`). Newer backends flag a cut with `truncated: true` + `finish_reason: "length"`; older ones return the clipped text as if complete.
- **Refusals:** `refused: true` on newer backends; otherwise the canned text starting `I'm here to help with questions about your documents`.
- **Failures:** newer backends `500 {"detail": {"error": "ask_failed", "message": "...", "use_endpoint": "/api/ask/stream"}, "request_id": "..."}`; older ones a bare `500 {"detail": "Internal server error...", "request_id": "..."}`. Either way, fall back to `/api/ask/stream`.
- **`use_agentic: true` is rejected** with `400 {"detail": {"error": "agentic_requires_streaming", "use_endpoint": "/api/ask/stream"}}`.
- `response_format` (structured JSON answers) works only here — see [Structured Answers](#structured-answers-response_format-non-streaming-only).

## Skill Files

| File | Description |
|------|-------------|
| [references/API.md](references/API.md) | Complete API endpoint reference |

## Resources

- [Ask AI Documentation](https://docs.cortex.eco/features/ask-ai)
- [API Reference](https://docs.cortex.eco/api)
