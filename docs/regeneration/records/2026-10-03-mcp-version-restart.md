# 2026-10-03 — MCP advertised-version binding + file-thread persistence-restart gate

Slice: `sdk-mcp-protocol-20261003/mcp` (disjoint MCP work, authorized backlog item
"SDK/MCP protocol evolution"). Status: **CLOSED for this slice — candidate fix
authorized, applied and verified 2026-10-03: MCP candidate suite 10/10 pass,
exit 0 (run 2), on the reviewed `createRequire` version-binding source with the
stable SDK build; no further product fixes to restart/thread state — the new
gates are coverage-only.** No dependency/lock/schema/public-skill change.

## Initial gate-only authorization and write ownership (historical)

Delegated with disjoint write paths; this session may write ONLY:

- `mcp-server/test/contract.test.mjs` (expanded gate — sole code write),
- this record,
- App evidence `output/sdk-mcp-protocol-20261003/mcp/`.

Explicitly NOT owned here: `sdk/**` (another agent builds the SDK),
`mcp-server/src/index.ts` (runtime fix deferred until the frozen rejection is
reviewed), root/nested package locks, `public/**`, site sources, manifests,
deps, versions. Tests are NOT executed this session: the lead schedules the
MCP suite after the SDK compilation stops, to keep build ownership disjoint.

## Inputs read (contracts)

- `cortex-app/CLAUDE.md` + `.claude/navigation.md` + `.claude/qa.md` +
  `.claude/regeneration.md` (campaign index; backlog item confirmed verbatim:
  "reconcile the MCP advertised package version binding, add file-thread
  persistence-restart coverage, no new dependencies").
- `cortex-skills/CLAUDE.md` + `docs/regeneration/index.md` (state ownership,
  gate commands; packet checkpoint untouched — dirty from another writer).
- `mcp-server/src/index.ts` (read-only): `McpServer({ name: "cortex",
  version: "0.2.0" })` — literal, vs `mcp-server/package.json` version
  `0.3.1`.
- `sdk/src/threads.ts` (read-only): `FileThreadStore` writes
  `{history, memory, updated_at}` JSON to `<CORTEX_STATE_DIR>/threads/
  <threadKey(name)>.json`, `chmod 600`; `threadKey` sanitizes to
  `[A-Za-z0-9._-]` (`-` else), ≤80 chars, `default` fallback.
- `public/mcp/SKILL.md` + `public/mcp/references/TOOLS.md`: 12 documented
  tools; threads live in `$CORTEX_STATE_DIR/threads/`, file shape
  `{history, memory, updated_at}`, shared with the Hermes skill's
  `cortex.sh --thread` via `CORTEX_STATE_DIR`.
- `public/hermes/scripts/cortex.sh` (read-only): thread files
  `$STATE/threads/<name>.json`, chmod 600, **"per source-independent name"** —
  the file identity is the thread NAME, not the API key.

## Key-scoping decision (inspect actual contract; no invention)

The published interop contract scopes thread identity by NAME only; Hermes
state files are per source-independent name and the three-tool sharing story
(MCP ↔ `cortex.sh` ↔ SDK `FileThreadStore`) depends on the identical path
`<state>/threads/<key>.json`. Inventing API-key-scoped filenames would break
that documented interop, so the negative isolation gate is thread-key-scoped:
a different thread key is a different identity with no history/memory leak;
API-key scoping of thread files is out of contract and asserted nowhere.

## Frozen gate (mcp-server/test/contract.test.mjs)

Existing six hermetic cases (real entry `dist/index.js` via
StdioClientTransport, loopback HTTP backend, owned `mkdtemp` CORTEX_STATE_DIR)
are unchanged. Four gates appended (suite: 6 → 10):

1. **Version binding** — `initialize`'s `serverInfo.version` must equal the
   `mcp-server/package.json` `version` field, read from the package file at
   test time (derivation, not a pinned literal, so the binding survives future
   bumps). **Expected current-state rejection:** literal `0.2.0` ≠ `0.3.1` →
   this gate FAILS on the current build by design; that frozen rejection is
   what the lead reviews before any `src/index.ts` change.
2. **Full-subprocess restart persistence** — two turns on one thread
   (`deep_research`), then `client.close()` with an explicit wait for the
   transport `onclose` (fires on the child process `close` event — a real
   process stop, not a second client in one process). Snapshot the thread
   file bytes; spawn a fresh subprocess on the SAME owned `CORTEX_STATE_DIR`;
   the restart itself must not rewrite the file; the resumed turn must replay
   the exact pre-restart `conversation_history` (all four messages) and the
   exact opaque `conversation_memory` blob. The loopback backend mints the
   blob as `{version: 9, facts: ["asked:<question>"]}` for sentinel questions
   (`restart:` prefix), so a brand-new process can only produce turn 2's blob
   via the persisted file — no shared memory possible across spawns.
3. **Thread-key isolation** — two thread keys in the same state dir: the
   second key's first turn is cold (`conversation_memory: {}`, empty history —
   no leak from the first); one file per key on disk; after a real stop/restart
   the second key resumes only its own exact history + memory and the first
   key's file is byte-untouched.
