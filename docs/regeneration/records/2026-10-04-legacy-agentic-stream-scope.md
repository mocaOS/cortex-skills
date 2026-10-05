# Legacy agentic stream scope — 2026-10-04

Translate, executed portable basis **v2.17.0**. Skills source writer, disjoint
from the App lead (runtime/docs/checkpoint), the other source writer
(`main.py`/`document_processor.py`), the generated writer
(`public/index.json`, later) and the read-only reviewer. Published HEADs
unchanged: Skills `63e37ec`, App `85e29fe`; all work local/uncommitted on
accepted dirty inputs (lead snapshot `output/legacy-agentic-scope-20261004/
start.json`, taken 2026-10-04T15:56Z).

## Confirmed source claims this slice translates

- **The non-streaming 400 is flag-conditional.** `POST /api/ask` raises
  `400 agentic_requires_streaming` only when
  `request.use_agentic and settings.enable_agent_research`
  (`backend/app/main.py:4438`). With `ENABLE_AGENT_RESEARCH=false` REST
  reaches the deadline-bounded legacy pipeline `rag_query` →
  `_agentic_rag_query` (`document_processor.py:5022-5027`, `:5305`), which
  accepts only `collection_id` and calls `search_communities_by_content`
  unscoped (`document_processor.py:5437`) — separate ungated
  allowlist/community gaps, a deliberately distinct boundary outside this
  slice's gate.
- **Streaming legacy fallback scope.** The frozen v3 baseline gate in App
  `output/legacy-agentic-scope-20261004/evaluation/GATE-ORACLE.md` rejects the
  gate's selected baseline — the accepted dirty local source (published HEAD
  plus the prior local empty-scope/hybrid repairs, not HEAD-identical to the
  published producer) — with 95/95 selected, 55 passed / 40 intended
  rejections (20 graph-leg allowlist drops, 10 unscoped community searches,
  10 unscoped community summaries), exit 1, no machinery failures;
  independent review PASS (`evaluation/REPORT.md`; `BASELINE-REVIEW.md` and
  `BASELINE-CORRECTIONS.json` at the round root, not under `evaluation/`).
- **Streaming-only candidate verified locally, not released.** The lead's
  candidate run (`output/legacy-agentic-scope-20261004/candidate/RESULTS.json`,
  sha256 `2af58f8ae666432cf791526cc900055986cbdb7cf754616570e8ef160e8fe592`)
  passes the frozen gate **95/95, exit 0** — no skips/errors, inputs unchanged,
  frozen gate and oracle identities unchanged (test
  `1e2d07850d8f3069…`, oracle `e195ae031b954a89…`); the focused backend suite
  (`output/legacy-agentic-scope-20261004/focused/RESULTS.json`, sha256
  `fe2be1180bac2cb45274b4ab87f21255b0333dd62787c05adc12c91ba7c74054`) passes
  **302/302, exit 0** across the eight contributing test files (including the
  new 95-case gate; no skips/errors/input drift). Relative to that selected
  baseline, the runtime delta is exactly the two streaming callers in
  `main.py` plus the additive `allowed_collection_ids`
  parameter on `agentic_rag_stream` with sub-question/community forwarding
  (`neo4j_service.py` digest `bf66df7e8b81…` unchanged from baseline). This is
  local gate evidence over a recording transport — **not a released-backend
  claim**; published HEADs are unchanged and no release is claimed.
- **Narrowed assembly contract (candidate).** The requested/effective scalar
  or key allowlist reaches the chunk-query builders **and** the
  community-selection/summary-access predicate; a returned full community
  summary can still include members the key cannot access once at least one
  member is accessible; `get_community`'s relationships query stays global
  (not consumed by this streaming graph-context projection). Broader
  entity/relationship metadata collection and the non-streaming flag-off
  legacy scope remain open — collection scoping is not complete
  graph-context privacy.

## Skills source edits (10 files, 7 patch-version bumps)

Unconditional rejection prose corrected to flag-conditional reality; the
streaming Deep Research recommendation is preserved regardless of flag; no
unconditional-400 or fixed-nonstream wording added:

- `public/SKILL.md` (v1.0.1→**1.0.2**) — non-streaming ask line + endpoint
  table row now condition the rejection on default `ENABLE_AGENT_RESEARCH=true`.
- `public/integration/SKILL.md` (v1.2.1→**1.2.2**) — same correction.
- `public/mcp/SKILL.md` (v1.3.0→**1.3.1**) — "only honors use_agentic on the
  streaming endpoint" now flag-qualified; parent bump also covers the
  TOOLS.md reference edit.
- `public/mcp/references/TOOLS.md` — `ask_question` mapping parenthetical
  flag-qualified.
- `public/hermes/SKILL.md` (v1.3.4→**1.3.5**) — `ask`/`check` helper rationale
  now leads with "streaming, where Deep Research belongs regardless of
  configuration".
