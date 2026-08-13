# Supported File Formats Reference

Exhaustive list of supported file formats, processing behavior, size limits, and vision/audio configuration.

---

## Performance Profile — Choose the Source Format

Since August 2026, conversion runs through two engines: **anydoc** (in-process,
no ML — office formats and text-based PDFs in milliseconds regardless of page
count) with automatic fallback to **Docling** (per-page ML layout analysis +
OCR) for everything the fast path can't do justice: scanned PDFs, image-rich
PDFs when a vision model is active, standalone images, audio, HTML, LaTeX.

| Cost tier | Formats | Cost |
|-----------|---------|------|
| Instant (no conversion) | `.md`, `.txt`, code files | Ingested as-is |
| Fast (anydoc) | `.epub`, `.docx`, `.pptx`, `.xlsx`, text-based `.pdf` | Milliseconds per document, independent of page count — a 462-page book ≈ 0.5 s |
| Fast (native parsing) | `.html`, `.tex` | Seconds per document |
| Expensive (per-page ML) | Scanned or image-rich `.pdf` | Docling layout analysis ~1 s/page on CPU, plus OCR for scans |
| Most expensive | Standalone images | Per-image vision-model calls |

A PDF is routed to the expensive tier automatically when it has no usable text
layer (scan), when its text yield is suspiciously low (hybrid scan), or — with
a vision model active — when it carries more embedded images per page than
`ANYDOC_PDF_MAX_IMAGES_PER_PAGE` (default 0.5), so its figures still reach
vision analysis. On instances older than August 2026, ALL PDFs run per-page ML
(~1 s/page; a 400-page book can hit the conversion timeout).

**Agent rule: upload the source format, not a rendering of it.** Text PDFs are
fast now, but source formats still win on fidelity: native markup preserves
real structure (headings, lists, tables), and office-format embedded images
flow into vision analysis on the fast path while text-PDF images do not
(anydoc cannot extract images from PDFs). Books → EPUB (convert
`.mobi`/`.azw` with `ebook-convert`); Office content → the office file, not an
"Export as PDF"; web pages → Web Import or HTML/Markdown, not print-to-PDF.
Reserve PDF for content that only exists as PDF.

---

## Format Table

| Category      | Format      | Extensions                        | Extraction Method                          | Vision Analysis          |
|---------------|-------------|-----------------------------------|--------------------------------------------|--------------------------|
| Documents     | PDF         | `.pdf`                            | anydoc text extraction (milliseconds) for text-based PDFs; Docling with layout preservation + OCR for scanned/image-rich PDFs (automatic routing; PyPdfium backend fallback for large files) | Docling path only: embedded images, charts, diagrams. Text PDFs on the fast path yield no images |
| Documents     | EPUB        | `.epub`                           | anydoc native parsing — milliseconds for a full book. **Preferred over PDF for books** (cleaner structure, images preserved). | Yes: embedded images     |
| Documents     | Word        | `.docx`, `.doc`                   | anydoc extraction (milliseconds)           | Yes: embedded images     |
| Documents     | PowerPoint  | `.pptx`, `.ppt`                   | anydoc extraction (milliseconds)           | Yes: charts, diagrams, images |
| Documents     | Excel       | `.xlsx`, `.xls`                   | anydoc extraction (milliseconds)           | Yes: embedded images     |
| Documents     | Plain Text  | `.txt`                            | Direct text ingestion                      | N/A                      |
| Documents     | Markdown    | `.md`, `.mdx`, `.markdown`        | Direct ingestion; preserves headers, code blocks, formatting | N/A                      |
| Documents     | reStructuredText | `.rst`                       | Text extraction                            | N/A                      |
| Markup        | HTML        | `.html`, `.htm`                   | Text extraction with tag stripping         | N/A                      |
| Markup        | XML         | `.xml`                            | Text extraction                            | N/A                      |
| Markup        | LaTeX       | `.tex`, `.latex`                  | Text extraction                            | N/A                      |
| Images        | PNG         | `.png`                            | Vision model or OCR                        | Yes (primary content)    |
| Images        | JPEG        | `.jpg`, `.jpeg`                   | Vision model or OCR                        | Yes (primary content)    |
| Images        | TIFF        | `.tiff`, `.tif`                   | Vision model or OCR                        | Yes (primary content)    |
| Images        | BMP         | `.bmp`                            | Vision model or OCR                        | Yes (primary content)    |
| Audio         | Audio (ASR) | `.wav`, `.mp3`, `.webvtt`, `.vtt` | Transcription-based extraction             | N/A                      |

