# Automation Platforms & Event Notifications — Complete Reference

How to connect Cortex to n8n, Make.com, Zapier, and your own automation — and how to react to Cortex events without webhooks.

---

## No Outbound Webhooks — Read This First

**Cortex does not emit webhooks, and there is no `/api/webhooks` API.** An earlier version of this reference documented a webhook subscription system (`POST /api/webhooks`, signed `document.processed` events, retry behavior) — none of that exists in the backend. Do not build against it.

To react to Cortex events, **poll**. Two surfaces cover everything:

| You want to know when… | Poll |
|------------------------|------|
| A background task finished (batch processing, relationship analysis, community detection, web import, library export/import) | `GET /api/tasks/{task_id}` |
| A document finished processing | `GET /api/documents/{id}` (or filter `GET /api/documents?status=processing`) |

---

## Polling for Events

### Background Tasks

```bash
# List recent tasks
curl http://localhost:8000/api/tasks \
  -H "X-API-Key: cortex_ro_your_key"

# Poll one task
curl http://localhost:8000/api/tasks/task_abc123 \
  -H "X-API-Key: cortex_ro_your_key"
```

Task statuses: `pending`, `running`, `completed`, `failed` (with `progress` while running). Task records are persisted to Neo4j and **survive restarts**: after a redeploy, a task that existed before the restart no longer returns 404 — if it was interrupted, it reports `failed` with message "interrupted by server restart". Terminal states are kept for 7 days.

### Document Processing Completion

Upload returns the `document_id`; poll the document until it settles:

```bash
curl http://localhost:8000/api/documents/{document_id} \
  -H "X-API-Key: cortex_ro_your_key"
```

`status` moves `pending` → `processing` → `extracting` → `completed` (or `failed`, with an `error` field). A `completed` document can still be **degraded** — check `entity_count == 0` or `unembedded_chunk_count > 0` and reprocess if so.

### Polling Rules of Thumb

