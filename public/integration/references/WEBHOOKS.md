# Webhooks and Automation Platforms — Complete Reference

> This reference complements the SKILL.md by providing detailed webhook configuration, all event types with payload schemas, retry behavior, security validation, and step-by-step integration guides for n8n, Make.com, and Zapier.

## Webhook Overview

Cortex emits webhook events when key operations complete: documents processed, entities extracted, communities detected, and errors encountered. Your application subscribes to these events by registering an HTTP endpoint that Cortex will POST to.

---

## Webhook Configuration

### Registering a Webhook Endpoint

```bash
curl -X POST http://localhost:8000/api/webhooks \
  -H "X-API-Key: moca_rw_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/webhook",
    "events": ["document.processed", "document.error", "entity.extracted"],
    "secret": "your_webhook_secret_here"
  }'
```

**Request body:**

| Field    | Type       | Required | Description |
|----------|------------|----------|-------------|
| `url`    | `string`   | Yes      | HTTPS endpoint that will receive POST requests |
| `events` | `string[]` | Yes      | List of event types to subscribe to (see below) |
| `secret` | `string`   | No       | Shared secret for HMAC signature verification |

**Response:**
```json
{
  "webhook_id": "wh_abc123",
  "url": "https://your-server.com/webhook",
  "events": ["document.processed", "document.error", "entity.extracted"],
  "status": "active",
  "created_at": "2025-03-15T10:30:00Z"
}
```

### Managing Webhooks

```bash
# List all registered webhooks
curl http://localhost:8000/api/webhooks \
  -H "X-API-Key: moca_rw_your_key"

# Delete a webhook
curl -X DELETE http://localhost:8000/api/webhooks/wh_abc123 \
  -H "X-API-Key: moca_rw_your_key"
```

---

## Event Types

### `document.processed`

Fired when a document has been fully processed: text extracted, chunks created, embeddings generated.

```json
{
  "type": "document.processed",
  "timestamp": "2025-03-15T10:35:00Z",
  "data": {
    "document_id": "abc123-def456",
    "filename": "report.pdf",
    "collection_id": "default",
    "chunk_count": 47,
    "entity_count": 23,
    "processing_time_ms": 12500
  }
}
```

### `document.error`

Fired when document processing fails.

```json
{
  "type": "document.error",
  "timestamp": "2025-03-15T10:35:00Z",
  "data": {
    "document_id": "abc123-def456",
    "filename": "corrupted.pdf",
    "collection_id": "default",
    "error": "Failed to extract text: file is encrypted",
    "stage": "text_extraction"
  }
}
```

**Possible `stage` values:** `"text_extraction"`, `"chunking"`, `"embedding"`, `"entity_extraction"`, `"graph_building"`

### `document.deleted`

Fired when a document is deleted.

```json
{
  "type": "document.deleted",
  "timestamp": "2025-03-15T10:36:00Z",
  "data": {
    "document_id": "abc123-def456",
    "filename": "report.pdf",
    "orphaned_entities_removed": 5,
    "orphaned_communities_removed": 1
  }
}
```

### `entity.extracted`

Fired when entities and relationships are extracted from a document.

```json
{
  "type": "entity.extracted",
  "timestamp": "2025-03-15T10:35:30Z",
  "data": {
    "document_id": "abc123-def456",
    "entities": [
      {"name": "Quarterly Revenue", "type": "Concept"},
      {"name": "Acme Corp", "type": "Organization"}
    ],
    "relationships": [
      {"source": "Acme Corp", "target": "Quarterly Revenue", "type": "REPORTS"}
    ],
    "entity_count": 23,
    "relationship_count": 15
  }
}
```

### `community.detected`

Fired when community detection completes.

```json
{
  "type": "community.detected",
  "timestamp": "2025-03-15T10:40:00Z",
  "data": {
    "task_id": "task_xyz789",
    "communities_found": 8,
    "collection_id": "default"
  }
}
```

### `collection.created`

Fired when a new collection is created.

```json
{
  "type": "collection.created",
  "timestamp": "2025-03-15T10:30:00Z",
  "data": {
    "collection_id": "col_abc123",
    "name": "Engineering Docs",
    "description": "Technical documentation"
  }
}
```

### `collection.deleted`

Fired when a collection is deleted.

```json
{
  "type": "collection.deleted",
  "timestamp": "2025-03-15T10:30:00Z",
  "data": {
    "collection_id": "col_abc123",
    "name": "Engineering Docs",
    "documents_affected": 15
  }
}
```

---

## Common Payload Envelope

Every webhook delivery follows this envelope structure:

