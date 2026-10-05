# @mocaos/cortex-client

Official TypeScript client for the [Cortex](https://github.com/mocaOS/cortex-app) knowledge-base API. One dependency-free package that owns the choreography every integration used to hand-roll: unified ask with the `depth` dial, SSE streaming (typed frames, heartbeats, graceful-shutdown handling), conversation threads with server-curated memory, upload-and-wait, collection find-or-create, ingestion status, and webhook administration.

Works on Node ≥18 and modern browsers (threads' file persistence is Node-only and lazily imported).

```bash
npm install @mocaos/cortex-client
```

## Quick start

```ts
import { CortexClient } from "@mocaos/cortex-client";

const cortex = new CortexClient({
  baseUrl: "http://localhost:8000",
  apiKey: process.env.CORTEX_API_KEY!,
});

// Quick answer (seconds)
const quick = await cortex.ask("What did we decide about the auth rewrite?");

// Deep research (agentic multi-step retrieval — minutes, streamed)
const deep = await cortex.deepResearch("Compare every SSE approach we tried", {
  onContent: (token) => process.stdout.write(token),
});
console.log(deep.sources.map((s) => s.document_title));
```

`ask()` takes `depth: "fast" | "standard" | "deep"` — the SDK sends both the unified dial and the equivalent legacy flags, so it works against current and older Cortex backends alike. `"deep"` transparently uses the SSE endpoint (the only place the backend runs agentic research).

## Conversation threads (multi-turn memory)

```ts
const thread = cortex.thread("auth-review");
await thread.ask("How does cortex-app validate API keys?");
await thread.ask("Expand on the caching part"); // follow-ups work
```

A thread carries the full history plus the opaque `conversation_memory` blob the backend curates (rolling summary, facts, source ledger) and replays both each turn. Default persistence is in-memory; for durable threads that interoperate with the Hermes skill's `cortex.sh --thread` state:

```ts
import { FileThreadStore } from "@mocaos/cortex-client";
cortex.useThreadStore(
  new FileThreadStore(`${process.env.HOME}/.hermes/skills/state/cortex/threads`)
);
```

## Structured answers

```ts
const result = await cortex.ask("List the deployment options with trade-offs", {
  response_format: {
    type: "object",
    properties: { options: { type: "array", items: { type: "object" } } },
    required: ["options"],
  },
});
console.log(result.structured); // parsed object (null if the model's output didn't parse)
```

Non-streaming `depth: "fast" | "standard"` only.

## Documents

```ts
const doc = await cortex.upload("notes.md", "# Meeting notes …", {
  collection_id: (await cortex.ensureCollection("Agent Memory")).id,
  source: "my-agent",
});
await cortex.waitForDocument(doc.document_id);      // poll until processed
// …or skip polling entirely: register a webhook (admin key) and get pushed
// document.processed events instead.

const recent = await cortex.listDocuments({ sort: "-upload_date", limit: 20 });
const backlog = await cortex.ingestionStatus();      // {counts, active, idle, …}
```

## Context assembly (retrieval into your own prompt)

```ts
const bundle = await cortex.getContext("deployment options", { max_tokens: 3000 });
myPrompt += bundle.text;   // [src_N]-cited chunks + graph + community sections
```

One call, token-budgeted: reranked chunks plus entity/relationship and community context, structured and as a ready-to-inject block. Requires a backend with `POST /api/context` (2026-08-10+; older instances 404).

## Streaming, raw

```ts
for await (const event of cortex.askStream("question", { depth: "deep" })) {
  switch (event.type) {           // current backends stamp `type`…
    case "content": process.stdout.write(event.content!); break;
    case "sources": renderSources(event.sources!); break;
  }
  // …but the flat keys (event.content, event.sources, …) work on any version.
}
```

`collectAskStream()` aggregates a stream into one result and always reads to stream end — the `memory_update` frame may arrive **after** the `done` frame.

Streams are parsed with LF framing; spec-legal CRLF line endings are accepted identically at the same frame boundary.

## Webhooks (admin key)

```ts
const hook = await cortex.createWebhook("https://my.app/hooks/cortex", {
  events: ["document.processed", "document.failed"],
});
console.log(hook.secret); // shown ONCE — verify deliveries with it
```

Deliveries are signed `X-Cortex-Signature: t=<unix>,v1=hex(hmac_sha256(secret, "<t>.<body>"))`.

## Answer flags

Every `AskResult` may carry `refused` (the backend returned its canned prompt-injection refusal instead of knowledge — rephrase as a plain question about the content) and `truncated` (the answer hit the writer's output-token cap). Both default to absent/false and need a backend newer than v1.2.1; on older backends detect a refusal by its text (`"I'm here to help with questions about your documents…"`).

## Errors

Every non-2xx response throws `CortexApiError` with `status`, `errorCode` (the backend's machine-readable code, e.g. `agentic_requires_streaming`, `depth_conflict`), and the raw `body`. Stream failures throw `CortexStreamError`; a graceful server restart mid-stream throws `CortexServerRestart` (safe to retry).

## Related

- Skill docs for agents: [cortexskills.org](https://cortexskills.org) (`/ask`, `/search`, `/upload`, …)
- MCP server: `@mocaos/cortex-mcp` (built on this client)
- Self-hosting: `npx @mocaos/cortex`
