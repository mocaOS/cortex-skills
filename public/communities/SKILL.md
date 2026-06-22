---
name: communities
description: Detects clusters of related entities in the knowledge graph using the Leiden algorithm (preferred), Louvain, or a BFS connected-components fallback, then generates LLM-powered descriptive names and summaries for each community to enrich RAG retrieval context and improve answer quality across broad or exploratory queries.
---

# Communities — Automatic Entity Clustering and Summarization

## What You Probably Got Wrong

Most users treat their knowledge graph as a flat collection of entities and relationships.
They search for individual nodes, retrieve direct neighbors, and call it a day. The problem
is that this misses the **structural signal** — groups of tightly connected entities that
represent coherent topics, projects, or domains. Community detection surfaces those clusters
automatically, and LLM summarization turns them into readable context that RAG can actually
use.

Here is what people consistently get wrong:

1. **Community detection is not instant.** It runs as a background task. If you call
   `POST /api/graph/communities/detect` and then immediately `GET /api/graph/communities`,
   you will get stale results. Poll the task endpoint until it completes.

2. **Summaries are separate from detection.** Detecting communities gives you entity clusters.
   Summaries require a second call to `/api/graph/communities/summarize`. They are decoupled
   because summarization costs LLM tokens and you may want to summarize only specific
   communities.

3. **The algorithm degrades gracefully.** Detection prefers **Leiden** (finest-grained), then
   **Louvain** — both require the Neo4j Graph Data Science (GDS) plugin. If GDS is not installed,
   the system falls back to **BFS connected components**, which produces larger, less granular
   communities. Check your Neo4j setup if results seem too coarse.

4. **MIN_COMMUNITY_SIZE filters small clusters.** Entities in communities smaller than the
   threshold are silently dropped. If you are missing entities, lower `MIN_COMMUNITY_SIZE`.

5. **MAX_COMMUNITIES caps output.** Communities beyond the limit are merged or discarded.
   For large graphs, increase this or accept that some structure is lost.

---

## Configuration

Set these environment variables before using community features:

| Variable                       | Default | Description                                      |
|--------------------------------|---------|--------------------------------------------------|
| `ENABLE_COMMUNITY_DETECTION`   | `true`  | Master switch for community detection             |
| `MIN_COMMUNITY_SIZE`           | `3`     | Minimum entities to form a community              |
| `MAX_COMMUNITIES`              | `50`    | Maximum number of communities to retain           |
| `ENABLE_GRAPH_SUMMARIZATION`   | `true`  | Allow LLM summarization of communities            |

If `ENABLE_COMMUNITY_DETECTION` is `false`, all `/api/graph/communities/*` endpoints return
`403 Forbidden`.

---

## Endpoints

### List Communities

```
GET /api/graph/communities
```

Returns all detected communities with their names, entity counts, and summary status.

```bash
curl -s http://localhost:8000/api/graph/communities \
  -H "X-API-Key: $TOKEN" | jq .
```

Response:

```json
{
  "communities": [
    {
      "id": "comm_01",
      "name": "Machine Learning Infrastructure",
      "entity_count": 12,
      "has_summary": true,
      "created_at": "2026-03-15T10:30:00Z"
    },
    {
      "id": "comm_02",
      "name": "Payment Processing Pipeline",
      "entity_count": 8,
      "has_summary": false,
      "created_at": "2026-03-15T10:30:00Z"
    }
  ],
  "total": 2
}
```

### Run Community Detection

```
POST /api/graph/communities/detect
```

Triggers community detection as a background task. Returns immediately with a `task_id`.

```bash
curl -s -X POST http://localhost:8000/api/graph/communities/detect \
  -H "X-API-Key: $TOKEN" \
  -H "Content-Type: application/json" | jq .
```

Response:

```json
{
  "task_id": "task_abc123",
  "status": "pending",
  "message": "Community detection started"
}
```

**Do not expect results immediately.** Use the task endpoints below to poll for completion.

### Get Community Details

```
GET /api/graph/communities/{id}
```

Returns full details for a single community including member entities and key relationships.

```bash
curl -s http://localhost:8000/api/graph/communities/comm_01 \
  -H "X-API-Key: $TOKEN" | jq .
```

Response:

```json
{
  "id": "comm_01",
  "name": "Machine Learning Infrastructure",
  "summary": "A cluster of entities related to ML model training, serving infrastructure, and experiment tracking systems.",
  "entities": [
    {"id": "ent_01", "name": "ModelRegistry", "type": "Service"},
    {"id": "ent_02", "name": "TrainingPipeline", "type": "Service"},
    {"id": "ent_03", "name": "FeatureStore", "type": "Service"}
  ],
  "key_relationships": [
    {"source": "TrainingPipeline", "target": "FeatureStore", "type": "READS_FROM"},
    {"source": "TrainingPipeline", "target": "ModelRegistry", "type": "PUBLISHES_TO"}
  ],
  "entity_count": 12,
  "has_summary": true
}
```

