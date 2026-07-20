---
name: apps
description: Use this skill when installing, operating, or reasoning about apps that run INSIDE a Cortex instance — registry installs (sha256-verified), zip installs, the sandbox/proxy security model, platform capabilities (server-side http, storage, scheduled background tasks, LLM), share links, and the first-party apps. To BUILD an app, fetch builder/app instead.
---

# Apps — Web Apps That Run Inside Your Cortex

A Cortex instance can host self-contained web apps: a paperless-ngx sync, a
YouTube transcriber, a custom dashboard — installed by an admin in one click,
served sandboxed at `/apps/{id}/`, with exactly the API access their manifest
declares and nothing more. Anyone can build one (see
[builder/app](../builder/app/SKILL.md)); anyone can publish one to the public
[registry](https://github.com/mocaOS/cortex-registry) with a PR.

## What You Probably Got Wrong

1. **Apps run INSIDE the instance.** They are static bundles installed from a
   zip and hosted by Cortex itself — not external services you deploy
   somewhere. (Apps that genuinely need their own container are
   `type: "service"` and ship compose templates instead.)

2. **Nothing works until `ENABLE_APPS=true`.** The subsystem is off by
   default: every app route 404s and the admin section hides itself. Env
   reference: the [setup skill](../setup/SKILL.md).

3. **No API key ever reaches the browser.** Install mints a dedicated scoped
   key that lives server-side; a proxy attaches it and enforces the
   manifest's endpoint allowlist. The app's frontend only ever holds a
   short-lived, auto-renewing token that validates nowhere else.

4. **Installing from the registry is checksum-verified end to end.** The
   catalog pins every release artifact by sha256, registry CI re-verifies
   continuously, and the installing instance verifies the download again
   before unpacking a byte. A moved or tampered release fails closed.

5. **Platform apps do real server-side work.** `type: "platform"` apps can
   declare capabilities: `http` (external calls with secrets injected from
   encrypted config — no CORS setup on the target, credentials never in the
   browser), `storage` (private quota-capped KV), `tasks` (declarative
   background step-queues that survive a closed tab and can run on a
   schedule — a sync app becomes a standing daemon), and `llm` (instance
   model, metered). The admin sees and approves all of it at install.

6. **Upgrades don't lose anything.** Reinstalling a newer version keeps the
   app's key, configuration, share links, storage, and scheduled tasks.

## First-Party Apps (in the registry today)

| App | What it does |
|-----|--------------|
| [**Paperless Sync**](https://github.com/mocaOS/cortex-app-paperless) | Syncs a paperless-ngx archive into the knowledge graph — on demand or on a schedule, fully server-side. Paperless already OCR'd everything; this ships the text as markdown, so documents become queryable knowledge in seconds instead of re-OCR minutes. |
| [**YT Transcriber**](https://github.com/mocaOS/cortex-app-youtube-transcriber) | Turns YouTube videos and whole channels into clean transcripts inside the graph: Venice AI transcription → chunk-safe LLM cleanup with graph-entity name correction → markdown upload. Close the tab; the pipeline keeps running. |

Catalog data: `https://raw.githubusercontent.com/mocaOS/cortex-registry/main/index.json`
(the same URL instances consume via `APP_REGISTRY_URL`).

## Installing

**From the registry (preferred):** Settings → Apps → **Browse Registry**.
Each entry shows what you'd be approving — key scope (read / read+write),
the exact endpoint allowlist, and platform capabilities — before install.
Updates appear in place. Curate by pointing `APP_REGISTRY_URL` at a fork;
set it empty to hide the panel.

**From a zip:** Settings → Apps → Install. Same validation, same security
model — for private apps that never touch the registry.

Both paths: choose the app's collection scope at install (all collections or
a restricted set), then fill in any declared config through the wizard —
secrets are encrypted at rest and only ever used server-side.

Admin API surface (install, registry, config, grants, task oversight): the
[admin skill](../admin/SKILL.md#apps-in-instance-app-hosting).

## Using & Sharing

Enabled apps appear in the launcher at `/apps`. For apps that allow it,
admins can mint **revocable share links** (`/a/{id}?g=…`) so people without
a Cortex login can use the app — a share visitor's token validates only at
that app's proxy, never against the rest of Cortex, and viewer-role links
are read-only for the app's server-side state (no starting tasks, no writes).

## Building Your Own

Fetch [builder/app](../builder/app/SKILL.md) — scaffold from
[cortex-app-template](https://github.com/mocaOS/cortex-app-template), build
against live instance data in `npm run dev`, package a zip, and either hand
it to an admin (private) or cut a GitHub release and PR one `listing.json`
to the registry (public). The task-DSL reference for background/scheduled
work is [builder/app/tasks.md](../builder/app/tasks.md).

## Resources

- [cortex-registry](https://github.com/mocaOS/cortex-registry) — the public catalog (browse site + JSON API in `site/`)
- [cortex-app-template](https://github.com/mocaOS/cortex-app-template) — the contract-in-code
- [Apps feature guide](https://docs.cortex.eco/features/apps) — operator documentation
