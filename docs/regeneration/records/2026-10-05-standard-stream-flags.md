# Standard-depth legacy streaming done-flag (finish_reason → truncated) — 2026-10-05

Portable basis **v2.19.0**. Disjoint documentation-only writer; the App lead
owns runtime/tests/audit/checkpoints, the evaluation writer owns the frozen
gate, and this slice owns only the public ask docs + this record. Published
HEADs unchanged: App `85e29fe`, Chat `d6d3ad6`, Skills `63e37ec`; all work
local/uncommitted on the accepted dirty basis (which includes the prior
legacy nonstream/streaming completion-flag repairs and scope repairs). Round
start: `cortex-app/output/standard-stream-flags-20261005/start.json`;
accepted working-tree snapshot
`cortex-app/output/standard-stream-flags-20261005/before/` (attributed
against this snapshot, not HEAD's cumulative dirty diff).

## Confirmed source claims this slice documents

- **Positive gate accepted before repair; independent review ACCEPT.**
  `backend/tests/test_standard_stream_flags.py` (digest `b150c335…`)
  froze 20 rows: typed truncation matrix (8), handler scope forwarding at
  the `processor.graph_search_async` seam (6), real `_screen_question`
  refusal, real `filter_stream` redaction, security-OFF passthrough, REST
  403×2/401 controls. Accepted v3 baseline **16 passed / 4 intended
  length rejects, exit 1**; independent review ACCEPT
  (`ses_ef51271e9ffe8C2kbPcgiAl3qR`). Candidate v4: **20/20, exit 0**
  (`output/standard-stream-flags-20261005/evaluation/v4/candidate/RESULTS.json`,
  run `standard-stream-flags-20261005-v4-candidate`, execution2.19.0,
  Python 3.13.5 / pytest 9.1.1), retention accepted against this-run
  identity; candidate runtime `backend/app/main.py` sha256
  `62b7eb9ad93ff8787eb6f4cdea24d411f589b01dff7e493ed3a6723fc2041cf4`.
- **Accepted behavior (versioned delta):** on the standard chat branch of
  `POST /api/ask/stream` (`ENABLE_AGENT_CHAT=false`, the default; entry
  `depth: "standard"` or the equivalent agreeing legacy flags — the
  flag-derived entry is exercised by the healthy `stop` rows), the standard
  writer's provider `finish_reason` is captured from the synthesis stream
  BEFORE the text-only `_writer_deltas`→`filter_stream` seam and projects
  onto the public `done` frame as `truncated`: `length` → `truncated:
  true`. `stop`, a null reason, and a missing reason attribute never set
  the flag; `length` is preserved across trailing null-reason and
  empty-choices/usage-only chunks. No appended "cut short" note (the agent
  writer's note is NOT generalized), no new SSE field, no public
  `finish_reason` on SSE, no SSE schema change.
- **Scope evidence bounded to the handler seam.** The gate's six scope rows
  record effective scalar/allowlist forwarding into the recorded
  `graph_search_async` call only — no query-builder/store execution, no
  returned-data or complete graph-privacy claim. Public prose was NOT
  extended with scope claims in this slice.
- **Caps stay distinct; no pipeline equivalence invented.** The standard
  streaming writer's cap is `settings.writer_max_tokens_speed` —
  `WRITER_MAX_TOKENS_SPEED` (default 1200) — not the non-streaming chat
  path's literal `max_tokens=1200` request cap and not the flag-off legacy
  deep synthesis call's literal 2000. The deep legacy streaming note
  (2,000-token synthesis cap, `agentic_rag_stream`) is preserved as its own
  separate note on every surface; the fast streaming path and the agent
  writer are unchanged by this repair.

## Writes this slice (Skills repo)

- `public/ask/SKILL.md` — frontmatter `version: 1.4.4` → **1.4.5**; SSE
  `done` row extended: the flag-off legacy streaming *paths* set the flag
  from the writer stream's provider reason (`length` only, no visible
  cut-short note), with the deep synthesis call's fixed 2,000-token cap and
  the standard chat writer's `WRITER_MAX_TOKENS_SPEED` (default 1,200) cap
  distinguished.
- `public/ask/references/API.md` — `WRITER_MAX_TOKENS_SPEED` config row now
  names both streamed speed-mode writers (agent pipeline writer and the
  legacy standard streaming writer); the legacy pipeline scope note gained
  the standard-writer done-flag sentence (identical length-only rule, no
  new SSE field / public `finish_reason` / cut-short note, cap distinct
  from the deep literal 2000).
- `public/index.json` — GENERATED only via existing `npm run manifest`,
  run twice, second output byte-identical (idempotent). Root-inclusive
  totals: **25 skills / 55 files** (24 skill dirs + root, 54 files + root
  file). Semantic diff ask-only: `ask` version 1.4.4 → 1.4.5 plus the two
  ask file sha256/bytes updates; root entry and all other skills/keys
  unchanged.
- `npm run lint`: **0 errors, 2 existing warnings** (pre-existing unused-var
  warnings in `src/app/skills-client.tsx`); no dependency or package
  manifest changes.

## App-side doc writes (owned by this slice, in cortex-app)

- `documentation/pages/features/ask-ai.mdx` — SSE `truncated` row now
  covers the standard chat writer alongside the deep legacy path; new
  "Local unreleased standard streaming done-flag" paragraph after the
  deep legacy paragraph (deep legacy note preserved verbatim).
- `handbook/10-ask-ai.md` — streaming done-flag paragraph extended with the
  standard-writer projection; the truncation parenthetical now covers both
  flag-off legacy streaming paths with their distinct caps.
- `BACKEND_API_DOCUMENTATION.md` — new "Local unreleased standard streaming
  done-flag" bullet after the deep legacy bullet (deep legacy bullet
  preserved verbatim).
