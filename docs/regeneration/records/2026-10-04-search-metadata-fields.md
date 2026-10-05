# Record — search metadata-vs-graph prose & collection/config corrections, 2026-10-04

Mode: **translate**, playbook `REGENERATIVE-SOFTWARE.md` v2.16.0, executed on the
published HEADs (Skills `63e37ec`, App `85e29fe`, Chat `d6d3ad6`) with all prior
local/uncommitted work preserved. Disjoint source writer; generated writer owns
`public/index.json` (not touched, not regenerated). This slice closes the exact
next action named in App `qa/NEXT_SESSION.md` and
`output/claims-openapi-20261004/{CLAIMS,FINAL}.md`: trace `/api/search`'s actual
vector/fulltext/**metadata** legs vs published graph-leg prose, the collections
skill's obsolete no-top-level-collection claim, and the search reference's
missing top-level field / `ENABLE_HYBRID_SEARCH` explanation.

## Claim verdicts (source-backed, documentation-only)

All three named claims are **confirmed drift**. Producer trace uses the current
local working tree, including the prior slice's uncommitted scope repair in
`main.py` and `neo4j_service.py`; those files are not HEAD-identical. The search
handler and leg structure remain unchanged; the repaired leg scope predicates
preserve the distinction between absent and empty allowlists.

1. **`/api/search` third leg is metadata, not graph traversal; no re-ranking.**
   `backend/app/main.py:4251-4334` (`search`) → `QueryProcessor.hybrid_search`
   (`backend/app/services/document_processor.py:4870-4904`) →
   `Neo4jService.simple_hybrid_search` (`backend/app/services/neo4j_service.py:2755-2792`).
   Legs: `vector_search` (:1194), `fulltext_search` (:2650), `metadata_search`
   (:2698), each at `top_k*2`, fused by `_reciprocal_rank_fusion` (:2794, k=60)
   with the fixed signature weights 0.5/0.3/0.2 (vector/keyword/metadata;
   `main.py` passes no weights). The handler's own docstring (:4262-4267) says
   metadata. No rerank call anywhere on this path; the response `score` is the
   RRF score (`weight/(60+rank)`, max ≈ 1/61 ≈ 0.016 at default weights).
   Graph traversal + cross-encoder reranking belong to the different ask/context/
   researcher path: `graph_search_async` (document_processor.py:4906-4987) →
   `hybrid_search_rrf` (neo4j_service.py:2837-2943) + `rerank_results`, which
   uses the config weights. Fulltext/metadata leg failures are contained
   (warning + empty leg, :2693-2695, :2750-2752); vector-leg failures surface as
   500. This extends the already-corrected 1.2.1 error-semantics block, which is
   preserved verbatim.
2. **`ENABLE_HYBRID_SEARCH` does not gate `/api/search`.** The flag
   (`backend/app/config.py:600`) is consulted only in `graph_search_async`
   (document_processor.py:4950) via `use_hybrid_rrf` from `/api/context`
   (main.py:4106), the ask stream path (main.py:4900), `rag_query`
   (document_processor.py:5037), and echoed in `/api/config` (main.py:6560).
   `false` falls back to legacy `neo4j.hybrid_search` (vector + graph traversal,
   no keyword leg, no collection scoping — "falls back to full scan" comment,
   document_processor.py:4974-4987). `/api/search` always runs
   vector+keyword+metadata regardless.
3. **Top-level `collection_id` exists on the search request.**
   `SearchRequest.collection_id` (`backend/app/models.py:274-277`, uniform with
   `/api/ask` and `/api/upload`; disagreeing placements → 400, main.py:4274-4284).
   The collections skill's "no top-level `collection_id` on the search request"
   and "not as a top-level field" statements are obsolete.

## Files changed (11 public skills files, 6 versions bumped)

Versions: search 1.2.1→**1.2.2**, collections 1.0.0→**1.0.1**,
cortex 2.5.1→**2.5.2**, hermes 1.3.3→**1.3.4**, integration 1.2.0→**1.2.1**,
root cortex-skills 1.0.0→**1.0.1**. No package/lock/SDK/MCP version changed.

| File | Same-claim fixes |
|---|---|
| `public/search/SKILL.md` | frontmatter description + version; "What You Probably Got Wrong" 1/2/4/5/6 (metadata third leg, no rerank / RRF-scale score, no graph leg, fixed weights, scoping wording); endpoint note (runs regardless of `ENABLE_HYBRID_SEARCH`); response example score; "How Hybrid Search Works" rewritten (sequential legs, leg descriptions incl. parse-safe fulltext tokens and metadata tiers 3.0/2.5/2.0, fixed weights, "No Re-Ranking on This Endpoint"); Tips (fusion/re-ranker/graph wording); Environment Variables table reframed as ask-path settings; latency sentence ("graph density" → "collection scope") |
| `public/search/references/API.md` | intro; **added the missing top-level `collection_id` request row**; hybrid/flag paragraph corrected (flag gates the ask/context path; no rerank here); response example (document_title, `total`, RRF-scale score) and "exactly four top-level fields" + score semantics; Weight Configuration (fixed endpoint weights, removed fabricated `RRF_K` env row — no `rrf_k` setting exists in config.py; k=60 hardcoded), tuning guidance moved to the ask path; Re-Ranking Details reframed (not applied to `/api/search`); "Graph Traversal" strategy section replaced by "Metadata Search" with a pointer that graph traversal is the ask-path leg; Collection Scoping (both placements, must agree, per-leg `Collection→CONTAINS→Document` match, vector over-fetch); env table (`ENABLE_HYBRID_SEARCH` row corrected incl. false path; weight rows scoped to ask path; `RRF_K` removed; intro notes embedding/overfetch settings also apply to the search vector leg); latency sentence |
| `public/collections/SKILL.md` | point 3 rewritten (search accepts top-level `collection_id` OR legacy `filters.collection_id`, must agree, 400 on disagreement); "Search Within a Collection" intro corrected |
| `public/collections/references/API.md` | scoping sentence third leg "graph traversal" → "metadata matching" (the `limit`/`search_type` rows in the same block are unaudited fabricated-parameter claims and were left) |
| `public/cortex/SKILL.md` | search section sentence (metadata fusion, no rerank, ask path adds graph+rerank); sub-skill index row |
| `public/cortex/references/API.md` | search description; response example corrected to actual shape (removed fabricated `query_time_ms` and `graph_context` — `SearchResponse` has exactly `query/results/total_results/total`, models.py:300-315) |
| `public/hermes/SKILL.md` | sub-skill index row |
| `public/integration/SKILL.md` | version only (reference fixes below) |
| `public/integration/references/LANGCHAIN.md` | LangChain tool description string |
| `public/integration/references/PYTHON.md` | `search()` docstring sentence |
| `public/SKILL.md` | search sub-skill index bullet |

New record: `docs/regeneration/records/2026-10-04-search-metadata-fields.md`
(this file). `public/index.json` was **not** edited or regenerated — the
generated writer owns it and must regenerate/verify it against these versions.

## Accepted before identities and final digests

Before-edit snapshots: App `output/search-prose-20261004/before/<repo>/...`
(lead-created `start.json`, 1896 identities); every edited file was verified
byte-identical to its snapshot immediately before editing (no drift). sha256
before → after:

- public/search/SKILL.md `ae986223…d34e` → `3aca38d1…218f`
- public/search/references/API.md `88ec4112…02ab` → `c5728369…9502`
- public/collections/SKILL.md `e199a8dd…73f66`→`add1e7e1…329f`
- public/collections/references/API.md `58666b47…9893` → `be9ffc5d…ab3fb`
- public/cortex/SKILL.md `b08fd603…ebcf` → `7eb5368d…74ad`
- public/cortex/references/API.md `e98a9756…842ee`→`16f19361…0162`
- public/hermes/SKILL.md `02ac9335…891a` → `226bbd96…a350`
- public/integration/SKILL.md `0bba0b60…1bfd` → `b7184856…3ce89`
- public/integration/references/LANGCHAIN.md `8af1c141…3e2c` → `4258a7ef…d7ec`
- public/integration/references/PYTHON.md `2030015c…c2846`→`c84cdf55…bb8f0`
- public/SKILL.md `56252dbb…514e4` → `cd8e3a45…b387d2`

Full 64-hex digests are recorded in App `output/search-prose-20261004/SOURCE.md`.

## Deliberately left (reviewed, not this slice's confirmed claims)

- General product-level "hybrid search = vector + keyword + graph" prose that
  correctly describes the ask/deep-research retrieval (root SKILL.md capability
  bullet, cortex/hermes frontmatter descriptions, handbook 01/02/20/22,
  `introduction.mdx`, README feature list, `BACKEND_API_DOCUMENTATION.md`
  agent-pipeline section): left as ask-path-true statements.
- Unaudited fabricated search request/response parameters (`limit`,
  `search_type`, `query_time_ms`, `metadata.page`, `document_type`/`tags`
  filter semantics — actual `filters` support is `file_type` only,
  neo4j_service.py:1206) in App `features/search.mdx` examples/"Search Types"
  table, `examples/curl.mdx`, `examples/python.mdx`, Skills
  `collections/references/API.md` rows, and `BACKEND_API_DOCUMENTATION.md`
  `/api/search` field list (root file, outside this writer's owned paths —
  it also lacks the top-level `collection_id` row and `total`). These need
  their own confirmed claim before editing.
- Latency tables ("150-300ms" etc.) and `EMBEDDING_MODEL` default spelling
  (`openai/text-embedding-3-small` vs config default `text-embedding-3-small`):
  unaudited, left.

## Limitations

- Documentation-only: no runtime, schema, config, test, manifest, dependency,
  build, or gate change; no lint/manifest/docs-build/test execution (the
  generated writer + lead verify the integrated candidate once after this
  source is frozen).
- Source evidence is the current local working tree, carrying the previous
  slice's local scope repair; traced files are not all HEAD-identical. Deployed instances may run older
  revisions (no version claim implied). All observations are static source
  reads — no live Neo4j/HTTP execution.
- Edits were made with exact-string patch replacements (the environment has no
  `apply_patch` binary; each replacement asserted a unique match).

## Additive review correction

The first independent source review returned CHANGES REQUIRED. Its exact
counterexamples are retained by the App lead. Corrections to the source writer's
counts, provenance and wording are authoritative in App
`output/search-prose-20261004/SOURCE-CORRECTIONS.md`; read that with the original
`SOURCE.md`. Final bytes and checks belong to the integrated closeout. The
legacy flag-off ask/context path's dropped scope is a static confinement finding
requiring a frozen positive baseline gate before any runtime repair.
