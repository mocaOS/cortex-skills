---
name: upload
description: Handles document ingestion and processing for Cortex. Supports uploading files in a wide range of formats (PDF, DOCX, images, audio, and more), extracting text, chunking content, generating embeddings, resolving entities, and storing everything in Neo4j. Also provides custom input creation, batch processing, bulk operations, and full document lifecycle management through a REST API.
---

# Upload — Document Ingestion and Processing

## What You Probably Got Wrong

Most integration issues with the upload system come from the same handful of mistakes:

1. **You sent JSON instead of multipart/form-data.** The upload endpoint exclusively accepts `multipart/form-data` with the file in a field named `"file"`. Sending `application/json` with a base64 body will return a 400.

2. **You assumed the document is ready immediately after upload returns.** It is not. Upload returns a document ID with status `pending` or `processing`. You must poll `GET /api/documents/{id}` until the status reaches `completed`. The processing pipeline has 9 stages and they are asynchronous.

3. **You forgot `start_processing=true`.** If you pass `start_processing=false` (or explicitly set it), the document will sit in `pending` forever until you trigger processing manually via `/api/documents/{id}/reprocess` or the batch endpoint.

4. **You tried to upload a 200 MB file.** The default max file size is 50 MB, controlled by `MAX_FILE_SIZE_MB`. If you need larger files, change the environment variable — do not try to work around it client-side.

5. **You ignored the processing status `failed`.** When extraction or chunking fails, the document status becomes `failed`. It does not retry automatically. You must call the reprocess endpoint after fixing the underlying issue (corrupt file, unsupported encoding, missing vision model for image-heavy PDFs).

6. **You expected image analysis without configuring `VISION_MODEL`.** Vision-based analysis of images and image-heavy documents only activates when the `VISION_MODEL` environment variable is set. Without it, images are either skipped or processed with basic OCR only.

---

## Supported Formats

| Category    | Formats                        |
|-------------|--------------------------------|
| Documents   | PDF, DOCX, PPTX, XLSX, TXT, MD |
| Markup      | HTML, XML, LaTeX               |
| Images      | PNG, JPG, TIFF, BMP            |
| Audio       | Supported (transcription-based)|

All formats go through the same processing pipeline after text extraction. The extraction method varies by format (e.g., PDF parsing, DOCX XML extraction, image OCR/vision, audio transcription).

---

## File Size Limits

The maximum upload size is controlled by the `MAX_FILE_SIZE_MB` environment variable. The default is **50 MB**. Files exceeding this limit are rejected at the upload boundary before any processing begins.

---

## Upload Endpoint

```
POST /api/upload
Content-Type: multipart/form-data
```

### Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | binary | Yes | The file to upload |

### Query Parameters

| Parameter          | Type    | Default | Description                                      |
|--------------------|---------|---------|--------------------------------------------------|
| `collection_id`    | string  | none    | Assign the document to a specific collection      |
| `start_processing` | boolean | `true`  | Begin processing immediately after upload         |

### Response

Returns the created document ID and metadata:

```json
{
  "document_id": "abc-123",
  "filename": "report.pdf",
  "status": "processing",
  "collection_id": "col-456",
  "created_at": "2025-01-15T10:30:00Z"
}
```

### Example: Upload a File

```bash
curl -X POST "{BASE_URL}/api/upload?collection_id=my-collection&start_processing=true" \
  -H "Authorization: Bearer {API_KEY}" \
  -F "file=@/path/to/document.pdf"
```

---

## Processing Pipeline

Every document passes through a 9-step pipeline after upload:

```
Upload → Text Extraction → Chunking → Embedding → Entity Extraction
  → Semantic Resolution → Neo4j Storage → Ready
```

The full sequence:

1. **Upload** — File is received and stored. Status: `pending`.
2. **Text Extraction** — Raw text is pulled from the file using format-specific extractors. Status: `processing`.
3. **Chunking** — Text is split into chunks. Status: `processing`.
4. **Embedding** — Vector embeddings are generated for each chunk. Status: `processing`.
5. **Entity Extraction** — Named entities and concepts are identified. Status: `extracting`.
6. **Semantic Resolution** — Entities are deduplicated and resolved against existing graph data. Status: `extracting`.
7. **Neo4j Storage** — Resolved entities, relationships, and chunks are persisted to the knowledge graph. Status: `extracting`.
8. **Indexing** — Embeddings are indexed for retrieval. Status: `extracting`.
9. **Ready** — Document is fully processed. Status: `completed`.

### Processing Statuses

| Status       | Meaning                                          |
|--------------|--------------------------------------------------|
| `pending`    | Uploaded but processing has not started           |
| `processing` | Text extraction, chunking, or embedding underway  |
| `extracting` | Entity extraction and graph operations underway   |
| `completed`  | Fully processed and available for queries          |
| `failed`     | Processing failed — requires manual reprocessing  |

### Example: Check Processing Status

```bash
curl -X GET "{BASE_URL}/api/documents/abc-123" \
  -H "Authorization: Bearer {API_KEY}"
```

Response:

```json
{
  "id": "abc-123",
  "filename": "report.pdf",
  "status": "completed",
  "chunk_count": 47,
  "entity_count": 23,
  "collection_id": "my-collection",
  "created_at": "2025-01-15T10:30:00Z",
  "processed_at": "2025-01-15T10:31:12Z"
}
```

---

## Chunking Configuration

Text is split into chunks using one of two strategies:

| Strategy       | Default Size        | Description                         |
|----------------|---------------------|-------------------------------------|
| Sentence-based | 5 sentences/chunk   | Splits on sentence boundaries       |
| Word-based     | 500 words/chunk     | Splits on word count                |

Chunking preserves context by maintaining overlap between adjacent chunks. The strategy and sizes are configurable at the system level.

