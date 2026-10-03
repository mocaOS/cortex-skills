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

function sseResponse(frames: string[]): Response {
  return new Response(frames.join(""), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function frame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function client(responder: (url: string, init: RequestInit) => Response, opts = {}) {
  const calls: { url: string; init: RequestInit; body?: unknown }[] = [];
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    let body: unknown;
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url: String(input), init, body });
    return responder(String(input), init);
  }) as typeof fetch;
  const c = new CortexClient({
    baseUrl: "http://cortex.test",
    apiKey: "cortex_rw_key",
    fetch: impl,
    ...opts,
  });
  return { c, calls };
}

// ---------------------------------------------------------------------------
// SSE transport contract (framing is the cross-version boundary)
// ---------------------------------------------------------------------------

test("SSE parser handles multi-line frames and comment keep-alives (LF framing)", async () => {
  // Current contract: cortex-app emits LF-terminated frames ("...\n\n").
  // NOTE (documented limitation, not asserted): a spec-legal CRLF-framed body
  // ("data: {...}\r\n\r\n") is NOT parsed — parseSSEStream splits only on
  // "\n\n", so such a stream yields zero events. Recorded as a finding for the
  // runtime owner; changing the parser is out of this campaign's scope.
  const events = parseSSEStream(
    new Response(
      "data: {\"content\": \"a\"}\ndata: {\"content\": \"b\"}\n\n: ping\n\ndata: {\"done\": true}\n\n"
    ).body!
  );
  const seen: unknown[] = [];
  for await (const e of events) seen.push(e);
  assert.deepEqual(seen, [
    { content: "a" },
    { content: "b" },
    { done: true },
  ]);
});

test("unknown event types and malformed data lines are skipped, not fatal", async () => {
  const events = parseSSEStream(
    new Response(
      [
        frame({ type: "future_field", new_thing: { a: 1 } }),
        "data: not-json{{\n\n",
        frame({ content: "still works" }),
      ].join("")
    ).body!
  );
  const seen: unknown[] = [];
  for await (const e of events) seen.push(e);
  assert.deepEqual(seen, [{ type: "future_field", new_thing: { a: 1 } }, { content: "still works" }]);
});

test("event: shutdown aborts collection with CortexServerRestart even after content", async () => {
  const events = parseSSEStream(
    new Response(
      frame({ content: "partial" }) +
        'event: shutdown\ndata: {"reason": "server restarting"}\n\n' +
        frame({ content: "never arrives" })
    ).body!
  );
  await assert.rejects(
    () => collectAskStream(events),
    (e: Error) => e instanceof CortexServerRestart
  );
});

test("flat-key frames without type are accepted (older/newer backend tolerance)", async () => {
  const { c } = client(() =>
    sseResponse([
      'event: status\ndata: {"stage": "searching"}\n\n',
      frame({ content: "hi" }),
      frame({ done: true }),
    ])
  );
  const result = await c.deepResearch("q");
  assert.equal(result.answer, "hi");
});