---

## Size Limits

| Constraint              | Default     | Environment Variable    | Notes                                          |
|-------------------------|-------------|-------------------------|-------------------------------------------------|
| Max file size           | 50 MB       | `MAX_FILE_SIZE_MB`      | Files exceeding this are rejected before processing |
| Upload body size limit  | 100 MB      | (server config)         | Nginx/reverse proxy body size limit             |
| Max total documents     | Unlimited   | `MAX_FILES`             | Set to 0 for unlimited; returns 403 when exceeded |
| Vision image size       | ~20 MB      | (provider limit)        | Per-image limit for vision API calls            |

---

## Processing Behavior by Format

### PDF

- **Text-based PDFs**: anydoc fast path — text-layer extraction with structure
  inference (headings from font metrics, reading order, tables), milliseconds
  regardless of page count. No images are extracted on this path (anydoc has
  no document model for PDFs).
- **Scanned / hybrid / image-rich PDFs**: automatically routed to Docling —
  layout preservation, table structure, and figure extraction. A PDF lands
  here on a typed "OCR required" refusal, low text yield per page, or (vision
  model active) embedded-image density above `ANYDOC_PDF_MAX_IMAGES_PER_PAGE`.
- **Scanned PDFs on vision-enabled instances**: if the Docling pass returns
  neither text nor images, the conversion retries once with OCR forced on
  (EasyOCR, English + German) — scans yield their text instead of failing as
  "No content extracted".
- Large PDF handling on the Docling path: chunked processing via
  `PAGE_CHUNK_SIZE` / `MAX_PAGES_PER_CHUNK`; PyPdfium backend fallback for
  large files; page counting via pypdf.
- If a specific PDF converted badly on the fast path (or its incidental images
  matter), force a full Docling run: `POST /api/documents/{id}/reprocess?engine=docling`.

### EPUB (E-books)

- Parsed natively by anydoc — no layout model, no OCR; a full book converts in
  milliseconds, embedded images preserved for vision analysis
- Cleaner output than PDF: real chapter headings and structure from the markup, not reconstructed layout
- **Agent guidance: when a human wants to import a book, prefer the EPUB over
  the PDF (better structure and image handling — though text PDFs also convert
  in under a second now). If only a Kindle file (`.mobi`, `.azw`, `.azw3`) is
  available, convert it to EPUB first (`ebook-convert book.mobi book.epub`,
  from Calibre) — Kindle formats are rejected with HTTP 400.**

### DOCX (Word)

- anydoc extraction (milliseconds), structure preserved
- Embedded images extracted and analyzed via vision pipeline
- Tables and structured content preserved during extraction

### PPTX (PowerPoint)

- Slide-by-slide extraction via anydoc (milliseconds)
- Charts, diagrams, and images analyzed via vision pipeline
- Speaker notes included in extraction

### XLSX (Excel)

- Cell content extracted via anydoc (milliseconds)
- Embedded images extracted and analyzed via vision pipeline
- Tabular structure preserved (merged cells, header rows)

### TXT (Plain Text)

- Direct ingestion with no conversion step
- UTF-8 encoding expected; unsupported encodings cause `failed` status

### MD (Markdown)

- Direct ingestion preserving all formatting
- Headers, code blocks, tables, and links preserved
- Rendered in in-app viewer when accessed

### HTML

- Tag stripping with text extraction
- Structural elements (headers, lists, tables) preserved as text

### XML

- Text content extracted from element values

### LaTeX

- Text extraction from LaTeX source
- Math environments and commands processed

### Images (PNG, JPG, TIFF, BMP)

- When `VISION_MODEL` is configured: full vision model analysis (object identification, OCR, chart interpretation, context understanding)
- When `VISION_MODEL` is not set: Docling's built-in picture-description model, or basic OCR via EasyOCR/Tesseract
- Image chunks stored with `type: image_analysis` and id `{document_id}_image_{index}`; `chunk_index` starts at 1,000,000 (documents processed before August 2026 used 1000+ — identify image chunks by id/type, never by index)

