# Legacy flag-off nonstream optional projection (sub_questions / communities_used / retrieval_stats) — 2026-10-05

Portable basis **v2.20.0**. Disjoint documentation-only writer; the App lead
owns runtime/tests/audit/checkpoints, the evaluation writer owns the frozen
gate, and this slice owns only the public ask docs + this record. Published
HEADs unchanged: App `85e29fe`, Chat `d6d3ad6`, Skills `63e37ec`; all work
local/uncommitted on the accepted dirty basis. Round start:
`cortex-app/output/legacy-agentic-optional-projection-20261005/start.json`;
before-snapshot `cortex-app/output/legacy-agentic-optional-projection-20261005/provenance/before/`
(this round's doc edits are attributed against that snapshot, not HEAD's
cumulative dirty diff). App-side source receipt:
`cortex-app/output/legacy-agentic-optional-projection-20261005/docs/source/RECEIPT.md`.

## Executed evidence this record describes (baseline + executed candidate/focused; FINAL pending)

- Frozen gate **before repair**: `backend/tests/test_legacy_agentic_optional_projection.py`
  sha256 `fb5be05b…`, 22 cases — **14 pass / 8 intended projection rejects /
  0 errors / 0 skips, exit 1** on the unchanged runtime `main.py`
  `6f3085d3…` (`evaluation/v3-baseline/`, machine-classified rejection texts,
  raw JUnit observations retained before assertions).
- Independent read-only **ACCEPT** (`evaluation/BASELINE-REVIEW.md`,
  reviewer session `ses_ef42bebd7ffeAYZTqxj9mAtPta`) — accepted the smallest
  handler-local `.get` projection into the existing `RAGResponse` at the
  flag-off nonstream ask constructor; schema and producer unchanged.
- The lead then applied the repair: `backend/app/main.py` ask handler
  constructor now passes `sub_questions=result.get("sub_questions")`,
  `communities_used=result.get("communities_used")`,
  `retrieval_stats=result.get("retrieval_stats")` (main.py:4544–4546, three
  lines on top of frozen `6f3085d3…`; working main sha256
  `fc78e101af416c464d1e01884a404c23eeaaf07fb835bdc919650b2d413ce9c0`).
- **Candidate executed (after the lead's repair; gate/schema/producer
  digests unchanged):** `run_checks_v3.py candidate` — **22/22, exit 0**,
  retention 148/148 against the execution-time pre-run identity
  (`evaluation/v3-candidate/RESULTS.json`; only `backend/app/main.py`
  `fc78e101…` differs from the frozen unchanged digest). The candidate's
  model-refusal row retains a public-JSON observation of the projection
  (`sub_questions: ["sub-alpha","sub-beta"]`, `communities_used: [7]`,
  four-key `retrieval_stats`, alongside `refused: true` /
  `refusal_source: "model"`) in its JUnit properties — **the gate has no
  dedicated optional-value assertion on that row**; the projection fact is
  source-based. Combined focused run-1 executed once against the candidate
  (19 modules): **546 selected / 546 passed / 0 failed / 0 errors / 0
  skips, product exit 0**; the runner's outer judgment falsely failed
  (JUnit→canonical-ID reconstruction dropped the `.py` suffix) and its
  attempt-1 receipt stays retained (`focused/run-1/RESULTS.json`,
  `outcomeOk=false`); the accepted successor
  `focused/run-1/REJUDGED.json` rejudges the same retained evidence
  read-only (zero replay): `ok=true`, 546/546, external binding
  revalidated with candidate digest `fc78e101…`. **FINAL remains pending.**
- Canned recording transport throughout: no live provider, store, Langfuse,
  model-quality, production or privacy execution.

## Confirmed source claims these docs now carry

- **Branch binding:** real-auth flag-off `POST /api/ask` with
  `use_agentic: true` (≡ `depth: "deep"` per `normalize_ask_depth`) routes
  `rag_query` → `_agentic_rag_query` under `ASK_DEADLINE_SECONDS`
  (`document_processor.py:5022–5023`; deadline `main.py:4483–4498`). With
  `ENABLE_AGENT_RESEARCH=true` (default) the same request is rejected
  `400 agentic_requires_streaming` (`main.py:4438–4451`); streaming Deep
  Research remains the recommendation in either configuration.
