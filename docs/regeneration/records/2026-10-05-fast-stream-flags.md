# Fast-mode streaming done-flag (finish_reason → truncated) — 2026-10-05

Portable basis **v2.19.0** (portable 2.20 harvest is lead-owned, later).
Disjoint documentation-only writer; the App lead owns runtime/tests/audit/
checkpoints/portable harvest, the evaluation writer owns the frozen gate, and
this slice owns only the public ask docs + this record. Published HEADs
unchanged: App `85e29fe`, Chat `d6d3ad6`, Skills `63e37ec`; all work
local/uncommitted on the accepted dirty basis (which includes the prior
standard-streaming completion-flag repair). Round start:
`cortex-app/output/fast-stream-flags-20261005/start.json`; accepted
working-tree snapshot `cortex-app/output/fast-stream-flags-20261005/before/`
(attributed against this snapshot, not HEAD's cumulative dirty diff).

## Confirmed source claims this slice documents

- **Positive gate accepted before repair; independent review path
  original26 REJECT → corrected27/v2 ACCEPT.** The original 26-row baseline
  (`evaluation/baseline/RESULTS.json`) was valid as a run but the reviewer
  (`ses_ef4b4d12dffesArggl05DwAR0a`, `BASELINE-REVIEW.md`) rejected
  proceeding to repair: `length-null-trailing` was wired into the machinery
  but never param-selected. The additive v2 gate
  (`backend/tests/test_fast_stream_flags.py`, digest `1c8567b3…`, 27
  canonical rows / 149 closure digests, v1 bytes retained) froze the missing
  positive case; v2 baseline **20 passed / 7 intended length rejects, exit 1,
  0 errors/skips** (`evaluation/v2-baseline/RESULTS.json`) was independently
  ACCEPTed before any repair. Candidate: **27/27, exit 0**
  (`evaluation/v2-candidate/RESULTS.json`, run
  `fast-stream-flags-20261005-v2-candidate`, execution2.19.0, retention
  149/149 binding this-run pre-run identity). Candidate runtime
  `backend/app/main.py` sha256
  `6f3085d3a721f33435bd1eea68005098c4578f7de1e21622c22a8ecd23e1c265`.
- **Accepted behavior:** on the fast branch of `POST /api/ask/stream`
  (reached with `depth: "fast"` or `use_fast_search: true` — **always its
  own branch, independent of `ENABLE_AGENT_CHAT`**;
  `/api/ask/stream/thinking` has no fast branch), the fast writer's provider
  `finish_reason` is captured in `_fast_deltas` from the synthesis stream
  BEFORE the text-only `filter_stream` seam and projects onto the public
  `done` frame as `truncated`: `length` → `truncated: true`; `stop`, a null
  reason, and a missing reason attribute never set the flag, and trailing
  null-reason / empty-choices usage tails do not erase a captured reason.
  No appended "cut short" note (the agent writer's note is NOT generalized),
  no new SSE field, no public `finish_reason` on SSE, no SSE schema change;
  the `done` frame keeps `fast_mode: true`.
- **Caps/units distinct; no equivalence invented.** The fast writer's output
  cap is the literal `max_tokens=600` argument — NOT `WRITER_MAX_TOKENS_SPEED`
  — and its model is `get_llm_config(fast_mode=True)`
  (`OPENAI_MODEL_FAST_MODE`, default `OPENAI_MODEL`), not the `WRITER_MODEL`
  override. First-turn context is the top 3 retrieved chunks truncated to
  600 characters each (fenced); a follow-up turn with conversation history
  skips retrieval entirely. 600 TOKENS (output) vs 600 CHARS (context) are
  distinct units.
- **Scope evidence bounded to the handler seam.** The gate's six scope rows
  record effective scope forwarding into the recorded `processor.search`
  call on the first-turn branch only — no query-builder/store execution, no
  returned-data or complete graph-privacy claim. Public scope prose was NOT
  extended; no new query/DB/privacy claim.
- **Bounded positive matrix.** Depth-fast, agreeing depth+flag and
  legacy-flag length entries are all first-turn; the history branch
  contributes one length row — not the full cross product. Standard/deep/
  prompt filters and security behavior are actual and retained by the gate.

## Writes this slice (Skills repo)

- `public/ask/SKILL.md` — frontmatter `version: 1.4.5` → **1.4.6**; SSE
  `done` row extended with the fast-writer qualifier (own branch regardless
  of the agent-chat flag, literal 600-token cap, Fast Mode model); the
  retained standard qualifier text is preserved verbatim.
- `public/ask/references/API.md` — the legacy-pipeline scope note gained the
  fast-writer sentence (same length-only rule; literal 600-token cap, not
  `WRITER_MAX_TOKENS_SPEED`; Fast Mode model, not `WRITER_MODEL`). The
  `WRITER_MAX_TOKENS_SPEED` row is deliberately unchanged — the fast writer
  is not configured by it.
- `public/index.json` — GENERATED only via existing `npm run manifest`,
  run twice with machine receipts, second output byte-identical (gen1==gen2==
  live `public/index.json` sha256 `96b7c0afe2501a97…`). Root-inclusive
  totals: **25 skills / 55 files**, all 55 entries' sha256+bytes re-verified
  against disk. Semantic diff vs the before snapshot, parsed (not
  hardcoded): ask-only — `ask` version 1.4.5 → 1.4.6 plus the two ask file
  sha256/bytes; root entry and all other skills/keys unchanged.
- `npm run lint`: **0 errors, 2 existing warnings** (pre-existing unused-var
  warnings); no dependency or package manifest changes. All four stage
  results are backed by staged machine receipts (App
  `output/fast-stream-flags-20261005/docs/gate-receipts/RESULTS.json` with
  retained gen1/gen2 copies and per-stage stdout/stderr/exit/timestamps) —
  the standard round's transcript-only-gates defect was not repeated.

## App-side doc writes (owned by this slice, in cortex-app)

- `documentation/pages/features/ask-ai.mdx` — SSE `truncated` row appends a
  fast clause (deep-legacy + standard text preserved verbatim); new "Local
  unreleased fast streaming done-flag" paragraph after the preserved
  standard paragraph. Fast is never subsumed under "flag-off legacy"
  phrasing — the fast branch is named as independent of the agent-chat flag.
- `handbook/10-ask-ai.md` — streaming done-flag paragraph extended with the
  fast-writer projection; the truncation parenthetical now also names the
  fast writer (existing text preserved inside).
- `BACKEND_API_DOCUMENTATION.md` — new "Local unreleased fast streaming
  done-flag" bullet after the preserved standard bullet.
- Judge: `output/fast-stream-flags-20261005/docs/` — App docs `npm run
  validate` + `npm test` (10 controls), ONE offline private-copy Zudoku
  build + source-bound mirror judgment (`generated/mirror-judgment.json`,
  judgmentVersion 1, ok: true; receipt-before-judgment; 28 mirror probes
  present incl. 6 NEW fast probes; 27 mirror-negative probes hold;
  source-only surfaces probed at source, negatively probed in the mirror;
  raw build receipt `docs-build/run-1/RESULTS.json`, 52 source inputs
  digest-verified unchanged; judgment parents created before probing). One
  disclosed preflight crash retained as
  `docs/attempt1-preflight-fail.stdout.log` (missing TMPDIR parent, wrote
  nothing; corrected additively in the script, no rebuild implicated).

## Limits / not claimed

Canned provider transport + recorded `processor.search` forwarding only: no
live provider/store, no production parity, no model quality, no returned-data
or complete graph-metadata privacy claim, no live Langfuse, no prompt-guard
classifier verdict (shipped fail-open default), Ruff not run. The positive
length matrix is bounded (first-turn depth/agreeing/legacy + one history
row), not Cartesian. `/api/ask/stream/thinking` has no fast branch and is not
covered. Handbook/backend/Skills surfaces are source-verified only — no
mirror-publication claim. No commit/push/deploy/publication; SDK/MCP/Chat
runtime and prior evidence unchanged, suites unreplayed. Portable guidance
stays 2.19.0; a portable 2.20 harvest is a separate lead-owned step.
