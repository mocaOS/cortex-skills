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
  // Published baseline contract: cortex-app emits LF-terminated frames
  // ("...\n\n"). The published baseline parser (sse.ts at sha256 42019a48…)
  // splits only on "\n\n", so a spec-legal CRLF-framed body
  // ("data: {...}\r\n\r\n") yields zero events. That baseline limitation is
  // asserted and frozen by the CRLF acceptance delta tests below, which were
  // added BEFORE any parser edit.
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

test("deep research retains a positive truncation flag without changing answer content", async () => {
  const answer = "A partial answer.";
  const { c } = client(() =>
    sseResponse([frame({ content: answer }), frame({ done: true, truncated: true })])
  );
  const result = await c.deepResearch("q");
  assert.equal(result.truncated, true);
  assert.equal(result.answer, answer);
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

// ---------------------------------------------------------------------------
// CRLF acceptance delta (frozen gate, added BEFORE any parser edit)
//
// The SSE spec treats CRLF as a legal line terminator, so a CRLF-framed body
// must parse identically to its LF twin: alternate line endings at the same
// frame boundary. The published baseline parser (sse.ts at sha256 42019a48…)
// splits only on "\n\n" and yields zero events for such bodies (the baseline
// limitation noted in the LF framing test above). These gates freeze the
// required acceptance BEFORE any parser edit: run against the unchanged
// baseline parser they must FAIL on the CRLF assertions only, while the
// embedded LF twins / byte-split controls pass, so
// an observed failure isolates CRLF handling and cannot be produced by a
// chunking or UTF-8 regression. Held-stream oracles follow the established
// pattern (named AssertionError on a 250ms timer, unconditional release plus
// consumer cleanup in finally), so a rejection is testCodeFailure — never a
// runner "cancelled" outcome.
// ---------------------------------------------------------------------------

function crlf(s: string): string {
  return s.replace(/\n/g, "\r\n");
}

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function byteSlices(bytes: Uint8Array, cuts: number[]): Uint8Array[] {
  const edges = [0, ...cuts, bytes.length];
  const slices: Uint8Array[] = [];
  for (let i = 0; i < edges.length - 1; i++) slices.push(bytes.slice(edges[i], edges[i + 1]));
  return slices;
}

async function collectEvents(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const seen: unknown[] = [];
  for await (const e of parseSSEStream(stream)) seen.push(e);
  return seen;
}

/** Index of a byte pattern inside an encoded body, or -1. */
function byteIndexOf(bytes: Uint8Array, pattern: number[]): number {
  outer: for (let i = 0; i <= bytes.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) {
      if (bytes[i + j] !== pattern[j]) continue outer;
    }
    return i;
  }
  return -1;
}

test("control: LF framing tolerates arbitrary byte/chunk splits, including inside multi-byte UTF-8", async () => {
  const encoder = new TextEncoder();
  const body =
    'data: {"content": "hällo"}\n\ndata: {"content": "wörld"}\n\n: ping\n\ndata: {"done": true}\n\n';
  const bytes = encoder.encode(body);
  // Cut before 'ä' (valid boundary), between the two UTF-8 bytes of 'ä'
  // (0xC3 | 0xA4), and between the two \n of a frame boundary — every cut
  // lands mid-token from the parser's viewpoint. The mid-'ä' offset is the
  // prefix length up to 'h' PLUS ONE byte, not the '…hä' prefix length (that
  // would include both bytes of 'ä' and cut after the complete character).
  const cutBeforeUtf8 = encoder.encode('data: {"content": "h').length;
  const cutMidUtf8 = cutBeforeUtf8 + 1;
  const cutMidBoundary = encoder.encode('data: {"content": "hällo"}\n').length;
  const chunks = byteSlices(bytes, [cutBeforeUtf8, cutMidUtf8, cutMidBoundary]);
  // Prove the cut really is mid-character: chunk 2 is exactly the 0xC3 byte
  // (first byte of 'ä') and chunk 3 starts with 0xA4 (second byte).
  assert.equal(chunks[1].length, 1);
  assert.equal(chunks[1][0], 0xc3);
  assert.equal(chunks[2][0], 0xa4);
  const seen = await collectEvents(streamOf(chunks));
  assert.deepEqual(seen, [{ content: "hällo" }, { content: "wörld" }, { done: true }]);
});

test("CRLF framing parses identically to its LF twin (multi-line frame, comments, malformed lines)", async () => {
  const lfBody =
    'event: status\ndata: {"stage": "searching"}\n\n' +
    frame({ content: "a" }) +
    "data: not-json{{\n\n" +
    ": ping\n\n" +
    frame({ content: "b" }) +
    frame({ done: true });
  const expected = [
    { stage: "searching" }, // the `event: status` line is skipped; its data line still yields
    { content: "a" },
    { content: "b" },
    { done: true },
  ];
  const lfSeen = await collectEvents(new Response(lfBody).body!);
  assert.deepEqual(lfSeen, expected); // healthy LF control

  const crlfSeen = await collectEvents(new Response(crlf(lfBody)).body!);
  assert.deepEqual(crlfSeen, expected); // FAILS against the unchanged parser: []
});

test("CRLF frames split across arbitrary byte boundaries (including between \\r and \\n) parse identically", async () => {
  const encoder = new TextEncoder();
  const lfBody = frame({ content: "hällo" }) + frame({ content: "b" }) + frame({ done: true });
  const expected = [{ content: "hällo" }, { content: "b" }, { done: true }];

  // LF control: the same splitting discipline (mid-'ä', inside the "\n\n"
  // boundary) is already handled — the failure below is CRLF-specific. Cut
  // offsets are located in the encoded bytes themselves so they cannot drift
  // from the actual body: v1.1's spaced-prefix offsets never landed where the
  // gate claimed (the frame() helper emits compact JSON), which the byte
  // assertions introduced in v1.2 exposed.
  const lfBytes = encoder.encode(lfBody);
  const lfUtf8At = byteIndexOf(lfBytes, [0xc3]); // index of the first byte of 'ä'
  const lfBoundaryCut = byteIndexOf(lfBytes, [0x0a, 0x0a]) + 1; // between the two \n
  assert.equal(lfBytes[lfUtf8At], 0xc3);
  assert.equal(lfBytes[lfUtf8At + 1], 0xa4);
  // A cut offset k means chunk N ends at byte k-1: to end a chunk with the
  // 0xC3 byte, cut at its index + 1.
  const lfChunks = byteSlices(lfBytes, [lfUtf8At + 1, lfBoundaryCut]);
  assert.equal(lfChunks[0][lfChunks[0].length - 1], 0xc3); // chunk 1 ends mid-'ä'
  assert.equal(lfChunks[1][0], 0xa4); // chunk 2 starts with the second byte
  const lfSeen = await collectEvents(streamOf(lfChunks));
  assert.deepEqual(lfSeen, expected);

  // CRLF: cut mid-'ä' and inside "\r\n\r\n" between \r and \n (both CRLFs of
  // the pair are cut mid-boundary).
  const crlfBytes = encoder.encode(crlf(lfBody));
  const crlfUtf8At = byteIndexOf(crlfBytes, [0xc3]);
  const firstBoundary = byteIndexOf(crlfBytes, [0x0d, 0x0a, 0x0d, 0x0a]); // first \r\n\r\n
  assert.equal(crlfBytes[firstBoundary], 0x0d);
  assert.equal(crlfBytes[firstBoundary + 1], 0x0a);
  assert.equal(crlfBytes[firstBoundary + 2], 0x0d);
  assert.equal(crlfBytes[firstBoundary + 3], 0x0a);
  // Cut after the 0xC3 byte (mid-'ä'), and after each \r of the pair (\r|\n).
  const crlfChunks = byteSlices(crlfBytes, [
    crlfUtf8At + 1,
    firstBoundary + 1,
    firstBoundary + 3,
  ]);
  assert.equal(crlfChunks[0][crlfChunks[0].length - 1], 0xc3); // chunk 1 ends mid-'ä'
  assert.equal(crlfChunks[1][0], 0xa4); // chunk 2 starts with the second byte
  const crlfSeen = await collectEvents(streamOf(crlfChunks));
  assert.deepEqual(crlfSeen, expected); // FAILS against the baseline parser: []
});

test("CRLF stream: onContent fires before close and late memory_update after done (held stream)", { timeout: 2_000 }, async () => {
  const encoder = new TextEncoder();
  let releaseContent: () => void = () => {};
  let releaseDone: () => void = () => {};
  const contentObserved = new Promise<void>((resolve) => {
    releaseContent = resolve;
  });
  const doneObserved = new Promise<void>((resolve) => {
    releaseDone = resolve;
  });
  const source = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(crlf(frame({ content: "token1" }))));
      // Hold everything else until token1 was observed incrementally.
      await contentObserved;
      controller.enqueue(encoder.encode(crlf(frame({ content: "token2" }))));
      controller.enqueue(encoder.encode(crlf(frame({ done: true }))));
      // Hold the late memory frame until done was delivered — memory_update
      // must be captured while the stream is still open (EMIT_DONE_BEFORE_MEMORY).
      await doneObserved;
      controller.enqueue(encoder.encode(crlf(frame({ memory_update: { summary: "m" } }))));
      controller.close();
    },
  });
  const tokens: string[] = [];
  const order: string[] = [];
  const collected = collectAskStream(parseSSEStream(source), {
    onContent: (t) => {
      tokens.push(t);
      if (t === "token1") releaseContent();
    },
    onEvent: (e) => {
      if (e.content !== undefined) order.push("content");
      else if (e.done === true) {
        order.push("done");
        releaseDone();
      } else if (e.memory_update) order.push("memory_update");
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      collected,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new assert.AssertionError({
              message: "onContent must fire before the source stream closes (EOF) — CRLF framing",
              actual: tokens,
              expected: ["token1", "token2"],
              operator: "deepStrictEqual",
            })
          );
        }, 250);
      }),
    ]);
    assert.deepEqual(tokens, ["token1", "token2"]);
    assert.deepEqual(order, ["content", "content", "done", "memory_update"]);
    assert.equal(result.answer, "token1token2");
    assert.deepEqual(result.memory_update, { summary: "m" });
  } finally {
    if (timer) clearTimeout(timer);
    releaseContent();
    releaseDone();
    await collected.catch(() => {});
  }
});