- **Producer fields:** `_agentic_rag_query`'s result dict already carries
  `sub_questions` (string list), `communities_used` (integer community IDs)
  and `retrieval_stats` with **exactly four keys** `total_sources_considered`,
  `unique_sources`, `sub_questions_researched`, `communities_referenced`
  (`document_processor.py:5707–5714`). The existing `RAGResponse` schema
  already had all three optional fields (`models.py:424–426`) — no schema
  change.
- **Projection semantics (corrected per independent review — see the
  correction section below):** nonempty and literal `[]` lists are preserved;
  the schema accepts `{}` for `retrieval_stats` but the real helper always
  returns all four keys populated; missing/null producer values project to
  public null — which is also what the standard chat path and the no-LLM-key
  recursive fallback (`document_processor.py:5346–5356`) return. **Refusals
  are not uniform:** the input-screen refusals (heuristic/classifier) are
  constructed directly at `main.py:4466–4474` before retrieval and leave all
  three fields null; a **model refusal** (the writer emitted the canned
  deflection) runs the real helper to completion, so the projection emits the
  populated optional values alongside `refused: true` /
  `refusal_source: "model"` (retained candidate observation, see below).
  Earlier inspected handler snapshots omitted the values — a characterized
  gap, not intended behavior; check version/capability rather than assuming
  any broad release behavior. No complete graph-context or shared-summary
  privacy claim attaches to this projection.
- **Separate SSE stats:** the streaming Deep Research events keep their own
  separate `retrieval_stats` (and `communities_used` on `done`,
  `document_processor.py:5936–5942`, `:6039`); the docs changes here do not
  describe SSE stat keys.

## Minimum consumer mapping (source-checked, no runtime change needed)

- **SDK:** `AskResult` already types optional `sub_questions`/`communities_used`
  (`sdk/src/types.ts:64–65`); `retrieval_stats` is typed on `AskStreamEvent`
  (`types.ts:90`). SDK `ask()` sends `use_agentic` only when
  `depth === "deep"` (`client.ts:161`) and routes deep to the streaming
  aggregator (`client.ts:187–201`), so SDK consumers never reach the
  nonstream agentic path — no SDK runtime change, no package bump, suites
  unreplayed.
- **Chat:** deep research always forces the streaming path
  (`useStreaming = settings.streaming || useAgentic`,
  `src/app/page.tsx:584–588`) and its non-streaming senders set
  `use_agentic: false` (`src/app/api/me/souls/generate/route.ts:68`), so the
  new values never surface there — no Chat runtime change.

## Independent source-review correction (attempt 1 REJECTED — this section is additive)

Independent read-only source review (`ses_ef42bebd7ffeAYZTqxj9mAtPta`)
**rejected** attempt 1's blanket "refusal → null" claim before the corrected
docs were generated. Exact factual correction, now applied to all six owned
surfaces:

- **Input-screen refusals** (heuristic pattern validator / prompt-guard
  classifier) are constructed directly at `main.py:4466–4474` **before
  retrieval** — no helper result exists, so `sub_questions`,
  `communities_used` and `retrieval_stats` are null there.
- **Model refusals** occur **after** the real helper returns the optional
  values, and the new `main.py:4544–4546` projection emits them **alongside
  `refused: true` / `refusal_source: "model"`**. Retained candidate
  observation (`evaluation/v3-candidate/junit.xml`,
  `test_nonstream_rest_model_refusal_keeps_refusal_flags`): public JSON
  carries `sub_questions: ["sub-alpha","sub-beta"]`, `communities_used:
  [7]`, the four-key `retrieval_stats` with `refused: true`,
  `refusal_source: "model"` — observed in properties, with **no dedicated
  optional-value assertion** on that row.
- Attempt 1's "released backends drop the values" was overbroad; corrected
  to the bounded claim: **earlier inspected handler snapshots omitted these
  values — check version/capability rather than assuming**; no broad
  all-released claim is made.

Original source receipt and `after/` copies are preserved unchanged as the
**rejected attempt 1**; the corrected files, this section and the successor
receipt live in `cortex-app/output/legacy-agentic-optional-projection-20261005/docs/source/`
(`CORRECTIONS.md`, `RECEIPT-v2.md`, `after-v2/`).

**Write-scope deviation, disclosed:** attempt 1 also wrote
`cortex-skills/docs/regeneration/index.md`, which was **outside this
slice's explicitly assigned write paths**. No lead writer was active in
Skills at that time, so no simultaneous-writer overlap occurred and no work
was lost; the lead adopts that additive checkpoint as session work and owns
the index/checkpoint final state from here. This writer makes **no further
index edits**.

