---
name: builder-skill
description: Recipe for turning ANY software's API documentation into an installable Cortex skill — a SKILL.md that teaches the Cortex research agent to call that software during Q&A. Covers the conventions the Cortex runtime rewards (config placeholders, auth headers, base URLs, pagination) and a validation checklist, with paperless-ngx as the worked example.
---

# Builder: Skill — From Docs to Installable SKILL.md

Your user gives you documentation for some software (a URL, a PDF, a repo) and
wants their Cortex instance to act on it during chat and Deep Research. Your
deliverable is **one Markdown file**. The instance installs it, an LLM wizard
extracts its config schema, the admin fills in credentials, and the research
agent starts calling the software's API through Cortex's built-in
`http_request` tool.

## What You Probably Got Wrong

1. **You wrote code.** A skill contains no code. It is instructions + API
   reference for the *research agent* (a small-to-mid LLM at runtime). The
   agent executes HTTP calls through a built-in tool; your job is to describe
   the API so precisely that a small model calls it right on the first try.

2. **You told the agent to set auth headers.** The runtime's `http_request`
   tool has **no headers parameter**. Auth is injected server-side from
   admin-configured values, scoped by hostname. Your skill *declares* auth
   via config conventions (below); it must never instruct the model to
   handle tokens. (Auth-related lines are stripped from the prompt at
   runtime anyway.)

3. **You used concrete values instead of placeholders.** URLs and bodies in
   your examples must use `{UPPER_SNAKE}` or `${UPPER_SNAKE}` placeholders
   (e.g. `{PAPERLESS_BASE_URL}/api/documents/`). The runtime substitutes
   configured values into them. Hardcoded example hosts produce calls to
   example.com in production.

4. **You made the config schema unextractable.** After install, an LLM reads
   your SKILL.md and extracts `{variables, base_url}` to build the admin's
   setup form. That model is small. Be blunt: name every variable explicitly,
   say which are required, mark the credential clearly ("API token",
   "API key"), and always include a `*_BASE_URL` variable for self-hosted
   software — it also scopes auth-header injection to the right hostname, so
   two skills never leak credentials to each other's hosts.

5. **You documented every endpoint.** Don't. Pick the 5–10 endpoints that
   answer real user questions. The runtime injects roughly 4,000 tokens
   (~16 KB) of skill instructions TOTAL across all enabled skills, truncating
   the rest — aim for ≤150 lines / ~6 KB so your skill coexists with others,
   and small models drown in options anyway.

6. **You ignored pagination.** Large responses get truncated by the runtime
   (with an explicit note telling the model to paginate). Document each list
   endpoint's pagination parameters (`?page=`, `?limit=`, cursor —
   whatever the API uses) or the agent will re-fetch giant payloads.

## The `http_request` Tool (ground truth)

The runtime tool the agent calls has exactly three parameters — design every
endpoint doc around them:

- `method` — one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`. All write
  methods are available by default; your skill's *guidance* is the only gate,
  so be explicit about confirmation etiquette.
- `url` — the full URL, composed by the model. **The runtime does not
  URL-encode anything.** If an endpoint takes queries with spaces, quotes, or
  brackets, add a guidance bullet telling the model to percent-encode them —
  small models get this wrong without the reminder.
- `body` — an optional string. For JSON APIs that means a JSON object
  serialized as a string (the `Body: {...}` convention in examples below).
  There is **no multipart/form-data support** — omit file-upload endpoints
  entirely; for getting documents INTO Cortex, that's the upload skill's job,
  not yours.

Responses are parsed as text and truncated when large. **Document JSON
endpoints only** — binary endpoints (file download, preview, thumbnail)
produce garbage for the model; instead, have the agent answer with the
resource's id/title and, when useful, the software's own UI URL for the file.

Two kinds of braces in endpoint docs, and the runtime treats them
differently: `{UPPER_SNAKE}` / `${UPPER_SNAKE}` placeholders are substituted
server-side from admin config; lowercase braces like `{id}` or `{terms}` are
NOT substituted — they're for the model to fill when composing the URL. Both
are fine; just never use UPPER_SNAKE for a model-filled value.

## The Recipe

### 1. Study the target docs
From the user's docs, extract: base URL shape (self-hosted vs SaaS), auth
scheme (header name + format), the highest-value read endpoints (search,
list, get), any write endpoints the user actually wants (create ticket,
tag document), and pagination + error conventions. If docs are thin, probe
the live API with the user's consent.

### 2. Write the frontmatter
```markdown
---
name: paperless
description: Search, retrieve and tag documents in a paperless-ngx instance. Use when the user asks about their archived documents, invoices, receipts, correspondence, or wants to file/tag a document.
---
```
The `description` doubles as the activation hint — write it as "what this
does + when to use it", mentioning the nouns users will actually say.

### 3. Declare configuration (the part the wizard reads)
A short section that names every variable. Pattern that extracts reliably:

```markdown
## Configuration

This skill requires:
- `PAPERLESS_BASE_URL` (required) — the base URL of your paperless-ngx
  instance, e.g. `https://paperless.example.com` (no trailing slash).
