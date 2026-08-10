/** SSE parsing for /api/ask/stream.
 *
 * Frames are `data: {json}` lines separated by blank lines; `: ping` comment
 * lines are keep-alives; `event: shutdown` announces a graceful server
 * restart. Current backends stamp every frame with a `type` field — but the
 * flat keys are authoritative here so the parser works against any backend
 * version.
 */

import type { AskResult, AskStreamEvent } from "./types.js";

export class CortexStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CortexStreamError";
  }
}

/** Thrown when the server closes the stream for a restart — retry the call. */
export class CortexServerRestart extends Error {
  constructor() {
    super("Cortex server is restarting — retry the request");
    this.name = "CortexServerRestart";
  }
}

/** Async-iterate the typed events of an SSE body. */
export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<AskStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          if (line.startsWith("event: shutdown")) {
            throw new CortexServerRestart();
          }
          if (!line.startsWith("data:")) continue; // incl. `: ping` keep-alives
          let event: AskStreamEvent;
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue; // partial/malformed line — skip
          }
          yield event;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Collect a full ask stream into one AskResult.
 *
 * Reads to stream END — never breaks at the `done` frame, because the
 * memory_update frame may arrive after it (EMIT_DONE_BEFORE_MEMORY). Throws
 * CortexStreamError on an error frame.
 */
export async function collectAskStream(
  events: AsyncIterable<AskStreamEvent>,
  handlers?: {
    onContent?: (token: string) => void;
    onEvent?: (event: AskStreamEvent) => void;
  }
): Promise<AskResult> {
  const result: AskResult = { answer: "", sources: [] };
  const steps: string[] = [];
  for await (const event of events) {
    handlers?.onEvent?.(event);
    if (event.error) throw new CortexStreamError(event.error);
    if (typeof event.content === "string") {
      result.answer += event.content;
      handlers?.onContent?.(event.content);
    }
    if (event.sources) result.sources = event.sources;
    if (event.graph_context) result.graph_context = event.graph_context;
    if (event.sub_questions) result.sub_questions = event.sub_questions;
    if (event.communities_used) result.communities_used = event.communities_used;
    if (event.memory_update) result.memory_update = event.memory_update;
    if (typeof event.thinking === "string") steps.push(event.thinking);
    if (typeof event.retrieval === "string") steps.push(event.retrieval);
  }
  if (steps.length) result.reasoning_steps = steps;
  return result;
}
