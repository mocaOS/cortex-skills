# App Catalog

Complete catalog of all Cortex apps -- source apps that ingest knowledge and workflow apps that provide interfaces on top of your knowledge graph.

---

## Architecture

Apps are **standalone services** that interact with your Cortex Library instance via the REST API. They are not plugins or extensions installed into the Library itself. Any app that can make HTTP requests can integrate with Cortex through the 60+ API endpoints.

**Two categories:**

- **Source Apps** -- Ingest knowledge from external platforms into your knowledge graph
- **Workflow Apps** -- Provide dashboards, exports, and integrations on top of your existing graph

---

## Source Apps

### YouTube Channel Importer

| | |
|---|---|
| **Category** | Source |
| **Price** | Premium (one-time purchase) |
| **Plans included** | Business ($249/mo), Enterprise |

**Description:** Paste a YouTube channel URL and Cortex transcribes every video, converts transcripts to structured markdown, and feeds them into your knowledge graph via the upload API. Hours of video become queryable knowledge in minutes.

**Workflow:**

1. Provide a YouTube channel URL
2. The app fetches the channel's complete video list
3. Each video's audio is transcribed to text
4. Transcripts are converted to structured markdown with metadata (title, date, duration)
5. Markdown documents are uploaded to your Cortex instance via `POST /api/upload`
6. The GraphRAG pipeline processes each document into the knowledge graph

**Use case:** Turn a 500-video educational channel into a searchable, queryable knowledge base in hours.

**Setup:**

