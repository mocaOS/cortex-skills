# Python MOCAClient — Complete Reference

> This reference complements the SKILL.md by providing exhaustive method documentation, parameter details, return type schemas, error handling patterns, and full working examples for every MOCAClient operation.

## Installation Requirements

```bash
pip install requests
```

No official SDK package exists. Copy the `MOCAClient` class from SKILL.md into your project, then use this reference for detailed method behavior.

## Configuration

```python
from moca_client import MOCAClient

client = MOCAClient(
    base_url="http://localhost:8000",  # No trailing slash
    api_key="moca_rw_your_key_here"    # Read-write key for mutations; read-only key for queries
)
```

### API Key Types

| Prefix     | Permissions                          |
|------------|--------------------------------------|
| `moca_rw_` | Full access: upload, delete, search, ask, graph mutations |
| `moca_ro_` | Read-only: search, ask, list documents, graph queries     |

---

## Method Reference

### `health() -> dict`

Check if the Cortex server is running. Does NOT require authentication.

**Parameters:** None

**Returns:**
```python
{
    "status": "healthy",
    "neo4j_connected": True,
    "version": "1.4.2"
}
```

**Example:**
```python
status = client.health()
if status["status"] != "healthy":
    raise RuntimeError("Cortex is not available")
if not status["neo4j_connected"]:
    print("Warning: Knowledge graph is disconnected, graph queries will fail")
```

---

### `stats() -> dict`

Retrieve system-wide statistics: document counts, entity counts, relationship counts, community counts.

**Parameters:** None

**Returns:**
```python
{
    "total_documents": 42,
    "total_chunks": 1580,
    "total_entities": 312,
    "total_relationships": 876,
    "total_communities": 8,
    "total_collections": 3
}
```

**Example:**
```python
stats = client.stats()
print(f"Knowledge base: {stats['total_documents']} docs, "
      f"{stats['total_entities']} entities, "
      f"{stats['total_relationships']} relationships")
```

---

### `upload(file_path, collection_id=None) -> dict`

Upload a document for processing. Cortex extracts text, chunks it, generates embeddings, and builds knowledge graph entities/relationships.

**Parameters:**

| Name            | Type           | Required | Description |
|-----------------|----------------|----------|-------------|
| `file_path`     | `str`          | Yes      | Local path to the file |
| `collection_id` | `Optional[str]`| No       | Target collection. Defaults to the system default collection |

**Supported file types:** PDF, DOCX, TXT, MD, CSV, XLSX, PPTX, HTML, JSON

**Returns:**
```python
{
    "filename": "report.pdf",
    "doc_id": "abc123-def456",
    "status": "processing",
    "message": "Document uploaded successfully",
    "collection_id": "default"
}
```

**Note:** Upload returns immediately with `status: "processing"`. The document is processed asynchronously. Poll the document status or use webhooks to know when processing completes.

**Examples:**
```python
# Basic upload
result = client.upload("report.pdf")
doc_id = result["doc_id"]
print(f"Uploaded: {doc_id}")

# Upload to a specific collection
result = client.upload("notes.md", collection_id="research_col")

# Upload multiple files
import glob
for path in glob.glob("docs/*.pdf"):
    result = client.upload(path, collection_id="batch_import")
    print(f"  {path} -> {result['doc_id']}")
```

**Polling for completion:**
```python
import time

result = client.upload("large_report.pdf")
doc_id = result["doc_id"]

# Poll until processing finishes
while True:
    docs = client.documents()
    doc = next((d for d in docs if d.get("doc_id") == doc_id), None)
    if doc and doc.get("status") == "completed":
        print(f"Done: {doc['chunk_count']} chunks, {doc['entity_count']} entities")
        break
    time.sleep(2)
```

---

### `documents() -> list`

List all documents in the library.

**Parameters:** None

**Returns:**
```python
[
    {
        "doc_id": "abc123-def456",
        "filename": "report.pdf",
        "status": "completed",        # "processing" | "completed" | "error"
        "chunk_count": 47,
        "entity_count": 23,
        "collection_id": "default",
        "uploaded_at": "2025-03-15T10:30:00Z"
    }
]
```