4. **Published Hermes-shared file shape** — a thread name outside the Hermes
   legal charset (`session notes/2026-10-03`) resolves to the canonical key
   advertised in the tool reply footer (`session-notes-2026-10-03`); the file
   parses as `{history: [...], memory: {...}, updated_at: ISO-8601}` with the
   exact turn history and curated blob, mode `0600` on POSIX (the Hermes
   `cortex.sh` state promise).

New loopback behavior is confined to the `restart:` sentinel branch of
`/api/ask/stream`; existing cases' frames and index-based assertions are
untouched. No paid/external endpoint: everything lands on the loopback
backend started inside the test.

## Gate-construction constraints (historical; runtime authority expanded below)

- No `sdk/**`, `src/index.ts`, global/config, `package.json`, or lockfile
  change; root workspace lock remains authoritative, nested `mcp-server`
  package-lock is historical and not regenerated.
- No install, commit, push, deploy, version bump, new dep, or schema change.
- Gates assert the published contract (advertised identity, file shape, wire
  bodies), not implementation internals; the only implementation-derived value
  (sanitized file name) is read from the server's own reply text.

## Evidence identities (at freeze)

- `mcp-server/test/contract.test.mjs`: `876630b3215cdd3f84131a9fc140116e35aa2ecff9e9cdf7273d046035988a55`
- `mcp-server/src/index.ts` (read-only reference, pre-fix): `444654bf4698c85c2c6f162880f0a97143b492ca56ee69796c72e3ae624026f8`
- `mcp-server/dist/index.js` (last build, advertises 0.2.0): `d7f988fd85b59ba5dafe6e8958dba8096d54bbe1f8175f641343821cdd94add5`
- `sdk/src/threads.ts` (read-only contract source): `9850d355da17052a87bd5af8a674dee8eb23255113f4ee2afcc98c4bca2127c4`
- Frozen gate copy + command list: App `output/sdk-mcp-protocol-20261003/mcp/`

## Intended commands (lead-scheduled, after SDK build is stable)

```sh
cd mcp-server && npm test        # build (tsc) + node --test test/*.test.mjs
```

Expected at first run against the current runtime: **9 pass / 1 fail** —
`initialize advertises the package's own server version (frozen binding)`
fails with `0.2.0` vs `0.3.1`; the three persistence/isolation/shape gates are
expected to pass on the existing `FileThreadStore` behavior. Any additional
failure is a finding to diagnose, not a gate relaxation.

## Baseline run 1 (2026-10-03, lead-authorized)

