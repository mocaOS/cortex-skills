import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CortexApiError,
  CortexClient,
  CortexServerRestart,
  CortexStreamError,
  collectAskStream,
  parseSSEStream,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Captured {
  url: string;
  init: RequestInit;
  body?: unknown;
}

function mockFetch(
  responder: (url: string, init: RequestInit) => Response
): { fetch: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    let body: unknown;
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, init, body });
    return responder(url, init);
  }) as typeof fetch;
  return { fetch: impl, calls };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(frames: string[]): Response {
  return new Response(frames.join(""), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function frame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function client(responder: (url: string, init: RequestInit) => Response) {
  const { fetch: fetchImpl, calls } = mockFetch(responder);
  const c = new CortexClient({
    baseUrl: "http://cortex.test/",
    apiKey: "cortex_rw_key",
    fetch: fetchImpl,
  });
  return { c, calls };
}

// ---------------------------------------------------------------------------
// Ask body shape
// ---------------------------------------------------------------------------

test("ask sends unified depth AND agreeing legacy flags", async () => {
  const { c, calls } = client(() =>
    jsonResponse({ answer: "hi", sources: [] })
  );
  await c.ask("q");
  assert.equal(calls[0].url, "http://cortex.test/api/ask");
  const body = calls[0].body as Record<string, unknown>;
  assert.equal(body.depth, "standard");
  assert.equal(body.use_agentic, false);
  assert.equal(body.use_fast_search, false);
});

test("ask depth fast maps to use_fast_search", async () => {
  const { c, calls } = client(() => jsonResponse({ answer: "a", sources: [] }));
  await c.ask("q", { depth: "fast", collection_id: "c1", top_k: 3 });
  const body = calls[0].body as Record<string, unknown>;
  assert.equal(body.depth, "fast");
  assert.equal(body.use_fast_search, true);
  assert.equal(body.use_agentic, false);
  assert.equal(body.collection_id, "c1");
  assert.equal(body.top_k, 3);
});

test("deep research streams and aggregates", async () => {
  const { c, calls } = client(() =>
    sseResponse([
      frame({ type: "status", status: { stage: "searching" } }),
      ": ping\n\n",
      frame({ type: "content", content: "Answer " }),
      frame({ type: "content", content: "text" }),
      frame({ type: "sources", sources: [{ document_id: "d1", chunk_id: "c1", content: "x", score: 1, metadata: {} }] }),
      frame({ type: "done", done: true }),
    ])
  );
  const tokens: string[] = [];
  const result = await c.deepResearch("big question", {
    onContent: (t) => tokens.push(t),
  });
  assert.equal(calls[0].url, "http://cortex.test/api/ask/stream");
  const body = calls[0].body as Record<string, unknown>;
  assert.equal(body.depth, "deep");
  assert.equal(body.use_agentic, true);
  assert.equal(result.answer, "Answer text");
  assert.equal(result.sources.length, 1);
  assert.deepEqual(tokens, ["Answer ", "text"]);
});

test("memory_update after done is captured (never break at done)", async () => {
  const { c } = client(() =>
    sseResponse([
      frame({ content: "ok" }),
      frame({ done: true, pending_memory: true }),
      frame({ memory_update: { version: 3, facts: ["f1"] } }),
    ])
  );
  const result = await c.ask("q", { conversation_memory: {} });
  assert.deepEqual(result.memory_update, { version: 3, facts: ["f1"] });
});

test("stream error frame throws CortexStreamError", async () => {
  const { c } = client(() => sseResponse([frame({ error: "boom" })]));
  await assert.rejects(
    () => c.deepResearch("q"),
    (e: Error) => e instanceof CortexStreamError
  );
});

test("shutdown frame throws CortexServerRestart", async () => {
  const events = parseSSEStream(
    new Response('event: shutdown\ndata: {"reason": "restart"}\n\n').body!
  );
  await assert.rejects(
    () => collectAskStream(events),
    (e: Error) => e instanceof CortexServerRestart
  );
});

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

test("thread carries history and memory across turns", async () => {
  let turn = 0;
  const { c, calls } = client(() => {
    turn += 1;
    return sseResponse([
      frame({ content: `answer ${turn}` }),
      frame({ done: true, pending_memory: true }),
      frame({ memory_update: { version: 3, turn } }),
    ]);
  });

  const thread = c.thread("research");
  await thread.ask("first question");
  await thread.ask("follow-up");

  const second = calls[1].body as Record<string, unknown>;
  assert.deepEqual(second.conversation_memory, { version: 3, turn: 1 });
  const history = second.conversation_history as { role: string; content: string }[];
  assert.equal(history.length, 2);
  assert.equal(history[0].content, "first question");
  assert.equal(history[1].content, "answer 1");
});

// ---------------------------------------------------------------------------
// Documents / upload / errors
// ---------------------------------------------------------------------------

test("listDocuments builds query params", async () => {
  const { c, calls } = client(() => jsonResponse({ documents: [], total: 0 }));
  await c.listDocuments({ collection_id: "c1", sort: "-upload_date", limit: 10, offset: 20 });
  assert.match(calls[0].url, /\/api\/documents\?/);
  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get("collection_id"), "c1");
  assert.equal(url.searchParams.get("sort"), "-upload_date");
  assert.equal(url.searchParams.get("limit"), "10");
  assert.equal(url.searchParams.get("offset"), "20");
});

test("upload sends multipart with query params", async () => {
  const { c, calls } = client(() =>
    jsonResponse({ document_id: "d1", id: "d1", filename: "n.md", status: "processing", message: "ok" })
  );
  const result = await c.upload("n.md", "# note", {
    collection_id: "c1",
    source: "sdk-test",
  });
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/api/upload");
  assert.equal(url.searchParams.get("collection_id"), "c1");
  assert.equal(url.searchParams.get("start_processing"), "true");
  assert.equal(url.searchParams.get("source"), "sdk-test");
  assert.ok(calls[0].init.body instanceof FormData);
  assert.equal(result.document_id, "d1");
});

test("API errors map to CortexApiError with errorCode", async () => {
  const { c } = client(() =>
    jsonResponse(
      { detail: { error: "agentic_requires_streaming", message: "use the stream" } },
      400
    )
  );
  await assert.rejects(
    () => c.ask("q"),
    (e: CortexApiError) =>
      e instanceof CortexApiError &&
      e.status === 400 &&
      e.errorCode === "agentic_requires_streaming"
  );
});

test("getContext posts the bundle request", async () => {
  const { c, calls } = client(() =>
    jsonResponse({
      query: "q", chunks: [], communities: [], text: "=== Knowledge Context ===",
      token_count: 5, budget: { max_tokens: 1000 },
    })
  );
  const bundle = await c.getContext("q", { max_tokens: 1000, collection_id: "c1" });
  assert.equal(calls[0].url, "http://cortex.test/api/context");
  const body = calls[0].body as Record<string, unknown>;
  assert.equal(body.query, "q");
  assert.equal(body.max_tokens, 1000);
  assert.equal(body.collection_id, "c1");
  assert.equal(bundle.text, "=== Knowledge Context ===");
});

test("ensureCollection finds before creating", async () => {
  const { c, calls } = client((url) => {
    if (url.endsWith("/api/collections")) {
      return jsonResponse({ collections: [{ id: "c1", name: "Notes" }] });
    }
    throw new Error("unexpected call");
  });
  const col = await c.ensureCollection("Notes");
  assert.equal(col.id, "c1");
  assert.equal(calls.length, 1); // no POST
});