- `public/ask/SKILL.md` (v1.4.1→**1.4.2**) — three corrections: Deep Research
  flag claim now distinguishes the default researcher pipeline
  (`ENABLE_AGENTIC_RAG=true` AND `ENABLE_AGENT_RESEARCH=true`) from the legacy
  fixed pipeline served with `ENABLE_AGENT_RESEARCH=false` on the streaming
  endpoints; the "What You Probably Got Wrong" bullet and the fast-chat
  appendix bullet are flag-conditional.
- `public/ask/references/API.md` — `POST /api/ask` paragraph flag-conditional
  with the streaming recommendation preserved, plus the single owning legacy
  pipeline scope note: a compact operator/agent-facing contract (~115 words,
  no gate/test counts or tool labels — those live here and in App records).
  It states the flag-off streaming legacy baseline's dropped multi/empty
  allowlist and unscoped community retrieval, the local unreleased repair
  forwarding the effective scalar/allowlist to sub-question chunk builders
  and community selection/summary access, the broader shared-summary/global
  metadata limits with `get_community`'s global relationships query, and the
  separate uncorrected non-streaming flag-off legacy path under the ~28s
  deadline. Reference edit bumps the parent ask skill.
- `public/cortex/SKILL.md` (v2.5.2→**2.5.3**) — "Only on the streaming
  endpoint" reframed; parent bump also covers the API reference edit.
- `public/cortex/references/API.md` — `POST /api/ask` section
  flag-conditional.
- `public/builder/app/SKILL.md` (v1.0.0→**1.0.1**) — Deep Research parenthetical
  flag-conditional.

Not edited (reviewed, unaffected): `setup/` flag rows (already accurate),
`trainings/SKILL.md` app-specific flag requirement, `x402`, `search`,
`collections` (streaming examples), `hermes/plugin/README.md`,
`hermes/references/LTM.md`, static `llms.txt`. Per-file before→after sha256
and the full producer trace: App
`output/legacy-agentic-scope-20261004/skills-source/SOURCE.md` (new).

## Limits and non-claims

No manifest/lint/build/test run by this writer (generated writer owns those
gates after source freeze); no package/dependency/schema change; no
publication; every pre-existing local/ignored byte preserved (10 edited files
verified byte-identical to the lead's before snapshots immediately prior to
editing). The `get_community` scope oracle is derived, not
caller-established; the baseline and candidate gate evidence is
recording-driver query assembly, not store execution, returned-data
isolation, live Cypher, production parity or model quality. The candidate
outcome is local gate evidence only — no released-backend, deployment or
store-isolation claim. The non-streaming flag-off boundary and broader
entity/relationship metadata remain named open follow-ups.

## Final source status (frozen)

Skills source is **frozen** as of this record's final edit; no further
source edits follow unless the lead requests them. The ask-reference scope
note compaction is part of the same unreleased edit — no new patch-version
bump (ask stays 1.4.2). Final digests for the generated writer:

- `cortex-skills/public/SKILL.md` `d41bd880c5cba0747254b507684dd3becd0601627b5a15516c55554522d65b01`
- `cortex-skills/public/integration/SKILL.md` `82726bf35100b12dd6272afe266fed782d321c60261ed5a0c8916a09e3fd4e68`
- `cortex-skills/public/mcp/SKILL.md` `0557f4d57f0be1ae8660eac538d6b8d669e358b89f26ab65e545f4fbced4157c`
- `cortex-skills/public/mcp/references/TOOLS.md` `4929e6323312f1fa0a4f7800128fe05c6cee345e9e925b6534357c416517f20b`
- `cortex-skills/public/hermes/SKILL.md` `a66702599f6fd07888433574e4b18aede7d116126abb838b764ecbd4e57c6044`
- `cortex-skills/public/ask/SKILL.md` `f61f325f24e0718fce2a64ec02d500f162b816de524f4fdd37f0331796ba9927`
- `cortex-skills/public/ask/references/API.md` `2330c6b1484d18ed84a995f21f781440dc7170956ffe3497704cff38a7749650`
- `cortex-skills/public/cortex/SKILL.md` `5c0cb9e576c72322f20db9e7c4adbcb41fab160b721ede0eec0c618404bc156e`
- `cortex-skills/public/cortex/references/API.md` `8f412371e3fe4b52cc71f3d48a96c0728ecf5cebe7180a479e765c9c5a5c534c`
- `cortex-skills/public/builder/app/SKILL.md` `8c444cb7f8609885549d2101570654f4c61beec245ff979b0e899770e9e0618f`

Next: generated writer regenerates `public/index.json` and runs
lint/manifest/build; the non-streaming flag-off agentic boundary needs its
own frozen positive gate before any repair.