Precondition digests verified identical to the freeze identities above
(including root lock `413c3e4c…`, nested lock `83dc1905…`, installed
`node_modules/@mocaos/cortex-client/dist/index.js` byte-identical to
`sdk/dist/index.js`, SDK version 0.1.3, SDK src unchanged). Then the existing
gate only, from `mcp-server/`:

```sh
cd mcp-server && npm test        # exit 1
```

Result: **tests 10, pass 9, fail 1** — `not ok 7` is exactly the frozen
version-binding gate with `ERR_ASSERTION '0.2.0' !== '0.3.1'`
(contract.test.mjs:333); cases 1–6 (pre-existing) and 8–10
(restart persistence, key isolation, Hermes-shared file shape) pass on the
current `FileThreadStore` runtime. Post-run digest check: every input,
including the suite-rebuilt `dist/index.js`, byte-identical — no drift, no
gate alteration. Full TAP + stderr and the receipt are in App
`output/sdk-mcp-protocol-20261003/mcp/` (`run1-stdout.log`, `run1-stderr.log`,
`RECEIPT-run1.md`). No unexpected failure; nothing diagnosed against the
gate; no product edit made.

## Next steps

1. ~~Lead confirms SDK compilation stable → run the MCP suite~~ **Done 2026-10-03** (baseline run 1 above).
2. Review the frozen version-binding rejection (receipt `RECEIPT-run1.md`:
   minimal repair proposal = read the version from the same package metadata
   at runtime, e.g. `createRequire(import.meta.url)("../package.json").version`,
   no public API change, no schema or dependency change); then — and only then —
   the `src/index.ts` fix is in scope for an authorized follow-up, and the
   full suite is re-run. — **Done 2026-10-03: lead reviewed run 1's rejection
   and authorized the minimal fix; candidate authored, NOT RUN (see below).**

## Candidate fix (authorized 2026-10-03, authored, NOT RUN)

Lead authorization: minimal `src/index.ts` repair only —
`createRequire(import.meta.url)("../package.json").version`, existing module
pattern, no deps/public-schema/version-bump changes. Applied:

- `mcp-server/src/index.ts`: import `createRequire` from `node:module`
  (alongside the existing `node:*` imports) and construct
  `new McpServer({ name: "cortex", version })` where `version` is read from
  `../package.json` relative to the module — binding the advertised
  handshake version to the package version by construction. The npm package
  always ships its own `package.json`, so the path resolves in-repo
  (`mcp-server/dist/index.js` → `mcp-server/package.json`) and installed
  (`node_modules/@mocaos/cortex-mcp/`).
- `tsc --noEmit` (typecheck only; no emit, no suite run): clean.
- Frozen test bytes preserved: `mcp-server/test/contract.test.mjs` still
  `876630b3…988a55`; locks (`413c3e4c…`, `83dc1905…`), package.json
  (`3ec9c568…`), run-1 receipts and `dist/index.js` (`d7f988fd…`, pre-candidate
  build) untouched.

Identities: candidate source `718fbeefcd6a3cbadf8d799533773950ab2e87d5ca45d82a5ea5c93a6acefb49`;
unified diff `73255c91265217b615349eea20d4117d28992700d6c7ef19af05d1a12703ada6`.

**Not executed at the time of writing** (superseded 2026-10-03: the lead
confirmed the SDK candidate verified 30/30 and builds stopped; see candidate
run 2 at the end of this record): the candidate MCP suite is NOT run until the
lead confirms the SDK build is stable (the SDK agent is correcting its gate and
will run its build); disjoint build ownership is preserved. Expected candidate
run: 10/10
(dist rebuild advertises 0.3.1 via the derived version; persistence gates
unchanged). Any deviation is a finding, not a gate relaxation.

