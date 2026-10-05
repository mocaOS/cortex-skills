# 2026-10-04 — search404 / readiness503 / community-id-as-collection claim corrections

Documentation-only prose slice implementing the three remaining named claims from
the bounded audit in `cortex-app/output/sdk-mcp-protocol-20261003/remaining-backlog/hightraffic-skills-audit-20261003.md`
("Unresolved / not verifiable"), after the deeper producer/auth/retrieval trace
required by `cortex-app/output/claims-openapi-20261004/SCOPE.md`. Authorized
disjoint write scope: `public/search/SKILL.md`, `public/search/references/API.md`,
`public/ask/SKILL.md`, plus this record. Generated `public/index.json` is owned
by the lead (`npm run manifest` only, run after this slice); no other
`public/**` file, SDK/MCP/test/lock/build output was written. No
commit/push/deploy/install; bases Skills `63e37ec`, App `85e29fe` (pre-existing
dirty local work in `public/cortex/*`, `public/upload/*`, `public/index.json`,
`sdk/`, `mcp-server/`, `docs/regeneration/index.md` preserved untouched).

## Findings (source-verified this session against cortex-app backend)

### search404 — confirmed wrong; no collection-existence 404 exists

- `POST /api/search` handler `backend/app/main.py:4249-4332`: only the
  disagreeing-placement check raises 400 (`collection_id` vs
  `filters.collection_id`, `main.py:4270-4279`; test
  `test_api_ergonomics.py::TestUniformCollectionId::test_search_disagreeing_placements_400`).
  Scope denial goes through `auth_service.validate_collection_access`
  (`auth_service.py:440-456`) → **403** for a restricted key whose allowlist
  excludes the id (`can_access_collection`, `auth_service.py:91-109`); an
  `all`-scope key passes for any id.
- The handler then calls `processor.hybrid_search`
  (`document_processor.py:4870`) → `neo4j_service.simple_hybrid_search`
  (`neo4j_service.py:2753`). All three legs
  (`vector_search` `neo4j_service.py:1194` — `MATCH (col:Collection {id:
  $collection_id})-[:CONTAINS]->(d)`; `fulltext_search` `:2664`; `metadata_search`
  `:2716`) match on the `Collection` label by id. There is **no existence
  check**: an id matching no `Collection` produces an empty match, so results
  can come back empty — not 404. Query predicates are `Collection`-label id
  matches; absence of a 404 is a property of this code path, not an existence
  proof.
- Omitted `collection_id` resolves the key's `allowed_collection_ids`
  (`main.py:4282-4292`) or the single allowed collection, so restricted keys
  are limited to allowed collections.

### readiness503 — confirmed stale; no search-index readiness 503

- No readiness site exists anywhere in the search flow. Pending documents are
  excluded by completion predicates (`d.processing_status = 'completed'` in
  all three legs). 503s reachable on this route are infrastructural only:
  auth-store outage → `require_read_permission` → `_raise_if_unauthenticated`
  (`auth_service.py:333-347`, `503` + `Retry-After: 2`; test
  `test_auth_service.py::test_dependency_returns_503_when_auth_store_down`) and,
  for `cortex_pub_` priced keys, x402 config-load/verify and facilitator
  verify/settle failures (`x402_service.py:793-816, 870-899`, `503` with
  `Retry-After` 5/60; test
  `test_x402.py::test_facilitator_down_503_fails_closed`).
- Retrieval-leg failure handling: the keyword/metadata legs catch exceptions
  and degrade to empty (`fulltext_search`/`metadata_search` except branches);
  a generic failure elsewhere surfaces as the handler's 500 (`main.py:4325-4332`).

### community-id-as-collection — confirmed wrong; collection_id never selects a community

- Community ids are **integers** on `Community` nodes
  (`store_community(community_id: int)`, `neo4j_service.py:4922-4943`,
  `MERGE (com:Community {id: $id})`) — a different id space from `Collection`
  ids (UUID/default strings).
- The ask endpoints validate and forward `collection_id`
  (`main.py:4390-4405`) into the researcher pipeline; every retrieval predicate
  is `Collection`-scoped (`researcher_agent.py:481, 2060`). The
  `community_search`/`entity_lookup` tools are scoped by
  `_tool_scope = [collection_id] if collection_id else allowed_collection_ids`
  (`researcher_agent.py:764-769`), and `search_communities_by_content`
  filters summaries to communities whose member entities belong to the
  allowed/requested **collections** (`neo4j_service.py:5561-5583`,
  `col.id IN $allowed_collection_ids`). Nothing interprets `collection_id`
  as a community id.

### 400-row correction

- Missing `query` or out-of-range `top_k` is request validation → **422**
  (`models.py:266-277`, `SearchRequest.top_k: ge=1, le=50`; test
  `test_api_endpoints_smoke.py:34` asserts 422 for a missing query). 400 on
  this endpoint means disagreeing placements.

## Files changed (`public/**`)

