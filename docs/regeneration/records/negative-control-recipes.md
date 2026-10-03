# Durable negative-control recipes

Replayable recipes for the contract gates' negative controls. Method for ALL
controls: isolated source copy under `/tmp` (e.g.
`/tmp/opencode/<name>-isolated`) containing the unit's public contract +
tests + build config, with a read-only symlink to the workspace
`node_modules` for type/module resolution. **Never mutate shared sources in
the repo working tree** — that method was used once (slice 1 first round) and
is recorded as invalid. Temp paths and sha256 labels are ephemeral identity
labels; the recipes below are the durable form. Replay of any candidate is
optional — the recipes + assertion identities are the deliverable.

## Shared procedure

```bash
# 1. Isolate (example for SDK)
rm -rf /tmp/opencode/sdk-isolated && mkdir -p /tmp/opencode/sdk-isolated
cp -r sdk/src sdk/test sdk/package.json sdk/tsconfig.json sdk/tsconfig.test.json /tmp/opencode/sdk-isolated/
ln -s "$PWD/node_modules" /tmp/opencode/sdk-isolated/node_modules
cd /tmp/opencode/sdk-isolated
TSC="$PWD/node_modules/.bin/tsc"   # from repo root resolution: use repo path

# 2. Baseline (healthy control) — must pass
$TSC && $TSC -p tsconfig.test.json && node --test "dist-test/test/*.test.js"   # exit 0

# 3. Apply mutation to the TEMP copy only (see recipes), rebuild, run, record
#    exit status + failing assertion names + counts. Then restore the temp
#    baseline and rerun green.
```

MCP variant: copy `mcp-server/{src,test,package.json,tsconfig.json}`, symlink
`node_modules`, build with `$TSC`, run `node --test "test/*.test.mjs"`
(spawns the temp `dist/index.js` subprocess — still hermetic).

## Recipe A — SDK: SSE opaque memory (never break at `done`)

- Mutation: in the temp copy of `sdk/src/sse.ts`, delete the line
  `if (event.memory_update) result.memory_update = event.memory_update;`
  inside `collectAskStream`.
- Expected failing assertions (exact test names in `sdk/test/contract.test.ts`
  / `client.test.ts`):
  - `client.test.ts / "memory_update after done is captured (never break at done)"`
  - `client.test.ts / "thread carries history and memory across turns"`
- Observed: exactly those 2 fail, 22 pass, process exit 1.

## Recipe B — MCP: documented tool surface

- Mutation: in the temp copy of `mcp-server/src/index.ts`, rename the
  registered tool name `"search_knowledge",` → `"search_knowledge_renamed",`.
- Expected failing assertion (exact): `contract.test.mjs /
  "tools/list exposes exactly the documented tool surface"` (asserts the
  `DOCUMENTED_TOOLS` set from `public/mcp/references/TOOLS.md`). Downstream
  tests calling the renamed tool also fail; the tools/list identity is the
  intended rejection.
- Observed: tools/list fails first (+2 shared-surface), 3 pass, exit 1.

## Recipe C — SDK: streaming callback timing (incremental observation)

- Gate: `sdk/test/contract.test.ts / "onContent fires before the source
  stream closes (incremental observation)"` (timeout 2s). Mechanism: the
  controlled `ReadableStream` enqueues frame 1 and blocks EOF until `onContent`
  fires for `"token1"`; asserts `tokens == ["token1","token2"]` and
  `result.answer == "token1token2"`.
- Candidate: batch-style `collectAskStream` — drain all events into a list
  first (for-await), then aggregate in a separate pure pass, firing
  `onContent`/`onEvent` only after EOF.
- Expected rejection: the candidate deadlocks (pending await on a promise only
  the callback can resolve). The gate's oracle races the collection against a
  250ms timer that rejects with the named
  `AssertionError: "onContent must fire before the source stream closes (EOF)"`
  (actual `[]` vs expected `["token1","token2"]`); the `finally` clears the
  timer, releases the stream unconditionally, and awaits consumer cleanup
  (`collected.catch`), so no promise/stream leaks keep the run pending. Result
  must be **fail 1 with `failureType: testCodeFailure` — NOT runner
  `cancelled`** (a cancelled outcome means the gate leaked its bound and is
  insufficient evidence; harden the oracle instead). Runner counts: 25 tests /
  24 pass / 1 fail / 0 cancelled, process exit 1, no hang.
- Reference requirement: the incremental implementation must keep passing
  25/25 with exit 0.
- Rationale: `sdk/README.md` documents `onContent` as incremental token
  observation under streamed deep research — callback-before-EOF is a
  supported promise, so a 24/24 pass without this gate is INCONCLUSIVE
  replacement evidence for any collector substitute.

## Artifact conventions

Keep mutation diffs and runner logs under `/tmp/opencode/` with names like
`<unit>-mutant<N>.diff` / `.log`; record in the slice record: candidate
identity (sha256 label), expected failing assertion names, actual failing
names, counts, process exit status, and the restore rerun (green). Temp
artifacts are ephemeral; this file + the slice records are the durable
evidence.
