/** Conversation threads — multi-turn asks with server-curated memory.
 *
 * A thread carries the FULL conversation history plus the opaque
 * `conversation_memory` blob the backend curates (rolling summary, facts,
 * source ledger). Send both each turn; read the updated blob back from the
 * stream's memory_update frame. That makes follow-ups ("expand on the second
 * point") work instead of every ask being a cold one-shot.
 *
 * Persistence is pluggable:
 * - MemoryThreadStore (default) — per-process.
 * - FileThreadStore — Node-only JSON files, shape-compatible with the Hermes
 *   skill/plugin state ({history, memory, updated_at}); point it at
 *   ~/.hermes/skills/state/cortex/threads to interoperate with cortex.sh.
 */

import type { CortexClient } from "./client.js";
import type {
  AskOptions,
  AskResult,
  ConversationMessage,
  ThreadState,
  ThreadStore,
} from "./types.js";

export function threadKey(name: string): string {
  const key = name.trim().replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
  return key || "default";
}

export class MemoryThreadStore implements ThreadStore {
  private readonly states = new Map<string, ThreadState>();

  async load(name: string): Promise<ThreadState> {
    const state = this.states.get(threadKey(name));
    return state
      ? { history: [...state.history], memory: { ...state.memory } }
      : { history: [], memory: {} };
  }

  async save(name: string, state: ThreadState): Promise<void> {
    this.states.set(threadKey(name), state);
  }
}

/** Node-only file persistence (dynamic imports keep the SDK browser-safe). */
export class FileThreadStore implements ThreadStore {
  constructor(private readonly directory: string) {}

  private async path(name: string): Promise<string> {
    const { join } = await import("node:path");
    return join(this.directory, `${threadKey(name)}.json`);
  }

  async load(name: string): Promise<ThreadState> {
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = JSON.parse(await readFile(await this.path(name), "utf8"));
      if (Array.isArray(raw.history)) {
        return {
          history: raw.history as ConversationMessage[],
          memory:
            raw.memory && typeof raw.memory === "object"
              ? (raw.memory as Record<string, unknown>)
              : {},
        };
      }
    } catch {
      /* new thread */
    }
    return { history: [], memory: {} };
  }

  async save(name: string, state: ThreadState): Promise<void> {
    const { mkdir, writeFile, chmod } = await import("node:fs/promises");
    await mkdir(this.directory, { recursive: true });
    const file = await this.path(name);
    await writeFile(
      file,
      JSON.stringify(
        { ...state, updated_at: new Date().toISOString() },
        null,
        2
      )
    );
    try {
      await chmod(file, 0o600);
    } catch {
      /* best-effort on non-POSIX */
    }
  }
}

export class CortexThread {
  constructor(
    private readonly client: CortexClient,
    readonly name: string,
    private readonly store: ThreadStore
  ) {}

  async state(): Promise<ThreadState> {
    return this.store.load(this.name);
  }

  /** Ask within this thread: history + memory ride along, and the turn (plus
   * the updated memory blob when one arrives) is persisted afterwards. */
  async ask(
    question: string,
    options: Omit<AskOptions, "conversation_history" | "conversation_memory"> & {
      onContent?: (token: string) => void;
    } = {}
  ): Promise<AskResult> {
    const state = await this.store.load(this.name);
    const result = await this.client.ask(question, {
      ...options,
      conversation_history: state.history,
      conversation_memory: state.memory,
    });
    if (result.answer) {
      await this.store.save(this.name, {
        history: [
          ...state.history,
          { role: "user", content: question },
          { role: "assistant", content: result.answer },
        ],
        memory: result.memory_update ?? state.memory,
      });
    }
    return result;
  }

  async clear(): Promise<void> {
    await this.store.save(this.name, { history: [], memory: {} });
  }
}
