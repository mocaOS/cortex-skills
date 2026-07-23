---
name: cortex-openclaw
description: >
  Run the Cortex long-term-memory skill on OpenClaw. The canonical skill lives at
  cortexskills.org/hermes/ and follows the open SKILL.md standard OpenClaw speaks
  natively — this page is the adapter: where to install the files, how to inject
  CORTEX_* env via openclaw.json, how to replace the Hermes heartbeat with an
  OpenClaw cron job, and which Hermes-only extras don't apply.
version: 1.0.0
license: MIT
platforms: [macos, linux]
---

# Cortex — Long-Term Memory for OpenClaw

[OpenClaw](https://docs.openclaw.ai) runs Anthropic-style agent skills: a `SKILL.md` instruction pack per skill, discovered from the workspace or a managed skill root and injected into the agent's prompt. The Cortex memory skill is exactly that shape — so **the same canonical skill that powers Hermes runs on OpenClaw unchanged**. You get the full command surface: `save`, `check`, `ask`, `search`, `list`, `show`, `forget`, `sync`, multi-source routing (personal / community / team cortexes), and even self-hosting a new instance (`setup`).

> **Hermes remains the recommended, deepest integration** — it adds a native memory-provider plugin (ambient recall injected before every turn, first-class `cortex_*` tools), secure env prompting on first load, and a built-in blueprint heartbeat. See [cortexskills.org/hermes/SKILL.md](https://cortexskills.org/hermes/SKILL.md). On OpenClaw you run the same skill through its helper script; everything below is the delta.

## Install

Fetch the multi-file skill into a skills directory OpenClaw scans — `<workspace>/skills/` for one agent (default workspace `~/.openclaw/workspace`), or `~/.openclaw/skills/` for all agents:

```bash
D=~/.openclaw/workspace/skills/cortex        # or ~/.openclaw/skills/cortex (all agents)
mkdir -p "$D/references" "$D/scripts"; base=https://cortexskills.org/hermes
curl -fsSL $base/SKILL.md -o "$D/SKILL.md"
curl -fsSL $base/references/CONNECT.md -o "$D/references/CONNECT.md"
curl -fsSL $base/references/LTM.md -o "$D/references/LTM.md"
curl -fsSL $base/scripts/cortex.sh -o "$D/scripts/cortex.sh" && chmod +x "$D/scripts/cortex.sh"
```

Alternatively, from a checkout of [mocaOS/cortex-skills](https://github.com/mocaOS/cortex-skills):

```bash
openclaw skills install ./cortex-skills/public/hermes --as cortex
```

The skill's frontmatter already carries a `metadata.openclaw` gate (`requires.bins: [jq, curl]`), so OpenClaw only offers it when its dependencies exist on the host. It registers as `cortex` (slash command `/cortex`); skills are snapshotted at session start, so begin a new session after installing.

## Configure

OpenClaw injects skill env through `~/.openclaw/openclaw.json` under `skills.entries.<name>` — that replaces Hermes' `~/.hermes/.env` prompting:

```json5
{
  skills: {
    entries: {
      cortex: {
        enabled: true,
        env: {
          CORTEX_BASE_URL: "http://localhost:8000",
          CORTEX_API_KEY: "cortex_rw_…",              // rw = save+recall, ro = recall only
          CORTEX_COLLECTION: "OpenClaw",              // WRITE scope: this agent's own collection
          // CORTEX_COLLECTION_READ: "all",           // READ scope; default "all" = every collection
          // Keep runtime state out of ~/.hermes (defaults still work, this is tidier).
          // Absolute paths only — env values are not tilde-expanded:
          CORTEX_STATE_DIR: "/home/you/.openclaw/state/cortex",
          CORTEX_MEMORY_DIR: "/home/you/.openclaw/workspace/memory"
        }
      }
    }
  }
}
```

- `CORTEX_STATE_DIR` — where the helper keeps `sources.json` (named cortexes) and upload tracking. Default is Hermes' state path, which works but leaves a stray `~/.hermes` on an OpenClaw box.
- `CORTEX_MEMORY_DIR` — the directory whose `*.md` files `cortex.sh sync` pushes. Point it at OpenClaw's daily notes (`<workspace>/memory/`); the curated `MEMORY.md` itself is better saved deliberately via "dump your session into your cortex".
- **Scopes**: writes target `CORTEX_COLLECTION` only; reads span **all collections** in the instance by default (the multi-memory model — sibling collections like a document archive stay recallable). Details in the canonical skill's Connect section.
- **Sandboxed agents**: `skills.entries.*.env` injects into the host process only — if your agent runs sandboxed, put the `CORTEX_*` vars into the sandbox's env configuration instead.

No instance yet? The skill self-hosts one: tell the agent *"set up a cortex for me"* (`setup` → `setup-status` via Docker). On a non-Hermes box the helper registers the new instance as named source `local` and tells you exactly which values to persist in `openclaw.json`.

## Replace the Hermes heartbeat with cron

Hermes runs the skill's blueprint (`sync` every 6h) natively. On OpenClaw, add a [scheduled task](https://docs.openclaw.ai) with the same prompt:

> Load the cortex skill, then run the memory heartbeat: `bash <skill-dir>/scripts/cortex.sh sync` to push changed memory files and outbox notes to your personal cortex. Report only if something new was synced or the sync failed; stay silent otherwise.

## What's Hermes-only (and what replaces it)

| Hermes feature | On OpenClaw |
|---|---|
| Native memory-provider plugin (`hermes/plugin/`): ambient recall before each turn, `cortex_search/ask/list/save` tools | Not available — use the skill's helper script; for ambient recall, OpenClaw's own memory plugins (builtin, QMD, …) coexist fine: they cover in-session recall, Cortex is the durable, shareable, multi-source layer |
| Secure env prompts on first skill load (`required_environment_variables`) | `skills.entries.cortex.env` in `openclaw.json` |
| Blueprint heartbeat (`sync` every 6h) | OpenClaw cron / scheduled task (above) |
| `~/.hermes/.env`, `~/.hermes/memories`, `~/.hermes/skills/state` | Same helper, redirected via `CORTEX_STATE_DIR` / `CORTEX_MEMORY_DIR` |
| Skill-scanner curl workaround | Not needed — `openclaw skills install` accepts local paths and git sources |

## The language is identical

Once installed, the same phrases drive it — *"dump your session into your cortex"*, *"check your cortex for X"*, *"what's in your cortex?"*, *"ask the community cortex about Y"*. The canonical [SKILL.md](https://cortexskills.org/hermes/SKILL.md) teaches the agent all of it, including multi-source routing and the recall-escalation ladder. Validate the hookup with:

```bash
bash <skill-dir>/scripts/cortex.sh status   # expect: healthy + write/read scope lines
```

Then have the agent store a routing memory in `MEMORY.md` (see the canonical skill's Validate section) so every future session knows "cortex" means this skill — OpenClaw's `MEMORY.md` is loaded at session start, same as Hermes' native memory.