```json
{
  "type": "event.type",
  "timestamp": "ISO-8601 timestamp",
  "webhook_id": "wh_abc123",
  "delivery_id": "del_unique_id",
  "data": { }
}
```

| Field          | Type     | Description |
|----------------|----------|-------------|
| `type`         | `string` | The event type identifier |
| `timestamp`    | `string` | ISO-8601 UTC timestamp of when the event occurred |
| `webhook_id`   | `string` | The registered webhook that triggered this delivery |
| `delivery_id`  | `string` | Unique ID for this delivery attempt (for idempotency) |
| `data`         | `object` | Event-specific payload (see event types above) |

---

## Signature Verification

If you provided a `secret` when registering the webhook, Cortex signs each delivery with an HMAC-SHA256 signature in the `X-Webhook-Signature` header.

### Python Verification

```python
import hmac
import hashlib
from flask import Flask, request, abort

WEBHOOK_SECRET = "your_webhook_secret_here"

app = Flask(__name__)

@app.route("/webhook", methods=["POST"])
def handle_webhook():
    # 1. Verify signature
    signature = request.headers.get("X-Webhook-Signature", "")
    body = request.get_data()
    expected = hmac.new(
        WEBHOOK_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(signature, expected):
        abort(401, "Invalid signature")

    # 2. Parse event
    event = request.json
    event_type = event["type"]
    delivery_id = event.get("delivery_id", "")

    # 3. Idempotency check (optional but recommended)
    if is_already_processed(delivery_id):
        return "", 200

    # 4. Handle event
    if event_type == "document.processed":
        doc_id = event["data"]["document_id"]
        chunk_count = event["data"]["chunk_count"]
        print(f"Document {doc_id} processed: {chunk_count} chunks")
        notify_team(doc_id)

    elif event_type == "document.error":
        doc_id = event["data"]["document_id"]
        error = event["data"]["error"]
        print(f"Document {doc_id} FAILED: {error}")
        alert_admin(doc_id, error)

    elif event_type == "entity.extracted":
        entities = event["data"]["entities"]
        print(f"Extracted {len(entities)} entities")

    mark_as_processed(delivery_id)
    return "", 200
```

### Node.js Verification

```javascript
const crypto = require("crypto");
const express = require("express");

const WEBHOOK_SECRET = "your_webhook_secret_here";
const app = express();

app.use(express.raw({ type: "application/json" }));

app.post("/webhook", (req, res) => {
  const signature = req.headers["x-webhook-signature"] || "";
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(req.body)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).send("Invalid signature");
  }

  const event = JSON.parse(req.body);
  console.log(`Received: ${event.type}`, event.data);

  res.status(200).send();
});

app.listen(3000);
```

---

## Retry Behavior

Cortex retries failed webhook deliveries with exponential backoff.

| Attempt | Delay After Failure |
|---------|---------------------|
| 1       | Immediate           |
| 2       | 30 seconds          |
| 3       | 2 minutes           |
| 4       | 10 minutes          |
| 5       | 1 hour              |

A delivery is considered **failed** if:
- The endpoint returns an HTTP status code >= 400
- The connection times out (30-second timeout per attempt)
- The endpoint is unreachable (DNS failure, connection refused)

After 5 failed attempts, the delivery is marked as permanently failed. The webhook remains active for future events.

**Your endpoint must respond with HTTP 200 within 30 seconds.** If processing takes longer, accept the webhook immediately and process asynchronously.

---

## n8n Integration

### Receiving Webhooks in n8n

1. Create a new workflow in n8n.
2. Add a **Webhook** trigger node.
3. Set the HTTP method to `POST`.
4. Copy the generated webhook URL.
5. Register it with Cortex (see Configuration above).

### Searching Cortex from n8n

Add an **HTTP Request** node after any trigger:

| Setting       | Value |
|---------------|-------|
| Method        | `POST` |
| URL           | `http://your-cortex-host:8000/api/search` |
| Authentication| Header Auth |
| Header Name   | `X-API-Key` |
| Header Value  | `moca_rw_your_key` |
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
| Header Value  | `moca_rw_your_key` |
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
| Header Value  | `moca_rw_your_key` |
| Body Type     | Form-Data/Multipart |
| Parameter Name| `file` |
| Parameter Type| File (from previous node binary data) |

### Full n8n Workflow Example: Document Processing Pipeline

