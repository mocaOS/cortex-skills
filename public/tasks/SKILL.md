---
name: tasks
description: Use this skill when working with background tasks in Cortex — polling for completion, cancelling long-running jobs, or cleaning up old tasks. Background tasks are used by community detection, summarization, relationship analysis, and bulk processing.
---

# Tasks — Background Jobs and Async Operations

## What You Probably Got Wrong

1. **Tasks are not created directly.** They are spawned by other operations — community detection, community summarization, cross-document relationship analysis, and bulk document processing. You poll and manage them, but you don't create them.

2. **Task results are only available when status is `completed`.** Calling `GET /api/tasks/{id}/result` on a `running` task returns nothing useful.

3. **Cancel uses DELETE, not POST.** To cancel a running task: `DELETE /api/tasks/{task_id}`.

4. **Cleanup removes old completed/failed tasks.** `POST /api/tasks/cleanup` removes tasks older than 24 hours. It does not cancel running tasks.

---

## Task Statuses

| Status | Description |
|--------|-------------|
| `pending` | Task has been queued but not yet started |
| `running` | Task is actively executing |
| `completed` | Task finished successfully — results available |
| `failed` | Task encountered an error |
| `cancelled` | Task was manually cancelled |

---

## Endpoints

### List All Tasks

```bash
curl "{BASE_URL}/api/tasks" \
  -H "X-API-Key: {API_KEY}"
```

### Get Task Status

```bash
curl "{BASE_URL}/api/tasks/{task_id}" \
  -H "X-API-Key: {API_KEY}"
```

Response:
```json
{
  "task_id": "task_abc123",
  "task_type": "community_detection",
  "status": "running",
  "progress_percent": 65,
  "message": "Analyzing graph structure...",
  "created_at": "2026-03-15T10:30:00Z",
  "updated_at": "2026-03-15T10:31:15Z"
}
```

### Get Task Result

```bash
curl "{BASE_URL}/api/tasks/{task_id}/result" \
  -H "X-API-Key: {API_KEY}"
```

Only available when status is `completed`. Returns the output of the task (e.g., the list of detected communities, relationship analysis stats).

### Cancel a Task

```bash
curl -X DELETE "{BASE_URL}/api/tasks/{task_id}" \
  -H "X-API-Key: {API_KEY}"
```

### Clean Up Old Tasks

```bash
curl -X POST "{BASE_URL}/api/tasks/cleanup" \
  -H "X-API-Key: {API_KEY}"
```

Removes completed and failed tasks older than 24 hours.

---

## Task Types

| Task Type | Spawned By | Typical Duration |
|-----------|------------|------------------|
| `community_detection` | `POST /api/graph/communities/detect` | Seconds to minutes |
| `community_summarization` | `POST /api/graph/communities/summarize` | Minutes (LLM calls per community) |
| `relationship_analysis` | `POST /api/graph/relationships/analyze` | Minutes to hours (depends on entity count) |
| `document_processing` | `POST /api/documents/process-pending` | Varies by document count and size |

---

## Polling Pattern

```bash
# 1. Trigger an operation that returns a task_id
TASK_ID=$(curl -s -X POST "{BASE_URL}/api/graph/communities/detect" \
  -H "X-API-Key: {API_KEY}" | jq -r '.task_id')

# 2. Poll until complete
while true; do
  STATUS=$(curl -s "{BASE_URL}/api/tasks/$TASK_ID" \
    -H "X-API-Key: {API_KEY}" | jq -r '.status')
  echo "Status: $STATUS"
  [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] && break
  sleep 5
done

# 3. Get the result
curl -s "{BASE_URL}/api/tasks/$TASK_ID/result" \
  -H "X-API-Key: {API_KEY}" | jq .
```

---

## Skill Files

| File | Description |
|------|-------------|
| [references/API.md](references/API.md) | Complete task API endpoint reference |
