# Ask AI API Reference

Complete API reference for all Ask AI endpoints. For conceptual overview, common patterns, and quick-start examples, see the [SKILL.md](../SKILL.md).

## Authentication

All endpoints require the `X-API-Key` header:

```
X-API-Key: your-api-key
```

The key must have `read` permission.

---

## Endpoints

### POST /api/ask

Non-streaming endpoint. Returns the complete answer in a single JSON response. Best for server-to-server integrations where streaming is unnecessary.

### POST /api/ask/stream

Primary streaming endpoint. Returns answer tokens, sources, and graph context via Server-Sent Events (SSE). This is the recommended endpoint for all client-facing integrations.

### POST /api/ask/stream/thinking

Same as `/api/ask/stream` but also emits reasoning/thinking steps when agentic mode is enabled. Use this when you want to surface the research process to end users.

---

## Request Schema (RAGRequest)

All three endpoints accept the same JSON body.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `question` | `string` | **required** | The question to ask |
| `top_k` | `integer` | `5` | Number of chunks to retrieve (1--20) |
| `use_reranking` | `boolean` | `true` | Apply cross-encoder reranking after hybrid search |
| `use_graph` | `boolean` | `true` | Include knowledge graph context in retrieval |
| `max_hops` | `integer` | `2` | Graph traversal depth (1--3) |
| `use_agentic` | `boolean` | `false` | Enable deep research mode with multi-step reasoning |
| `use_fast_search` | `boolean` | `false` | Vector-only search (disables hybrid search, reranking, and graph) |
| `collection_id` | `string \| null` | `null` | Scope retrieval to a specific collection. Omit or set to `null` to search all collections. |
| `conversation_history` | `ConversationMessage[] \| null` | `null` | Previous messages for multi-turn context |

### ConversationMessage Schema

```json
{
  "role": "user" | "assistant",
  "content": "Message text"
}
```

The backend keeps the most recent messages (configured by `MAX_CONVERSATION_HISTORY`, default 6). Older messages are silently dropped.

### Parameter Interactions

- `use_agentic` and `use_fast_search` are independent toggles and can be combined, though combining them is unusual.
- When `use_fast_search` is `true`, `use_reranking` and `use_graph` are effectively ignored (vector-only path).
- `collection_id` applies to all retrieval steps: vector search, keyword search, and graph traversal.

---

## Non-Streaming Response Schema (POST /api/ask)

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
      "metadata": {
        "document_title": "q4-report.pdf",
        "collection_id": "financial-reports"
      }
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
  "communities_used": ["Financial Performance"],
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

| Field | Type | Description |
|-------|------|-------------|
| `question` | `string` | Echo of the original question |
| `answer` | `string` | The complete generated answer |
| `sources` | `SearchResult[]` | Retrieved source chunks with scores |
| `graph_context` | `object` | Entities, relationships, and communities from the knowledge graph |
| `reranked` | `boolean` | Whether cross-encoder reranking was applied |
| `reasoning_steps` | `string[] \| null` | Reasoning steps (only when `use_agentic: true`) |
| `sub_questions` | `string[] \| null` | Decomposed sub-questions (only when `use_agentic: true`) |
| `communities_used` | `string[]` | Community names used during retrieval |
| `retrieval_stats` | `object` | Counts of results from each retrieval method |
| `collection_id` | `string \| null` | The collection scope used, if any |

---

## SSE Event Reference (POST /api/ask/stream and /api/ask/stream/thinking)

The response is an HTTP stream with `Content-Type: text/event-stream`. Each event is a JSON object on a `data:` line. Each event object contains exactly **one** of the following keys.

