---
name: git-integration
description: Use this skill when connecting GitHub, GitLab, or Gitea repositories to Cortex as a knowledge source, configuring incremental repo sync, or enabling the research agent to open pull requests. Covers access levels, token scopes, file filtering, incremental sync, the git_repo agent tool, and configuration.
---

# Git Integration — Connect Repositories as a Knowledge Source

## What You Probably Got Wrong

1. **A connected repo is bidirectional, not just an import.** Cortex ingests repo files and wikis into the knowledge graph (read), and on read/write connections the research agent can open pull requests via the `git_repo` tool. It works with GitHub, GitLab, and Gitea — including self-hosted instances.

2. **The agent never pushes to your default branch.** Every write creates a new `cortex/agent-…` branch and opens a pull request for human review. Safety is enforced in code, not just by prompt. On read-only connections, write actions are refused server-side.

3. **Sync is incremental, not a full re-ingest.** Cortex records the last-synced commit and uses git history to classify Added / Modified / Deleted / Renamed files. It only re-ingests what changed.

4. **Deleted files are flagged, never auto-deleted.** When a source file disappears from the repo, Cortex flags the document for review — you delete it yourself from the Documents page if you no longer need it.

5. **The default only ingests `.pdf` and `.md`.** New connections ingest documentation files only. Uncheck the default to set custom include/exclude globs. Images and audio are never ingested from repos.

6. **The token is stored server-side and never exposed to the agent.** It is masked in the UI (`••••abcd`), injected automatically into git and API calls, never written to logs or `.git/config`.

## Enabling

```bash
ENABLE_GIT_INTEGRATION=true
```

Then manage connections from **Settings → Git Integration** (admin only). The backend image bundles the `git` binary; ensure `GIT_WORK_DIR` is writable (mount a volume in production).

## Access Levels

| Access level | What it enables |
|---|---|
| **Read-only** | Ingestion only — repo files and (optionally) the wiki flow into the knowledge graph, searchable alongside other documents. |
| **Read/write** | Ingestion **plus** the agent's `git_repo` tool — it can read live files and open pull requests with proposed changes. |

A repo's content is chunked, embedded, and run through entity/relationship extraction exactly like uploaded documents — once synced it appears in Search, Ask AI, the knowledge graph, and communities.

## Connecting a Repository

1. **Settings → Git Integration → Connect repository**.
2. Pick a **provider** (GitHub / GitLab / Gitea). For self-hosted GitLab/Gitea, fill in the API base URL.
3. Paste a **personal access token**. The form shows a vendor-specific guide for the least-privilege token, with a direct link. Click **Test** to verify.
4. Enter the **owner/org** and **repository**.
5. Choose the **access level**.
6. Leave **"Only ingest `.pdf` and `.md` files"** checked, or uncheck it to set custom filters.
7. Click **Connect**, then **Sync** to ingest.

### Which Token to Create (least-privilege)

- **GitHub** — a **fine-grained PAT** scoped to the one repo, with **Contents: Read-only** for ingestion. For read/write, add **Contents: Read and write** + **Pull requests: Read and write**. (To ingest a GitHub **wiki**, use a classic token with the `repo` scope — fine-grained tokens don't cover wikis.)
- **GitLab** — a **Project Access Token** with role **Reporter** and scope `read_repository`. For merge requests, use role **Developer** with `api` + `write_repository`.
- **Gitea** — a scoped PAT with **Repository: Read**. For pull requests, **Repository: Read and Write** plus **Issue: Read and Write** (for PR comments).

## Filtering: What Gets Ingested

By default, new connections ingest **`.pdf` and `.md` files only**. Uncheck the default to reveal **include** and **exclude** glob fields (gitignore-style, comma-separated):

- Include: `src/**, docs/**`
- Exclude: `**/node_modules/**, *.lock`

Supported types are text/code (`.py`, `.ts`, `.go`, `.md`, …) and documents (`.pdf`, `.docx`, `.pptx`, …). Code and markdown ingest through a fast path that skips Docling; PDFs and Office files route through Docling. **Images and audio are not ingested from repos.**

## Incremental Sync

Cortex records the last-synced commit and runs `git diff --name-status -M` to classify changes:

| Change | What Cortex does |
|---|---|
| **Added** | Creates a new document |
| **Modified** | Re-extracts that document in place (old chunks/relationships replaced) |
| **Deleted** | Flags the document for review (never auto-deleted) |
| **Renamed** | Remaps the document's path |

If the branch was force-pushed or you change filters, sync self-heals via a full-tree reconcile (comparing each file's content hash to what's stored). After any change, the graph is flagged **stale** — re-run relationship analysis and community detection from the **Knowledge Graph** page.

Each ingested document carries git provenance fields: `git_connection_id`, `git_path`, `git_blob_sha`, `git_commit_sha`.

## Keeping Repos Up to Date

- **Manual** — click **Sync** on a connection any time.
- **Scheduled** — set an **Auto-sync** interval (minutes) under Advanced; a background poller re-syncs on schedule. No webhooks or public endpoint required.

## The Agent's `git_repo` Tool (read/write)

On a **read/write** connection, the research agent gains a `git_repo` tool with three actions:

- **read_file** — fetch a file's current contents.
- **propose_change** — open a pull request with edits.
- **comment** — comment on an existing pull request.

Every write creates a new `cortex/agent-…` branch and opens a PR/MR for human review — the agent never pushes to your default branch.

## Editing & Removing Connections

Expand a connection to **Edit** — change access level, branch, auto-sync interval, filters, wiki ingestion, or rotate the token. **Delete** offers two options: keep the already-ingested documents, or purge them along with the connection.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `ENABLE_GIT_INTEGRATION` | `false` | Master switch for the connector, endpoints, scheduler, and the agent `git_repo` tool |
| `GIT_WORK_DIR` | `./git_repos` | Where clone working copies are cached (mount a volume in production) |
| `GIT_CLONE_DEPTH` | `1` | Shallow-clone depth |
| `GIT_MAX_REPO_SIZE_MB` | `500` | Abort a sync above this repo size (0 = unlimited) |
| `GIT_SYNC_MAX_FILE_SIZE_MB` | `5` | Skip individual files larger than this (0 = no limit) |
| `GIT_SYNC_POLL_INTERVAL` | `5` | Minutes between scheduled-sync checks |
| `GIT_HTTP_TIMEOUT` | `30` | Timeout (seconds) for git provider REST calls |
| `GIT_HTTP_INSECURE_HOSTS` | _(empty)_ | Comma-separated hosts allowed to skip TLS verification (self-hosted self-signed) |

Connection PATs are encrypted at rest when `ENCRYPTION_KEY` is set (comma-separated Fernet keys; first encrypts, all decrypt).

API endpoints live under `/api/integrations/git/*` (admin-gated). Connections are created and managed from the web UI rather than scripted.

## Resources

- [Git Integration Guide](https://docs.cortex.eco/features/git-integration)
- [Document Upload](https://docs.cortex.eco/features/document-upload) — how ingested content flows through the pipeline