### Audio

- Transcription-based extraction
- Transcribed text goes through the standard chunking/embedding pipeline

---

## Vision Model Configuration

Image analysis activates only when `VISION_MODEL` is set. Without it, images use Docling's built-in picture-description model or basic OCR.

| Variable                  | Required | Default              | Description                                       |
|---------------------------|----------|----------------------|---------------------------------------------------|
| `VISION_MODEL`            | No       | (none)               | Vision model name (e.g., `gpt-4o`, `claude-3-5-sonnet-20241022`, `llava`) |
| `VISION_MODEL_API_BASE`   | No       | `OPENAI_API_BASE`    | API endpoint for vision model                     |
| `VISION_MODEL_API_KEY`    | No       | `OPENAI_API_KEY`     | API key for vision model                          |
| `VISION_MAX_CONCURRENT`   | No       | `2`                  | Max concurrent vision API calls system-wide       |

### Supported Vision Providers

| Provider     | Model                          | Config Example                          | Cost per Image     |
|--------------|--------------------------------|-----------------------------------------|--------------------|
| OpenAI       | GPT-4o                         | `VISION_MODEL=gpt-4o`                   | ~$0.01-0.03        |
| Anthropic    | Claude 3.5 Sonnet              | `VISION_MODEL=claude-3-5-sonnet-20241022` | ~$0.003-0.015    |
| Local/Ollama | LLaVA                          | `VISION_MODEL=llava` + Ollama base URL  | Free (requires GPU)|
| Custom       | Any OpenAI-compatible          | `VISION_MODEL=your-model-name`          | Varies             |

### Image Analysis Fallback Chain

1. **Vision model** (if `VISION_MODEL` is configured) -- detailed analysis with object identification, OCR, chart/diagram interpretation
2. **Docling's built-in picture-description model** (always available) -- basic image classification and simple descriptions, generated during conversion via `do_picture_description=True`
3. **Basic metadata** -- page number and caption only

### Performance

- Each image adds 2-5 seconds processing time (depends on vision model latency)
- Images within a document are processed concurrently via `asyncio.gather`
- Concurrency controlled by `VISION_MAX_CONCURRENT` (default 2, system-wide semaphore)
- Thread pool sizes scale automatically with `VISION_MAX_CONCURRENT`
- The default of 2 is deliberate: each in-flight image spawns a multi-call chain, and ~20 concurrent slots per provider key is the binding limit (not RPM) — raising this saturates the key's slots rather than speeding things up
- Image analysis runs asynchronously after text processing completes; document may show `processing_status: "completed"` while images are still being analyzed

---

## Audio Model Configuration

Audio files are processed via transcription. The transcribed text then enters the standard chunking, embedding, and entity extraction pipeline. Audio transcription model configuration follows the primary LLM configuration unless separately specified.

---

## Chunking Configuration

All formats go through the same chunking pipeline after text extraction.

| Variable              | Default     | Description                                     |
|-----------------------|-------------|-------------------------------------------------|
| `CHUNK_BY`            | `sentence`  | Strategy: `sentence` or `token`                 |
| `SENTENCES_PER_CHUNK` | `5`         | Sentences per chunk (sentence strategy)         |
| `CHUNK_SIZE`          | `500`       | Tokens per chunk (token strategy)               |
| `CHUNK_OVERLAP`       | `50`        | Overlap tokens between adjacent chunks          |

Chunking preserves context by maintaining overlap between adjacent chunks. The strategy and sizes are configurable at the system level.

---

## Embedding Configuration

Embeddings are generated for every chunk regardless of source format.

| Variable                    | Default                          | Description                                    |
|-----------------------------|----------------------------------|------------------------------------------------|
| `EMBEDDING_MODEL`           | `openai/text-embedding-3-small`  | Embedding model identifier                     |
| `EMBEDDING_DIMENSION`       | `1536`                           | Embedding vector dimensions                    |
| `EMBEDDING_SEND_DIMENSIONS` | `true`                           | Send `dimensions` param to API; set `false` for fixed-dim models |
| `EMBEDDING_API_BASE`        | `OPENAI_API_BASE`                | API endpoint for embeddings                    |
| `EMBEDDING_API_KEY`         | `OPENAI_API_KEY`                 | API key for embeddings                         |