| Event Key | Type | Available In | Description |
|-----------|------|--------------|-------------|
| `content` | `string` | All modes | A token of the streamed answer |
| `sources` | `SearchResult[]` | All modes | Retrieved source documents with scores |
| `graph_context` | `object` | All modes | Knowledge graph entities, relationships, and community data |
| `thinking` | `string` | Deep Research | Status message describing the current reasoning step |
| `sub_questions` | `string[]` | Deep Research | The decomposed research sub-questions |
| `retrieval` | `string` | Deep Research | Per-search retrieval progress (e.g., "Found 8 sources") |
| `retrieval_stats` | `object` | Deep Research | Summary: `total_sources_considered`, `unique_sources`, `search_calls`, `communities_used` |
| `done` | `boolean` | All modes | `true` when the stream is complete |
| `error` | `string` | All modes | Error message if something went wrong |
| `communities_used` | `number[]` | Deep Research | Community IDs used (included in the `done` event) |

### Chat Mode Event Sequence

```
sources -> graph_context -> content (repeated) -> done
```

```
data: {"sources": [{"document_id": "doc_abc", "chunk_id": "chunk_1", "content": "Knowledge graphs provide...", "score": 0.94, "metadata": {"document_title": "Overview.pdf"}}]}

data: {"graph_context": {"entities": [...], "relationships": [...], "chunks": [...]}}

data: {"content": "Knowledge graphs "}
data: {"content": "provide several "}
data: {"content": "key benefits..."}

data: {"done": true}
```

### Deep Research Mode Event Sequence

```
thinking (repeated) -> retrieval (repeated) -> sources -> graph_context -> retrieval_stats -> content (repeated) -> done
```

```
data: {"thinking": "Starting research..."}

data: {"thinking": "The user wants to compare methodologies in papers A and B. I'll start by searching for each paper's methodology separately."}
data: {"thinking": "Searching: Paper A methodology, Paper B methodology, methodology comparison"}
data: {"retrieval": "Found 8 sources"}

data: {"thinking": "Good results on Paper A. I should also check for community-level context on research methodologies."}
data: {"retrieval": "Found 2 relevant communities"}

data: {"thinking": "Let me search for specific differences and limitations."}
data: {"thinking": "Searching: Paper A limitations, Paper B strengths weaknesses, methodology comparison criteria"}
data: {"retrieval": "Found 6 sources"}

data: {"thinking": "Comprehensive coverage achieved. Ready to wrap up."}

data: {"sources": [...]}
data: {"graph_context": {"entities": [...], "relationships": [...], "communities": [...]}}
data: {"retrieval_stats": {"total_sources_considered": 14, "unique_sources": 11, "search_calls": 2, "communities_used": 2}}

data: {"content": "Both papers "}
data: {"content": "approach the problem "}
data: {"content": "differently..."}

data: {"done": true, "communities_used": [1, 4]}
```

### Source Object Shape

Each entry in the `sources` array:

```json
{
  "document_id": "abc123",
  "chunk_id": "chunk_456",
  "content": "The relevant text from the document...",
  "score": 0.94,
  "metadata": {
    "document_title": "Report.pdf",
    "collection_id": "research"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `document_id` | `string` | The parent document ID |
| `chunk_id` | `string` | The specific chunk ID |
| `content` | `string` | The retrieved text content |
| `score` | `number` | Relevance score (0.0--1.0) |
| `metadata` | `object` | Additional metadata including `document_title` and optionally `collection_id`, `chunk_index`, `type` |

---

## Agentic Mode (Deep Research) Internals

When `use_agentic: true`, the system uses a **researcher/writer agent architecture**:

1. A **Researcher Agent** iteratively gathers information using tool-calling
2. A **Writer LLM** synthesizes the gathered context into a streamed answer

### Researcher Agent Tools

| Tool | Chat Mode | Deep Research Mode | Description |
|------|:---------:|:------------------:|-------------|
| `knowledge_search` | 1 call | 3--5+ calls | Hybrid RRF search (vector + keyword + graph) with cross-encoder reranking. Up to 3 queries per call. |
| `community_search` | -- | Yes | Search entity community summaries for thematic context |
| `entity_lookup` | -- | Yes | Look up specific entities by name for deeper exploration |
| `reasoning` | -- | Yes | Plan next research step (streamed to UI as thinking events) |
| `done` | Yes | Yes | Signal research completion with a summary for the writer |

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_AGENTIC_RAG` | `true` | Enable deep research mode |
| `ENABLE_AGENT_RESEARCH` | `true` | Use agent pipeline for deep research (set `false` for legacy) |
| `ENABLE_AGENT_CHAT` | `false` | Use agent pipeline for standard chat (opt-in) |
| `RESEARCHER_MAX_ITERATIONS_SPEED` | `2` | Agent iterations for chat mode |
| `RESEARCHER_MAX_ITERATIONS_QUALITY` | `10` | Agent iterations for deep research |
| `WRITER_MAX_TOKENS_SPEED` | `1200` | Max output tokens for chat answers |
| `WRITER_MAX_TOKENS_QUALITY` | `4000` | Max output tokens for deep research answers |
| `MAX_CONVERSATION_HISTORY` | `6` | Messages to keep for multi-turn context |
| `STREAM_REASONING_STEPS` | `true` | Show thinking steps in deep research |
| `SHOW_RETRIEVAL_STATS` | `true` | Include retrieval_stats events |
| `PROMPT_SECURITY` | `true` | Sanitize input and filter harmful output |

