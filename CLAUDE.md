# Cortex Skills — repository instructions (canonical)

`AGENTS.md` is the fallback adapter for harnesses that load it instead.
`public/AGENTS.md` and `public/CLAUDE.md` are published product content, not repo policy.
`docs/regeneration/index.md` is the scoped packet (commands, contract map,
records, checkpoint) — read it plus your area's contract/test files before
your first edit; assume nothing else arrived automatically.

## What this repository is

A **docs-and-skills product**: a Next.js site serving curated Markdown skills
(`public/**/SKILL.md`, generated manifest `public/index.json`), the TypeScript
SDK (`sdk/` = `@mocaos/cortex-client`), and an MCP server (`mcp-server/` =
`@mocaos/cortex-mcp`). Its API integration contracts describe **Cortex** in `cortex-app`.

**State ownership.** Skills/manifest/site: none — published skill copies are
state-less external artifacts consumed by agents/installers, pinned by
`index.json` versions/sha256. SDK: stateless except pluggable thread stores.
MCP server: **owns file-backed conversation state** — `FileThreadStore`
persists thread history + the opaque memory blob under `CORTEX_STATE_DIR`
(default `~/.cortex-mcp/threads`), interop-compatible with the Hermes skill's
`cortex.sh`; account for it in Deletion/retirement.

## The seven-primitive change loop

Depth proportionate to coupling and failure consequence; one rule may serve several primitives.

- **Start** — `git status` / `git log -1`; read the scoped packet if not already in session.
- **Intent** — outcome, preserved promises (REST fields, scope auth, SSE opaque
  memory, streaming callback timing, documented endpoint semantics, manifest
  contract), accepted deltas.
- **Compilation** — unit (skill docs, SDK, MCP, manifest, site), public
  boundary, consumers, allowed effects. Cross-repo changes are legitimate when
  the user authorizes the scope and the target repo's instructions permit the
  write; otherwise raise it with the owning repo's writer.
- **Evaluations** — gate before editing: `npm run lint` + manifest idempotency
  for site/docs; `cd sdk && npm test` for SDK; `cd mcp-server && npm test` for
  MCP. Assertions target the published contract (request/error/event shapes,
  callback timing), not current accidents. Negative controls run in an isolated
  copy (e.g. `/tmp`), never by mutating shared sources in place.
- **Provenance** — record baseline vs candidate results proportionately: tiny
  edits need no campaign record; contract-, instruction-, or inventory-touching
  work updates the scoped packet (command, counts, evidence scope).
- **Pace** — docs fixes ship after lint+manifest; SDK/MCP behavior changes need
  the full hermetic suite; published-semantics changes also need a drift check
  against `cortex-app` source or `cortex-app/documentation`.
- **Deletion** — consumer and removal conditions BEFORE removing anything.
  State-less external consumers (published skill copies): retirement evidence
  is the contract — manifest version/deprecation published, superseded guidance
  replaced in the same change, no documented consumer flow still points at the
  removed path, removal verified by manifest/navigation check. State-bearing
  surfaces (MCP thread files): also account for owned state — document
  migration/recovery or leave state untouched while its obligation stands.
- **Compaction** — separately from deletion: remove superseded complexity and
  duplicate guidance while preserving distinct behavior and rationale. One
  authoritative statement per rule; retire a copy only when its replacement is
  at the canonical owner. `public/index.json` is GENERATED (only via
  `npm run manifest`; never hand-edit); `public/**.md` fixes survive
  regeneration.
- **Finish** — verify the integrated candidate (applicable gates green), update
  affected docs and — for contract- or instruction-touching work — the packet
  checkpoint; harvest lessons into the owning guide; state the actual evidence
  claim and the next step.

## Preserved promises and runtime changes

- The SDK's request/error/event behavior and the skills' documented endpoints
  mirror `cortex-app` REST/SSE — load-bearing for old-instance consumers; do
  not relax them as a side effect. Runtime/library/MCP implementation changes
  in `sdk/` and `mcp-server/` are ordinary work when the engagement authorizes
  them: change behavior with its gate, keep dependency versions/schemas
  deliberate, version distribution-facing values together.
- If a skill disagrees with `cortex-app` source, correct the skill only with
  source evidence; if that exposes a backend bug, document the reproducible
  finding and raise it with the backend owner rather than encoding the defect.

## Where things live

`public/**` published skills + generated `index.json`; `sdk/`, `mcp-server/`
(contract suites are the gate); `src/` site; `docs/regeneration/` packet + records.
