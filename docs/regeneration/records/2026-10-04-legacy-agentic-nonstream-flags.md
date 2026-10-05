# Legacy agentic nonstream finish-reason flags — 2026-10-04

Portable basis **v2.18.0**. Disjoint documentation-only writer; the owning App
lead holds checkpoint/guide/audit, the runtime writer owns only
`backend/app/services/document_processor.py`, and the evaluator's
tests/evaluation work is complete. Published HEADs unchanged: App `85e29fe`,
Chat `d6d3ad6`, Skills `63e37ec`; all work local/uncommitted on the accepted
dirty basis, which includes the prior local scope repairs (streaming, empty/
hybrid, nonstream allowlist forwarding). Round start:
`cortex-app/output/legacy-agentic-nonstream-flags-20261004/start.json`
(2026-10-04T20:09:40Z, executionBasis 2.18.0).

## Confirmed source claims this slice documents

- **Independent PASS precedes the runtime repair.** Gate v3 on the unchanged
  source froze the positive provider `finish_reason` gates
  (`evaluation/GATE-ORACLE.md`, gate digest
  `9c86b1dd36cc7face70c693d26aba794a50f63f874f66f10d70746977390a1f9`);
  `BASELINE-REVIEW.md` (read-only reviewer session
  `ses_ef7713941ffewrsbhYN7rqCpiy`) verdict **ACCEPT**. Executed frozen
  baseline (`evaluation/BASELINE.md`): **75 selected / 68 passed / 7
  intended failures, exit 1**, no errors/skips — every failure the intended
  `None != stop|length` projection reject; the null-reason compatibility
  control already passes on unchanged source.
- **Behavior accepted (versioned delta):** on the flag-off non-streaming
  path, the **synthesis** completion's provider `finish_reason` becomes the
  public answer reason — `stop` → `finish_reason: "stop"`,
  `truncated: false`; `length` → `finish_reason: "length"`,
  `truncated: true`. The **decompose** call's reason never becomes the
  answer's public reason (decomposition contrast). Absent/null provider
  reason stays `finish_reason: null, truncated: false` for compatible
  providers. The two-line runtime repair is owned by the runtime writer:
  capture the synthesis completion's `finish_reason`
  (`getattr(..., None)`) in `_agentic_rag_query`'s return so `main.py`'s
  existing mapping (`result.get("finish_reason")`,
  `truncated = finish_reason == "length"`) projects it.
- **No schema change.** `RAGResponse.finish_reason`/`truncated` already
  exist (`backend/app/models.py:434-440`); `main.py` mapping unchanged.
  Optional agentic metadata (`sub_questions`/`communities_used`/
  `retrieval_stats`) projection remains a separate open finding.
- **Writer output-token caps (corrected generic claim).** The public
  "1,200-token chat cap" phrasing was imprecise: `truncated` marks the
  **writer's output-token cap** — a literal
  `build_chat_params(..., max_tokens=1200)` on the standard non-streaming
  chat path (`document_processor.py:5216`; `WRITER_MAX_TOKENS_SPEED` is
  consumed by the streamed agent writer, `researcher_agent.py:2332-2334`,
  not by this endpoint path); the flag-off legacy deep-research synthesis
  call uses its own 2,000-token cap (`document_processor.py:5677`).
- **Entry map unchanged and preserved in every surface.** With
  `ENABLE_AGENT_RESEARCH=false`, non-streaming `POST /api/ask` reaches
  `rag_query` → `_agentic_rag_query` under `ASK_DEADLINE_SECONDS`
  (~28s → 504) and recurses without an LLM key; SSE
  `agentic_rag_stream` is a separate implementation with no deadline and
  no keyless recursion. Streaming remains the recommended Deep Research
  entry in either configuration. Flag-on `400
  agentic_requires_streaming`, scope caveats (no complete graph-context
  privacy) and legacy controls unchanged.

## Owned write paths (exact changes)

- `cortex-app/documentation/pages/features/ask-ai.mdx` — (1) the
  non-streaming flags sentence now names the writer's output-token cap
  (standard 1,200, flag-off legacy synthesis 2,000) instead of the generic
  1,200-token chat cap; (2) a narrow **local unreleased** finish-reason
  propagation note appended to the existing scope-repairs paragraph in
  Collection Scope (projection mapping, fields-already-exist, decompose
  exclusion; no internal maintenance language in the public body).
- `cortex-app/handbook/10-ask-ai.md` — same two corrections: the
  non-streaming flags sentence (writer's cap: 1,200 standard, 2,000
  flag-off legacy) and the Collection-Scoped Questions paragraph (narrow
  local-unreleased propagation note).
