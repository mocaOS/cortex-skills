---
name: apps
description: Use this skill when working with the Cortex app ecosystem — browsing available apps, understanding source vs workflow apps, launching integrations, or requesting custom app development. Covers all available apps, pricing, and the app architecture.
---

# Apps — Extend Your Knowledge Graph with Source and Workflow Apps

## What You Probably Got Wrong

1. **Apps are not plugins or extensions you install into MOCA Library.** They are standalone services that interact with your Cortex instance via the API. They run externally and push/pull data through the 60+ REST endpoints.

2. **There are two categories.** Source apps ingest knowledge from external platforms into your graph. Workflow apps provide better UIs and integrations on top of your existing graph.

3. **Free apps are included on every plan.** You do not need a paid plan to use the Web Crawler or Research Dashboard. Premium apps are one-time purchases (not subscriptions).

4. **Business tier includes all premium apps.** If you are on the Business plan ($249/mo), every premium app is already unlocked.

5. **Custom apps are built by the Cortex team, not community-developed.** You describe what you need, receive a quote, and the team builds it for your specific requirements.

## App Categories

### Source Apps

Source apps ingest knowledge from external platforms into your Cortex knowledge graph.

### Workflow Apps

Workflow apps provide dashboards, exports, and integrations that work with your existing knowledge graph.

## Available Apps

| App | Category | Price | Description |
|-----|----------|-------|-------------|
| **YouTube Channel Importer** | Source | Premium | Paste a channel URL. Cortex transcribes every video, converts to structured markdown, and feeds into your knowledge graph via API. Hours of video become queryable knowledge in minutes. |
| **Web Crawler** | Source | Free | Point at any website or sitemap. Crawls every page, extracts content, and ingests into your knowledge graph. Keep your graph in sync with the web. |
| **Notion Sync** | Source | Premium | Two-way sync between your Notion workspace and your Cortex knowledge graph. Pages, databases, and documents flow seamlessly between both systems. |
| **Slack Archive Importer** | Source | Premium | Import entire Slack channel histories into your knowledge graph. Conversations, decisions, and institutional knowledge become searchable and connected. |
| **Research Dashboard** | Workflow | Free | Visual interface for exploring entities, relationships, and clusters in your knowledge graph. Interactive graph visualization with filtering and search. |
| **API Playground** | Workflow | Free | Test queries and prototype integrations directly in the browser. Send requests to any API endpoint and see formatted responses. |

## App Details

### YouTube Channel Importer

**Category:** Source | **Price:** Premium (one-time)

Workflow:
1. Provide a YouTube channel URL
2. The app fetches the channel's video list
3. Each video is transcribed (audio → text)
4. Transcripts are converted to structured markdown
5. Markdown documents are uploaded to your Cortex instance via `POST /api/upload`
6. GraphRAG processes each document into the knowledge graph

Use case: Turn a 500-video educational channel into a searchable, queryable knowledge base in hours.

### Web Crawler

**Category:** Source | **Price:** Free

Workflow:
1. Provide a website URL or sitemap URL
2. The crawler discovers all pages
3. Content is extracted (HTML → clean text/markdown)
4. Each page is uploaded as a document to Cortex
5. Knowledge graph builds automatically

Use case: Index your company documentation site, competitor websites, or public knowledge bases.

### Notion Sync

**Category:** Source | **Price:** Premium (one-time)

Workflow:
1. Connect your Notion workspace via OAuth
2. Select which pages/databases to sync
3. Content is extracted and uploaded to Cortex
4. Changes in Notion are synced periodically
5. Optionally sync Cortex insights back to Notion

Use case: Keep your team's Notion workspace and Cortex knowledge graph in sync.

### Slack Archive Importer

**Category:** Source | **Price:** Premium (one-time)

Workflow:
1. Export your Slack workspace data (or use the Slack API)
2. The importer processes channel histories
3. Conversations are chunked and uploaded to Cortex
4. Entities (people, projects, decisions) are extracted

Use case: Unlock the institutional knowledge buried in years of Slack conversations.

### Research Dashboard

**Category:** Workflow | **Price:** Free

Features:
- Interactive force-directed graph visualization
- Entity and relationship exploration
- Community cluster view
- Search and filter entities by type
- Zoom into subgraphs around specific entities

### API Playground

**Category:** Workflow | **Price:** Free

Features:
- Test any of the 60+ API endpoints
- Formatted JSON responses
- Request history
- Code generation (curl, Python, JavaScript)

## Pricing by Plan

| Plan | Free Apps | Premium Apps |
|------|-----------|-------------|
| Free ($0/mo) | Included | Purchase individually |
| Individual ($19/mo) | Included | Purchase individually |
| Enthusiast ($79/mo) | Included | Select premium apps included |
| Business ($249/mo) | Included | All premium apps included |
| Enterprise (Custom) | Included | All premium apps included |

## Custom App Development

Need something specific? The Cortex team builds custom apps:

1. **Describe** your requirements
2. **Receive** a detailed quote
3. **Review** and approve
4. **We build** the app for your team
5. **Launch** with seamless integration

Custom apps follow the same architecture: standalone service that interacts with Cortex via API.

Examples of custom apps teams have requested:
- CRM integration (Salesforce, HubSpot)
- Email archive importer (Gmail, Outlook)
- PDF batch processor with custom chunking
- Real-time monitoring dashboard
- Custom export formats (XML, CSV, proprietary)

## Building Your Own App

Any app that can make HTTP requests can integrate with Cortex. The core pattern:

```python
import requests

BASE_URL = "http://your-cortex-instance:8000"
API_KEY = "moca_rw_your_key"

# 1. Ingest: Upload content to the knowledge graph
requests.post(f"{BASE_URL}/api/upload",
    headers={"X-API-Key": API_KEY},
    files={"file": open("content.md", "rb")})

# 2. Query: Search or ask questions
results = requests.post(f"{BASE_URL}/api/search",
    headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
    json={"query": "relevant topic", "top_k": 10}).json()

# 3. Display: Present results in your UI
for result in results:
    print(f"Score: {result['score']:.2f} — {result['content'][:100]}")
```

## Resources

- [Cortex Apps Page](https://cortex.moca.qwellco.de/apps)
- [API Reference](https://docs-library.moca.qwellco.de/api)
- [Integration Examples](https://docs-library.moca.qwellco.de/examples/integration)