### Generate LLM Summaries

```
POST /api/graph/communities/summarize
```

Generates descriptive names and natural-language summaries for communities using the
configured LLM. You can target specific communities or summarize all of them.

```bash
# Summarize specific communities
curl -s -X POST http://localhost:8000/api/graph/communities/summarize \
  -H "X-API-Key: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "community_ids": ["comm_01", "comm_02"],
    "force_regenerate": false
  }' | jq .
```

```bash
# Summarize all communities (omit community_ids)
curl -s -X POST http://localhost:8000/api/graph/communities/summarize \
  -H "X-API-Key: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "force_regenerate": true
  }' | jq .
```

- `community_ids` (optional): Array of community IDs to summarize. Omit to summarize all.
- `force_regenerate` (optional, default `false`): If `true`, regenerates summaries even for
  communities that already have one.

Response:

```json
{
  "task_id": "task_def456",
  "status": "pending",
  "message": "Summarization started for 2 communities"
}
```

### Search Communities

```
GET /api/graph/communities/search?q={query}
```

Searches community names and summaries for the given query string.

```bash
curl -s "http://localhost:8000/api/graph/communities/search?q=machine%20learning" \
  -H "X-API-Key: $TOKEN" | jq .
```

Response:

```json
{
  "results": [
    {
      "id": "comm_01",
      "name": "Machine Learning Infrastructure",
      "summary": "A cluster of entities related to ML model training...",
      "score": 0.92
    }
  ],
  "total": 1
}
```

---

## Delete Communities

### Delete a Single Community

```bash
curl -X DELETE "{BASE_URL}/api/graph/communities/comm_01" \
  -H "X-API-Key: {API_KEY}"
```

Member entities are unlinked (their `community_id` is cleared) but **not deleted**.

### Delete All Communities

```bash
curl -X DELETE "{BASE_URL}/api/graph/communities" \
  -H "X-API-Key: {API_KEY}"
```

All communities are removed. Entities are preserved.

---

## Cleanup Orphaned Entities

After deleting documents or communities, some entities may become orphaned (not mentioned by any document). Clean them up:

```bash
curl -X POST "{BASE_URL}/api/cleanup/orphaned-entities" \
  -H "X-API-Key: {API_KEY}"
```

Response:
```json
{
  "message": "Cleanup completed",
  "orphaned_entities_removed": 42,
  "orphaned_communities_removed": 3
}
```

---

## Background Tasks

Community detection and summarization run as background tasks. For full task management (polling, cancellation, cleanup), see the [Tasks skill](../tasks/SKILL.md).

Quick reference:

```bash
# Get task status
curl "{BASE_URL}/api/tasks/{task_id}" -H "X-API-Key: {API_KEY}"

# Cancel a task
curl -X DELETE "{BASE_URL}/api/tasks/{task_id}" -H "X-API-Key: {API_KEY}"
```

---

## Typical Workflow

```bash
# 1. Trigger detection
TASK_ID=$(curl -s -X POST http://localhost:8000/api/graph/communities/detect \
  -H "X-API-Key: $TOKEN" | jq -r '.task_id')

# 2. Poll until complete
while true; do
  STATUS=$(curl -s http://localhost:8000/api/tasks/$TASK_ID \
    -H "X-API-Key: $TOKEN" | jq -r '.status')
  echo "Status: $STATUS"
  [ "$STATUS" = "completed" ] && break
  sleep 5
done

# 3. List detected communities
curl -s http://localhost:8000/api/graph/communities \
  -H "X-API-Key: $TOKEN" | jq .

# 4. Generate summaries for all communities
curl -s -X POST http://localhost:8000/api/graph/communities/summarize \
  -H "X-API-Key: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force_regenerate": false}' | jq .

# 5. Search communities to use in RAG context
curl -s "http://localhost:8000/api/graph/communities/search?q=payments" \
  -H "X-API-Key: $TOKEN" | jq .
```

---

## How Communities Improve RAG

Without communities, a RAG query like "How does our payment system work?" retrieves
individual entities and relationships. With communities, the system can include a
pre-generated summary like:

> "The Payment Processing Pipeline community encompasses 8 entities including
> PaymentGateway, FraudDetector, TransactionLedger, and SettlementService. Key
> relationships include FraudDetector screening transactions before they reach
> the TransactionLedger, and SettlementService batching confirmed transactions
> nightly."

This gives the LLM a high-level structural overview that individual entity retrievals
cannot provide.

## Skill Files

| File | Description |
|------|-------------|
| [references/API.md](references/API.md) | Complete API endpoint reference |
