# Platform Tasks — Declarative Step-Queue Reference

Apps ship no server code. Background work is a **JSON program** your app
submits once (`POST ./api/platform/tasks`); the Cortex instance executes it
server-side in its own async loop. Close the tab — it keeps running. Add a
`schedule` — it re-runs forever, headless. Runs interrupted by an instance
restart resume on boot.

Requires `"capabilities": { "tasks": {} }` in `app.json` (plus `"storage": {}`
for `store` steps / dedup, `"http": {...}` for http steps, `"llm": {}` for llm
steps). The template's `src/lib/platform.ts` wraps every endpoint below.

## Task shape

```jsonc
{
  "name": "my-sync",                        // 1-80 chars
  "schedule": { "everyMinutes": 60 },       // optional → recurring, headless
  "concurrency": 2,                          // item worker pool (cap: instance env, default ≤4)

  "setup": [ /* steps */ ],                  // once, sequential, before items

  // EITHER a literal item list…
  "items": [ { "vars": { "id": "42" } } ],
  // …OR a fan-out over a setup step's output:
  "items": {
    "from": "$setup.docs.items",             // must resolve to a list
    // OR "fromEach": ["$f0.items", "$f1.items"],  // several listings (e.g.
    //    one webdav step per selected folder), concatenated into one pool;
    //    a "when"-skipped listing resolves to null and is just ignored
    "vars": { "id": "{item.id}" },           // templates over each element
    "limit": 500,                            // optional
    "skipIfStored": "synced/{item.id}"       // dedup: drop elements whose key exists in storage
  },

  "steps": [ /* per-item steps, sequential */ ],
  "finally": [ /* once, after all items; skipped on pause/cancel */ ]
}
```

Semantics that matter:

- Items run through a worker pool with **per-item error isolation** — one
  failing item never aborts the run; it's marked `failed` and the rest
  continue. `retryFailed` re-queues only failed items.
- `finally` is where you persist a cursor. Guard it on
  `{"eq": ["$run.failedCount", 0]}` — otherwise failed items fall behind an
  advanced cursor and are never retried.
- A submit always starts a run immediately. Scheduled tasks then re-run every
  `everyMinutes` (instance floor: 15). Definitions are immutable — to change
  one, delete and resubmit.
- Caps (instance-tunable): items per task (default 2000), steps per section
  (50), llm calls per run (500), step output size (2 MB — put big artifacts
  in storage, not step context).

## Steps

Every step: exactly one type key, plus optional `"id"` (makes its output
referenceable) and `"when"` (condition — false skips the step, its id
resolves to null).

### `http` — external calls (capability `http`)

```jsonc
{ "id": "docs", "http": {
    "method": "GET",                         // GET|POST|PUT|PATCH|DELETE
    "url": "{config.SERVICE_BASE_URL}/api/documents/?page_size=100",
    "headers": { "X-Api-Version": "2" },     // optional; Authorization/Cookie/Host are stripped —
                                              // auth comes ONLY from config auth_header injection
                                              // (scope multi-host credentials with auth_host!)
    "body": { "any": "json or $ref" },       // optional; string or JSON
    "contentType": "application/json",       // optional
    "responseType": "json",                  // "json" | "text" (default: by content-type)
    "auth": { "bearer": "$tok.body.access_token" },  // optional: dynamic credential
                                              // minted DURING the run (OAuth refresh) —
                                              // overrides config auth for this request;
                                              // also {"basic": <ref/template>}. Config
                                              // secrets are untemplatable → can't leak.
    "paginate": {                             // optional: follow-the-next-link
      "items": "results",                    // path to the page's item list
      "next": "next",                        // path to the next-page URL (absolute)
      "maxPages": 50,                        // 1-50 (default 20)
      "keyBy": "id"                          // optional: also build a {id: element} map
    }
} }
```

Output without `paginate`: `{status, body}` (non-2xx fails the step).
With `paginate`: `{status, items: [...all pages...], pages, map?}` — `map`
(from `keyBy`) enables name joins via dynamic lookups (below). Every page is
re-checked against the manifest host allowlist + SSRF guard; secrets are
injected from config `auth_header` vars, never from your JSON.

### `webdav` — PROPFIND folder listing (capability `http`)

```jsonc
{ "id": "listing", "webdav": {
    "url": "{config.BASE_URL}/remote.php/dav/files/{config.USER}/{vars.path}",
    "depth": 1,                               // 0 | 1 | "infinity" (default 1)
    "filter": "files",                        // optional: "files" | "dirs"
    "auth": { "basic": "…" }                  // optional, as http.auth; config
                                              // auth_header vars inject as usual
} }
```

Same gates as http steps (host allowlist, SSRF guard, config auth). The
multistatus XML is parsed server-side — the DSL has no XML vocabulary —
into `{status, items, count}` where each item is `{href, name, etag,
lastModified (ISO), size, contentType, isDir, fileId?}` (`fileId` on
Nextcloud/ownCloud). The requested folder's own entry is dropped. ETags
come unquoted (`W/` stripped) — compare them directly against stored state.
Interactive folder browsers use the same PROPFIND via the platform http
envelope and parse the XML in the browser (DOMParser).