### Agent vs Legacy Pipeline

| | Agent Pipeline | Legacy Pipeline |
|---|---|---|
| **LLM requirement** | Must support function calling / tool use (OpenAI `tools` parameter) | Any OpenAI-compatible chat endpoint |
| **Compatible models** | GPT-4o, GPT-4o-mini, Claude, Mistral Large, Command R+ | Any model (including local Ollama/vLLM) |
| **Token usage** | 3--5x higher (multiple researcher iterations) | Lower (2 LLM calls: decompose + synthesize) |
| **Latency** | 15--30s typical (4--8 LLM round-trips) | 5--10s typical (2 LLM calls) |
| **Research depth** | Adaptive -- agent decides when to dig deeper | Fixed -- always decomposes into N sub-questions |
| **Behavior** | Non-deterministic -- agent chooses search queries dynamically | Deterministic -- fixed decompose, search, synthesize path |
| **Transparency** | Reasoning tool streams agent's thought process | Hard-coded status messages |

Set `ENABLE_AGENT_RESEARCH=false` if your model does not support function calling, or if you prefer lower cost/latency with predictable behavior.

---

## Error Responses

### Authentication Errors

**Missing API Key** -- `401 Unauthorized`

```json
{
  "detail": "API key required. Provide X-API-Key header or api_key query parameter."
}
```

**Invalid API Key** -- `401 Unauthorized`

```json
{
  "detail": "Invalid API key"
}
```

**Expired API Key** -- `401 Unauthorized`

```json
{
  "detail": "API key has expired"
}
```

**Insufficient Permissions** -- `403 Forbidden`

```json
{
  "detail": "Permission 'read' required for this operation"
}
```

### Request Errors

**Validation Error** -- `422 Unprocessable Entity`

Returned when the request body fails schema validation (e.g., missing `question` field, `top_k` out of range).

```json
{
  "detail": [
    {
      "loc": ["body", "question"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

**Rate Limited** -- `429 Too Many Requests`

```json
{
  "detail": "Rate limited, please wait"
}
```

### Streaming Errors

During an SSE stream, errors are delivered as an event rather than an HTTP status code:

```
data: {"error": "LLM request failed: connection timeout"}
```

---

## Code Examples

### cURL -- Non-Streaming

```bash
export CORTEX_URL="http://localhost:8000"
export CORTEX_API_KEY="your-api-key"

curl -X POST "$CORTEX_URL/api/ask" \
  -H "X-API-Key: $CORTEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are the key findings in the Q4 report?",
    "top_k": 10,
    "use_graph": true,
    "use_reranking": true,
    "collection_id": "financial-reports"
  }'
```

### cURL -- Streaming

```bash
curl -X POST "$CORTEX_URL/api/ask/stream" \
  -H "X-API-Key: $CORTEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the main findings?"}' \
  --no-buffer