| File | Change | sha256 before → after | bytes |
|---|---|---|---|
| `public/search/SKILL.md` | version 1.2.0 → **1.2.1**; error table: 400 row → conflict-placements 400, new 403 row, 422 row for validation, 404 row removed, 503 row removed; added current-producer-behavior note (unknown id → empty results, no readiness gate, infrastructural 503s, stale-row disclaimer) | `821ca59cdbe82ff0878dd4e1663ee8c8190dc03555ee41339789de57eb5d126f` → `7452735264b010241c4afd56d9fc2a6cbccbf8c0b38e21c9eead54ef470af140` | 10823 → 12262 |
| `public/search/references/API.md` | same error-table correction and note (duplicated statements) | `53fb0a8624f68235cb9e8710817902a979b4b03f83dbf646c1149a8945f6bf96` → `80a0abcaa5a5a45e32b589c4cdb25c42a898b0db1096fa4f7a8306d0fb1bafee` | 11033 → 11879 |
| `public/ask/SKILL.md` | version 1.4.0 → **1.4.1**; gotcha 6 rewritten (collection ids only, integer `Community` ids, no collection-existence 404, `community_search` scoping, restricted-key default) and `collection_id` request-body row corrected | `4d7ad1fc7cdefec940575a769ae85a3985e6271d7f55a8ef3119c08e6fc11c50` → `f1b6d787443bf141454447d70dc8d3a56d0156ba78785b2b4ccfba672b0113df` | 31682 → 32213 |

`public/ask/references/API.md` was inspected (pre-edit
`45729f34335044407e077f718861aa5d4d35356631abb41951e7fb1406d1fd9b`, unchanged):
it carries no community-id-as-`collection_id` statement, no search 404/503 rows,
and its `collection_id` row ("Scope retrieval to a specific collection") was
already correct. All four pre-edit digests reconcile byte-identically with the
App snapshot `output/claims-openapi-20261004/before/cortex-skills/` (search
SKILL/ref, ask SKILL/ref).

## Version choices

- `search` 1.2.0 → 1.2.1, `ask` 1.4.0 → 1.4.1: patch bump for prose corrections
  of documented error semantics, per the convention used by the accepted
  `skill-drift-20261003` slice (cortex 2.5.0→2.5.1, upload 1.1.0→1.1.1).
- `cortex` stays at the already-bumped unpublished 2.5.1: its files contain no
  active duplicate of the three claims, so no further bump.
- No other skill frontmatter changed (only these two files carry active
  duplicates of the named claims — see scope check below).

## Scope check (active duplicates)

Repo-wide `public/**` grep for `does not exist` (search error table), `index not
ready|still ingesting`, `community id|community_id` (outside `public/communities/*`,
which documents real `community_ids` API fields), and `or community id` found no
further active duplicates of the three claims in published Markdown. The claim
sentences were unique to `public/search/SKILL.md`, `public/search/references/API.md`
and `public/ask/SKILL.md` (two statements). Before-edit knowledge snapshots exist
at `cortex-app/output/claims-openapi-20261004/before/cortex-skills/`.

## Not done (per slice scope)

- No `npm run manifest` / lint / build here — the lead owns manifest generation
  (frontmatter versions changed, so `public/index.json` must be regenerated
  after this slice) and all canonical indexes; App prose writer owns App
  Markdown separately.
- No tests mirroring the prose; no runtime repair; no schema/OpenAPI alignment.

## Flagged for later (unrelated discovered claims, not corrected in this slice)

1. `public/collections/SKILL.md:15` states `/api/search` "lives *inside* the
   `filters` object — there is no top-level `collection_id` on the search
   request". The current producer accepts the top-level placement
   (`models.py:271-277`, `main.py:4270-4279`,
   `test_api_ergonomics.py::TestUniformCollectionId::test_search_top_level_collection_id`),
   so that statement is stale on current backends. Not one of the three named
   claims; left untouched.
2. `public/search/references/API.md` request-body table omits the top-level
   `collection_id` field entirely (the SKILL.md documents it); same
   non-named-claim disposition as above.
3. `public/search/references/API.md:24` cites an `ENABLE_HYBRID_SEARCH`
   environment variable that the SKILL.md's env table does not list; unverified
   against `config.py` in this pass.

## Limitations

- Source-derived characterization of the current producer code path only
  (`main.py`, `models.py`, `auth_service.py`, `neo4j_service.py`,
  `document_processor.py`, `x402_service.py`, `researcher_agent.py` at App
  `85e29fe` plus local source state); no live-instance, Cypher, or production
  behavior claim. Existing offline tests are cited as evidence of the pinned
  branches, not as runtime parity.
- The unknown-id→empty-results statement is deliberately labeled as
  code-path behavior ("results can come back empty"), not as a universal
  "always 200 empty" guarantee across outages or future revisions.
- Independent read-only review of this claim prose is pending (reviewer owns
  source-truth review; outcome returned to the lead).

