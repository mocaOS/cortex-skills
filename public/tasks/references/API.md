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
      "created_at": "2026-03-15T10:30:00Z",
      "updated_at": "2026-03-15T10:31:15Z"
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
  "created_at": "2026-03-15T10:30:00Z",
  "updated_at": "2026-03-15T10:35:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `task_id` | string | Unique task identifier |
| `task_type` | string | One of: `community_detection`, `community_summarization`, `relationship_analysis`, `document_processing` |
| `status` | string | `pending`, `running`, `completed`, `failed`, `cancelled` |
| `progress_percent` | float | Progress (0-100), not available for all task types |
| `message` | string | Human-readable status message |
| `created_at` | datetime | Task creation timestamp |
| `updated_at` | datetime | Last status update |

**Errors:**

| Status | Cause |
|--------|-------|
| 404 | Task ID not found |

---

## GET /api/tasks/{task_id}/result

Get the output of a completed task.

Only available when `status` is `completed`. Returns task-specific output (e.g., list of communities, analysis statistics).

**Errors:**

| Status | Cause |
|--------|-------|
| 404 | Task ID not found |
| 400 | Task is not in `completed` status |

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