**Example:**
```python
docs = client.documents()

# Filter by status
completed = [d for d in docs if d["status"] == "completed"]
processing = [d for d in docs if d["status"] == "processing"]

print(f"Completed: {len(completed)}, Processing: {len(processing)}")

# Find a specific document
target = next((d for d in docs if d["filename"] == "report.pdf"), None)
```

---

### `delete_document(doc_id) -> dict`

Delete a document and its associated chunks, entities, and relationships. Orphaned entities (not referenced by any other document) are cleaned up automatically.

**Parameters:**

| Name     | Type  | Required | Description |
|----------|-------|----------|-------------|
| `doc_id` | `str` | Yes      | Document ID to delete |

**Returns:**
```python
{
    "status": "deleted",
    "orphaned_entities_removed": 5,
    "orphaned_communities_removed": 1
}
```

**Example:**
```python
result = client.delete_document("abc123-def456")
print(f"Deleted. Cleaned up {result['orphaned_entities_removed']} orphaned entities.")
```

---

### `search(query, top_k=10, collection_id=None) -> list`

Hybrid search combining vector similarity, keyword matching, and knowledge graph traversal.

**Parameters:**

| Name            | Type           | Required | Default | Description |
|-----------------|----------------|----------|---------|-------------|
| `query`         | `str`          | Yes      |         | Natural language search query |
| `top_k`         | `int`          | No       | `10`    | Maximum number of results to return |
| `collection_id` | `Optional[str]`| No       | `None`  | Restrict search to a specific collection |

**Returns:**
```python
[
    {
        "content": "The quarterly revenue increased by 15%...",
        "document_id": "abc123-def456",
        "chunk_id": "chunk_042",
        "score": 0.92,
        "metadata": {
            "filename": "report.pdf",
            "page": 3
        }
    }
]
```

**Examples:**
```python
# Basic search
results = client.search("quarterly revenue")
for r in results:
    print(f"[{r['score']:.2f}] {r['content'][:100]}...")

# Scoped search within a collection
results = client.search("deployment architecture", top_k=5, collection_id="engineering")

# Use search results as context for an external LLM
context = "\n\n".join([r["content"] for r in results[:3]])
prompt = f"Based on the following context:\n{context}\n\nAnswer: What was the revenue?"
```

---

### `ask(question, use_graph=True, collection_id=None) -> dict`

Ask a question and receive a synthesized answer with source citations. This is the RAG (Retrieval Augmented Generation) endpoint.

**Parameters:**

| Name            | Type           | Required | Default | Description |
|-----------------|----------------|----------|---------|-------------|
| `question`      | `str`          | Yes      |         | Natural language question |
| `use_graph`     | `bool`         | No       | `True`  | Whether to include knowledge graph context in the answer |
| `collection_id` | `Optional[str]`| No       | `None`  | Restrict to a specific collection |

**Returns:**
```python
{
    "answer": "The quarterly revenue increased by 15%, driven primarily by...",
    "sources": [
        {
            "document_id": "abc123",
            "chunk_id": "chunk_042",
            "content": "Revenue figures for Q3...",
            "score": 0.92
        }
    ],
    "graph_context": {
        "entities": ["Q3 Revenue", "Growth Rate"],
        "relationships": [
            {"source": "Q3 Revenue", "target": "Growth Rate", "type": "MEASURED_BY"}
        ]
    }
}
```

**Examples:**
```python
# Basic question
result = client.ask("What were the key findings in the Q3 report?")
print(result["answer"])
print(f"Based on {len(result['sources'])} sources")

# Without graph context (faster, but less comprehensive)
result = client.ask("What is the deployment architecture?", use_graph=False)

# Collection-scoped question
result = client.ask(
    "What are the known risks?",
    collection_id="risk_assessments"
)

# Access source citations
for source in result["sources"]:
    print(f"  Source: {source['document_id']} (score: {source['score']:.2f})")
    print(f"  Content: {source['content'][:150]}...")
```

