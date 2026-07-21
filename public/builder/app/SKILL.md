---
name: builder-app
description: Recipe for building a web app that runs inside a Cortex instance — React/Tailwind by default, any framework works. Covers the app template, the hosting contract (manifest, sandboxing, token handshake, API proxy), streaming Q&A rendering, platform capabilities for background work, and both endings — private install or publishing to the registry.
---

# Builder: App — From Idea to Installable Cortex App

Your user imagines an interface — a triage dashboard, a research tool, a
tailored front-end combining their knowledge graph with other software. Your
deliverable is a **zip file**: static bundle + manifest. The instance admin
uploads it (Apps → Install) and it runs at `/apps/{slug}/`, sandboxed, with
scoped access to the Cortex API. No hosting, no domain, no server setup for
the user.

> **Status note:** the full loop is live — dev against any instance,
> in-instance hosting (zip upload, sandboxed serving, share links), and the
> platform capabilities `http`, config-read, `tasks`, `storage`, and `llm`.
> Hosting requires `ENABLE_APPS=true` on the target instance (routes 404
> when off). `features`/`branding` are specced but not yet shipped.

## What You Probably Got Wrong

1. **You are not modifying the Cortex frontend.** Apps are separate bundles
   installed at runtime. You never touch the instance's Next.js code.

2. **You put an API key in the browser.** Never. In production the hosting
   proxy attaches the app's server-side scoped key. The browser only holds a
   short-lived app token delivered via postMessage — the template's client
   (`src/lib/cortex.ts`) handles the entire handshake. In dev, the Vite
   proxy plays the proxy's role with a dev key from `.env`.

3. **You fetched an absolute `/api` path.** Apps are served under
   `/apps/{slug}/` — every request must be relative (`./api/…`). Use the
   template client; `npm run validate` rejects absolute API paths.

4. **You loaded something from a CDN.** Hosted apps run under CSP
   `default-src 'self'`. Fonts, scripts, styles, images — everything ships
   inside `dist/`. (Browser-direct `fetch()` to other services is possible
   via `externalHosts`, but see the next point first.)

5. **You called an external API from the browser.** Browser-direct calls to
   third-party services drag in two avoidable failure modes: the target must
   be CORS-configured for the Cortex origin, and any credential has to live
   client-side. **Prefer the platform `http` capability instead**
   (`type: "platform"`, see below): calls execute server-side inside the
   instance, secrets come encrypted from admin config, and the target needs
   zero CORS setup — the compatibility barrier drops to "admin pastes URL +
   token once". Reserve `externalHosts`/browser-direct for public keyless
   APIs or user-specific credentials that genuinely belong to the visitor.

6. **You called endpoints you didn't declare.** The manifest's
   `cortex.endpoints` is an allowlist enforced by the proxy. Declare exactly
   what you use; the admin approves exactly that at install.

7. **You defaulted to the wrong class.** `static` covers pure UI-over-Cortex
   apps. Reach for `platform` when you integrate an external service (see
   mistake 5) or work must survive a closed tab. Only `service` (own
   container) when you need arbitrary server code or binaries.

## Quickstart

```bash
git clone https://github.com/mocaOS/cortex-app-template my-app && cd my-app
npm install
cp .env.example .env        # CORTEX_DEV_URL + a cortex_ro_… key from the instance
npm run dev                 # live data from the user's instance, immediately
# …build the user's idea in src/ …
npm run package             # → {id}-{version}.zip, ready to install
```

The template ships React 19 + Tailwind 4 + Vite with the Cortex design tokens
pre-wired, a typed client for the whole contract, demo panels for search and
streaming Q&A (keep them until your features exercise both paths), and the
`validate`/`package` scripts that enforce this skill's rules.

Any framework works — the contract is just "static bundle + relative API
calls + manifest". But React/Tailwind gets the maintained template; with
another stack you implement the client handshake yourself (spec below).