test("non-200 on the stream endpoint maps to CortexApiError with parsed body", async () => {
  const { c } = client(() =>
    new Response(JSON.stringify({ detail: { error: "scope_read_required", message: "read key needed" } }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  );
  await assert.rejects(
    () => c.deepResearch("q"),
    (e: CortexApiError) =>
      e instanceof CortexApiError && e.status === 403 && e.errorCode === "scope_read_required"
  );
});

// ---------------------------------------------------------------------------
// Error contract
// ---------------------------------------------------------------------------

test("error body variants map without throwing: string detail, non-JSON body", async () => {
  const stringDetail = client(() => jsonResponse({ detail: "Not found" }, 404));
  await assert.rejects(
    () => stringDetail.c.getDocument("d1"),
    (e: CortexApiError) =>
      e instanceof CortexApiError && e.status === 404 && /Not found/.test(e.message) && e.errorCode === undefined
  );

  const html = client(() => new Response("<html>Bad Gateway</html>", { status: 502 }));
  await assert.rejects(
    () => html.c.stats(),
    (e: CortexApiError) =>
      e instanceof CortexApiError && e.status === 502 && e.errorCode === undefined
  );
});

test("stream error frame surfaces the backend error string as CortexStreamError", async () => {
  const { c } = client(() => sseResponse([frame({ error: "monthly_quota_exceeded" })]));
  await assert.rejects(
    () => c.deepResearch("q"),
    (e: CortexStreamError) => e instanceof CortexStreamError && e.message === "monthly_quota_exceeded"
  );
});

// ---------------------------------------------------------------------------
// Request contract (auth header, timeout, normalization)
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("every request carries X-API-Key; streaming adds Accept: text/event-stream", async () => {
  const { c, calls } = client(() => sseResponse([frame({ content: "x" }), frame({ done: true })]));
  await c.search("q");
  await c.deepResearch("q");
  const searchHeaders = calls[0].init.headers as Record<string, string>;
  const streamHeaders = calls[1].init.headers as Record<string, string>;
  assert.equal(searchHeaders["X-API-Key"], "cortex_rw_key");
  assert.equal(streamHeaders["X-API-Key"], "cortex_rw_key");
  assert.equal(streamHeaders["Accept"], "text/event-stream");
});

test("trailing-slash base URLs are normalized, no double slash", async () => {
  const { c, calls } = client(() => jsonResponse({ status: "ok" }));
  await c.health();
  assert.equal(calls[0].url, "http://cortex.test/health");
});

test("timeout aborts the request instead of hanging", async () => {
  // Real fetch against a loopback server that accepts but never responds —
  // only the client timeout can end this. (The mock-fetch tests above do not
  // exercise the signal contract.)
  const { createServer } = await import("node:http");
  const server = createServer(() => {
    /* deliberately never responds */
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const c = new CortexClient({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: "cortex_rw_key",
      timeoutMs: 25,
    });
    await assert.rejects(() => c.stats(), (e: unknown) => e instanceof Error);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Collect contract (aggregation semantics)
// ---------------------------------------------------------------------------

test("refused and truncated flags propagate from done frame", async () => {
  const { c } = client(() =>
    sseResponse([frame({ content: "I cannot" }), frame({ done: true, refused: true, truncated: false })])
  );
  const result = await c.deepResearch("inject something");
  assert.equal(result.refused, true);
  assert.equal(result.truncated, undefined);
});

test("reasoning steps accumulate from thinking and retrieval frames", async () => {
  const { c } = client(() =>
    sseResponse([
      frame({ thinking: "plan" }),
      frame({ retrieval: "searched 3 sources" }),
      frame({ content: "a" }),
      frame({ done: true }),
    ])
  );
  const result = await c.deepResearch("q");
  assert.deepEqual(result.reasoning_steps, ["plan", "searched 3 sources"]);
});

// ---------------------------------------------------------------------------
// Streaming callback contract (collectAskStream boundary)
//
// sdk/README.md documents `onContent: (token) => process.stdout.write(token)`
// under streamed deep research — callbacks are an incremental-observation
// promise, not an implementation freedom. This gate proves onContent fires
// while the source is still open: the controlled ReadableStream refuses to
// emit its second frame (and EOF) until the callback has fired for the first,
// so an implementation that defers observations until EOF can only deadlock.
// The oracle races the collection against a 250ms timer that rejects with a
// named AssertionError, so a deferred-callback candidate FAILS (exit 1) on
// the intended assertion instead of being runner-cancelled; the finally
// clears the timer, releases the stream, and awaits consumer cleanup.
// ---------------------------------------------------------------------------

test("onContent fires before the source stream closes (incremental observation)", { timeout: 2_000 }, async () => {
  const encoder = new TextEncoder();
  let releaseSecondFrame: () => void = () => {};
  const secondFrameRequested = new Promise<void>((resolve) => {
    releaseSecondFrame = resolve;
  });
  const source = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(frame({ content: "token1" })));
      // Block EOF until the callback has been observed — the release only
      // happens from onContent below.
      await secondFrameRequested;
      controller.enqueue(encoder.encode(frame({ content: "token2" })));
      controller.close();
    },
  });
  const tokens: string[] = [];
  const collected = collectAskStream(parseSSEStream(source), {
    onContent: (t) => {
      tokens.push(t);
      if (t === "token1") releaseSecondFrame();
    },
  });
  // Explicit oracle bound: onContent must arrive before EOF. Without it a
  // deferred-callback candidate only deadlocks on an unresolvable promise,
  // which the runner reports as "cancelled" — not a named assertion failure.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      collected,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new assert.AssertionError({
              message: "onContent must fire before the source stream closes (EOF)",
              actual: tokens,
              expected: ["token1", "token2"],
              operator: "deepStrictEqual",
            })
          );
        }, 250);
      }),
    ]);
    assert.deepEqual(tokens, ["token1", "token2"]);
    assert.equal(result.answer, "token1token2");
  } finally {
    if (timer) clearTimeout(timer);
    // Release the stream unconditionally so its start() completes and closes
    // (no leak), then await the consumer to finish draining before exiting.
    releaseSecondFrame();
    await collected.catch(() => {});
  }
});