---

### `ask_stream(question, **kwargs) -> Generator[dict, None, None]`

Stream an answer token by token using Server-Sent Events. Ideal for real-time UIs.

**Parameters:**

| Name       | Type   | Required | Description |
|------------|--------|----------|-------------|
| `question` | `str`  | Yes      | Natural language question |
| `**kwargs` | varies | No       | Additional parameters: `use_graph` (bool), `collection_id` (str), `mode` (str) |

**Yields:** A sequence of event dicts with varying shapes by `type`:

| Event Type   | Fields                  | Description |
|--------------|-------------------------|-------------|
| `"token"`    | `content: str`          | A fragment of the answer text |
| `"source"`   | `document_id`, `chunk_id`, `score` | A source citation |
| `"reasoning"`| `content: str`          | A reasoning/thinking step (if `STREAM_REASONING_STEPS=true`) |
| `"done"`     | `full_answer: str`      | Final event with the complete answer |
| `"error"`    | `message: str`          | An error occurred during generation |

**Examples:**
```python
# Print tokens as they arrive
for event in client.ask_stream("Summarize the architecture", use_graph=True):
    if event["type"] == "token":
        print(event["content"], end="", flush=True)
    elif event["type"] == "source":
        pass  # Collect sources silently
    elif event["type"] == "done":
        print("\n--- Done ---")

# Collect the full response and sources
full_answer = ""
sources = []
for event in client.ask_stream("What happened in Q3?"):
    if event["type"] == "token":
        full_answer += event["content"]
    elif event["type"] == "source":
        sources.append(event)
    elif event["type"] == "error":
        raise RuntimeError(f"Stream error: {event['message']}")

print(full_answer)
print(f"Sources: {len(sources)}")

# Use mode parameter for different response styles
for event in client.ask_stream("Analyze the data", mode="deep_research"):
    if event["type"] == "token":
        print(event["content"], end="", flush=True)
```

---

### `collections() -> list`

List all collections.

**Parameters:** None

**Returns:**
```python
[
    {
        "id": "col_abc123",
        "name": "Engineering Docs",
        "description": "Technical documentation",
        "document_count": 15
    }
]
```

---

### `create_collection(name, description="") -> dict`

Create a new collection for organizing documents.

**Parameters:**

| Name          | Type  | Required | Default | Description |
|---------------|-------|----------|---------|-------------|
| `name`        | `str` | Yes      |         | Collection name |
| `description` | `str` | No       | `""`    | Human-readable description |

**Returns:**
```python
{
    "id": "col_abc123",
    "name": "Engineering Docs",
    "description": "Technical documentation"
}
```

**Example:**
```python
# Create a collection, then upload documents into it
col = client.create_collection("Q3 Reports", description="All Q3 2025 financial reports")
client.upload("q3_revenue.pdf", collection_id=col["id"])
client.upload("q3_expenses.xlsx", collection_id=col["id"])

# List collections
for c in client.collections():
    print(f"  {c['name']} ({c['document_count']} docs)")
```

---

### `entities(entity_type=None) -> list`

List knowledge graph entities, optionally filtered by type.

**Parameters:**

| Name          | Type           | Required | Default | Description |
|---------------|----------------|----------|---------|-------------|
| `entity_type` | `Optional[str]`| No       | `None`  | Filter by entity type (e.g., "Person", "Concept", "Organization") |

**Returns:**
```python
[
    {
        "name": "Quarterly Revenue",
        "type": "Concept",
        "description": "Financial metric tracking...",
        "document_ids": ["abc123", "def456"],
        "relationship_count": 5
    }
]
```

**Example:**
```python
# List all entities
all_entities = client.entities()
print(f"Total entities: {len(all_entities)}")

# Filter by type
people = client.entities(entity_type="Person")
orgs = client.entities(entity_type="Organization")
concepts = client.entities(entity_type="Concept")

print(f"People: {len(people)}, Orgs: {len(orgs)}, Concepts: {len(concepts)}")
```