## The Manifest (`app.json`)

```jsonc
{
  "id": "paperless-triage",            // kebab-case slug, unique in the registry
  "name": "Paperless Triage",
  "version": "1.0.0",                  // semver
  "type": "static",                    // static | platform | service
  "description": "One-liner for launcher + registry",
  "publisher": { "name": "you", "url": "https://github.com/you" },
  "icon": "icon.svg",
  "entry": "index.html",
  "cortex": {
    "minVersion": "2.0.0",
    "keyScope": "read",                // read | read_write — least privilege!
    "endpoints": ["search", "ask", "graph/entities"],   // /api/-relative allowlist
    "collections": "user-selected"     // "user-selected" | "all" | ["names"]
  },
  "config": [                          // admin fills at install; secrets encrypted
    { "name": "PAPERLESS_BASE_URL", "type": "text", "required": true },
    { "name": "PAPERLESS_TOKEN", "type": "secret",
      "auth_header": "Authorization: Token PAPERLESS_TOKEN" }
  ],
  "externalHosts": [],                 // browser-direct CSP allowlist — prefer
                                       // the platform "http" capability instead
  "sharing": { "links": true }         // owner may share the app via revocable links
}
```

Full JSON Schema: `schema/app.v1.json` in the template.

## The Client Contract (what `src/lib/cortex.ts` implements)

**Token handshake** (production, inside the sandboxed launcher iframe):
1. App posts `{type: "cortex:ready"}` to `window.parent` on load.
2. Launcher replies `{type: "cortex:token", token, expiresAt}` (postMessage).
3. App sends the token as `Authorization: Bearer <token>` on every
   `./api/…` request. On a 401, post `{type: "cortex:token:renew"}` and
   retry once with the fresh token.