---

## Document Management

### List All Documents

```
GET /api/documents
```

Returns all documents with metadata (status, collection, timestamps).

### Get Document Details

```
GET /api/documents/{id}
```

Returns metadata and processing status for a single document.

### Get Document with Full Chunks

```
GET /api/documents/{id}/content
```

Returns the document metadata along with all extracted chunks and their content.

### Delete a Document

```
DELETE /api/documents/{id}
```

Deletes the document, its chunks, embeddings, and cleans up any orphaned entities and communities in the knowledge graph that were only referenced by this document.

### Bulk Delete

```
POST /api/documents/delete
Content-Type: application/json

{
  "document_ids": ["abc-123", "def-456", "ghi-789"]
}
```

Deletes multiple documents in a single request. Orphan cleanup runs for each.

### Delete All Documents

```
DELETE /api/documents
```

Removes every document and associated data. This is destructive and irreversible.

### Reprocess a Document

```
POST /api/documents/{id}/reprocess
```

Re-runs the full processing pipeline on an existing document. Useful after a `failed` status or when extraction/embedding models have been updated.

### Bulk Reprocess

```
POST /api/documents/reprocess
```

Triggers reprocessing for all documents (or those matching filter criteria).

### Move Documents Between Collections

```
POST /api/documents/move
Content-Type: application/json

{
  "document_ids": ["abc-123", "def-456"],
  "target_collection_id": "new-collection"
}
```

Moves one or more documents to a different collection without reprocessing.

---

## Batch Processing

For workflows where documents are uploaded with `start_processing=false`, or when documents are stuck in `pending`:

### List Pending Documents

```
GET /api/documents/pending
```

Returns all documents with status `pending`.

### Process All Pending

```
POST /api/documents/process-pending
```

Kicks off processing for all pending documents with controlled concurrency. The system manages parallelism internally to avoid overwhelming extraction and embedding services.

---

## Custom Inputs

Custom inputs let you ingest structured content without uploading a file. This is useful for adding Q&A pairs, curated text, or markdown content directly into the knowledge base.

### Create a Custom Input

```
POST /api/custom-input
Content-Type: application/json

{
  "input_type": "qa_pair",
  "content": "What is the refund policy?",
  "answer": "Full refund within 30 days of purchase.",
  "title": "Refund Policy",
  "collection_id": "support-docs",
  "start_processing": true
}
```

| Field              | Type    | Required | Description                                       |
|--------------------|---------|----------|---------------------------------------------------|
| `input_type`       | string  | Yes      | One of: `qa_pair`, `text`, `markdown`              |
| `content`          | string  | Yes      | The main content (or question for Q&A pairs)       |
| `answer`           | string  | No       | The answer (required when `input_type` is `qa_pair`)|
| `title`            | string  | No       | Display title for the input                        |
| `collection_id`    | string  | No       | Assign to a specific collection                    |
| `start_processing` | boolean | No       | Begin processing immediately (default: `true`)     |

### Example: Create a Custom Q&A Input

```bash
curl -X POST "{BASE_URL}/api/custom-input" \
  -H "Authorization: Bearer {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "input_type": "qa_pair",
    "content": "What regions do you operate in?",
    "answer": "We operate in North America, Europe, and APAC.",
    "title": "Operating Regions",
    "collection_id": "company-info",
    "start_processing": true
  }'
```

### Generate Topic Hint

```
POST /api/custom-input/generate-topic
```

Uses an LLM to generate a suggested topic or title for a given piece of content. Useful for auto-categorization before ingestion.

### List Custom Inputs

```
GET /api/custom-inputs
```

### Get Custom Input Details

```
GET /api/custom-inputs/{id}
```

---

## Vision and Image Analysis

When the `VISION_MODEL` environment variable is configured, the system automatically uses vision-capable models to analyze:

- Uploaded images (PNG, JPG, TIFF, BMP)
- Images embedded within PDFs and DOCX files
- Charts, diagrams, and tables in presentations (PPTX)

Without `VISION_MODEL` set, image content is processed with basic OCR only, which may miss contextual information from charts, diagrams, or handwritten content.

---

## Common Patterns

### Upload and Wait for Completion

```bash
# 1. Upload the file
RESPONSE=$(curl -s -X POST "{BASE_URL}/api/upload?start_processing=true" \
  -H "Authorization: Bearer {API_KEY}" \
  -F "file=@/path/to/document.pdf")

DOC_ID=$(echo "$RESPONSE" | jq -r '.document_id')

# 2. Poll until processing completes
while true; do
  STATUS=$(curl -s -X GET "{BASE_URL}/api/documents/$DOC_ID" \
    -H "Authorization: Bearer {API_KEY}" | jq -r '.status')

  echo "Status: $STATUS"

  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi

  sleep 2
done
```

### Bulk Upload with Deferred Processing

```bash
# Upload multiple files without processing
for file in /path/to/docs/*; do
  curl -s -X POST "{BASE_URL}/api/upload?start_processing=false&collection_id=bulk-import" \
    -H "Authorization: Bearer {API_KEY}" \
    -F "file=@$file"
done

# Kick off batch processing
curl -X POST "{BASE_URL}/api/documents/process-pending" \
  -H "Authorization: Bearer {API_KEY}"
```

---

## Error Handling

| HTTP Status | Meaning                                                  |
|-------------|----------------------------------------------------------|
| 400         | Bad request — missing file, wrong content type, invalid params |
| 413         | File exceeds `MAX_FILE_SIZE_MB`                          |
| 404         | Document ID not found                                    |
| 500         | Internal processing error — check logs                   |

When a document's processing status is `failed`, the document metadata typically includes an `error` field describing what went wrong. Always check this before calling reprocess.