- `PAPERLESS_TOKEN` (required, secret) — a paperless-ngx API token
  (Settings → API Tokens). Sent as `Authorization: Token PAPERLESS_TOKEN`.
```

Rules: UPPER_SNAKE names, one `*_BASE_URL` for self-hosted software, state
the exact auth header format (`Header-Name: SCHEME VAR`), mark secrets.
`(optional)` variables are supported — the wizard extracts a required flag
per variable. Concrete hosts are fine *here* as `e.g.` illustrations (the
wizard reads them); the no-concrete-hosts rule applies to endpoint examples.

One formatting caution: at runtime, lines whose phrasing suggests the model
should handle tokens itself ("your API token", "replace the token", "ask the
user to provide…") are stripped from the prompt. Keep the auth declaration
factual and self-contained on its own bullet, exactly like the pattern above,
and don't mix how-to-obtain-a-token prose into the same line as information
the agent needs at runtime.

### 4. Document endpoints with placeholder-true examples
Per endpoint: method + path with placeholders, the 2–4 parameters that
matter, one request example, one *abbreviated* response example showing the
fields the agent should read, and pagination.

````markdown
### Search documents
`GET {PAPERLESS_BASE_URL}/api/documents/?query={search terms}&page_size=10`

Full-text search. Supports `&page=` for pagination. Key response fields:
`results[].id`, `.title`, `.created`, `.correspondent`, `.tags` (ids),
`.content` (extracted text, long — prefer `title` + metadata when listing).
````

### 5. Behavioral guidance
Close with 3–6 bullets of judgment the agent can't infer: which endpoint to
prefer for which question, result-count etiquette ("fetch 10, not 100"),
when to combine with knowledge-base search, write-action confirmation
("only POST when the user explicitly asked to create/modify something").

### 6. Validate before shipping
- [ ] No code, no auth handling, no concrete hosts in examples
- [ ] Every placeholder is UPPER_SNAKE and every variable is declared in
      the Configuration section with required/secret status
- [ ] A `*_BASE_URL` variable exists (self-hosted) or the SaaS base URL is
      stated in prose (the wizard extracts it)
- [ ] ≤10 endpoints; each has pagination noted if it lists things
- [ ] Description says when to activate, in the user's vocabulary
- [ ] File reads sensibly when you imagine a 20-B model executing it

### 7. Install and verify on a live instance
1. Host the file at any raw URL (gist, repo raw link) and install it:
   Settings → Skills → Install from URL (or `POST /api/admin/skills` —
   see `cortexskills.org/admin/SKILL.md`).
2. Run the config wizard (auto-triggered; `POST /api/admin/skills/{id}/analyze`).
   **Verify every variable you declared appears in the extracted schema.**
   If one is missing, your Configuration section wasn't explicit enough —
   fix the wording, don't hand-edit the schema.
3. Fill in config, enable the skill, then ask a question that should trigger
   it (e.g. "find my latest phone invoice in paperless"). Failed API calls
   surface as red puzzle-icon steps in chat — a 401 means auth format, a
   404 usually means base-URL/trailing-slash issues.

## Worked Example — paperless-ngx (condensed)

```markdown
---
name: paperless
description: Search, retrieve and tag documents in a paperless-ngx instance. Use when the user asks about archived documents, invoices, receipts, or correspondence.
---

# Paperless-ngx Document Archive

## Configuration
This skill requires:
- `PAPERLESS_BASE_URL` (required) — base URL of the paperless-ngx instance,
  e.g. `https://paperless.example.com` (no trailing slash).
- `PAPERLESS_TOKEN` (required, secret) — API token from Settings → API
  Tokens. Sent as `Authorization: Token PAPERLESS_TOKEN`.

## Endpoints

### Search documents
`GET {PAPERLESS_BASE_URL}/api/documents/?query={terms}&page_size=10`
Full-text search; paginate with `&page=`. Read `results[].id`, `.title`,
`.created`, `.correspondent`, `.archive_serial_number`.

### Get one document
`GET {PAPERLESS_BASE_URL}/api/documents/{id}/`
Returns full metadata + `content` (extracted text).

### List tags / correspondents
`GET {PAPERLESS_BASE_URL}/api/tags/?page_size=50`
`GET {PAPERLESS_BASE_URL}/api/correspondents/?page_size=50`
Use these to resolve tag/correspondent ids to names before answering.

### Tag a document (write — confirm with user first)
`PATCH {PAPERLESS_BASE_URL}/api/documents/{id}/`
Body: `{"tags": [1, 5]}` — the FULL new tag id list (replaces, not appends).

## Guidance
- Prefer search with a tight query over listing everything.
- Resolve tag/correspondent ids to human names in answers.
- Dates in responses are ISO 8601; format them for the user.
- Only PATCH when the user explicitly asked to tag/file something, and
  fetch the document's current tags first (PATCH replaces the list).
```

That file — alone — is the entire deliverable. Pair it with an app
(`cortexskills.org/builder/app/SKILL.md`) when the user also wants a
dedicated UI.