**Routes** (all relative to the app's own base URL):
- `./api/cortex/{path}` → the instance's `/api/{path}`, allowlisted +
  key-attached by the proxy. SSE streams pass through unbuffered.
- `./api/platform/{path}` → platform capabilities (platform apps only).

**Cortex API essentials** (ground truth, current as of this skill):
- Search: `POST …/cortex/search` body
  `{"query": "...", "top_k": 5, "filters": {"collection_id": "…"}}` →
  `{results: [{document_id, chunk_id, content, score, metadata: {filename}}]}`
- Q&A streaming: `POST …/cortex/ask/stream` body
  `{"question": "...", "top_k": 5, "conversation_history": [{role, content}],
    "use_agentic": false, "use_fast_search": false, "collection_id": "…"}`.
  Response is SSE: every frame is `data: {json}` (no named events, `: ping`
  keep-alives). Discriminate frames by key:

  | Key present | Meaning |
  |---|---|
  | `content` | answer token delta — append |
  | `thinking` | agentic reasoning step |
  | `status` | `{stage, message}` pipeline stage |
  | `sources` | retrieved sources (have `sid` matching `[src_N]` citations in the answer) |
  | `retrieval` / `retrieval_stats` | progress / final stats |
  | `error` | client-safe message; stream ends |
  | `done` | terminal frame |

  Render `[src_N]` markers in the answer as citation badges linked to the
  `sources` entries. Deep Research = `use_agentic: true` (streaming only —
  the non-streaming `/ask` rejects it).
- Entities: `GET …/cortex/graph/entities?search=…&limit=50`.
- Deeper reference: fetch `cortexskills.org/{search,ask,graph}/SKILL.md`.

## Platform Capabilities (`type: "platform"`)

Declare under `capabilities`; each is admin-approved at install and served
by the instance — your app still ships zero server code.

**Shipped — use these today:**

- `http` — server-side external calls with secrets injected from app config.
  This is THE pattern for integrating other software:

  ```jsonc
  // app.json
  "type": "platform",
  "capabilities": { "http": { "hosts": ["${SERVICE_BASE_URL}"] } },
  "config": [
    { "name": "SERVICE_BASE_URL", "type": "text", "required": true },
    { "name": "SERVICE_TOKEN", "type": "secret",
      "auth_header": "Authorization: Token SERVICE_TOKEN" }
  ]
  ```

  ```ts
  // app code — POST an envelope; the response passes through verbatim
  const res = await platform("http", {
    method: "POST",
    body: JSON.stringify({ method: "GET", url: `${base}/api/documents/?page=1` }),
  });
  ```

  The backend executes the call with `SERVICE_TOKEN` injected as the declared
  header. **The target needs no CORS setup, and the secret never exists in
  the browser.** Targets are restricted to the declared hosts (`${VAR}` refs
  resolve from the app's config) and SSRF-guarded: self-hosted/LAN targets
  are fine, loopback/metadata are blocked. Redirects are not followed;
  responses cap at 20 MB. Optional envelope fields: `body` (string),
  `content_type`, `headers` (extra request headers — `Authorization`/`Host`/
  framing names are stripped; config-injected auth always wins; `Cookie` IS
  allowed, e.g. YouTube's EU consent bypass `SOCS=CAI`).

  **Multiple hosts? Scope every credential.** Add
  `"auth_host": "api.venice.ai"` (or `"${SERVICE_BASE_URL}"`) to each
  auth_header var — without it the header is injected on calls to EVERY
  declared host, leaking one service's key to another. `npm run validate`
  warns about this.

  **Basic auth? Never make users hand-encode base64.** An auth_header
  template may reference ANY config var by name and wrap parts in
  `base64(...)`, evaluated server-side after substitution:

  ```jsonc
  { "name": "NC_APP_PASSWORD", "type": "secret",
    "auth_header": "Authorization: Basic base64(NC_USER:NC_APP_PASSWORD)" }
  ```

  Users paste a plain login + app password; the header is assembled and
  encoded inside the instance. (Field lesson: a manual "encode this
  yourself" step produced corrupted credentials immediately.)

  **Google APIs? Use a service account — no OAuth flow at all.** An
  auth_header may carry `google_sa_token(VAR, <scope> [scope…])`: the var
  holds a service-account JSON key (secret), and the instance mints and
  caches short-lived access tokens from it server-side (RS256 JWT +
  exchange, token_uri pinned to Google). Users share Drive folders with the
  service account's email; the task holds no credentials:

  ```jsonc
  { "name": "GDRIVE_SA_KEY", "type": "secret",
    "auth_header": "Authorization: Bearer google_sa_token(GDRIVE_SA_KEY, https://www.googleapis.com/auth/drive.readonly)" }
  ```

- **Config read (implicit, no declaration):** `GET ./api/platform/config`
  returns the app's NON-secret config values (`{"values": {...}}`) — e.g.
  read `SERVICE_BASE_URL` for display/backlinks. Secret-typed values never
  cross this boundary; they are only injected server-side by `http`.

- `tasks` — **background work that survives a closed tab.** Your app submits
  a declarative JSON step-queue (`http` / `cortex` / `llm` / `store` /
  `template` steps; setup → fan-out items → finally) and the instance
  executes it server-side, with per-item error isolation,
  pause/resume/cancel/retry-failed, and resume-on-restart. Add
  `"schedule": {"everyMinutes": 60}` and it re-runs headless forever — the
  pattern that turns an integration app into a standing sync daemon (the
  paperless-sync app syncs a whole archive this way; its task definition is
  the worked example). The `llm` step has built-in chunking + output
  validation (length-ratio / word-overlap, retry-once-else-keep-original)
  for safe long-text rewriting. **Fetch
  `cortexskills.org/builder/app/tasks.md` for the full DSL reference before
  writing a task** — step vocabulary, refs/templates/conditions, caps, and a
  complete real definition. Template client: `src/lib/platform.ts`
  (`submitTask`, `getTask`, `taskAction`, …).

- `storage` (declare `"storage": {}`) — the app's private, quota-capped
  key/value store (JSON values, path-like keys), shared by task `store`
  steps and your UI (`GET/PUT/DELETE ./api/platform/storage/{key}`, prefix
  listing). Use it for cursors, dedup keys, results, and cross-device
  preferences instead of localStorage. Task fan-outs dedup against it
  directly via `skipIfStored`.

- `llm` (declare `"llm": {}`) — completions via the instance's configured
  model inside task steps, metered against the instance quota and capped per
  run. (No standalone completion endpoint yet — use an `ask` cortex call for
  interactive Q&A.)

**Specced, not yet shipped** (declaring them fails install with a clear
message — probe `GET /api/features` for availability):

- `features` / `branding` — instance feature flags and accent/logo/language,
  so your app degrades gracefully and inherits the tenant's look.

Platform mutations (task control, storage writes) require an owner or editor
token — share-link **viewers are read-only**.

If your server logic doesn't fit these declarative shapes, your app is
`type: "service"` — it ships as a container image + compose template instead
of a zip. Service-app rules (learned the hard way): runtime-only config (no
build-time env — one image serves any tenant), fail-fast startup validation
listing every config error at once, named volumes for state, no
`NEXT_PUBLIC_`/`VITE_`-prefixed secrets, and request the narrowest key the
app can live with.

## Design

Fetch `cortexskills.org/cortex-design/SKILL.md` and follow it — dark-first,
typography-led, sharp corners, restrained accent. The template's
`src/styles/index.css` carries the tokens. Prefer tokens over hardcoded
colors so instances can theme your app via the `branding` capability.

## Shipping

**Private app** (never surfaces anywhere): `npm run package`, send the zip to
the instance admin, done. Iterate by re-uploading — versions are semver.

**Publish to the ecosystem** — the release flow, exactly:

1. Commit + push everything. Releases are cut from a clean tree so the
   artifact is reproducible from the tagged source.
2. Build the artifact from that source and record its digest:

   ```bash
   npm run package                        # → {id}-{version}.zip (validates first)
   sha256sum {id}-{version}.zip           # the digest goes in release notes + listing
   ```

3. Create a tagged GitHub release with the zip attached (tag `v{version}`,
   matching `app.json`):

   ```bash
   gh release create v1.0.0 my-app-1.0.0.zip \
     --title "My App v1.0.0" \
     --notes "…what it does, install hint, and the sha256…"
   ```

4. Sanity-check the published artifact — the registry pins it by digest:

   ```bash
   curl -sL https://github.com/you/my-app/releases/download/v1.0.0/my-app-1.0.0.zip \
     | sha256sum   # must equal step 2
   ```

5. PR to `github.com/mocaOS/cortex-registry`: add
   `apps/{your-id}/listing.json` — your `app.json` verbatim plus the
   artifact block `{url, sha256, size}` from steps 2-4 (see the registry
   README for the template). CI re-downloads the artifact and re-verifies
   the checksum; a human reviews.
6. Once merged, every Cortex instance can browse and install your app from
   its admin panel. New version = new release (steps 1-4) + a PR bumping
   your listing's `app.version` + artifact block. Never re-upload a
   different zip under an existing tag — the pinned digest is the trust
   anchor.

## Pre-ship checklist

- [ ] `npm run validate` passes with zero issues
- [ ] Works in dev against a real instance (search AND streaming ask)
- [ ] `cortex.endpoints` lists exactly what you call — nothing more
- [ ] `keyScope` is the minimum that works (`read` unless you truly write)
- [ ] No CDN/external assets; external services go through platform `http`
      (browser-direct only for public keyless APIs, declared in `externalHosts`)
- [ ] Config vars: UPPER_SNAKE, secrets typed `secret` with `auth_header`
- [ ] Looks native (cortex-design), placeholder id replaced, icon replaced