1. Purchase the YouTube Channel Importer from the [Cortex Apps page](https://cortex.moca.qwellco.de/apps)
2. Configure your Cortex Library base URL and API key in the app
3. Paste a channel URL and start the import
4. Monitor progress in the app dashboard or via `GET /api/documents/pending`

---

### Web Crawler

| | |
|---|---|
| **Category** | Source |
| **Price** | Free |
| **Plans included** | All plans |

**Description:** Point at any website or sitemap URL. The crawler discovers all pages, extracts clean content from HTML, and ingests each page as a document into your knowledge graph.

**Workflow:**

1. Provide a website URL or sitemap URL
2. The crawler discovers all pages (follows links or parses sitemap)
3. Content is extracted from HTML and converted to clean text/markdown
4. Each page is uploaded as a document to Cortex via `POST /api/upload`
5. The knowledge graph builds automatically as documents are processed

**Use case:** Index your company documentation site, competitor websites, or public knowledge bases.

**Setup:**

1. Access the Web Crawler from your Cortex instance (included free)
2. Enter the target URL or sitemap URL
3. Configure crawl depth and page limits if needed
4. Start the crawl and monitor progress

---

### Notion Sync

| | |
|---|---|
| **Category** | Source |
| **Price** | Premium (one-time purchase) |
| **Plans included** | Business ($249/mo), Enterprise |

**Description:** Two-way sync between your Notion workspace and your Cortex knowledge graph. Pages, databases, and documents flow seamlessly between both systems.

**Workflow:**

1. Connect your Notion workspace via OAuth
2. Select which pages and databases to sync
3. Content is extracted from Notion and uploaded to Cortex
4. Changes in Notion are synced periodically (automatic re-sync)
5. Optionally sync Cortex insights back to Notion

**Use case:** Keep your team's Notion workspace and Cortex knowledge graph in sync for unified search and AI-powered Q&A across all your team knowledge.

**Setup:**

1. Purchase Notion Sync from the [Cortex Apps page](https://cortex.moca.qwellco.de/apps)
2. Authorize the Notion integration via OAuth
3. Select workspaces, pages, and databases to sync
4. Configure sync frequency (e.g., hourly, daily)
5. Run the initial sync

---

### Slack Archive Importer

| | |
|---|---|
| **Category** | Source |
| **Price** | Premium (one-time purchase) |
| **Plans included** | Business ($249/mo), Enterprise |

**Description:** Import entire Slack channel histories into your knowledge graph. Conversations, decisions, and institutional knowledge become searchable and connected through entity extraction.

**Workflow:**

1. Export your Slack workspace data (via Slack export) or connect via the Slack API
2. The importer processes channel histories
3. Conversations are chunked into logical segments and uploaded to Cortex
4. Entities (people, projects, decisions, technologies) are extracted from conversations

**Use case:** Unlock the institutional knowledge buried in years of Slack conversations. Find past decisions, project context, and team discussions through natural language search.

**Setup:**

1. Purchase the Slack Archive Importer from the [Cortex Apps page](https://cortex.moca.qwellco.de/apps)
2. Export your Slack workspace data or provide a Slack API token
3. Select which channels to import
4. Start the import process
5. Monitor via `GET /api/documents/pending`

---

## Workflow Apps

### Research Dashboard

| | |
|---|---|
| **Category** | Workflow |
| **Price** | Free |
| **Plans included** | All plans |

**Description:** Visual interface for exploring entities, relationships, and clusters in your knowledge graph. Provides an interactive force-directed graph visualization with filtering and search.

**Features:**

- Interactive force-directed graph visualization
- Entity and relationship exploration
- Community cluster view with summaries
- Search and filter entities by type (Person, Organization, Concept, Technology, etc.)
- Zoom into subgraphs around specific entities
- Node colors by entity type, node size by mention frequency
- Edge labels showing relationship types
- Dynamic expansion -- click entities to explore their connections

**Setup:** No setup required. Access via the Explore section in the Cortex Library web interface.

---

### API Playground

| | |
|---|---|
| **Category** | Workflow |
| **Price** | Free |
| **Plans included** | All plans |

**Description:** Test queries and prototype integrations directly in the browser. Send requests to any of the 60+ API endpoints and see formatted responses.

**Features:**

- Test any API endpoint with a visual interface
- Formatted JSON response display
- Request history for quick re-execution
- Code generation for curl, Python, and JavaScript
- Authentication handled automatically

**Setup:** No setup required. Access via the Cortex Library web interface.

---

## Pricing by Plan

| Plan | Monthly Cost | Free Apps | Premium Apps |
|------|-------------|-----------|--------------|
| **Free** | $0/mo | All included | Purchase individually |
| **Individual** | $19/mo | All included | Purchase individually |
| **Enthusiast** | $79/mo | All included | Select premium apps included |
| **Business** | $249/mo | All included | All premium apps included |
| **Enterprise** | Custom | All included | All premium apps included |

**Key points:**

- Free apps (Web Crawler, Research Dashboard, API Playground) are available on every plan at no additional cost.
- Premium apps (YouTube Channel Importer, Notion Sync, Slack Archive Importer) are one-time purchases, not subscriptions.
- Business and Enterprise plans include all premium apps automatically.

---

## Custom App Development

The Cortex team builds custom apps for teams with specific integration needs.

**Process:**

1. **Describe** your requirements to the Cortex team
2. **Receive** a detailed quote and timeline
3. **Review** and approve the proposal
4. **Build** -- the team develops the app for your requirements
5. **Launch** -- seamless integration with your Cortex instance

Custom apps follow the same architecture: standalone services that interact with Cortex via the REST API.

**Examples of custom apps built for teams:**

- CRM integration (Salesforce, HubSpot)
- Email archive importer (Gmail, Outlook)
- PDF batch processor with custom chunking logic
- Real-time monitoring dashboard
- Custom export formats (XML, CSV, proprietary formats)

---

## Building Your Own App

Any application that can make HTTP requests can integrate with Cortex. The core pattern:

```python
import requests

BASE_URL = "http://your-cortex-instance:8000"
API_KEY = "moca_rw_your_key"

# 1. Ingest: Upload content to the knowledge graph
requests.post(
    f"{BASE_URL}/api/upload",
    headers={"X-API-Key": API_KEY},
    files={"file": open("content.md", "rb")}
)

# 2. Query: Search or ask questions
results = requests.post(
    f"{BASE_URL}/api/search",
    headers={"X-API-Key": API_KEY, "Content-Type": "application/json"},
    json={"query": "relevant topic", "top_k": 10}
).json()

# 3. Display: Present results in your UI
for result in results["results"]:
    print(f"Score: {result['score']:.2f} - {result['content'][:100]}")
```

For the full API surface, see the [Library API Reference](/library/references/API.md).

---

## Resources

- [Cortex Apps Page](https://cortex.moca.qwellco.de/apps)
- [API Reference](https://docs-library.moca.qwellco.de/api)
- [Integration Examples](https://docs-library.moca.qwellco.de/examples/integration)
