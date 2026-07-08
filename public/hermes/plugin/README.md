# Cortex Memory Provider for Hermes

Makes a [Cortex](https://github.com/mocaOS/cortex-app) instance Hermes' native long-term memory: ambient recall injected before turns, plus first-class `cortex_search` / `cortex_ask` / `cortex_list` / `cortex_save` tools — no `skill_view`, no terminal round-trips.

This is the deepest of the three Cortex↔Hermes integration tiers:

| Tier | What it is | When |
|------|-----------|------|
| [cortex skill](https://cortexskills.org/hermes/SKILL.md) | SKILL.md + bash helper (curl) | Zero-dependency default; multi-source routing (community/company cortexes); self-host setup |
| [MCP server](https://cortexskills.org/mcp/SKILL.md) | `mcp_servers:` entry in config.yaml | First-class tools without a plugin; works in every MCP client |
| **This plugin** | Hermes `MemoryProvider` | Ambient memory: prefetched recall each turn, tools always present, `hermes memory` integration |

Skill, MCP server, and plugin all read the same `CORTEX_BASE_URL` / `CORTEX_API_KEY` — one set of credentials serves all three. Run the plugin for your *personal* cortex and keep the skill for named community/company sources; they coexist.

## Install

```bash
D=~/.hermes/plugins/memory/cortex; mkdir -p "$D"; base=https://cortexskills.org/hermes/plugin
curl -fsSL $base/__init__.py -o "$D/__init__.py"
curl -fsSL $base/plugin.yaml -o "$D/plugin.yaml"
```

Stdlib-only — no pip dependencies.

## Activate

```bash
hermes memory setup     # pick "cortex", it prompts for URL + key securely
hermes memory status    # verify
```

Or manually: put `CORTEX_BASE_URL` + `CORTEX_API_KEY` in `~/.hermes/.env` and set in `~/.hermes/config.yaml`:

```yaml
memory:
  provider: cortex
```

Non-secret config (collection name) lives in `$HERMES_HOME/cortex.json`; env vars always win.

## What it does

- **System prompt**: one status line (instance, collection, access) so the agent knows memory is live.
- **Prefetch**: before each turn, a fast hybrid search over your cortex injects up to 3 relevant snippets as context (skipped for short messages, subagents, and cron).
- **Tools**: `cortex_search` (verbatim chunks), `cortex_ask` (synthesized + cited), `cortex_list` (ground-truth inventory), `cortex_save` (curated notes; hidden on read-only keys).
- **Deliberate memory**: turn transcripts are *not* auto-ingested — Cortex holds curated notes, decisions, and session dumps, not a firehose. Built-in MEMORY.md/USER.md keep working unchanged alongside.

## Uninstall / switch

```bash
hermes memory off       # deactivate, keep files
rm -rf ~/.hermes/plugins/memory/cortex
```