```
[Webhook Trigger] -> [HTTP Request: Upload to Cortex]
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

### Receiving Webhooks

1. Create a new scenario.
2. Add a **Webhooks > Custom Webhook** module as the trigger.
3. Copy the webhook URL.
4. Register with Cortex.
5. Send a test event to define the data structure.

### Searching Cortex

Add an **HTTP > Make a request** module:

| Setting          | Value |
|------------------|-------|
| URL              | `http://your-cortex-host:8000/api/search` |
| Method           | `POST` |
| Headers          | `X-API-Key: moca_rw_your_key` and `Content-Type: application/json` |
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
[Custom Webhook] -> [HTTP: POST /api/ask]
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

### Trigger: Catch Webhook

1. Create a new Zap.
2. Select **Webhooks by Zapier > Catch Hook** as the trigger.
3. Copy the webhook URL.
4. Register with Cortex.
5. Send a test event from Cortex to map fields.

### Action: Search Cortex

1. Add **Webhooks by Zapier > Custom Request** as an action.
2. Configure:

| Setting       | Value |
|---------------|-------|
| Method        | `POST` |
| URL           | `http://your-cortex-host:8000/api/search` |
| Data          | `{"query": "your search term", "top_k": 5}` |
| Headers       | `X-API-Key\|moca_rw_your_key` and `Content-Type\|application/json` |

### Action: Ask Cortex

| Setting       | Value |
|---------------|-------|
| Method        | `POST` |
| URL           | `http://your-cortex-host:8000/api/ask` |
| Data          | `{"question": "your question here", "use_graph": true}` |
| Headers       | `X-API-Key\|moca_rw_your_key` and `Content-Type\|application/json` |

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

---

## Python Webhook Receiver — Production Example

A complete webhook receiver with signature verification, idempotency, async processing, and logging.

```python
import hmac
import hashlib
import json
import logging
from datetime import datetime
from flask import Flask, request, abort, jsonify
from threading import Thread

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cortex_webhook")

WEBHOOK_SECRET = "your_webhook_secret_here"
processed_deliveries = set()  # In production, use Redis or a database

app = Flask(__name__)


def verify_signature(body: bytes, signature: str) -> bool:
    if not WEBHOOK_SECRET:
        return True  # No secret configured, skip verification
    expected = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


def process_event_async(event: dict):
    """Process the event in a background thread."""
    event_type = event["type"]
    data = event["data"]

    if event_type == "document.processed":
        logger.info(
            f"Document processed: {data['filename']} "
            f"({data['chunk_count']} chunks, {data['entity_count']} entities, "
            f"{data['processing_time_ms']}ms)"
        )
        # Trigger downstream actions: update dashboard, notify users, etc.

    elif event_type == "document.error":
        logger.error(
            f"Document failed: {data['filename']} "
            f"at stage {data['stage']}: {data['error']}"
        )
        # Alert admin, retry, or quarantine the document

    elif event_type == "entity.extracted":
        entity_names = [e["name"] for e in data["entities"]]
        logger.info(
            f"Entities extracted from {data['document_id']}: {entity_names}"
        )

    elif event_type == "community.detected":
        logger.info(
            f"Community detection complete: {data['communities_found']} communities"
        )

    elif event_type == "document.deleted":
        logger.info(
            f"Document deleted: {data['filename']}, "
            f"cleaned up {data['orphaned_entities_removed']} orphaned entities"
        )

    else:
        logger.warning(f"Unhandled event type: {event_type}")


@app.route("/webhook", methods=["POST"])
def webhook_handler():
    # 1. Verify signature
    signature = request.headers.get("X-Webhook-Signature", "")
    body = request.get_data()
    if not verify_signature(body, signature):
        logger.warning("Invalid webhook signature")
        abort(401)

    # 2. Parse payload
    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        abort(400)

    # 3. Idempotency check
    delivery_id = event.get("delivery_id", "")
    if delivery_id in processed_deliveries:
        logger.debug(f"Duplicate delivery: {delivery_id}")
        return "", 200

    # 4. Acknowledge immediately, process asynchronously
    logger.info(f"Received event: {event['type']} (delivery: {delivery_id})")
    processed_deliveries.add(delivery_id)

    thread = Thread(target=process_event_async, args=(event,))
    thread.start()

    return "", 200


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "processed": len(processed_deliveries)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Webhooks never arrive | Endpoint not reachable from Cortex server | Ensure the URL is accessible (not localhost if Cortex runs elsewhere). Use ngrok for local development. |
| 401 signature errors | Secret mismatch | Verify the `secret` matches between registration and your verification code |
| Duplicate events received | Retry after slow response | Return HTTP 200 within 30 seconds. Process asynchronously. |
| Events arrive out of order | Network/retry timing | Use `timestamp` field to sort. Design handlers to be idempotent. |
| Missing events | Not subscribed to that event type | Check registered `events` list. Re-register with the missing types. |