---

### `entity(name) -> dict`

Get detailed information about a specific entity, including its relationships and source documents.

**Parameters:**

| Name   | Type  | Required | Description |
|--------|-------|----------|-------------|
| `name` | `str` | Yes      | Entity name (case-sensitive) |

**Returns:**
```python
{
    "name": "Quarterly Revenue",
    "type": "Concept",
    "description": "Financial metric...",
    "properties": {},
    "relationships": [
        {
            "source": "Quarterly Revenue",
            "target": "Growth Rate",
            "type": "MEASURED_BY",
            "weight": 0.85
        }
    ],
    "documents": ["abc123", "def456"]
}
```

**Example:**
```python
# Explore an entity and its connections
entity = client.entity("Quarterly Revenue")
print(f"Type: {entity['type']}")
print(f"Found in {len(entity['documents'])} documents")

for rel in entity["relationships"]:
    print(f"  --[{rel['type']}]--> {rel['target']}")
```

---

### `graph_visualization() -> dict`

Get the full knowledge graph as nodes and edges, suitable for rendering in a visualization library (D3.js, vis.js, Cytoscape).

**Parameters:** None

**Returns:**
```python
{
    "nodes": [
        {"id": "entity_1", "label": "Quarterly Revenue", "type": "Concept", "size": 5}
    ],
    "edges": [
        {"source": "entity_1", "target": "entity_2", "label": "MEASURED_BY", "weight": 0.85}
    ]
}
```

**Example:**
```python
graph = client.graph_visualization()
print(f"Graph: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges")

# Export for D3.js
import json
with open("graph_data.json", "w") as f:
    json.dump(graph, f)
```

---

## Extended Client Methods

The SKILL.md client covers core operations. These additional methods wrap API endpoints not included in the base class.

### Bulk Delete

```python
def bulk_delete(self, doc_ids: list) -> dict:
    r = requests.post(f"{self.base_url}/api/documents/delete",
                      headers=self.headers, json={"document_ids": doc_ids})
    return r.json()
```

### Reprocess Document

```python
def reprocess(self, doc_id: str) -> dict:
    r = requests.post(f"{self.base_url}/api/documents/{doc_id}/reprocess",
                      headers=self.headers)
    return r.json()
```

### Move Documents Between Collections

```python
def move_documents(self, doc_ids: list, target_collection_id: str) -> dict:
    r = requests.post(f"{self.base_url}/api/documents/move",
                      headers=self.headers,
                      json={"document_ids": doc_ids, "target_collection_id": target_collection_id})
    return r.json()
```

### Custom Input (Q&A Pair)

```python
def add_qa(self, title: str, question: str, answer: str) -> dict:
    r = requests.post(f"{self.base_url}/api/custom-input",
                      headers=self.headers,
                      json={"type": "qa", "title": title, "question": question, "answer": answer})
    return r.json()
```

### Custom Input (Text or Markdown)

```python
def add_text(self, title: str, content: str, input_type: str = "text") -> dict:
    r = requests.post(f"{self.base_url}/api/custom-input",
                      headers=self.headers,
                      json={"type": input_type, "title": title, "content": content})
    return r.json()
```

### Community Detection

```python
def detect_communities(self, collection_id: str = None, min_size: int = None,
                       force: bool = False) -> dict:
    body = {"force_regenerate": force}
    if collection_id:
        body["collection_id"] = collection_id
    if min_size:
        body["min_community_size"] = min_size
    r = requests.post(f"{self.base_url}/api/graph/communities/detect",
                      headers=self.headers, json=body)
    return r.json()
```

### List Communities

```python
def communities(self) -> list:
    r = requests.get(f"{self.base_url}/api/graph/communities", headers=self.headers)
    return r.json()
```

### Graph Subgraph Query

```python
def subgraph(self, entity_name: str, max_depth: int = 2, limit: int = 50) -> dict:
    r = requests.post(f"{self.base_url}/api/graph/subgraph",
                      headers=self.headers,
                      json={"entity_name": entity_name, "max_depth": max_depth, "limit": limit})
    return r.json()
```

