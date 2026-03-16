---
name: integration
description: Use this skill when connecting Cortex to agent frameworks (LangChain, CrewAI, AutoGen, LangGraph, ElizaOS), MCP for Claude, Slack bots, webhooks, automation platforms, or building custom clients. Includes Python and TypeScript client code, framework-specific patterns, and the memory hierarchy model.
---

# Integration — Connect Cortex to Agent Frameworks and Tools

## What You Probably Got Wrong

1. **Cortex is a long-term memory layer, not a framework.** It does not replace LangChain or CrewAI — it complements them. Your agent framework handles orchestration; Cortex handles persistent knowledge storage and retrieval.

2. **The memory hierarchy matters.** Context window = short-term memory (dies with the session). Agent memory stack = mid-term memory (survives the session, lost on redeploy). MOCA Library = long-term memory (survives everything — crashes, redeployments, framework migrations).

3. **There is no official SDK package.** Integration is via REST API calls. The Python and TypeScript clients below are reference implementations you copy into your project.

4. **Authentication is always X-API-Key header.** No OAuth, no Bearer tokens, no session cookies for API access.

5. **Streaming uses SSE, not WebSockets.** When integrating `/api/ask/stream`, parse `data:` lines from an HTTP response, not WebSocket frames.

## Memory Hierarchy

```
┌─────────────────────────────────────────┐
│  Context Window (Short-term)            │
│  Dies when the conversation ends        │
├─────────────────────────────────────────┤
│  Agent Memory Stack (Mid-term)          │
│  Survives sessions, lost on redeploy    │
├─────────────────────────────────────────┤
│  MOCA Library / Cortex (Long-term)      │
│  Survives everything — persistent API   │
└─────────────────────────────────────────┘
```

## Python Client (MOCAClient)

Copy this class into your project:

```python
import requests
import json
from typing import Optional, Generator

class MOCAClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        }

    def health(self) -> dict:
        r = requests.get(f"{self.base_url}/health")
        return r.json()

    def stats(self) -> dict:
        r = requests.get(f"{self.base_url}/api/stats", headers=self.headers)
        return r.json()

    def upload(self, file_path: str, collection_id: Optional[str] = None) -> dict:
        url = f"{self.base_url}/api/upload"
        if collection_id:
            url += f"?collection_id={collection_id}"
        with open(file_path, "rb") as f:
            r = requests.post(url, headers={"X-API-Key": self.headers["X-API-Key"]},
                              files={"file": f})
        return r.json()

    def documents(self) -> list:
        r = requests.get(f"{self.base_url}/api/documents", headers=self.headers)
        return r.json()

    def delete_document(self, doc_id: str) -> dict:
        r = requests.delete(f"{self.base_url}/api/documents/{doc_id}", headers=self.headers)
        return r.json()

    def search(self, query: str, top_k: int = 10, collection_id: Optional[str] = None) -> list:
        body = {"query": query, "top_k": top_k}
        if collection_id:
            body["collection_id"] = collection_id
        r = requests.post(f"{self.base_url}/api/search", headers=self.headers, json=body)
        return r.json()

    def ask(self, question: str, use_graph: bool = True, collection_id: Optional[str] = None) -> dict:
        body = {"question": question, "use_graph": use_graph}
        if collection_id:
            body["collection_id"] = collection_id
        r = requests.post(f"{self.base_url}/api/ask", headers=self.headers, json=body)
        return r.json()

    def ask_stream(self, question: str, **kwargs) -> Generator[dict, None, None]:
        body = {"question": question, **kwargs}
        r = requests.post(f"{self.base_url}/api/ask/stream",
                          headers=self.headers, json=body, stream=True)
        for line in r.iter_lines(decode_unicode=True):
            if line.startswith("data: "):
                yield json.loads(line[6:])

    def collections(self) -> list:
        r = requests.get(f"{self.base_url}/api/collections", headers=self.headers)
        return r.json()

    def create_collection(self, name: str, description: str = "") -> dict:
        r = requests.post(f"{self.base_url}/api/collections", headers=self.headers,
                          json={"name": name, "description": description})
        return r.json()

    def entities(self, entity_type: Optional[str] = None) -> list:
        url = f"{self.base_url}/api/graph/entities"
        if entity_type:
            url += f"?type={entity_type}"
        r = requests.get(url, headers=self.headers)
        return r.json()

    def entity(self, name: str) -> dict:
        r = requests.get(f"{self.base_url}/api/graph/entity/{name}", headers=self.headers)
        return r.json()

    def graph_visualization(self) -> dict:
        r = requests.get(f"{self.base_url}/api/graph/visualization", headers=self.headers)
        return r.json()
```

Usage:

