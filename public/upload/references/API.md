# Upload API Reference

Complete endpoint reference for document ingestion, management, and custom inputs.

All endpoints require authentication via `X-API-Key: {API_KEY}` header.

---

## Upload File

```
POST /api/upload
Content-Type: multipart/form-data
```

### Form Fields

| Field  | Type   | Required | Description        |
|--------|--------|----------|--------------------|
| `file` | binary | Yes      | The file to upload |

### Query Parameters

| Parameter          | Type    | Default | Description                                 |
|--------------------|---------|---------|---------------------------------------------|
| `collection_id`    | string  | none    | Assign the document to a collection         |
| `start_processing` | boolean | `true`  | Begin processing immediately after upload   |

`collection_id` and `start_processing` are query parameters, not form fields. Sending them as form data will not work.

### Response `200`

```json
{
  "filename": "document.pdf",
  "doc_id": "doc_abc123",
  "status": "processing",
  "message": "Document uploaded and processing started",
  "collection_id": "default"
}
```

When `start_processing=false`, status will be `pending` instead of `processing`.

### Errors

| Status | Cause                                                        |
|--------|--------------------------------------------------------------|
| 400    | Missing `file` field, wrong content type (must be multipart/form-data), invalid parameters |
| 403    | `MAX_FILES` limit exceeded                                   |
| 413    | File exceeds `MAX_FILE_SIZE_MB` (default 50 MB)              |
| 500    | Internal error during file storage                           |

---

## List All Documents

```
GET /api/documents
```

### Response `200`

Array of document objects with metadata, status, collection assignment, and timestamps.

---

## Get Document Details

```
GET /api/documents/{id}
```

### Response `200`

```json
{
  "id": "doc_abc123",
  "filename": "document.pdf",
  "status": "completed",
  "chunk_count": 42,
  "entity_count": 18,
  "created_at": "2025-01-15T10:30:00Z",
  "processed_at": "2025-01-15T10:32:15Z",
  "collection_id": "default",
  "image_progress_current": 67,
  "image_progress_total": 67,
  "image_progress_message": "Analyzed 67/67 images"
}
```

A document with `status: "completed"` may still have background image analysis running. Check `image_progress_current` vs `image_progress_total` to determine if image processing is finished.

### Errors

| Status | Cause                  |
|--------|------------------------|
| 404    | Document ID not found  |

---

## Get Document Content (Chunks)

```
GET /api/documents/{id}/content
```

Returns document metadata plus all extracted chunks and their text content.

### Errors

| Status | Cause                  |
|--------|------------------------|
| 404    | Document ID not found  |

---

## Get Original File

```
GET /api/documents/{id}/file
```

Returns the original uploaded file with the appropriate `Content-Type` header. The browser will render or download depending on format.

### Errors

| Status | Cause                           |
|--------|---------------------------------|
| 404    | Document ID or file not found   |

---

## Delete a Document

```
DELETE /api/documents/{id}
```

Deletes the document, its chunks, embeddings, and cleans up orphaned entities and communities. Cancels any active processing task before deletion.

### Response `200`

```json
{
  "message": "Document deleted successfully",
  "processing_cancelled": true,
  "orphaned_entities_removed": 15,
  "orphaned_communities_removed": 2
}
```

### Errors

| Status | Cause                  |
|--------|------------------------|
| 404    | Document ID not found  |

---

## Delete All Documents

```
DELETE /api/documents
```

Removes every document and all associated data (chunks, entities, relationships, communities, merge history, system metadata). Cancels all active processing tasks. Destructive and irreversible.

---

## Bulk Delete

```
POST /api/documents/delete
Content-Type: application/json
```

### Request Body

```json
{
  "document_ids": ["doc_abc123", "doc_def456", "doc_ghi789"]
}
```

### Response `200`

```json
{
  "message": "Successfully deleted 2 document(s)",
  "deleted_count": 2,
  "processing_cancelled": 1,
  "orphaned_entities_removed": 28,
  "orphaned_communities_removed": 3
}
```

---

## Bulk Download (ZIP)

```
POST /api/documents/download-zip
Content-Type: application/json
```

### Request Body

```json
{
  "document_ids": ["doc_abc123", "doc_def456"]
}
```

### Response

Streamed `application/zip` containing the original uploaded files. Supports ZIP64 for large collections (1000+ documents). Duplicate filenames are disambiguated automatically (e.g., `report.pdf`, `report (1).pdf`).

---

## Reprocess a Document

```
POST /api/documents/{id}/reprocess
```

Re-runs the full processing pipeline on an existing document. Use after a `failed` status, or when extraction/embedding models have been updated.

### Errors

| Status | Cause                  |
|--------|------------------------|
| 404    | Document ID not found  |

---

## Bulk Reprocess

```
POST /api/documents/reprocess
```

Triggers reprocessing for all documents (or those matching filter criteria).

---

## List Pending Documents

```
GET /api/documents/pending
```

Returns all documents with status `pending` (uploaded with `start_processing=false` or otherwise not yet processed).