**Timing note (stale-docs observation):** a reviewer reading this record
during the concurrent run-1 window saw it still describing the gate as not
yet executed. That is publication timing, not a fabricated "unrun" claim: the
gate was genuinely frozen before run 1, run 1 was executed only after the
lead's SDK-stable confirmation, and the record was updated additively
afterwards with the run's own hashes (receipt `RECEIPT-run1.md`, App
`output/sdk-mcp-protocol-20261003/mcp/`). The GATE.md evidence file now
separates the historical at-freeze state (NOT RUN) from the additive
executed-run and candidate sections with their own hashes.
3. Harvest the checkpoint into `docs/regeneration/index.md` by the packet
   owner once the post-fix suite has actually run.

## Candidate run 2 (2026-10-03, lead-authorized after SDK candidate verified 30/30)

Precondition digests verified before the run: candidate source
`718fbeef…acefb49`, frozen MCP test `876630b3…988a55`, package.json
`3ec9c568…b94d`, root lock `413c3e4c…49e79`, nested lock `83dc1905…73b04`, and
the stable SDK build per the SDK owner's manifests
(`output/sdk-mcp-protocol-20261003/sdk/stable-source-identity.sha256`,
`dist-identity.sha256`), all matched in-tree — including the full manifest
binding, not just the index export:

```
5d4c0601…280dd  sdk/src/sse.ts              (stable source)
e2448908…bbc02  sdk/test/contract.test.ts   (frozen SDK test)
0e987e24…170c   sdk/dist/sse.js             (rebuilt SSE module — explicitly bound)
985fbd87…1e06   sdk/dist/index.js
cbfee2f6…ff0b   sdk/dist/client.js          49a4c3e0…97d   sdk/dist/threads.js
309c6e06…6828   sdk/dist/types.js           (+ matching .d.ts set, per manifest)
8dc19d2c…6f14   sdk/package.json            9850d355…127c4  sdk/src/threads.ts
```

and the installed `node_modules/@mocaos/cortex-client/dist/{index.js,sse.js}`
byte-identical to `sdk/dist` (version 0.1.3). Then the existing gate only:

```sh
cd mcp-server && npm test        # exit 0
```

Result: **tests 10, pass 10, fail 0** (`# pass 10 / # fail 0`, ~3.7 s) — the
version-binding gate now passes because the runtime advertises the package's
own version (`0.3.1`) read at runtime from `../package.json` relative to the
module; the persistence/isolation/shape gates pass unchanged. Raw TAP: App
`output/sdk-mcp-protocol-20261003/mcp/run2-stdout.log`, `run2-stderr.log`,
receipt `RECEIPT-run2.md`. Post-run digests: every input identical (sources,
locks, SDK src/dist, frozen test bytes, run-1 receipts); the suite-rebuilt
`mcp-server/dist/index.js` is now
`6fee3e499d3b0b6b9cac2af348e3d9cb0c62b7cb0845c635731e790d6bc9379e` and — as
designed — contains no inlined version literal; the advertised value comes
from package-root metadata at runtime.

Package-root metadata load assumption: the entry resolves `../package.json`
relative to the module. This is the npm package layout, already mandatory for
every published package (npm ships `package.json` regardless of the `files`
allowlist, and `bin` executes from inside the installed package), so the
binding holds in-repo and installed with no added dependency.

Verdict: the only product change this slice is the version binding; the
restart/thread-state gates are **coverage-only** — no further product fix is
warranted or proposed for restart/state behavior (run 1 already showed the
existing `FileThreadStore` behavior passing them).

Remaining gaps (honest limits): the file-shape gate asserts the published
shared `{history, memory, updated_at}` format and sanitized key — it does not
execute the Hermes `cortex.sh` script itself; cross-tool sharing is proven at
the file-contract level only. All gates run hermetically at loopback against
`dist/index.js`; no live-instance or production parity claim. The nested
`mcp-server/package-lock.json` remains historical and was not regenerated.

Packet-owner harvest completed in `docs/regeneration/index.md`; independent review
accepts the combined SDK30/MCP10 result. Remaining bounded audit findings and
recovery/quality prerequisites are recorded there; no further MCP fix is justified.
