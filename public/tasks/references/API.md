# Tasks API Reference

Complete endpoint reference for background task management.

All endpoints require authentication via `X-API-Key: {API_KEY}` header with `read` permission.

---

## GET /api/tasks

List all background tasks.

**Response:**

```json
{
  "tasks": [
    {
      "task_id": "task_abc123",
      "task_type": "community_detection",
      "status": "completed",
      "progress_percent": 100,
      "message": "Detected 23 communities",
      "started_at": "2026-03-15T10:30:00Z",
      "completed_at": "2026-03-15T10:31:15Z"
    }
  ]
}
```

---

## GET /api/tasks/{task_id}

Get status and progress for a single task.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `task_id` | string | Task ID (e.g., `task_abc123`) |

**Response:**

```json
{
  "task_id": "task_abc123",
  "task_type": "relationship_analysis",
  "status": "running",
  "progress_percent": 45.0,
  "message": "Analyzing batch 195/432...",
  "started_at": "2026-03-15T10:30:00Z",
  "completed_at": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `task_id` | string | Unique task identifier |
| `task_type` | string | One of: `community_detection`, `community_summarization`, `relationship_analysis`, `document_processing` |
| `status` | string | `pending`, `running`, `completed`, `failed`, `cancelled` |
| `progress_percent` | float | Progress (0-100), not available for all task types |
| `message` | string | Human-readable status message |
| `started_at` | datetime\|null | When the task started (null until it starts) |
| `completed_at` | datetime\|null | When the task finished (null until complete) |

**Errors:**

| Status | Cause |
|--------|-------|
| 404 | Task ID not found |

---

## GET /api/tasks/{task_id}/result

Get the output of a completed task.

Returns `200` with the task-specific output (e.g., list of communities, analysis statistics) when the task is `completed`. If the task is still running, returns `202 Accepted` with the current status instead of the result — poll until you get `200`.

**Responses:**

| Status | Meaning |
|--------|---------|
| 200 | Task completed — body contains the result |
| 202 | Task still running — body contains current status, not the result |
| 404 | Task ID not found |

---

## DELETE /api/tasks/{task_id}

Cancel a running task.

**Response:**

```json
{
  "task_id": "task_abc123",
  "status": "cancelled",
  "message": "Task cancelled"
}
```

**Errors:**

| Status | Cause |
|--------|-------|
| 404 | Task ID not found |
| 400 | Task is not in a cancellable state |

---

## POST /api/tasks/cleanup

Remove completed and failed tasks older than 24 hours.

**Response:**

```json
{
  "removed": 12,
  "message": "Cleaned up 12 old tasks"
}
```