- `cortex-app/BACKEND_API_DOCUMENTATION.md` — the two `RAGResponse` field
  clauses under `POST /api/ask` were stale for the accepted source
  ("currently null … does not propagate it" / "separate open propagation
  finding") and now describe the accepted propagation with the
  local-unreleased marker and the corrected caps.
- `cortex-skills/docs/regeneration/records/2026-10-04-legacy-agentic-nonstream-flags.md`
  — this record only.
- `cortex-app/output/legacy-agentic-nonstream-flags-20261004/docs-source/**`
  — receipt + after-state copies of the edited App docs.

Not edited: Skills `public/**` (existing flags already accurate; manifest
reused as-is), any index/guide/test/runtime/generated/deps files, App
changelog (documentation-only hotfix ⇒ **no changelog entry** per
maintenance instructions), and all other bytes (before snapshots preserved
at `output/…/before/cortex-app/…`, digest-verified equal to the working
files immediately before these edits).

## Consumer trace (no consumer runtime change required)

- **SDK** (`cortex-skills/sdk`): the stateless non-streaming ask response
  is passed through with existing optional types — `finish_reason?: string
  | null` and `truncated?: boolean` (`sdk/src/types.ts:73-76`); the SSE
  aggregation already OR-accumulates `truncated`
  (`sdk/src/sse.ts:98`). No type or runtime change required.
- **Chat** (`cortex-chat`): deep research forces the streaming path
  (`const useStreaming = settings.streaming || useAgentic`,
  `cortex-chat/src/app/page.tsx:591`), so the non-streaming projection
  change does not touch its runtime flow.
- **Consumer suites:** no suites were executed by this writer; existing
  SDK/MCP suite evidence is old, not fresh for this slice.

## Limits and non-claims

- Documentation-only, **local unreleased**: no release, deployment,
  publication or released-version promise follows; public guidance carries
  current use/limits only, no baseline test history or counts.
- This writer executed no gates/builds/suites; generation/build execution
  belongs to a separate writer. No Git mutation, install, pull, paid,
  network or schema/dependency change; every pre-existing local byte
  preserved.

## Lead-directed prose corrections (2026-10-04, before generated build)

Source-error fix: the standard non-streaming `rag_query` branch consumes a
literal `build_chat_params(..., max_tokens=1200)`
(`document_processor.py:5216`) and does **not** read
`WRITER_MAX_TOKENS_SPEED`; that setting belongs to the streamed agent
writer (`researcher_agent.py:2332-2334`). Applied: (1) removed the setting
attribution from the `ask-ai.mdx` final answer-flags paragraph and the
`BACKEND_API_DOCUMENTATION.md` `truncated` row, retaining the explicit
1,200 vs 2,000 call caps; (2) removed the internal "optional agentic
metadata … separate open finding" maintenance sentence from the
`ask-ai.mdx` public note (the finding remains here and in the lead's
guides only); (3) corrected this record's caps bullet and the owned-write
description. `handbook/10-ask-ai.md` needed no change (it never attributed
the setting). Corrected snapshots under `output/…/docs-source/after-v2/`;
original `after/` snapshots and receipts unaltered.

## Lead verification addendum

The actual strict candidate command is App
`PYTHONDONTWRITEBYTECODE=1 /home/clippy/.local/share/cortex-qa-venv/bin/python output/legacy-agentic-nonstream-flags-20261004/run_checks.py candidate`;
the corresponding `focused` invocation selects the previous nine-file set plus
the six additive cases. Candidate75/75 and focused377/377, exit0, exact selections
and unchanged start/end input identities pass. Original weaker runner is retained,
not the accepted candidate launcher. Ruff availability probe fails (`No module named
ruff`); CI error-only lint remains unverified. QA Python3.13.5 is not CI/production
recovery evidence.

Qualification of the absent/null wording above: only attribute-present null is
executed; getattr supports absent attributes in source, but no absent-provider gate
ran. Baseline rejections stop at reason assertions and do not independently prove
truncated or decomposition-leak sensitivity; candidate executes all clauses. The
per-case provider/public values are asserted in the gate; they were not serialized
as separate successful raw-response fixtures. The runtime symbol is
`QueryProcessor._agentic_rag_query`, correcting the implementation writer's
`DocumentProcessor` label in its unchanged note. Full final digest/audit/review and
next distinct streaming truncation gate: owning App `{FINAL.md,FINAL.json,HANDOFF.md}`.