- Judge: `output/standard-stream-flags-20261005/docs/` — App docs
  `npm run validate` + `npm test` (10 controls), ONE offline private-copy
  Zudoku build + source-bound mirror judgment (receipt before judgment;
  source-only surfaces probed at source, negatively probed in the mirror).

## Addendum — independent-review evidence correction (2026-10-05, additive)

Independent read-only integrated review ACCEPTed the slice with two
evidence corrections, neither requiring a runtime/gate/source-page change:

1. Owning-receipt links in this record were re-inspected: the v4 candidate
   path (`evaluation/v4/candidate/RESULTS.json`) exists; this record never
   linked a nonexistent `evaluation/FINAL.json` (the defect was confined to
   the App docs receipt, corrected in
   `cortex-app/output/standard-stream-flags-20261005/docs/RECEIPT.md`).
   The lead's output-root `FINAL.md`/`FINAL.json` closeout remains the
   lead's eventual write.
2. The original manifest-×2 / lint / docs-validate / docs-npm-test gates
   were transcript-only (no machine receipts, no retained gen1 manifest
   copy; the machine payload available from the original round is the five
   skills-manifest checks embedded in the App
   `docs/generated/mirror-judgment.json`
   `sourceOnlyProbes.skills-manifest`). Fresh bounded receipt-bearing
   re-executions of exactly those stages (no build/judge replay) are at
   App `output/standard-stream-flags-20261005/docs/gate-receipts/`
   (`RESULTS.json`, retained `index.gen1.json`/`index.gen2.json`,
   per-stage stdout/stderr logs): gen1==gen2==live `public/index.json`
   sha256 `7ffe7a28f6624cb6737bb014c7d076a8e98b6b19727ea76ec7574757c403a38c`,
   root-inclusive 25 skills / 55 files with all 55 entries' sha256+bytes
   verified, lint 0 errors / 2 warnings, docs validate OK (31 pages, 155
   routes, 329+71 env names), docs npm test 10/10 — offline env
   (`npm_config_offline=true`, `npm_config_yes=false`) on a root-backed
   run-owned tmp (30.9 GB free), 110-file input closure unchanged.
   Original claims above stand, now corroborated by machine receipts.

## Limits / not claimed

Canned provider transport + recorded retrieval-request forwarding only: no
live provider/store, no production parity, no model quality, no returned-data
or complete graph-metadata privacy claim, no live Langfuse. The
`enable_agent_chat=true` agent-chat sibling and the fast path are not
covered by the gate; a `length` rejection through the flag-derived (no
`depth`) entry is unexercised (reviewer limit 2, additive). The
`top_k`/`max_hops` seam values are observed, not value-asserted (reviewer
limit 1). Handbook/backend/Skills surfaces are source-verified only — no
mirror-publication claim. No commit/push/deploy/publication; SDK/MCP/Chat
runtime and prior evidence unchanged, suites unreplayed.
