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

> **Status note:** the dev loop below (template + `npm run dev` against any
> live instance) works today. In-instance hosting (zip upload, sandboxed
> serving, platform capabilities) ships with the Cortex app-hosting release —
> check `GET /api/features` on the target instance or the template README for
> current availability. Build against the contract; it is frozen.

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
  `content_type`.

- **Config read (implicit, no declaration):** `GET ./api/platform/config`
  returns the app's NON-secret config values (`{"values": {...}}`) — e.g.
  read `SERVICE_BASE_URL` for display/backlinks. Secret-typed values never
  cross this boundary; they are only injected server-side by `http`.

**Specced, not yet shipped** (declaring them fails install with a clear
message — probe `GET /api/features` for availability):

- `tasks` — background queue that survives closed tabs: submit items whose
  `steps` are declarative (`http`, `llm`, `store`) with built-in retry and
  response-validation policies; control via pause/resume/cancel/retry-failed.
- `storage` — per-app KV/JSON store.
- `llm` — completions via the instance's configured model (metered against
  the instance's quota).
- `features` / `branding` — instance feature flags and accent/logo/language,
  so your app degrades gracefully and inherits the tenant's look.

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

**Publish to the ecosystem**:
1. Push your app repo to GitHub and attach the zip to a release.
2. PR to `github.com/mocaOS/cortex-registry`: add
   `apps/{your-id}/listing.json` (your manifest + artifact URL + sha256 +
   screenshots). CI validates schema and checksum; a human reviews.
3. Once merged, every Cortex instance can browse and install your app from
   its admin panel.

## Pre-ship checklist

- [ ] `npm run validate` passes with zero issues
- [ ] Works in dev against a real instance (search AND streaming ask)
- [ ] `cortex.endpoints` lists exactly what you call — nothing more
- [ ] `keyScope` is the minimum that works (`read` unless you truly write)
- [ ] No CDN/external assets; external services go through platform `http`
      (browser-direct only for public keyless APIs, declared in `externalHosts`)
- [ ] Config vars: UPPER_SNAKE, secrets typed `secret` with `auth_header`
- [ ] Looks native (cortex-design), placeholder id replaced, icon replaced
