---
name: web-import
description: Use this skill when importing web pages into Cortex as clean markdown. Covers the MDHarvest web import feature powered by a self-hosted crawl4ai service, content filters (readable / full page / relevance-ranked), link discovery, configuration, and running crawl4ai.
---

# Web Import — Harvest Web Pages into the Knowledge Graph

## What You Probably Got Wrong

1. **Cortex does not embed its own browser.** Web Import (MDHarvest) calls a separate [crawl4ai](https://github.com/unclecode/crawl4ai) service over HTTP. You run crawl4ai once and point Cortex at it via `CRAWL_SERVICE_URL`.

2. **The feature is hidden unless both the switch AND the service URL are set.** The Web Import option appears in the split **Upload** button dropdown on the **Documents** page only when `ENABLE_WEB_CRAWL=true` AND `CRAWL_SERVICE_URL` is set.

3. **Imported pages become real documents.** Harvested markdown is chunked, embedded, and run through entity/relationship extraction like any uploaded file — it shows up in Search, Ask AI, the knowledge graph, and communities.

4. **A single crawl4ai instance is stateless and shared.** It can serve many Cortex backends. It needs ~4 GB RAM and `--shm-size=1g`. Keep port 11235 on a private network — don't expose it to the public internet.

## Enabling

```bash
# Master switch — the Web Import option appears only when this is true
# AND a crawl service URL is set
ENABLE_WEB_CRAWL=true

# crawl4ai service base URL (self-hosted or shared). Empty = feature off
CRAWL_SERVICE_URL=http://crawl4ai:11235

# Optional bearer token (must match crawl4ai's security.api_token)
CRAWL_SERVICE_TOKEN=
```

When `CRAWL_SERVICE_TOKEN` is set, Cortex sends it as `Authorization: Bearer …` to crawl4ai.

## Running crawl4ai

```bash
docker run -d --name crawl4ai \
  -p 11235:11235 \
  --shm-size=1g \
  unclecode/crawl4ai:0.9.0   # Cortex targets crawl4ai 0.9.0 or newer
```

Then in the Cortex backend `.env`:

```bash
ENABLE_WEB_CRAWL=true
CRAWL_SERVICE_URL=http://crawl4ai:11235     # or http://<host>:11235
# CRAWL_SERVICE_TOKEN=...                    # only if you enable a token in crawl4ai
```

It uses a headless browser pool (~4 GB RAM). A single instance can serve many Cortex deployments.

## Using Web Import

1. On the **Documents** page, open the split **Upload** button dropdown and select **Web Import** to open the Web Import modal.
2. **Discover links** (optional) — enter a single page URL; Cortex returns same-site links with checkboxes so you can pick which to import.
3. Choose a **content filter** (see below).
4. Optionally select a collection.
5. Start the import — a progress bar tracks crawl + processing and shows imported/failed counts.

## Content Filters

| Filter | `CRAWL_CONTENT_FILTER` value | Description |
|---|---|---|
| **Readable** (recommended) | `fit` | Main article content; strips nav, ads, and boilerplate |
| **Full page** | `raw` | Entire page converted to markdown |
| **Relevance-ranked** | `bm25` | Keeps passages most relevant to a query you provide |

## Provenance Header

Every imported page is prefixed with its source so citations stay traceable:

```markdown
# Page title

> Source: https://example.com/the-page
> Extracted: 2026-06-22

---

…clean markdown…
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `ENABLE_WEB_CRAWL` | `false` | Master switch — Web Import appears only when true and a service URL is set |
| `CRAWL_SERVICE_URL` | _(empty)_ | crawl4ai service base URL. Empty = feature off |
| `CRAWL_SERVICE_TOKEN` | _(empty)_ | Optional bearer token (must match crawl4ai's `security.api_token`) |
| `CRAWL_CONTENT_FILTER` | `fit` | Default content filter: `fit` (readable) \| `raw` (full page) \| `bm25` (ranked) |
| `CRAWL_HTTP_TIMEOUT` | `60` | Per-page crawl timeout (seconds) |
| `CRAWL_CONCURRENCY` | `5` | Concurrency within one import job |
| `CRAWL_MAX_URLS_PER_JOB` | `100` | Maximum URLs accepted per import (0 = unlimited) |
| `CRAWL_DISCOVER_MAX_LINKS` | `200` | Cap on links returned by the Discover sub-flow |

## Privacy on Shared Instances

On a shared crawl4ai host, Cortex retains no crawl history, uses ephemeral storage, calls only request-scoped endpoints (never the async job API), and bypasses cache. See the `cortex-helper` repo for a hardened shared-host setup.

## Resources

- [Web Import Guide](https://docs.cortex.eco/features/web-import)
- [crawl4ai](https://github.com/unclecode/crawl4ai)
