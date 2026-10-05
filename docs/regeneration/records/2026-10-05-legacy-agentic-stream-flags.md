# Legacy agentic STREAMING done-flag (finish_reason → truncated) — 2026-10-05

Portable basis **v2.18.0** (Sections 11–12 governing). Disjoint
documentation-only writer; the owning App lead holds guides/checkpoints/portable,
the runtime writer owns only `backend/app/services/document_processor.py`
(patch applied concurrently, separately reviewed), and the evaluator's gate
work is complete and frozen. Published HEADs unchanged: App `85e29fe`, Chat
`d6d3ad6`, Skills `63e37ec`; all work local/uncommitted on the accepted dirty
basis, which includes the prior local non-streaming completion repair and the
legacy scope repairs. Round start:
`cortex-app/output/legacy-agentic-stream-flags-20261005/start.json`
(6522 recorded identities, 404 snapshots, sha256 `f791750924e0ace4…`).

## Confirmed source claims this slice documents

- **Gate frozen before repair; independent review ACCEPT.** The v2 corrected
  gate (`evaluation/v2/GATE-ORACLE.md`, digest `369b4769…`; runner
  `3fc577a8…`) froze the intended public behavior on unchanged runtime
  `be538950…` (which already carries the prior non-streaming repair).
  `BASELINE-REVIEW.md` (independent read-only reviewer) verdict **ACCEPT**
  before runtime repair. Executed v2 baseline: **107 selected (95 old scope
  gate + 12 new gate) / 103 passed / 4 failed, exit 1**, 0 errors/skips —
  every failure an intended `length-synthesis-*` row rejecting at the public
  `done.truncated` assertion; old 95 scope cases pass.
- **Static finding frozen by the gate:** the legacy flag-off streaming
  synthesis loop (`QueryProcessor.agentic_rag_stream`,
  `backend/app/services/document_processor.py`, synthesis stream at
  `:6019–6031`) ignored the provider stream's `finish_reason` and yielded
  `done` without `truncated`. The runtime repair is separately owned and was
  applied concurrently by the runtime writer.
- **Accepted behavior (versioned delta):** with `ENABLE_AGENT_RESEARCH=false`,
  on both streaming endpoints (`/api/ask/stream`,
  `/api/ask/stream/thinking`) reached via real auth, the synthesis stream's
  provider `finish_reason` projects onto the public `done` frame as
  `truncated`: `length` → `truncated: true`. `stop`, a null reason, and a
  missing `finish_reason` attribute never set the flag (absent or `false`
  both accepted). The decomposition call's reason never becomes the answer's
  truncation. No appended "cut short" notice in this slice — answer tokens
  exact. Additive only: no new SSE field, no public `finish_reason` on SSE,
  no SSE schema change.
- **Empty-choices/usage-only guard:** the gate's `empty-choices-usage-only`
  row establishes that empty-choices keep-alive and usage-only chunks must
  not crash the synthesis loop or the public stream.
- **Caps stay literal, not `WRITER_MAX_TOKENS_*`.** The legacy streaming
  synthesis call carries its own literal
  `build_chat_params(..., max_tokens=2000)` (`document_processor.py:6024`);
  `WRITER_MAX_TOKENS_SPEED` configures the streamed agent writer
  (`researcher_agent.py`). This round removed the residual
  `WRITER_MAX_TOKENS_SPEED` misattribution from the ask skill's
  non-streaming appendix (App docs were corrected on 2026-10-04).
- **Entry map unchanged and preserved.** Flag-off legacy streaming is the SSE
  implementation with no `ASK_DEADLINE_SECONDS` and no keyless recursion;
  non-streaming keeps the ~28s deadline and the no-LLM-key recursive
  fallback. The two implementations stay separate in prose and gates.
- **Prior machinery failure retained separately.** The v2
  `baseline-failed-attempt-1/` receipt-vocabulary producer/validator mismatch
  (13 issues; behavioral outcome already correct) is retained immutable and
  distinct from the product-value failures; repaired vocabulary was refrozen
  before the accepted baseline. Raw retention: all 11 matrix rows retain
  nonempty raw provider chunks + parsed public frames; exactly 1
  public-frames-only helper row (11 + 1). QA interpreter measured Python
  3.13.5 (venv `bin/python3`) — no CI or production-recovery claim; Ruff
  unavailable (no install performed).

## Owned write paths (exact changes)

- `cortex-app/documentation/pages/features/ask-ai.mdx` — (1) the SSE
  `truncated` event row now states the answer-cap semantics per path (agent
  writer: visible "cut short" note; flag-off legacy streaming: synthesis
  provider reason, 2,000-token cap, no note) and no longer attributes the
  cap to `WRITER_MAX_TOKENS_*`; (2) a narrow **local unreleased legacy
  streaming done-flag** note appended directly after the existing
  non-streaming finish-reason propagation paragraph in Collection Scope.
