# Legacy agentic nonstream scope — 2026-10-04

Translate, executed portable basis **v2.17.0**. Skills source writer, disjoint
from the App lead (one-file runtime repair applied and verified locally by
the lead; docs/checkpoint/audit remain the lead's) and the
read-only reviewer. Published HEADs unchanged: Skills `63e37ec`, App
`85e29fe`; all work local/uncommitted on the accepted dirty baseline — the
prior local empty-scope/hybrid and streaming forwarding repairs included
(round start `output/legacy-agentic-nonstream-scope-20261004/start.json`;
actual new start **5527 recorded identities / 401 snapshot files**, per the
review's additive corrections).

## Confirmed source claims this slice translates

- **Flag-conditional 400 stands (prior round's source trace preserved).**
  `POST /api/ask` raises `400 agentic_requires_streaming` only when
  `request.use_agentic and settings.enable_agent_research`
  (`backend/app/main.py:4438`). With `ENABLE_AGENT_RESEARCH=false`, REST
  reaches the deadline-bounded legacy pipeline `rag_query` →
  `_agentic_rag_query` (`document_processor.py:5022-5027`, `:5305-5312`),
  which accepts only `collection_id` and calls
  `search_communities_by_content` unscoped (`document_processor.py:5437`).
  No unconditional-400 or "fixed non-streaming" wording introduced; the
  streaming Deep Research recommendation is preserved in every surface.
- **Frozen pre-repair accepted NONSTREAM positive baseline precedes the
  repair.** Gate sha256
  `190aea811fe9c05f4b9a81bf7dafb59db53e1778dfdf396c24d04bb1add547a7`, oracle
  `8eed16776bcfee430312090ddb0e3c58ec797c32a56a6a463322753b57895e6e`, frozen
  manifest `9b50be70f40570d10c1c625837273bc08a128041e5222fdcc9761e3f744d6ebb`
  (`evaluation/FROZEN-IDENTITIES.json`, `GATE-ORACLE.md`, `run_gate.py`;
  unchanged streaming helper `1e2d07850d8f…`). Test
  `backend/tests/test_legacy_agentic_nonstream_scope.py`, eleven definitions
  / **69 selected cases**: the accepted pre-repair NONSTREAM baseline run is
  `evaluation/baseline-attempt2` — it rejects the accepted pre-repair dirty
  producer with **69 selected / 43 passed / 26 intended scope-assertion
  failures** (RRF6 + hybrid-off4 allowlist losses, community-search5 /
  summary-access5, no-key recursive fallback6), exit 1, no errors/skips.
  The first attempt `evaluation/baseline/` (29 failures) included machinery
  failures and is retained, not accepted. Healthy flag-off 200/progress,
  flag-on 400/zero store calls, forbidden 403, non-agentic forwarding,
  no-key return and direct positional-callback controls pass. v1's three
  machinery failures and its original gate/manifest/attempt are retained
  (`evaluation/gate-machinery/`); v2 corrects observed boundary expectations
  without changing the 26 scope assertions or product source.
- **Independent read-only review PASS** (`BASELINE-REVIEW.md`,
  `ses_ef7b3c9d3ffeRFgTedaJLcxInm`), authorizing a
  `document_processor.py`-only forwarding repair. Its additive corrections
  are part of the record: new start 5527/401 (392 belonged to the prior
  slice), preflight 31.526GiB rounded to 32GiB with the 3GiB guard
  unaffected, junit time 10.293s vs wall 11.289s; REPORT is post-execution
  knowledge, not a frozen executable input.
- **Accepted patch — verified locally (lead receipt, this round's docs
  inputs independent).** The one-file `document_processor.py` forwarding
  patch appends `allowed_collection_ids` after `thinking_callback` and
  forwards it at `rag_query`→`_agentic_rag_query`, the no-key recursive
  fallback, sub-question searches, and the `[scalar] else allowlist`
  community selection/summary access; `None` vs `[]`, algorithms,
  positional callback, deadlines, response projection, state and threaded
  SYNC LLM calls preserved. Receipts read before citing: frozen v2 gate and
  streaming helper unchanged (`190aea…` / `1e2d0785…`),
  `main.py` digest `2c924e70…` and `models.py` `f8096482…` unchanged,
  patched `document_processor.py` digest `95998d20…`. Candidate gate
  **69/69 passed, exit 0** (`candidate/RESULTS.json`, sha256
  `fd76c354258f34f00d9cfa45035807b57000c70d010e7169d79f4c3674eb74ed`:
  selection matches the frozen gate, inputs unchanged, in-memory syntax
  pass); focused suite **371/371 passed, exit 0** across the nine
  contributing test files (`focused/RESULTS.json`, sha256
  `96c9ff5d6b5ca868397e83dd0220a0b1f4030515e7a6c5ba9a01def8e8926631`,
  inputs unchanged).
- **Two implementations, not one (resume correction).** With
  `ENABLE_AGENT_RESEARCH=false`, the SSE legacy path is
  `agentic_rag_stream` (`document_processor.py:5715`, called at
  `main.py:4693`/`:6409`): streamed, **no** `ASK_DEADLINE_SECONDS`, and
  **no** keyless recursive fallback — it emits `error` when no key
  resolves. The non-streaming `POST /api/ask` path is
  `rag_query` (`document_processor.py:4992`) → `_agentic_rag_query`
  (`:5306`, pre-repair signature accepted only `collection_id`; unscoped
  `search_communities_by_content` at `:5437` per the pre-repair accepted
  NONSTREAM baseline), deadline-bounded by `ASK_DEADLINE_SECONDS`
  (`main.py:4483-4493`). The prior first-delivery note wrongly conflated
  the two implementations and their deadlines; corrected this resume
  round.
- **Narrowed contract (candidate, verified locally).** The local unreleased
  repair forwards the effective scalar or allowlist (including `[]`) to the
  chunk-query builders and community selection/summary access in **both**
  implementations; the **non-streaming** path also preserves scope through
  its no-LLM-key recursive fallback (no key → standard RAG recursion);
  streaming has no such fallback. This round starts with the streaming
  path already repaired by the prior accepted slice; the pre-repair
  NONSTREAM baseline above owns the old signatures/gaps at this narrow
  boundary — no all-released-baseline claim. Broader limits remain: shared
  full summaries can mention inaccessible members once one is accessible,
  global entity/relationship metadata, derived community IDs and
  `get_community`'s global relationships query (not projected by these
  callers) — collection scoping is not complete graph-context privacy.

## Skills source edits (4 files, 2 patch-version bumps)

- `public/ask/references/API.md` — the owning legacy pipeline scope note,
  finalized this round (two prior deliveries superseded; see the resume
  correction and the final wrong-delivery correction): the public body now
  carries **no baseline-defect history at all**. After the bold label it
  states the two implementations and deadlines exactly, then the local
  unreleased forwarding repairs' carried scope (effective scalar or
  allowlist, including `[]`, to sub-question chunk builders and community
  selection/summary access in both implementations), the non-streaming
  no-LLM-key recursive fallback (streaming has none), the shared-summary
  accessibility caveat, the global entity/relationship metadata, derived
  community IDs and `get_community`'s global unprojected relationships
  limits, and "collection scoping is not complete graph-context privacy".
  No all-released-baseline or "published baseline" claim; the flag-true
  400 and streaming recommendation remain in their existing paragraphs;
  test counts, gate identities and dirty-baseline provenance live in this
  record and the App records, not the public body.
- `public/ask/SKILL.md` v1.4.2→**1.4.3** — parent patch bump for the
  reference edit; body unchanged (its flag-conditional 400 and fast-chat
  appendix bullets already match source).
- `public/hermes/SKILL.md` v1.3.5→**1.3.6** — parent bump for the script
  comment artifact hash.
- `public/hermes/scripts/cortex.sh` — **comment-only** fix of the previously
  recorded `ask` block comment (lines 311–315 after edit): the non-streaming
  `400 agentic_requires_streaming` is conditioned on default
  `ENABLE_AGENT_RESEARCH=true`; with the flag off the legacy pipeline runs
  under the ~28s deadline, where the script's existing
  deadline/`ask_failed` hint still points at the streaming path. No
  executable line changed (non-comment lines byte-identical to the before
  snapshot; `bash -n` pass).

New this slice: this record and App
`output/legacy-agentic-nonstream-scope-20261004/skills-source/SOURCE.md`.

Not edited (forbidden/out of scope): `public/index.json` and all generated
outputs (generated writer owns, assigned later), `docs/regeneration/index.md`
(lead owns checkpoints), App docs/handbook/maintenance guides, SDK/MCP/Hermes
plugin runtime/schemas/locks, backend sources, static `llms.txt`, old
records. No lint/manifest/build/test execution by this writer; no
publication; every pre-existing local/ignored byte preserved.

## Limits and non-claims

- Baseline and candidate evidence is real-auth HTTP down to real query
  assembly over a canned recording transport — no store execution,
  returned-data isolation, live Cypher, production parity or model
  quality. Verified locally, **not released**: no deployment, publication
  or released-backend claim follows.
- Receipts are the lead's; this writer read them, it did not execute the
  candidate or focused suite. Quality, truncation handling and schema
  findings are out of scope for the public note and this slice.
- No Git mutation, install, pull, network, paid or deploy operation;
  published HEADs unchanged; no release/deployment/store-isolation claim.

## Resume correction (lead-directed, 2026-10-04)

The first-delivered public note wrongly conflated the two flag-off
implementations and their deadlines (it claimed one shared
deadline-bounded pipeline and attributed the no-key recursive fallback to
both) and leaned on a "published baseline" phrase that read as an
all-released-version claim. Corrected additively this resume round: the
record/source now distinguish streaming `agentic_rag_stream` (no deadline,
no keyless fallback) from non-streaming `rag_query`→`_agentic_rag_query`
(deadline-bounded, keyless recursion), name the accepted pre-repair
NONSTREAM baseline as `evaluation/baseline-attempt2` (`baseline/` retained
as the machinery-failed first attempt), fix the source-files heading to 4,
and note the lead's one-file dp patch already applied with the candidate
running in parallel on independent docs inputs. No other file, manifest,
or version changed; ask stays 1.4.3, hermes 1.3.6.

## Final wrong-delivery correction (lead-directed, additive)

The resume-round note still described the pre-repair gaps in the public
body ("Both … drop a restricted key's multi/empty-collection allowlist
…"), which is false for the accepted source: this round starts with the
streaming path already repaired by the prior accepted slice, and the
non-streaming gaps belong to the pre-repair accepted NONSTREAM baseline —
a narrow-boundary historical statement, not an all-released-baseline
claim. Corrected by removing **all** baseline-defect history from the
public note and replacing the body after the bold label with the lead's
exact text (ASCII apostrophe). Superseded second-round note digest
`2c80fe4d6ab71510ec690870f9f0d5149e38309d1df17638a5716b41ff641d20`
(retained, not erased). Candidate verification landed during this round:
candidate 69/69 exit 0 and focused 371/371 exit 0 receipts cited above;
the record's pending-candidate statements were updated to VERIFIED
LOCALLY. Two frontmatter patch versions unchanged (ask 1.4.3, hermes
1.3.6); the Hermes shell comment stays comment-only and unchanged.

## Final source status (frozen)

Skills source is **frozen** as of this record's final edit; no further
source edits follow unless the lead requests them. before → after sha256:

```
cortex-skills/public/ask/SKILL.md                 f61f325f24e0718fce2a64ec02d500f162b816de524f4fdd37f0331796ba9927 → 80403a0aa314d7301a3e0bcfc796c247e3d1462f1495bcd5e1a9ad028e9db2d8
cortex-skills/public/ask/references/API.md        2330c6b1484d18ed84a995f21f781440dc7170956ffe3497704cff38a7749650 → 8d47b4475a3b99e620d0db719159cecd83be03a9ec8dd1f1121728892b6b244f
cortex-skills/public/hermes/SKILL.md              a66702599f6fd07888433574e4b18aede7d116126abb838b764ecbd4e57c6044 → b8bd8a4423ebfc28478e3063ed577fa9a8313df59261bc6a785d99070864125f
cortex-skills/public/hermes/scripts/cortex.sh     839d6ce529178da98c90b4fd054c32505bdc2ec246ed50f5e3ee8acadec6ed2c → 529cf721775f6216910be2a09ebe4fa150e80d041503c826d65e51c9a5563f74
```

Before digests equal the lead's accepted `../before/` snapshots in
`output/legacy-agentic-nonstream-scope-20261004/` (each verified
byte-identical immediately before its edit; API.md's after digest reflects
the final wrong-delivery correction). For the generated writer: regenerate
`public/index.json` from the frozen `public/**` tree (frontmatter versions
ask 1.4.3, hermes 1.3.6; all other skills unchanged this slice), then
lint/manifest-idempotency per the packet commands. Candidate verification
is complete locally (69/69 and 371/371 receipts above); the docs source is
stopped and frozen — no further docs edits follow unless the lead requests
them.