```

### cURL -- Deep Research

```bash
curl -X POST "$CORTEX_URL/api/ask/stream" \
  -H "X-API-Key: $CORTEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Compare the methodologies in papers A and B",
    "use_agentic": true
  }' --no-buffer
```

### cURL -- Streaming with Thinking

```bash
curl -X POST "$CORTEX_URL/api/ask/stream/thinking" \
  -H "X-API-Key: $CORTEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How does the Q3 strategy compare to Q4 results?",
    "use_agentic": true
  }' --no-buffer
```

### cURL -- Fast Search Mode

```bash
curl -X POST "$CORTEX_URL/api/ask/stream" \
  -H "X-API-Key: $CORTEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the company mission?",
    "use_fast_search": true
  }' --no-buffer
```

### cURL -- With Conversation History

```bash
curl -X POST "$CORTEX_URL/api/ask/stream" \
  -H "X-API-Key: $CORTEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Can you elaborate on the third point?",
    "conversation_history": [
      {"role": "user", "content": "What are the benefits of knowledge graphs?"},
      {"role": "assistant", "content": "Knowledge graphs provide: 1) Structured relationships, 2) Semantic understanding, 3) Discovery of hidden connections."}
    ]
  }' --no-buffer
```

### Python -- httpx Streaming (Recommended)

```python
import httpx
import json

def ask_stream(base_url: str, api_key: str, question: str, **kwargs):
    """Stream answers from the Ask AI endpoint."""
    payload = {"question": question, **kwargs}

    with httpx.stream(
        "POST",
        f"{base_url}/api/ask/stream",
        headers={"X-API-Key": api_key, "Content-Type": "application/json"},
        json=payload,
        timeout=60.0,
    ) as response:
        response.raise_for_status()
        buffer = ""
        for chunk in response.iter_text():
            buffer += chunk
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                if line.startswith("data: "):
                    event = json.loads(line[6:])
                    yield event

# Chat mode
for event in ask_stream("http://localhost:8000", "your-api-key", "What is GraphRAG?"):
    if "content" in event:
        print(event["content"], end="", flush=True)
    elif "sources" in event:
        print(f"\n[{len(event['sources'])} sources retrieved]")
    elif "done" in event:
        print("\n--- Complete ---")

# Deep research mode
for event in ask_stream(
    "http://localhost:8000",
    "your-api-key",
    "Compare the approaches in these papers",
    use_agentic=True,
    top_k=10,
):
    if "thinking" in event:
        print(f"  [{event['thinking']}]")
    elif "sub_questions" in event:
        for i, q in enumerate(event["sub_questions"], 1):
            print(f"  Sub-Q {i}: {q}")
    elif "retrieval" in event:
        print(f"  {event['retrieval']}")
    elif "content" in event:
        print(event["content"], end="", flush=True)
    elif "done" in event:
        print("\n--- Complete ---")
```

### Python -- requests Streaming

```python
import requests
import json

def ask_stream(base_url: str, api_key: str, question: str, **kwargs):
    payload = {"question": question, **kwargs}

    with requests.post(
        f"{base_url}/api/ask/stream",
        headers={"X-API-Key": api_key, "Content-Type": "application/json"},
        json=payload,
        stream=True,
        timeout=60,
    ) as response:
        response.raise_for_status()
        for line in response.iter_lines(decode_unicode=True):
            if line and line.startswith("data: "):
                yield json.loads(line[6:])
```

### Python -- Non-Streaming

```python
import requests

response = requests.post(
    "http://localhost:8000/api/ask",
    headers={"X-API-Key": "your-api-key", "Content-Type": "application/json"},
    json={
        "question": "Summarize the key points",
        "top_k": 10,
        "use_graph": True,
        "use_reranking": True,
    },
)
response.raise_for_status()
data = response.json()
print(data["answer"])
for source in data["sources"]:
    print(f"  - {source['metadata']['document_title']} (score: {source['score']:.2f})")