### Find Duplicate Entities

```python
def find_duplicates(self, threshold: float = 0.85, limit: int = 50) -> list:
    r = requests.get(
        f"{self.base_url}/api/entities/duplicates?threshold={threshold}&limit={limit}",
        headers=self.headers)
    return r.json()
```

### Merge Entities

```python
def merge_entities(self, canonical: str, merge: list) -> dict:
    r = requests.post(f"{self.base_url}/api/entities/merge",
                      headers=self.headers,
                      json={"canonical": canonical, "merge": merge})
    return r.json()
```

### Task Status Polling

```python
def task_status(self, task_id: str) -> dict:
    r = requests.get(f"{self.base_url}/api/tasks/{task_id}", headers=self.headers)
    return r.json()

def wait_for_task(self, task_id: str, poll_interval: float = 2.0, timeout: float = 300) -> dict:
    import time
    start = time.time()
    while time.time() - start < timeout:
        status = self.task_status(task_id)
        if status.get("status") in ("completed", "failed", "error"):
            return status
        time.sleep(poll_interval)
    raise TimeoutError(f"Task {task_id} did not complete within {timeout}s")
```

---

## Error Handling

All methods raise `requests.exceptions.HTTPError` on failure. Wrap calls for robust error handling:

```python
import requests

def safe_search(client, query, **kwargs):
    try:
        results = client.search(query, **kwargs)
        return results
    except requests.exceptions.ConnectionError:
        print("Cannot connect to Cortex. Is the server running?")
        return []
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            print("Invalid API key")
        elif e.response.status_code == 404:
            print("Collection not found")
        elif e.response.status_code == 429:
            print("Rate limited. Retry after a delay.")
        else:
            print(f"HTTP {e.response.status_code}: {e.response.text}")
        return []
```

**Common HTTP status codes:**

| Code | Meaning |
|------|---------|
| 200  | Success |
| 401  | Invalid or missing API key |
| 404  | Resource not found (document, collection, entity) |
| 413  | File too large |
| 422  | Invalid request body |
| 429  | Rate limited |
| 500  | Server error |

---

## Full Working Example: Document Pipeline

```python
from moca_client import MOCAClient
import time

client = MOCAClient("http://localhost:8000", "moca_rw_your_key_here")

# 1. Verify server health
health = client.health()
assert health["status"] == "healthy", "Server not healthy"

# 2. Create a collection
col = client.create_collection("Project Alpha", description="All Project Alpha docs")

# 3. Upload documents
files = ["architecture.pdf", "requirements.docx", "meeting_notes.md"]
doc_ids = []
for f in files:
    result = client.upload(f, collection_id=col["id"])
    doc_ids.append(result["doc_id"])
    print(f"Uploaded {f} -> {result['doc_id']}")

# 4. Wait for processing
print("Waiting for processing...")
for doc_id in doc_ids:
    while True:
        docs = client.documents()
        doc = next((d for d in docs if d.get("doc_id") == doc_id), None)
        if doc and doc.get("status") == "completed":
            break
        time.sleep(3)
print("All documents processed.")

# 5. Search the collection
results = client.search("system architecture decisions", top_k=5, collection_id=col["id"])
for r in results:
    print(f"[{r['score']:.2f}] {r['content'][:120]}...")

# 6. Ask a question with graph context
answer = client.ask("What are the main architectural components?", collection_id=col["id"])
print(f"\nAnswer: {answer['answer']}")

# 7. Explore the knowledge graph
entities = client.entities(entity_type="Concept")
for e in entities[:10]:
    print(f"  Entity: {e['name']} ({e['type']})")

# 8. Stream a complex answer
print("\nStreaming deep research answer:")
for event in client.ask_stream(
    "Compare the requirements against the architecture and identify gaps",
    collection_id=col["id"],
    mode="deep_research"
):
    if event["type"] == "token":
        print(event["content"], end="", flush=True)
    elif event["type"] == "done":
        print()
```
