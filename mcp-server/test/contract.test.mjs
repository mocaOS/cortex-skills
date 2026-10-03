// Hermetic contract suite for the MCP server.
//
// Exercises the REAL entry path: the built `dist/index.js` is spawned as a
// stdio subprocess and driven with the official MCP client SDK over
// StdioClientTransport, while its REST calls land on a loopback HTTP backend
// started inside this test. No external network, no live Cortex instance.
//
// Contract under test (mirrors cortex-app REST/SSE + public/mcp docs):
// - tool surface (names registered == documented in public/mcp/references/TOOLS.md)
// - scope auth passthrough (X-API-Key forwarded on every REST call)
// - REST field preservation (depth dial + legacy flags on /api/ask,
//   filters placement on /api/search)
// - SSE aggregation through the SDK (deep_research mode, memory after done)
// - error propagation (backend failure reaches the MCP client as isError)
// - entry wiring (missing env -> process exit, nonzero)

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, before, after } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const API_KEY = "cortex_rw_mcp_test_key";
const DIST_ENTRY = new URL("../dist/index.js", import.meta.url).pathname;

// --- Hermetic loopback backend ---------------------------------------------

const seen = []; // {method, url, headers, body}
let failingSearch = false; // negative-route switch for the failure test

function jsonResponse(data, status = 200) {
  return { status, headers: { "content-type": "application/json" }, body: JSON.stringify(data) };
}

function sseBody(frames) {
  return {
    status: 200,
    headers: { "content-type": "text/event-stream" },
    body: frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join(""),
  };
}

function route(method, path, body) {
  if (failingSearch && method === "POST" && path === "/api/search") {
    return jsonResponse({ detail: { error: "internal_error", message: "boom" } }, 500);
  }
  if (method === "GET" && path === "/health") {
    return jsonResponse({ status: "ok", neo4j_connected: true, version: "test" });
  }
  if (method === "POST" && path === "/api/search") {
    return jsonResponse({
      query: body.query,
      results: [
        {
          document_id: "d1",
          chunk_id: "c1",
          content: "chunk text",
          score: 0.9,
          metadata: { filename: "notes.md" },
        },
      ],
      total_results: 1,
    });
  }
  if (method === "POST" && path === "/api/ask") {
    return jsonResponse({ answer: "short answer", sources: [] });
  }
  if (method === "POST" && path === "/api/ask/stream") {
    return sseBody([
      { content: "deep " },
      { content: "answer" },
      { done: true, pending_memory: true },
      { memory_update: { version: 3, facts: ["f1"] } },
    ]);
  }
  if (method === "POST" && path === "/api/fail") {
    return jsonResponse({ detail: { error: "internal_error", message: "boom" } }, 500);
  }
  return jsonResponse({ detail: "Not found" }, 404);
}

let server;
let baseUrl;
let stateDir;

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = raw;
      }
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      const out = route(req.method, req.url.split("?")[0], body);
      res.writeHead(out.status, out.headers);
      res.end(out.body);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  stateDir = mkdtempSync(join(tmpdir(), "cortex-mcp-test-"));
});

after(() => {
  server.close();
  rmSync(stateDir, { recursive: true, force: true });
});

// --- Client harness ----------------------------------------------------------

async function startClient() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_ENTRY],
    env: {
      CORTEX_BASE_URL: baseUrl,
      CORTEX_API_KEY: API_KEY,
      CORTEX_STATE_DIR: stateDir,
    },
  });
  const client = new Client({ name: "contract-test", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

const DOCUMENTED_TOOLS = [
  "search_knowledge",
  "ask_question",
  "list_documents",
  "get_document",
  "get_document_content",
  "list_entities",
  "get_entity",
  "search_entities",
  "list_collections",
  "list_communities",
  "upload_document",
  "get_stats",
];

test("tools/list exposes exactly the documented tool surface", async () => {
  const client = await startClient();
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [...DOCUMENTED_TOOLS].sort());
  } finally {
    await client.close();
  }
});

