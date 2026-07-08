# Supported File Formats Reference

Exhaustive list of supported file formats, processing behavior, size limits, and vision/audio configuration.

---

## Format Table

| Category      | Format      | Extensions                        | Extraction Method                          | Vision Analysis          |
|---------------|-------------|-----------------------------------|--------------------------------------------|--------------------------|
| Documents     | PDF         | `.pdf`                            | Docling with layout preservation; PyPdfium backend fallback for large/memory-constrained files (page count via pypdf) | Yes: embedded images, charts, diagrams |
| Documents     | Word        | `.docx`, `.doc`                   | Docling XML extraction                     | Yes: embedded images     |
| Documents     | PowerPoint  | `.pptx`, `.ppt`                   | Docling extraction                         | Yes: charts, diagrams, images |
| Documents     | Excel       | `.xlsx`, `.xls`                   | Docling extraction                         | Yes: embedded images     |
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

- Primary converter: Docling with layout preservation
- Large PDF handling: chunked processing via `PAGE_CHUNK_SIZE` and `MAX_PAGES_PER_CHUNK` environment variables
- Lightweight page counting via pypdf before conversion
- Fallback to PyPdfium for large files when Docling encounters memory constraints
- Embedded images extracted and analyzed when vision model is configured
- Without vision model: Docling's built-in picture-description model generates basic image descriptions (`do_picture_description=True`)
- OCR via Tesseract for scanned documents
- System dependencies required: X11 libraries, Tesseract OCR (included in Docker image)

### DOCX (Word)

- XML-based text extraction via Docling
- Basic formatting preserved
- Embedded images extracted and analyzed via vision pipeline
- Tables and structured content preserved during extraction

### PPTX (PowerPoint)

- Slide-by-slide extraction via Docling
- Charts, diagrams, and images analyzed via vision pipeline
- Speaker notes included in extraction

### XLSX (Excel)

- Cell content extracted via Docling
- Embedded images extracted and analyzed via vision pipeline
- Tabular structure preserved

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
- Image chunks stored with `chunk_index` starting at 1000 and `type: image_analysis`

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
- Image analysis runs asynchronously after text processing completes; document may show `status: "completed"` while images are still being analyzed

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