```python
client = MOCAClient("http://localhost:8000", "moca_rw_your_key_here")

# Upload a document
client.upload("report.pdf")

# Search
results = client.search("quarterly revenue")

# Ask with streaming
for event in client.ask_stream("What were the key findings?", use_graph=True):
    if event["type"] == "token":
        print(event["content"], end="", flush=True)
    elif event["type"] == "done":
        print()
```

## LangChain Integration

### Custom Retriever

```python
from langchain.schema import BaseRetriever, Document
from typing import List

class CortexRetriever(BaseRetriever):
    client: MOCAClient
    top_k: int = 10
    collection_id: str = None

    class Config:
        arbitrary_types_allowed = True

    def _get_relevant_documents(self, query: str) -> List[Document]:
        results = self.client.search(query, top_k=self.top_k,
                                      collection_id=self.collection_id)
        return [
            Document(
                page_content=r["content"],
                metadata={
                    "document_id": r["document_id"],
                    "chunk_id": r["chunk_id"],
                    "score": r["score"],
                }
            )
            for r in results
        ]

# Usage
retriever = CortexRetriever(client=client, top_k=5)
docs = retriever.get_relevant_documents("deployment architecture")
```

### LangChain Tool

```python
from langchain.tools import Tool

cortex_search = Tool(
    name="cortex_search",
    description="Search the knowledge base for relevant information",
    func=lambda q: str(client.search(q, top_k=5)),
)

cortex_ask = Tool(
    name="cortex_ask",
    description="Ask a question and get an answer with source citations",
    func=lambda q: client.ask(q)["answer"],
)
```

## CrewAI Integration

```python
from crewai import Agent, Task, Crew

researcher = Agent(
    role="Research Analyst",
    goal="Find relevant information from the knowledge base",
    tools=[cortex_search, cortex_ask],
)

task = Task(
    description="Research the deployment architecture and summarize findings",
    agent=researcher,
)

crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff()
```

### Multi-Agent with Shared Memory

Use collections for agent-specific memory:

```python
# Research agent writes to its collection
research_client = MOCAClient(BASE_URL, API_KEY)
research_client.upload("findings.md", collection_id="research_col")

# Writing agent reads from research collection
writing_client = MOCAClient(BASE_URL, API_KEY)
context = writing_client.search("key findings", collection_id="research_col")
```

## MCP (Model Context Protocol) for Claude

Cortex is MCP-server compatible. Configure for Claude Desktop:

```json
{
  "mcpServers": {
    "cortex": {
      "command": "node",
      "args": ["path/to/cortex-mcp-server.js"],
      "env": {
        "CORTEX_BASE_URL": "http://localhost:8000",
        "CORTEX_API_KEY": "moca_ro_your_key"
      }
    }
  }
}
```

The MCP server exposes tools: `search_knowledge`, `ask_question`, `list_documents`, `list_entities`.

## Slack Bot

Flask-based Slack bot with `/ask` and `/search` commands:

```python
from flask import Flask, request, jsonify

app = Flask(__name__)
client = MOCAClient("http://localhost:8000", "moca_ro_your_key")

@app.route("/slack/ask", methods=["POST"])
def slack_ask():
    question = request.form.get("text", "")
    result = client.ask(question)
    return jsonify({
        "response_type": "in_channel",
        "text": f"*Answer:* {result['answer']}\n\n"
               f"_Sources: {len(result['sources'])} chunks_"
    })

@app.route("/slack/search", methods=["POST"])
def slack_search():
    query = request.form.get("text", "")
    results = client.search(query, top_k=3)
    text = "\n".join([f"• {r['content'][:200]}..." for r in results])
    return jsonify({"response_type": "in_channel", "text": text})
```

## Webhook Support

Subscribe to events from Cortex (document processed, entity extracted, etc.):

```python
from flask import Flask, request

@app.route("/webhook", methods=["POST"])
def handle_webhook():
    event = request.json
    if event["type"] == "document.processed":
        doc_id = event["data"]["document_id"]
        print(f"Document {doc_id} processed successfully")
    return "", 200
```

## n8n / Make.com / Zapier

Use HTTP Request nodes with:

- **URL:** `{BASE_URL}/api/search` (or `/api/ask`, etc.)
- **Method:** POST
- **Headers:** `X-API-Key: {API_KEY}`, `Content-Type: application/json`
- **Body:** `{"query": "your search query", "top_k": 5}`

## Next.js API Route

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { question } = await req.json();
  const res = await fetch(`${process.env.CORTEX_BASE_URL}/api/ask`, {
    method: "POST",
    headers: {
      "X-API-Key": process.env.CORTEX_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question, use_graph: true }),
  });
  const data = await res.json();
  return NextResponse.json(data);
}
```

## Resources

- [Integration Examples](https://docs-library.moca.qwellco.de/examples/integration)
- [Python Examples](https://docs-library.moca.qwellco.de/examples/python)
- [API Reference](https://docs-library.moca.qwellco.de/api)
