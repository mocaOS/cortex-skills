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

5. **Answers always include source citations.** The `sources` array in the response contains chunk references with document IDs, content, and scores. Never present an answer without showing its sources.

6. **Collection scoping applies to all three endpoints.** Pass `collection_id` to restrict retrieval to documents in that collection.

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

SSE event stream:
```
data: {"type": "token", "content": "The"}
data: {"type": "token", "content": " main"}
data: {"type": "token", "content": " themes"}
data: {"type": "token", "content": " across"}
...
data: {"type": "source", "sources": [{"document_id": "doc_1", "content": "..."}]}
data: {"type": "done", "answer": "The main themes across all documents..."}
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

SSE event stream with reasoning:
```
data: {"type": "thinking", "step": 1, "content": "Decomposing question into sub-questions..."}
data: {"type": "thinking", "step": 2, "content": "Sub-question 1: What was the Q3 strategy?"}
data: {"type": "thinking", "step": 3, "content": "Sub-question 2: What were the Q4 results?"}
data: {"type": "token", "content": "Comparing"}
data: {"type": "token", "content": " the"}
...
data: {"type": "source", "sources": [...]}
data: {"type": "done", "answer": "..."}
```

## Request Body Schema

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `question` | string | required | The question to ask |
| `top_k` | integer | 10 | Number of chunks to retrieve (1-20) |
| `use_graph` | boolean | true | Include graph traversal in retrieval |
| `max_hops` | integer | 2 | Graph traversal depth (1-3) |
| `conversation_history` | array | [] | Previous messages: `[{role, content}]` |
| `use_reranking` | boolean | true | Apply cross-encoder re-ranking |
| `use_agentic` | boolean | false | Enable multi-step reasoning |
| `use_fast_search` | boolean | false | Vector-only search (skip graph + reranking) |
| `collection_id` | string | null | Scope to a specific collection |

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

Maximum 6 messages in history. The system automatically manages context window size.

## Agentic Mode (Deep Research)

When `use_agentic: true`, the system:

1. **Decomposes** the question into sub-questions
2. **Retrieves** relevant context for each sub-question independently
3. **Synthesizes** a comprehensive answer from all retrieved contexts
4. Up to `MAX_AGENTIC_STEPS` (default 3) reasoning steps

Best for complex, multi-part questions that span multiple documents or require cross-referencing.

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
      if (event.type === "token") process.stdout.write(event.content);
      if (event.type === "source") console.log("\nSources:", event.sources);
      if (event.type === "done") console.log("\nDone.");
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
        if event["type"] == "token":
            print(event["content"], end="", flush=True)
        elif event["type"] == "source":
            print(f"\n\nSources: {len(event['sources'])} chunks")
        elif event["type"] == "done":
            print("\n--- Done ---")
```

## Resources

- [Ask AI Documentation](https://docs-library.moca.qwellco.de/features/ask-ai)
- [API Reference](https://docs-library.moca.qwellco.de/api)