test("search_knowledge forwards the query and the API key (scope auth preserved)", async () => {
  const client = await startClient();
  try {
    const result = await client.callTool({ name: "search_knowledge", arguments: { query: "hello" } });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /notes\.md/);
    assert.match(result.content[0].text, /chunk text/);
    const call = seen.find((c) => c.url === "/api/search");
    assert.ok(call, "backend received POST /api/search");
    assert.equal(call.headers["x-api-key"], API_KEY);
    assert.equal(call.body.query, "hello");
    assert.equal(call.body.top_k, 10); // zod default reaches the wire
  } finally {
    await client.close();
  }
});

test("ask_question chat mode sends depth + agreeing legacy flags to /api/ask", async () => {
  const client = await startClient();
  try {
    const result = await client.callTool({
      name: "ask_question",
      arguments: { question: "what?" },
    });
    assert.match(result.content[0].text, /short answer/);
    const call = seen.find((c) => c.url === "/api/ask");
    assert.ok(call, "backend received POST /api/ask");
    assert.equal(call.headers["x-api-key"], API_KEY);
    assert.equal(call.body.question, "what?");
    assert.equal(call.body.depth, "standard");
    assert.equal(call.body.use_agentic, false);
    assert.equal(call.body.use_fast_search, false);
    assert.equal(call.body.use_graph, true); // zod default reaches the wire
  } finally {
    await client.close();
  }
});

test("ask_question deep_research streams SSE and aggregates content + memory", async () => {
  const client = await startClient();
  try {
    const result = await client.callTool({
      name: "ask_question",
      arguments: { question: "research this", mode: "deep_research" },
    });
    assert.match(result.content[0].text, /deep answer/);
    const call = seen.find((c) => c.url === "/api/ask/stream");
    assert.ok(call, "backend received POST /api/ask/stream");
    assert.equal(call.body.depth, "deep");
    assert.equal(call.body.use_agentic, true);
    // SSE opaque memory contract: round trip through a thread — turn 1 sends
    // an empty memory blob and receives memory_update; the follow-up replays
    // the blob the backend curated, unmodified, with the accumulated history.
    const threadName = "contract-thread";
    const turn1 = await client.callTool({
      name: "ask_question",
      arguments: { question: "first thread question", mode: "deep_research", thread: threadName },
    });
    assert.match(turn1.content[0].text, /deep answer/);
    const result2 = await client.callTool({
      name: "ask_question",
      arguments: { question: "follow-up", mode: "deep_research", thread: threadName },
    });
    assert.match(result2.content[0].text, /deep answer/);
    const streamCalls = seen.filter((c) => c.url === "/api/ask/stream");
    const firstTurn = streamCalls[streamCalls.length - 2];
    const followUp = streamCalls[streamCalls.length - 1];
    assert.equal(firstTurn.body.depth, "deep");
    assert.deepEqual(firstTurn.body.conversation_memory, {}); // fresh thread
    assert.equal(firstTurn.body.conversation_history.length, 0);
    assert.deepEqual(followUp.body.conversation_memory, { version: 3, facts: ["f1"] });
    assert.equal(followUp.body.conversation_history.length, 2);
  } finally {
    await client.close();
  }
});

test("backend failure propagates as an MCP tool error, not a hang", async () => {
  const client = await startClient();
  try {
    failingSearch = true;
    const result = await client.callTool({
      name: "search_knowledge",
      arguments: { query: "trigger" },
    });
    failingSearch = false;
    assert.equal(result.isError, true);
    assert.match(String(result.content?.[0]?.text ?? ""), /boom|500/);
  } finally {
    failingSearch = false;
    await client.close();
  }
});

test("missing env vars: entry refuses to start (nonzero exit)", async () => {
  const { spawn } = await import("node:child_process");
  const exit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [DIST_ENTRY], {
      env: { PATH: process.env.PATH }, // no CORTEX_* vars
      stdio: ["ignore", "ignore", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("server did not exit without env config"));
    }, 10_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
  assert.notEqual(exit, 0);
});