- `cortex-app/handbook/10-ask-ai.md` — the `done` event row, the
  Collection-Scoped Questions paragraph (streaming done-flag sentence after
  the existing non-streaming propagation note), and a parenthetical in the
  truncation section scoping the visible-note claim away from the legacy
  streaming path.
- `cortex-app/BACKEND_API_DOCUMENTATION.md` — a narrow Notes bullet under
  `POST /api/ask/stream` mirroring the done-flag projection, additive to the
  existing scope-repairs bullet.
- `cortex-skills/public/ask/SKILL.md` — version **1.4.3 → 1.4.4**; SSE `done`
  row wording (answer-cap semantics, legacy streaming provider-reason source,
  no note on that path); non-streaming appendix Cap bullet no longer
  attributes the 1,200 cap to `WRITER_MAX_TOKENS_SPEED`.
- `cortex-skills/public/ask/references/API.md` — endpoint intro cap sentence
  gains the 2,000 legacy-synthesis qualifier; `truncated` response-field row
  corrected to answer-cap semantics with both caps; SSE `done` row wording;
  `WRITER_MAX_TOKENS_SPEED` configuration row no longer claims it is also
  the non-streaming `/api/ask` cap; legacy pipeline scope note gains the
  streaming done-flag sentence.
- `cortex-skills/docs/regeneration/records/2026-10-05-legacy-agentic-stream-flags.md`
  — this record only.
- `cortex-app/output/legacy-agentic-stream-flags-20261005/docs-source/**` —
  receipt + after-state copies of the edited public docs.

Not edited: `cortex-skills/public/index.json` (generated — manifest
regeneration and the private docs build belong to the separate generated
writer), any guide/checkpoint/portable bytes (lead-owned), tests, runtime
source beyond the runtime writer's `document_processor.py`, changelog
(documentation-only hotfix ⇒ **no changelog entry** per maintenance rules),
and all other bytes. `before/` snapshots were verified byte-identical to the
working files immediately before these edits (previous dirty state
preserved).

## Consumer trace (no consumer runtime change required)

- **SDK** (`cortex-skills/sdk`): SSE aggregation OR-accumulates `truncated`
  (`sdk/src/sse.ts:98`); the additive done-frame flag requires no type or
  runtime change.
- **Chat**: deep research rides the streaming path; the additive done-frame
  flag does not change its runtime flow.
- **Consumer suites:** none executed by this writer; existing suite evidence
  is not fresh for this slice.

## Limits and non-claims

- Documentation-only, **local unreleased**: no release, deployment,
  publication or released-version promise; public bodies carry current
  use/limits only — no baseline test history, counts or test names (those
  live here and in the App evidence). Manifest is stale versus the 1.4.4
  frontmatter until the generated writer runs it.
- This writer executed no gates/builds/suites/lint; gate execution (candidate
  `107/107`) belongs to the runtime writer's separately owned slice, and the
  docs build/manifest to the generated writer. No Git mutation, install,
  pull, paid, network, schema, dependency or cache-cleanup operations;
  every pre-existing local byte preserved.
# Lead closeout addendum

Main gate execution basis2.18.0 remains unchanged. Candidate producer107/107 passed
before outer retention failed by comparing the changed runtime to frozen baseline
bytes. Accepted successor finalization rejudges the retained XML/receipts and uses
candidate inputs-before for changed runtime identity; original failed wrapper and
early producer receipt remain immutable. Focused backend389/389 and Chat streaming
source contracts13/13 pass. SDK contract file18/18 passed initially but its existing
flag test supplied only truncated=false. A new direct positive true flag case fills
that gap on unchanged SDK runtime; the fresh source-based contract file19/19 passes.
These are selected source checks, not fresh full SDK/MCP/browser/live-stack evidence.

Two additional usage-tail cases pass through both real-auth streaming endpoints:
content-free length followed by null-reason and empty-choice usage chunks keeps
truncated=true and exact content. Supplemental basis2.19.0 is separate from main
107/389 runs2.18.0. No live Langfuse/provider proof or executed erasure mutant.
Failed supplemental preflights (relative/absolute identity keys, then wrong oracle
filename) stay retained; real runner identities() preflight precedes attempt3.

Current portable harvest2.19.0 owns transferable lessons; all prior artifacts/bases
stay unchanged. RAG/QA/maintenance guides and three-repo indices point to App
`output/legacy-agentic-stream-flags-20261005/{FINAL.md,FINAL.json}` and separate
`output/playbook-harvest-2.19.0/{HARVEST.json,HANDOFF.md}`. Exact following action is
the standard-depth legacy `/api/ask/stream` stop/length→done.truncated positive gate
with ENABLE_AGENT_CHAT=false before repair; fast sibling/optional metadata/Hermes
cutoff/privacy remain separate. Recovery both CI/production needs snapshot/upgrade/
image bindings; Ruff remains unverified. All work stays local/uncommitted, no cleanup.
