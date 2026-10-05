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
// - handshake version binding (advertised server.version == package.json version)
// - thread persistence (history + opaque memory survive a REAL subprocess
//   stop/restart on the same CORTEX_STATE_DIR; thread files keep the published
//   Hermes-shared shape {history, memory, updated_at}); thread keys are
//   name-scoped identities (no cross-thread leak) per the published contract

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
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
    // Sentinel route for the persistence gates: the curated blob carries the
    // exact question it was minted for, so a later process can only replay it
    // if the opaque memory really survived the restart through the file.
    if (typeof body.question === "string" && body.question.startsWith("restart:")) {
      return sseBody([
        { content: "restart answer" },
        { done: true, pending_memory: true },
        { memory_update: { version: 9, facts: [`asked:${body.question}`] } },
      ]);
    }
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

async function startSession(env = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_ENTRY],
    env: {
      CORTEX_BASE_URL: baseUrl,
      CORTEX_API_KEY: API_KEY,
      CORTEX_STATE_DIR: stateDir,
      ...env,
    },
  });
  // StdioClientTransport fires onclose only when the spawned server process
  // has actually exited — awaiting it proves a real stop, not another client
  // in the same process.
  const exited = new Promise((resolve) => {
    transport.onclose = resolve;
  });
  const client = new Client({ name: "contract-test", version: "0.0.0" });
  await client.connect(transport);
  return { client, exited };
}

async function startClient() {
  return (await startSession()).client;
}

// --- Persistence gate helpers -----------------------------------------------

const threadFile = (name) => join(stateDir, "threads", `${name}.json`);
const streamCallsFor = (question) =>
  seen.filter((c) => c.url === "/api/ask/stream" && c.body.question === question);

async function askDeep(client, question, thread) {
  return client.callTool({
    name: "ask_question",
    arguments: { question, mode: "deep_research", thread },
  });
}

async function stopSession(session) {
  await session.client.close();
  const closed = await Promise.race([
    session.exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 15_000).unref()),
  ]);
  assert.ok(closed, "the MCP server subprocess actually exited on close");
}

function packageVersion() {
  return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
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

test("initialize advertises the package's own server version (frozen binding)", async () => {
  const client = await startClient();
  try {
    const info = client.getServerVersion();
    assert.ok(info, "initialize result carries serverInfo");
    assert.equal(info.version, packageVersion());
  } finally {
    await client.close();
  }
});

test("thread history + opaque memory survive a full MCP subprocess stop/restart", async () => {
  const file = threadFile("restart-thread");
  let session = await startSession();
  try {
    await askDeep(session.client, "restart: first question", "restart-thread");
    await askDeep(session.client, "restart: follow-up", "restart-thread");
    const turns = [
      streamCallsFor("restart: first question")[0],
      streamCallsFor("restart: follow-up")[0],
    ];
    assert.deepEqual(turns[0].body.conversation_memory, {});
    assert.equal(turns[0].body.conversation_history.length, 0);
    assert.deepEqual(turns[1].body.conversation_memory, {
      version: 9,
      facts: ["asked:restart: first question"],
    });
    assert.equal(turns[1].body.conversation_history.length, 2);
  } finally {
    await stopSession(session);
  }

  const beforeRestart = readFileSync(file);
  session = await startSession(); // fresh subprocess, SAME owned CORTEX_STATE_DIR
  try {
    assert.ok(
      beforeRestart.equals(readFileSync(file)),
      "the restart itself must not rewrite the persisted thread file"
    );
    const result = await askDeep(session.client, "restart: after restart", "restart-thread");
    assert.match(result.content[0].text, /restart answer/);
  } finally {
    await stopSession(session);
  }

  const resumed = streamCallsFor("restart: after restart")[0];
  // The only way a brand-new process can replay turn 2's exact blob is the file.
  assert.deepEqual(resumed.body.conversation_memory, {
    version: 9,
    facts: ["asked:restart: follow-up"],
  });
  assert.deepEqual(resumed.body.conversation_history, [
    { role: "user", content: "restart: first question" },
    { role: "assistant", content: "restart answer" },
    { role: "user", content: "restart: follow-up" },
    { role: "assistant", content: "restart answer" },
  ]);
});

test("different thread keys are isolated identities; each resumes only its own state", async () => {
  const alphaFile = threadFile("isolated-alpha");
  const betaFile = threadFile("isolated-beta");
  let session = await startSession();
  try {
    await askDeep(session.client, "restart: alpha one", "isolated-alpha");
    await askDeep(session.client, "restart: beta one", "isolated-beta");
    const betaFirst = streamCallsFor("restart: beta one")[0];
    assert.deepEqual(betaFirst.body.conversation_memory, {}); // no leak from alpha
    assert.equal(betaFirst.body.conversation_history.length, 0);
    assert.ok(existsSync(alphaFile) && existsSync(betaFile), "one file per thread key");
  } finally {
    await stopSession(session);
  }

  const alphaBytes = readFileSync(alphaFile);
  session = await startSession();
  try {
    assert.ok(
      alphaBytes.equals(readFileSync(alphaFile)),
      "an unrelated thread file is untouched across a restart"
    );
    const result = await askDeep(session.client, "restart: beta two", "isolated-beta");
    assert.match(result.content[0].text, /restart answer/);
  } finally {
    await stopSession(session);
  }

  const resumed = streamCallsFor("restart: beta two")[0];
  assert.deepEqual(resumed.body.conversation_memory, {
    version: 9,
    facts: ["asked:restart: beta one"],
  });
  assert.deepEqual(resumed.body.conversation_history, [
    { role: "user", content: "restart: beta one" },
    { role: "assistant", content: "restart answer" },
  ]);
});

test("thread files keep the published Hermes-shared shape with sanitized keys", async () => {
  const session = await startSession();
  try {
    const result = await askDeep(
      session.client,
      "restart: shape probe",
      "session notes/2026-10-03"
    );
    const advertised = String(result.content[0].text).match(/thread '([^']+)' updated/);
    assert.ok(advertised, "the tool reply advertises the canonical thread key");
    assert.equal(advertised[1], "session-notes-2026-10-03");
    const file = threadFile(advertised[1]);
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    assert.deepEqual(parsed.memory, { version: 9, facts: ["asked:restart: shape probe"] });
    assert.deepEqual(parsed.history, [
      { role: "user", content: "restart: shape probe" },
      { role: "assistant", content: "restart answer" },
    ]);
    assert.ok(
      typeof parsed.updated_at === "string" && !Number.isNaN(Date.parse(parsed.updated_at))
    );
    if (process.platform !== "win32") {
      assert.equal(statSync(file).mode & 0o777, 0o600); // Hermes-shared state promise
    }
  } finally {
    await stopSession(session);
  }
});
