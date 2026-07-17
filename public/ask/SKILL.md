---
name: ask
description: Use this skill when building RAG-powered Q&A features on Cortex. Covers the three Ask AI endpoints (non-streaming, streaming SSE, streaming with reasoning), request/response schemas, agentic multi-step reasoning, deep research mode, conversation history, and collection-scoped queries.
---

# Ask — RAG-Powered Q&A with Streaming and Agentic Reasoning

## What You Probably Got Wrong

1. **Streaming uses Server-Sent Events (SSE), not WebSockets.** Use `POST /api/ask/stream` with standard HTTP. The response is a stream of `data:` lines, not a WebSocket upgrade.

2. **There are three separate endpoints**, not one with a mode flag. Non-streaming (`/api/ask`), streaming (`/api/ask/stream`), and streaming with visible reasoning (`/api/ask/stream/thinking`).

3. **`conversation_history` is an array of `{role, content}` objects**, not a session ID. The client is responsible for maintaining and sending history. Max 6 messages.

4. **`use_agentic` and `use_fast_search` are independent toggles.** Agentic mode does multi-step reasoning. Fast search skips graph traversal and re-ranking for speed. You can combine them.

5. **Answers always include source citations.** The `sources` array in the response contains chunk references with document IDs, content, and scores — each carries a conversation-stable `sid`. Never present an answer without showing its sources.

6. **Collection scoping applies to every endpoint.** Pass `collection_id` to restrict retrieval to documents in that collection. Pass a community id as `collection_id` (e.g. `"comm_1"`) to scope to a community.

7. **Conversation memory is opt-in and client-carried — the backend stays stateless.** Send an opaque `conversation_memory` blob, read the updated blob back from the `memory_update` SSE event, and replay it next turn. Follow-ups answerable from memory can skip retrieval entirely (memory fast-path).

8. **Injection refusals look like normal streams.** A question flagged by the prompt-injection defenses returns a safe-refusal `content` frame followed by `done` — no `error` frame, no HTTP error, no special field. Don't treat refusals as failures. There are also two 429 flavors: the per-key burst limit (seconds-scale `Retry-After`) and the monthly unit quota (`Retry-After` = seconds until the next UTC month) — see [references/API.md](references/API.md#error-responses).

9. **A 402 means your key is monetized, not broken.** Keys with the `cortex_pub_` prefix pay per query via x402 micropayments: decode the `PAYMENT-REQUIRED` header, sign the EIP-3009 authorization, retry with `PAYMENT-SIGNATURE`. When paying, always use `/api/ask/stream` — the non-streaming `/api/ask` has a ~28s deadline that can expire *after* your payment settled. Full handshake: the [x402 skill](../x402/SKILL.md).

## Endpoints

### Non-Streaming: POST /api/ask

Returns the complete answer in a single JSON response.

```bash
curl -X POST "{BASE_URL}/api/ask" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are the key findings in the Q4 report?",
    "top_k": 10,
    "use_graph": true,
    "max_hops": 2,
    "use_reranking": true,
    "use_agentic": false,
    "collection_id": null
  }'
```

Response:
```json
{
  "question": "What are the key findings in the Q4 report?",
  "answer": "The Q4 report highlights three key findings: ...",
  "sources": [
    {
      "document_id": "doc_abc123",
      "chunk_id": "chunk_001",
      "content": "Revenue increased 23% year-over-year...",
      "score": 0.92,
      "metadata": {"filename": "q4-report.pdf", "chunk_index": 5}
    }
  ],
  "graph_context": {
    "entities": [{"name": "Q4 Report", "type": "Document"}],
    "relationships": [],
    "communities": []
  },
  "reranked": true,
  "reasoning_steps": null,
  "sub_questions": null,
  "communities_used": [3, 7],
  "retrieval_stats": {
    "vector_results": 10,
    "keyword_results": 8,
    "graph_results": 5,
    "total_unique": 15,
    "after_reranking": 10
  },
  "collection_id": null
}
```

> **Agentic deep research requires streaming.** `use_agentic: true` is only honored on the streaming endpoints (`/api/ask/stream`, `/api/ask/stream/thinking`). Sending it to the non-streaming `POST /api/ask` returns `400 {"error":"agentic_requires_streaming"}` — agentic runs routinely exceed the gateway timeout. Use non-streaming `/api/ask` for `use_agentic: false` (fast chat) only; switch to `/api/ask/stream` for deep research.

### Streaming: POST /api/ask/stream

Returns answer tokens in real-time via Server-Sent Events.

```bash
curl -X POST "{BASE_URL}/api/ask/stream" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "question": "Summarize the main themes across all documents",
    "use_graph": true,
    "use_agentic": true
  }'
```

SSE event stream (each event is a flat-keyed JSON object — switch on which key is present, there is no `type` field):
```
data: {"sources": [{"document_id": "doc_1", "content": "...", "metadata": {"filename": "report.pdf", "chunk_index": 5, "rerank_score": 0.91}}]}
data: {"graph_context": {"entities": [...], "relationships": [...]}}
data: {"content": "The"}
data: {"content": " main"}
data: {"content": " themes"}
...
data: {"done": true}
```

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

The streaming endpoint emits these event keys (the exact `data:` payload shape may vary by build — switch on the event key):

| Event | Mode | Description |
|-------|------|-------------|
| `status` | All (if `STREAM_REASONING_STEPS`) | Stage updates: `analyzing` → `searching` → `reranking` → `generating` |
| `content` | All | Answer token |
| `sources` | All | `SearchResult[]` with scores; each source has a stable `sid` |
| `graph_context` | All | Entities / relationships / community data |
| `thinking` | Deep Research | Reasoning step status |
| `sub_questions` | Deep Research | Decomposed sub-questions |
| `retrieval` | Deep Research | Per-sub-question retrieval progress |
| `retrieval_stats` | Deep Research | `total_sources`, `unique_sources`, `communities_used` |
| `done` | All | `{"done": true}` when complete. Deep Research adds `communities_used`. When memory is active, this frame carries `pending_memory: true` to signal one more frame follows |
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
| `use_agentic` | boolean | false | Enable deep research (multi-step reasoning) |
| `use_fast_search` | boolean | false | Vector-only search (skip graph + reranking) |
| `collection_id` | string | null | Scope to a specific collection or community id |

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
2. A **Writer LLM** synthesizes the gathered context into a streamed answer

The researcher decides dynamically how many searches to perform and when to stop (up to `RESEARCHER_MAX_ITERATIONS_QUALITY` iterations, default 8). This is fundamentally different from legacy fixed-step reasoning. Deep Research requires `ENABLE_AGENTIC_RAG=true` AND `ENABLE_AGENT_RESEARCH=true`.

Best for complex, multi-part questions that span multiple documents or require cross-referencing.

### Research Modes

There are two operational modes that affect iteration depth and output length:

| Mode | Trigger | Max Iterations | Max Output Tokens | Use Case |
|------|---------|----------------|-------------------|----------|
| **Chat (Speed)** | `use_agentic: false` or standard chat | 3 (5 when skills active) | 1,200 | Quick answers, conversational Q&A |
| **Deep Research (Quality)** | `use_agentic: true` | 8 | 4,000 | Comprehensive analysis, cross-document comparison |

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

## Skill Files

| File | Description |
|------|-------------|
| [references/API.md](references/API.md) | Complete API endpoint reference |

## Resources

- [Ask AI Documentation](https://docs.cortex.eco/features/ask-ai)
- [API Reference](https://docs.cortex.eco/api)