## Addendum 2026-10-04 — lead-review revision (authoritative final)

Lead review returned revisions to the first pass above. The first-pass tables,
digests and prose below are retained as recorded history; the **authoritative
final** public bytes are those hashed in this addendum. Same disjoint write
scope (the three `public/**` files plus this record), same unpublished slice —
**no second version bump**: `search` stays 1.2.1, `ask` stays 1.4.1.

### Revisions applied

1. **ask gotcha 6 lead** changed from "Collection scoping applies to every
   endpoint" (overbroad: it implied scoping also rewrites client-provided
   context) to **"Scope fresh retrieval with collection IDs"**, keeping the
   collection-never-community meaning and adding explicitly that
   `collection_id` scopes retrieval, not client-provided context —
   conversation history and the conversation-memory blob are used as sent,
   never rewritten by the collection (memory fast-path and history are not
   collection-rewritten in the producer).
2. **Unknown-collection behavior made explicit per principal** in both search
   surfaces: all-scope/admin keys — no existence check, no 404; restricted
   keys — a disallowed id is denied 403 before retrieval even if unknown;
   an allowed-but-unknown id matches no `Collection` → empty retrieval
   (source-derived).
3. **Stale-history bullets removed from public prose** ("Older revisions …"
   rows in SKILL.md and references/API.md). The history lives here: the
   superseded rows were `404 Specified collection_id does not exist` and
   `503 Search index not ready (still ingesting)`.
4. **"Current backends" replaced** by "the audited current producer source;
   deployed instances may run older revisions (no version claim implied)" —
   the prose describes source bytes (App `85e29fe` plus local tree, relevant
   source bytes unchanged), not deployed or published-release behavior.
5. **Auth 503 scoped correctly**: the store-outage 503 (`Retry-After: 2`)
   applies to **generated-key validation**; the admin environment key is
   authenticated before any store access (`auth_service.py:236-243`), so not
   every principal is affected by every outage. Cached prior validation can
   also serve a generated key during a store outage (negatives never cached).
6. **Omitted-id and empty-allowlist behavior described from current source**:
   omitted `collection_id` → key's permitted collections; a restricted key
   whose allowlist has become empty retrieves nothing. Creation requires ≥1
   existing collection (`main.py:8761-8766`); runtime emptying (e.g. allowed
   collections deleted) is not guarded. **No "now repaired / published
   release bug" claim was made** — no repair evidence exists in the current
   source or its recent history, so affected runtime versions remain unknown.
7. **Contained retrieval-leg failure added** (narrow, per lead): a keyword or
   metadata leg failure contributes nothing instead of failing the request
   (`fulltext_search`/`metadata_search` except branches) — a retrieval failure
   is not always 500. No other semantic-drift claims broadened.

### Authoritative final file state

| File | sha256 first pass → authoritative final | bytes |
|---|---|---|
| `public/search/SKILL.md` | `7452735264b010241c4afd56d9fc2a6cbccbf8c0b38e21c9eead54ef470af140` → `ae9862237a65af720440aa9dabb6df5cd3d9046ba3251ebcb54bdd39de52d34e` | 12262 → 12307 |
| `public/search/references/API.md` | `80a0abcaa5a5a45e32b589c4cdb25c42a898b0db1096fa4f7a8306d0fb1bafee` → `88ec41123af68d9995e2902c15ff64bb7a1ed0e318c1b2534ae48e68675e02ab` | 11879 → 12192 |
| `public/ask/SKILL.md` | `f1b6d787443bf141454447d70dc8d3a56d0156ba78785b2b4ccfba672b0113df` → `3e7583785fd9c190b0db0e2521573d633c9bd7cecd1a9aa46be79bd02119dab2` | 32213 → 32492 |
| `public/ask/references/API.md` | unchanged `45729f34335044407e077f718861aa5d4d35356631abb41951e7fb1406d1fd9b` | 29526 |

Manifest: `public/index.json` remains generated-output owned by the lead (the
current generated manifest hash `f97dd4…` predates these bytes and is
superseded by the lead's next `npm run manifest`; this slice does not run
manifest/lint/build).

### Revised limitations

- All first-pass limitations stand, revised: "current producer source" means
  audited source bytes (App `85e29fe` + local tree, relevant bytes unchanged),
  **local, not deployed** — no published-instance, deployed-version, or
  release-parity claim; version-dependent behavior is left open.
- The empty-allowlist sentence is a current-source behavior description with
  runtime versions unknown; no repair claim and no published-release-bug
  attribution.
- The contained-leg-failure sentence covers only the keyword/metadata legs'
  observed except-branches; the vector leg and leg-interaction failures were
  not re-traced this pass and remain uncharacterized.
- Flags for later are unchanged (collections skill top-level `collection_id`
  staleness, search ref body-table omission, `ENABLE_HYBRID_SEARCH`
  citation); none were corrected in this slice.
- Independent read-only review remains pending after this stable state.