---

## Process All Pending

```
POST /api/documents/process-pending
```

Starts processing for all pending documents with controlled concurrency managed by `BATCH_PROCESSING_CONCURRENCY`. The system handles parallelism internally.

---

## Move Documents Between Collections

```
POST /api/documents/move
Content-Type: application/json
```

### Request Body

```json
{
  "document_ids": ["doc_abc123", "doc_def456"],
  "target_collection_id": "new-collection"
}
```

Moves documents to a different collection without reprocessing.

---

## Custom Input: Create

```
POST /api/custom-input
Content-Type: application/json
```

### Request Body

```json
{
  "input_type": "qa_pair",
  "content": "What is the refund policy?",
  "answer": "Full refund within 30 days of purchase.",
  "title": "Refund Policy",
  "collection_id": "support-docs",
  "start_processing": true
}
```

### Fields

| Field              | Type    | Required | Description                                           |
|--------------------|---------|----------|-------------------------------------------------------|
| `input_type`       | string  | Yes      | One of: `qa_pair`, `text`, `markdown`                 |
| `content`          | string  | Yes      | Main content body (or question for `qa_pair`)         |
| `answer`           | string  | No       | Required when `input_type` is `qa_pair`               |
| `title`            | string  | No       | Display title                                         |
| `collection_id`    | string  | No       | Assign to a collection                                |
| `start_processing` | boolean | No       | Begin processing immediately (default: `true`)        |

### Errors

| Status | Cause                                       |
|--------|---------------------------------------------|
| 400    | Missing required fields, invalid input_type |
| 403    | `MAX_FILES` limit exceeded                  |

---

## Custom Input: Generate Topic Hint

```
POST /api/custom-input/generate-topic
```

Uses an LLM to suggest a topic or title for a given piece of content. Useful for auto-categorization before ingestion.

---

## Custom Input: List

```
GET /api/custom-inputs
```

Returns all custom inputs with metadata.

---

## Custom Input: Get Details

```
GET /api/custom-inputs/{id}
```

Returns metadata and content for a single custom input.

---

## Processing Statuses

| Status       | Description                                                                    |
|--------------|--------------------------------------------------------------------------------|
| `pending`    | Uploaded but processing has not started                                        |
| `processing` | Text extraction, chunking, or embedding underway                              |
| `extracting` | Entity extraction and graph operations underway                               |
| `completed`  | Text processing done; images may still be analyzing in the background         |
| `failed`     | Processing failed; requires manual reprocessing via `/api/documents/{id}/reprocess` |

When status is `failed`, the document metadata includes an `error` field describing what went wrong.

---

## Error Code Summary

| HTTP Status | Meaning                                                                   |
|-------------|---------------------------------------------------------------------------|
| 400         | Bad request: missing file, wrong content type, invalid parameters         |
| 401         | Invalid or missing API key                                                |
| 403         | Resource limit exceeded (`MAX_FILES`, `MAX_COLLECTIONS`)                  |
| 404         | Document or resource not found                                            |
| 413         | File exceeds `MAX_FILE_SIZE_MB`                                           |
| 500         | Internal processing error                                                 |

---

## Environment Variables Affecting Upload

| Variable                        | Default     | Description                                       |
|---------------------------------|-------------|---------------------------------------------------|
| `MAX_FILE_SIZE_MB`              | `50`        | Maximum upload size in megabytes                  |
| `MAX_FILES`                     | `0`         | Cap on total documents (0 = unlimited)            |
| `UPLOAD_DIR`                    | `/app/uploads` | Server-side storage directory for uploads      |
| `CUSTOM_INPUTS_DIR`             | `/app/custom_inputs` | Storage directory for custom inputs      |
| `CHUNK_SIZE`                    | `500`       | Tokens per chunk                                  |
| `CHUNK_OVERLAP`                 | `50`        | Overlap tokens between adjacent chunks            |
| `CHUNK_BY`                      | `sentence`  | Chunking strategy: `sentence` or `token`          |
| `SENTENCES_PER_CHUNK`           | `5`         | Sentences per chunk (when `CHUNK_BY=sentence`)    |
| `BATCH_PROCESSING_CONCURRENCY`  | `2`         | Documents processed in parallel                   |
| `PROCESSING_THREAD_WORKERS`     | `4`         | Thread workers for processing                     |
| `CONCURRENT_EXTRACTIONS`        | `3`         | Entity extraction thread pool size                |
| `CONCURRENT_RELATIONS`          | `3`         | Per-chunk relationship extractions per document   |
| `VISION_MAX_CONCURRENT`         | `3`         | Max concurrent vision API calls system-wide       |
| `ENABLE_GRAPH_EXTRACTION`       | `true`      | Enable entity/relationship extraction             |
| `START_PROCESSING` (default)    | `true`      | Default for the query parameter                   |
| `PAGE_CHUNK_SIZE`               | varies      | Chunked PDF processing page count                 |
| `MAX_PAGES_PER_CHUNK`           | varies      | Max pages per processing chunk for large PDFs     |