### `cortex` — instance API calls

```jsonc
{ "id": "up", "cortex": {
    "method": "POST",
    "path": "upload?start_processing=true&source=my-app",   // /api/-relative; MUST be in cortex.endpoints
    "body": { ... },                          // JSON body, OR:
    "multipart": {                            // file upload built from text
      "content": "$md.text",                 // ref/template → file contents
      "filename": "doc-{vars.id}.md",
      "field": "file",                        // default "file"
      "contentType": "text/markdown"          // default
    },
    // OR binary passthrough (capability `http`): fetch → upload, the bytes
    // never enter step context (PDFs/images/docx survive intact):
    "multipart": {
      "fromUrl": "{config.BASE_URL}/remote.php/dav/files/{config.USER}{vars.href}",
      "method": "GET",                        // GET (default) | POST
      "headers": { "Dropbox-API-Arg": "…" },  // optional, denylist-filtered
      "auth": { "bearer": "$tok.body.access_token" },  // optional, as http.auth
      "filename": "{vars.name}",
      "contentType": "application/pdf"        // default: upstream's content-type
    }
} }
```

Same allowlist as your browser calls — a task cannot reach endpoints the
manifest didn't declare. Output: `{status, body}`. The fromUrl fetch passes
the same http gates (host allowlist, SSRF guard, 20 MB cap) and fails the
step on a non-2xx fetch.

### `llm` — instance-model completions (capability `llm`)

```jsonc
{ "id": "refined", "llm": {
    "prompt": "Clean up this transcript chunk:\n\n{chunk}",
    "system": "You are an editor.",           // optional
    "input": "$t.body.transcript",            // required with chunk/validate
    "chunk": { "words": 1000 },               // optional: split input, one call per chunk
    "validate": {                              // optional output guards
      "minLengthRatio": 0.5,                  // output ≥ 50% of input length
      "minWordOverlap": 0.6,                  // output keeps ≥ 60% of input vocabulary
      "onFail": "keepOriginal"                // "keepOriginal" (retry once, then keep input) | "fail"
    },
    "maxTokens": 4000, "temperature": 0.3     // optional
} }
```

Without `chunk`: one completion, prompt fully templated → `{text}`.
With `chunk`: input split on paragraph/sentence boundaries, `{chunk}` in the
prompt is replaced per chunk, outputs validated + reassembled →
`{text, chunksTotal, chunksKeptOriginal}`. This is the safe pattern for
long-text rewriting — silent LLM truncation can't destroy content. Calls are
metered against the instance quota and capped per run.

Steps run on the instance's **extraction-tier** model (fallback: main model)
— the right tier for bulk text work. Budget `maxTokens` generously anyway:
if the instance's model reasons before answering, a tight cap can be consumed
by thinking and yield empty text.

### `store` — app storage (capability `storage`)

```jsonc
{ "id": "cursor", "store": { "get": "sync/cursor" } }        // → {found, value}
{ "store": { "put": "synced/{vars.id}", "value": { "at": "{run.startedAt}" } } }
{ "store": { "delete": "old/key" } }                          // → {ok, deleted}
{ "store": { "list": "synced/", "limit": 100 } }              // → {keys: [{key,size,updated_at}], next}
```

Keys are path-like (`[A-Za-z0-9._-/:]`, ≤512 chars). Values are JSON
(≤1 MB each, 50 MB per app by default). The same store backs the fan-out's
`skipIfStored` and your app UI via `./api/platform/storage/{key}`.

### `template` — string rendering

```jsonc
{ "id": "md", "template": {
    "lines": [                                 // OR "text": "single template string"
      "# {full.body.title}",
      "",
      { "text": "- Correspondent: {setup.names.map.{full.body.correspondent}.name}",
        "when": { "notEmpty": "$setup.names.map.{full.body.correspondent}.name" } },
      "{full.body.content}"
    ],
    "joiner": "\n"                             // default "\n"
} }
```

Output: `{text}`. Conditional lines drop cleanly — the standard way to render
metadata blocks with optional fields.

### `skipItem` — per-item guard (item steps only)

```jsonc
{ "skipItem": { "when": { "empty": "$full.body.content" },
                 "reason": "no extracted text" } }
```

Marks the item `skipped` (with the reason shown in the task detail) and stops
its remaining steps. Skipped ≠ synced: don't expect its `store` puts to have
run.

## References, templates, conditions

**Context roots:** `vars` (item vars) · `setup.<id>` (setup outputs) ·
`steps.<id>` or bare `<id>` (prior step outputs in scope) · `run`
(`taskId, runId, startedAt, index, itemsTotal, doneCount, failedCount,
skippedCount`) · `config` (NON-secret config values only — secrets are never
templatable) · `item` (fan-out element) · `chunk` (inside chunked llm
prompts).