test("CRLF stream: shutdown sentinel aborts, preserving preceding incremental content (held stream)", { timeout: 2_000 }, async () => {
  const encoder = new TextEncoder();
  let releaseContent: () => void = () => {};
  const contentObserved = new Promise<void>((resolve) => {
    releaseContent = resolve;
  });
  const source = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(crlf(frame({ content: "token1" }))));
      // Hold the sentinel until token1 was observed incrementally — the
      // shutdown abort must not discard content delivered before it.
      await contentObserved;
      controller.enqueue(
        encoder.encode(crlf('event: shutdown\ndata: {"reason": "server restarting"}\n\n'))
      );
      controller.close();
    },
  });
  const tokens: string[] = [];
  const collected = collectAskStream(parseSSEStream(source), {
    onContent: (t) => {
      tokens.push(t);
      if (t === "token1") releaseContent();
    },
  });
  // Bound the hold: against the unchanged parser onContent never fires, so
  // without the oracle this would wait on an unresolvable promise.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await assert.rejects(
      Promise.race([
        collected,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new assert.AssertionError({
                message: "shutdown sentinel must abort after preceding incremental content — CRLF framing",
                actual: tokens,
                expected: ["token1"],
                operator: "deepStrictEqual",
              })
            );
          }, 250);
        }),
      ]),
      (e: Error) => e instanceof CortexServerRestart
    );
  } finally {
    if (timer) clearTimeout(timer);
    releaseContent();
    await collected.catch(() => {});
  }
  assert.deepEqual(tokens, ["token1"]);
});
