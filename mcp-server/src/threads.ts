/**
 * Local conversation-thread state for the ask_question tool.
 *
 * A thread carries the full conversation_history PLUS the server-curated
 * conversation_memory blob across calls, so follow-up questions work instead
 * of every ask being a cold one-shot. File shape is shared with the Hermes
 * skill/plugin ({history, memory, updated_at}); point CORTEX_STATE_DIR at
 * the same directory (e.g. ~/.hermes/skills/state/cortex) to interoperate.
 */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ConversationMessage } from "./cortex-client.js";

export interface ThreadState {
  history: ConversationMessage[];
  memory: Record<string, unknown>;
}

function threadsDir(): string {
  const state = process.env.CORTEX_STATE_DIR?.trim()
    ? process.env.CORTEX_STATE_DIR.trim()
    : join(homedir(), ".cortex-mcp");
  return join(state, "threads");
}

export function threadKey(name: string): string {
  const key = name.trim().replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
  return key || "default";
}

export function loadThread(name: string): ThreadState {
  try {
    const raw = readFileSync(join(threadsDir(), `${threadKey(name)}.json`), "utf8");
    const state = JSON.parse(raw) as Partial<ThreadState>;
    if (Array.isArray(state.history)) {
      return {
        history: state.history,
        memory:
          state.memory && typeof state.memory === "object" ? state.memory : {},
      };
    }
  } catch {
    // new thread
  }
  return { history: [], memory: {} };
}

export function saveThread(
  name: string,
  prior: ThreadState,
  question: string,
  answer: string,
  memory: Record<string, unknown>
): void {
  try {
    const dir = threadsDir();
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${threadKey(name)}.json`);
    writeFileSync(
      path,
      JSON.stringify(
        {
          history: [
            ...prior.history,
            { role: "user", content: question },
            { role: "assistant", content: answer },
          ],
          memory: memory ?? {},
          updated_at: new Date().toISOString(),
        },
        null,
        2
      )
    );
    chmodSync(path, 0o600);
  } catch {
    // thread persistence is best-effort — never fail the answer over it
  }
}