```

### Python -- Multi-Turn Conversation

```python
history = []

def chat(question: str):
    """Ask a follow-up question with conversation context."""
    answer_parts = []
    for event in ask_stream(
        "http://localhost:8000",
        "your-api-key",
        question,
        conversation_history=history,
    ):
        if "content" in event:
            answer_parts.append(event["content"])
            print(event["content"], end="", flush=True)
        elif "done" in event:
            print()

    answer = "".join(answer_parts)
    history.append({"role": "user", "content": question})
    history.append({"role": "assistant", "content": answer})

chat("What are the main findings?")
chat("Can you elaborate on the second point?")
chat("How does that compare to the introduction?")
```

### Python -- Error Handling

```python
from requests.exceptions import HTTPError

try:
    response = requests.post(
        "http://localhost:8000/api/ask",
        headers={"X-API-Key": "your-api-key", "Content-Type": "application/json"},
        json={"question": "What are the key findings?"},
    )
    response.raise_for_status()
except HTTPError as e:
    if e.response.status_code == 401:
        print("Invalid or missing API key")
    elif e.response.status_code == 403:
        print("Insufficient permissions")
    elif e.response.status_code == 422:
        print("Validation error:", e.response.json())
    elif e.response.status_code == 429:
        print("Rate limited, please wait")
    else:
        print(f"Error: {e}")
```

### JavaScript/TypeScript -- Async Generator

```typescript
async function* askStream(
  baseUrl: string,
  apiKey: string,
  question: string,
  options: {
    topK?: number;
    useReranking?: boolean;
    useGraph?: boolean;
    useAgentic?: boolean;
    useFastSearch?: boolean;
    conversationHistory?: { role: string; content: string }[];
    collectionId?: string;
  } = {}
) {
  const res = await fetch(`${baseUrl}/api/ask/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      question,
      top_k: options.topK ?? 5,
      use_reranking: options.useReranking ?? true,
      use_graph: options.useGraph ?? true,
      use_agentic: options.useAgentic ?? false,
      use_fast_search: options.useFastSearch ?? false,
      conversation_history: options.conversationHistory,
      ...(options.collectionId
        ? { collection_id: options.collectionId }
        : {}),
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Stream failed" }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

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
        try {
          yield JSON.parse(line.slice(6));
        } catch {
          // skip malformed events
        }
      }
    }
  }
}

// Usage
for await (const event of askStream(
  "http://localhost:8000",
  "your-api-key",
  "What is GraphRAG?"
)) {
  if (event.sources) console.log("Sources:", event.sources);
  if (event.graph_context) console.log("Graph:", event.graph_context);
  if (event.content) process.stdout.write(event.content);
  if (event.thinking) console.log("[Thinking]", event.thinking);
  if (event.done) console.log("\n--- Done ---");
  if (event.error) console.error("Error:", event.error);
}
```

### JavaScript -- Non-Streaming

```javascript
const response = await fetch("http://localhost:8000/api/ask", {
  method: "POST",
  headers: {
    "X-API-Key": "your-api-key",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    question: "What are the key findings?",
    top_k: 10,
    use_graph: true,
  }),
});

if (!response.ok) {
  const err = await response.json();
  throw new Error(err.detail || `HTTP ${response.status}`);
}

const data = await response.json();
console.log(data.answer);
data.sources.forEach((s) =>
  console.log(`  - ${s.metadata.document_title} (${s.score.toFixed(2)})`)
);
```

---

## Prompt Security

When `PROMPT_SECURITY=true` (default), the system:

- Validates and sanitizes user input
- Injects anti-manipulation instructions into the system prompt
- Filters potentially harmful outputs
- Returns safe refusal messages when attacks are detected

---

## Permissions

| Endpoint | Required Permission |
|----------|---------------------|
| `POST /api/ask` | `read` |
| `POST /api/ask/stream` | `read` |
| `POST /api/ask/stream/thinking` | `read` |