## Writes this slice (Skills repo)

- `public/ask/SKILL.md` — frontmatter `version: 1.4.6` → **1.4.7**; new
  non-streaming appendix bullet for the optional projection (branch, exact
  four-key stats, empty-list preservation, null paths, released-backend
  drop, separate SSE stats). No package/dependency changes.
- `public/ask/references/API.md` — the non-streaming response example's
  **fabricated** `retrieval_stats` keys (`vector_results/keyword_results/
  graph_results/total_unique/after_reranking`) and populated
  `communities_used` on a standard-path example corrected to the actual
  null standard-path values; field rows now carry the branch qualification
  and exact four-key shape; a populated legacy-deep example fragment added;
  the legacy pipeline scope note gained the projection sentence.
- `docs/regeneration/index.md` — new latest-checkpoint entry (this record).

## App-side doc writes (owned by this slice, in cortex-app)

- `documentation/pages/features/ask-ai.mdx` — new "Local unreleased optional
  projection" paragraph after the preserved finish-reason propagation
  paragraph.
- `handbook/10-ask-ai.md` — non-streaming section paragraph extended with
  the projection (existing text preserved verbatim).
- `BACKEND_API_DOCUMENTATION.md` — `POST /api/ask` response field rows and
  the `RAGResponse` model rows now carry branch/null/key semantics.

## Deliberately NOT corrected here (recorded for the next audit)

Wider streaming stats prose is a separate finding and was not bundled: the
SSE `retrieval_stats` table row and stream example in
`public/ask/references/API.md` and the SSE stream example in App
`documentation/pages/features/ask-ai.mdx` still show fabricated keys
(`total_sources_considered`/`search_calls` mixed into SSE frames), and the
`SHOW_RETRIEVAL_STATS` gating/`search_calls` prose is unprobed. Audit these
against `agentic_rag_stream`'s actual three-key SSE event in the next slice.

## Limits / not claimed

- No changelog entry (documentation-only hotfix per maintenance rules);
  no released-version promise; public bodies carry no test history/counts.
- Skills `public/index.json` NOT regenerated here (generated writer owns
  the manifest); it is stale versus the 1.4.7 frontmatter until that pass.
- This writer ran no gates/builds/suites/lint/docs-build. No Git mutation,
  install, pull, paid, network, schema, dependency or cache-cleanup
  operations. Unrelated dirty text preserved. No live provider/store/
  privacy/quality/production claim. Candidate/combined results are the
  evaluation writer's executed receipts (read here read-only); FINAL and
  the session closeout remain pending.

## Lead closeout addendum — source-stage body preserved

The body above is retained source-stage evidence, including its pending-final
and manifest-stale statements. The completed session now has ask1.4.7,
manifest25skills/55files twice retained byte-identical (all55 hashes/bytes
verified), lint0errors/2existingwarnings, Appdocs10/10 controls and exactly one
private-existing-dependency offline build plus source-bound mirror judgment.
Generated stage receipts: App
`output/legacy-agentic-optional-projection-20261005/docs/generated/RECEIPT.md`.
Candidate22/22 with148retention and combined546/546 remain the executions above;
the addendum does not replay them or change public/generator/build inputs.

Two source-stage navigation corrections: the actual round-start snapshot is
`output/legacy-agentic-optional-projection-20261005/provenance/start.json`, and
the independent baseline review is the round-root `BASELINE-REVIEW.md`, not
`evaluation/BASELINE-REVIEW.md`. The v2 source receipt/copies retain the earlier
record bytes; this append-only knowledge addendum is lead-owned, after generation.
Those snapshots describe actual stage inputs, rather than current-record bytes.

Current authoritative closeout, preservation/harvest and next prompt: App
`output/legacy-agentic-optional-projection-20261005/{FINAL.md,FINAL.json,
FINAL-REVIEW.json,HARVEST.json,HANDOFF.md}`. Source-attempt1 refusal-null/release
wording and the extra-index write are historical, corrected/disclosed above.
Next exact action is the source-backed agent-on/legacy SSE-stats/config-prose
trace on unchanged bytes, with positive/empty/config-contrast observations
frozen before any repair. No nonstream stats/deadline/no-key transfer or schema
change; wider metadata privacy/Hermes cutoff remain separate. Recovery stays
both CI Python3.11/Node20 and production images with snapshot/upgrade-pair/
retained-image prerequisites. Portable2.20 remains unchanged; local/uncommitted,
no cleanup or new release/provider authority.