**Refs** — `"$path.to.value"` resolves the raw value (any type):
`"$setup.docs.items"`, `"$full.body.content"`, array indexes as numeric
segments (`"$setup.docs.items.0.added"`).

**Templates** — `{path|filter|filter:arg}` interpolates into strings.
Placeholders nest for dynamic lookups: `{setup.names.map.{full.body.author}.name}`.
Escape literal braces as `{{` `}}`. Filters:

| Filter | Effect |
|---|---|
| `slug` | lowercase, non-alphanumerics → `-`, ≤60 chars (`untitled` fallback) |
| `lower` / `upper` / `trim` | the obvious |
| `ext` | lowercase file extension, no dot; `""` when none — type-filter listings without MIME types: `{"contains": [" pdf docx md ", " {vars.name\|ext} "]}` (space-padded exact match) |
| `default:X` | X when the value is null/empty |
| `urlencode` | percent-encode (use on cursor values in URLs) |
| `json` | JSON-serialize |
| `join:SEP` | join a list |
| `pluck:FIELD` | map a list of objects to one field |
| `slice:N` / `truncate:N` | first N list items / first N chars |

**Conditions** (in `when`): `{"empty": v}` `{"notEmpty": v}` `{"found": v}`
`{"eq": [a,b]}` `{"neq": [a,b]}` `{"gt": [a,b]}` `{"lt": [a,b]}`
`{"contains": [list_or_str, x]}` `{"and": [...]}` `{"or": [...]}`
`{"not": c}` — operands are refs, templates, or literals.

## Control API

```
POST   ./api/platform/tasks              submit (returns summary; runs immediately)
GET    ./api/platform/tasks              list summaries (newest first)
GET    ./api/platform/tasks/{id}         detail: counts, message, per-item statuses, runs
PATCH  ./api/platform/tasks/{id}         {"action": "pause"|"resume"|"cancel"|"retryFailed"|"runNow"}
DELETE ./api/platform/tasks/{id}         remove (cancels first if running)
```

Counts: `{total, done, failed, skipped, deduped}` (`deduped` =
`skipIfStored` drops). Submitting and every mutation require an owner or
editor token — share-link **viewers are read-only**. Validation errors come
back as `400 {"detail": {"issues": [...]}}` listing every problem at once.

## A complete real example (incremental scheduled sync)

The paperless-sync app's entire engine — cursor-incremental listing, dedup,
conditional skip, name joins, markdown, upload, cursor write:

```jsonc
{
  "name": "paperless-sync",
  "schedule": { "everyMinutes": 60 },
  "concurrency": 2,
  "setup": [
    { "id": "cursor", "store": { "get": "sync/cursor" } },
    { "id": "docs", "http": { "method": "GET",
        "url": "{config.PAPERLESS_BASE_URL}/api/documents/?ordering=-added&page_size=100&added__gt={cursor.value|default:1970-01-01T00:00:00Z|urlencode}",
        "paginate": { "items": "results", "next": "next", "maxPages": 50 } } },
    { "id": "names", "http": { "method": "GET",
        "url": "{config.PAPERLESS_BASE_URL}/api/correspondents/?page_size=100",
        "paginate": { "items": "results", "next": "next", "keyBy": "id" } } }
  ],
  "items": { "from": "$setup.docs.items",
              "vars": { "id": "{item.id}", "title": "{item.title}" },
              "skipIfStored": "synced/{item.id}" },
  "steps": [
    { "id": "full", "http": { "method": "GET",
        "url": "{config.PAPERLESS_BASE_URL}/api/documents/{vars.id}/" } },
    { "skipItem": { "when": { "empty": "$full.body.content" },
                     "reason": "no extracted text" } },
    { "id": "md", "template": { "lines": [
        "# {full.body.title}",
        "",
        { "text": "- Correspondent: {setup.names.map.{full.body.correspondent}.name}",
          "when": { "notEmpty": "$setup.names.map.{full.body.correspondent}.name" } },
        "",
        "---",
        "",
        "{full.body.content}" ] } },
    { "cortex": { "method": "POST",
        "path": "upload?start_processing=true&source=paperless-sync",
        "multipart": { "content": "$md.text",
                        "filename": "paperless-{vars.id}-{vars.title|slug}.md" } } },
    { "store": { "put": "synced/{vars.id}", "value": { "at": "{run.startedAt}" } } }
  ],
  "finally": [
    { "store": { "put": "sync/cursor", "value": "{setup.docs.items.0.added}" },
      "when": { "and": [ { "eq": ["$run.failedCount", 0] },
                          { "notEmpty": "$setup.docs.items" } ] } }
  ]
}
```

## When the DSL is not enough

No loops beyond pagination/chunking/fan-out, no arbitrary code, no binary
data in step context (binary flows only through `multipart.fromUrl`, which
streams fetch → upload server-side). Orchestration you can't express
declaratively runs client-side
when composing the item list — the *execution* is what survives the closed
tab. If your app's server logic genuinely can't fit these shapes, it's a
`type: "service"` app (own container).