- Poll every 5–10 seconds with backoff; document processing takes seconds to minutes depending on size and the configured models.
- Respect `429` + `Retry-After` (burst rate limit or exhausted monthly quota — the quota's `Retry-After` runs until the next UTC month, so treat a long horizon as "stop retrying").
- A `completed` document may still have image analysis running — compare `image_progress_current` vs `image_progress_total`.

### Python Polling Example

```python
import time
import requests

BASE_URL = "http://localhost:8000"
HEADERS = {"X-API-Key": "cortex_rw_your_key"}

def upload_and_wait(path: str, timeout_s: int = 600) -> dict:
    """Upload a document and block until processing settles."""
    with open(path, "rb") as f:
        res = requests.post(f"{BASE_URL}/api/upload", headers=HEADERS,
                            files={"file": f})
    res.raise_for_status()
    doc_id = res.json()["document_id"]

    deadline = time.time() + timeout_s
    delay = 5
    while time.time() < deadline:
        doc = requests.get(f"{BASE_URL}/api/documents/{doc_id}",
                           headers=HEADERS).json()
        if doc["status"] in ("completed", "failed"):
            return doc
        time.sleep(delay)
        delay = min(delay * 1.5, 30)
    raise TimeoutError(f"Document {doc_id} did not settle in {timeout_s}s")

doc = upload_and_wait("report.pdf")
if doc["status"] == "failed":
    print("Processing failed:", doc.get("error"))
elif doc.get("entity_count") == 0 or doc.get("unembedded_chunk_count", 0) > 0:
    print("Completed but degraded — consider reprocessing")
else:
    print("Ready for queries")
```

---

## n8n Integration

n8n **Webhook trigger** nodes still work for *inbound* triggers from other systems (forms, email, GitHub) — Cortex just won't call them itself. To react to Cortex processing, use a **Schedule** trigger plus a status-poll HTTP node.

### Searching Cortex from n8n

Add an **HTTP Request** node after any trigger:

| Setting       | Value |
|---------------|-------|
| Method        | `POST` |
| URL           | `http://your-cortex-host:8000/api/search` |
| Authentication| Header Auth |
| Header Name   | `X-API-Key` |
| Header Value  | `cortex_rw_your_key` |
| Body Type     | JSON |
| Body          | See below |

**Body:**
```json
{
  "query": "={{ $json.search_term }}",
  "top_k": 5
}
```

### Asking Questions from n8n

| Setting       | Value |
|---------------|-------|
| Method        | `POST` |
| URL           | `http://your-cortex-host:8000/api/ask` |
| Authentication| Header Auth |
| Header Name   | `X-API-Key` |
| Header Value  | `cortex_rw_your_key` |
| Body Type     | JSON |

**Body:**
```json
{
  "question": "={{ $json.question }}",
  "use_graph": true
}
```

### Uploading Documents from n8n

Use the **HTTP Request** node with multipart form:

| Setting       | Value |
|---------------|-------|
| Method        | `POST` |
| URL           | `http://your-cortex-host:8000/api/upload` |
| Authentication| Header Auth |
| Header Name   | `X-API-Key` |
| Header Value  | `cortex_rw_your_key` |
| Body Type     | Form-Data/Multipart |
| Parameter Name| `file` |
| Parameter Type| File (from previous node binary data) |

### Full n8n Workflow Example: Document Processing Pipeline

```
[Webhook Trigger (from your form/app)] -> [HTTP Request: Upload to Cortex]
                       |
                       v
                  [Wait: 10s]
                       |
                       v
               [HTTP Request: Check document status]
                       |
                       v
                  [IF: status == "completed"]
                   /           \
                  Yes           No
                  |             |
                  v             v
          [HTTP Request:    [Wait: 10s]
           Search for       [Loop back to check]
           key topics]
                  |
                  v
          [Slack: Post summary to channel]
```

---

## Make.com (Integromat) Integration

Use a **Schedule** trigger (or another app's webhook module) as the scenario entry point — Cortex only appears as HTTP modules.

### Searching Cortex

Add an **HTTP > Make a request** module:

| Setting          | Value |
|------------------|-------|
| URL              | `http://your-cortex-host:8000/api/search` |
| Method           | `POST` |
| Headers          | `X-API-Key: cortex_rw_your_key` and `Content-Type: application/json` |
| Body type        | Raw |
| Content type     | JSON (application/json) |
| Request content  | See below |

**Request content:**
```json
{
  "query": "{{1.search_query}}",
  "top_k": 5
}
```

### Asking Questions

Same HTTP module setup with URL `http://your-cortex-host:8000/api/ask`:

```json
{
  "question": "{{1.question}}",
  "use_graph": true
}
```

### Make.com Scenario Example: Auto-Research Pipeline

```
[Custom Webhook (from your app)] -> [HTTP: POST /api/ask]
                         |
                         v
                   [JSON: Parse response]
                         |
                         v
                   [Router]
                    /         \
  [Has sources]              [No sources]
       |                          |
       v                          v
  [Google Sheets:            [Slack: Notify
   Log answer + sources]      "No info found"]
```

---

## Zapier Integration

Use any Zapier trigger (Gmail, Slack, Schedule, Catch Hook fed by *your* systems) — Cortex only appears as Custom Request actions.

### Action: Search Cortex

1. Add **Webhooks by Zapier > Custom Request** as an action.
2. Configure:

| Setting       | Value |
|---------------|-------|
| Method        | `POST` |
| URL           | `http://your-cortex-host:8000/api/search` |
| Data          | `{"query": "your search term", "top_k": 5}` |
| Headers       | `X-API-Key\|cortex_rw_your_key` and `Content-Type\|application/json` |

### Action: Ask Cortex

| Setting       | Value |
|---------------|-------|
| Method        | `POST` |
| URL           | `http://your-cortex-host:8000/api/ask` |
| Data          | `{"question": "your question here", "use_graph": true}` |
| Headers       | `X-API-Key\|cortex_rw_your_key` and `Content-Type\|application/json` |

### Zapier Workflow Examples

**Email-to-Knowledge Base:**
```
[Gmail: New email with label "knowledge"]
  -> [Webhooks: POST to Cortex /api/custom-input]
  -> [Slack: Confirm "Added to knowledge base"]
```

Custom input body:
```json
{
  "type": "text",
  "title": "Email: {{subject}}",
  "content": "From: {{from}}\nDate: {{date}}\n\n{{body_plain}}"
}
```

**Slack Question Bot:**
```
[Slack: New message in #ask-cortex]
  -> [Webhooks: POST to Cortex /api/ask with message text]
  -> [Slack: Reply in thread with answer]
```

**Weekly Digest:**
```
[Schedule: Every Monday at 9am]
  -> [Webhooks: POST to Cortex /api/ask "Summarize all documents uploaded this week"]
  -> [Email: Send digest to team@company.com]
```
