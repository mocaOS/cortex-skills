# 2026-10-03 — skill drift corrections (ordered backlog item 5 continuation)

**Current result: independently ACCEPTED**, cortex2.5.1/upload1.1.1, supplemental
manifest generations byte-identical, lint0 errors (two existing warnings).
The first-pass claims/digests below are historical: the supplemental section
corrects blanket query precedence, the SYNC duplicate and the mistaken README
claim. Current public content follows the actual parameter-specific merge code.

Source-backed prose corrections to two high-traffic published skills, continuing
the bounded audit in `cortex-app/output/sdk-mcp-protocol-20261003/remaining-backlog/hightraffic-skills-audit-20261003.md`.
Authorized disjoint write slice: `public/cortex/SKILL.md`, `public/upload/SKILL.md`,
generated `public/index.json` (via `npm run manifest` only), affected
`references/API.md` files where the same statements were duplicated, plus this
record. No code, tests, SDK, MCP, lockfile, dependency or other-doc changes;
no commit/push. Bases: Skills `63e37ec`, App `85e29fe` (same revisions the audit
ran against; four claims independently re-verified in this session).

## The four corrections (each re-verified against current producer source)

1. **cortex `/health` `version` is release-dependent, not hardcoded `1.0.0`.**
   Producer: `backend/app/main.py:955` `CORTEX_VERSION = "1.2.1"`, used in
   `/health` at `main.py:2278`; git history shows per-release bumps
   (`aa7f6ef` 2026-07-29 "report the real release version on /health, and guard
   it", then 1.1.0 → 1.1.1 → 1.2.0 → 1.2.1 in release commits). The skills said
   version was hardcoded `1.0.0` on every release through 1.0.1 — stale. New
   prose states only the release-dependent fact and retains the feature-detection
   advice ("don't branch on `version`"); **no new hardcoded version claim was
   added** (examples now use a `<instance release>` placeholder).
2. **upload custom-input `input_type` is `qa`, not `qa_pair`.** Producer:
   `backend/app/models.py:596-600` `CustomInputType` enum (`qa|text|markdown`);
   endpoint uses it at `main.py:2855`. `qa_pair` would 422. cortex already
   documented `qa` correctly; upload was corrected to match.
3. **upload endpoint `start_processing` default is `false`.** Producer:
   `backend/app/main.py:2429` `Query(default=False, ...)`. The upload skill's
   table said `true` while its own gotcha 3 said omitting it parks the document
   in `pending` — table now says `false` and gotcha 3 states the default
   explicitly. The **custom-input** body field default remains `true`
   (`models.py:610`) — those table rows were left unchanged. Source-default
   reconciliation only; no product policy decision was made or needed (runtime
   behavior is the producer). No test pins the upload default
   (`test_max_files.py:88` / `test_max_entities.py:88` pass the field
   explicitly); the adjacent, source-backed response delta for the default
   branch was recorded (`main.py:2563-2568`: `pending` +
   "Call /api/documents/process-pending").
4. **Upload params are accepted as multipart form fields with query
   precedence.** Producer: `main.py:2432-2450` form aliases
   `collection_id`/`start_processing`/`source` with query-wins merge;
   tests `test_api_ergonomics.py:209` (form field accepted) and `:223`
   (query wins). cortex SKILL.md's "MUST be query parameters, NOT form
   fields / will not work" was overstated and is now softened; the form-field
   note was also added to the upload skill's query-parameter table, which had
   omitted the form placement entirely.

## Files changed (public/**)

| File | Change | sha256 before → after | bytes |
|---|---|---|---|
| `public/cortex/SKILL.md` | version 2.5.0 → **2.5.1**; health-version + upload form-field corrections | `8b5fc43c…73be` → `3f3c395b…48ac8` | 15195 → 15778 |
| `public/cortex/references/API.md` | same statements duplicated (health version ¶, upload MUST/form claim, upload `start_processing` default row) | `eed83afc…3b1b9` → `5af9fab4…f047a81f` | 33246 → 33149 |
| `public/upload/SKILL.md` | version 1.1.0 → **1.1.1**; `qa_pair` → `qa` (table + 2 examples), `start_processing` default `false`, form-field note, pending-response note | `2449751363…382b` → `c7db3d0087…3bf53` | 20012 → 20324 |
| `public/upload/references/API.md` | same statements duplicated (default row, `qa_pair` example + 3 table cells) | `c3be2ba281…279f` → `b1976a50e8…173b3` | 15074 → 15069 |
| `public/index.json` | GENERATED (`npm run manifest` ×2) | `309ed4ff…f80d` → `59d0f334…1aa5a` | bytes 13233 |

Version increments follow the existing frontmatter metadata convention
(`cortex` nested `metadata.version`, `upload` top-level `version`); patch
increments for prose-only corrections. No package versions or dependencies
touched.

## Gates

- `npm run manifest` run **twice**; gen1 and gen2 are byte-identical
  (sha256 `59d0f33481066d5f33d81beaa5673d9e20d670963e6f0a1001d847da5581aa5a`).
  Pre-generation manifest bytes preserved at
  `cortex-app/output/skill-drift-20261003/index.json.{pre,gen1,gen2}`.
- Root `npm run lint`: **exit 0, 0 errors**, the two pre-existing
  unused-var warnings (`scripts/build-manifest.mjs:24`,
  `src/app/skills-client.tsx:63`) — already documented in the packet; no skips.
- No SDK/MCP/source/dist/test changes; no tests run (reversible prose only).

## Residuals (not blessed, not corrected — out of this slice's write scope)

- `cortex/references/SYNC.md:137` still carries the hardcoded-`1.0.0`
  health-version claim — `references/SYNC.md` was not in the authorized write
  list (only `references/API.md`), left byte-identical. Same one-line correction
  applies next time SYNC.md is in scope.
- Static docs still record the old defaults: `documentation/apis/openapi.yaml`
  `start_processing` default `true` — part of the known OpenAPI drift report,
  App-side fix, not this slice.
- Unresolved audit claims stand unchanged: search error-table 404/503 rows and
  ask gotcha 6 community-id clause (unresolved traces), latency tables and all
  other `references/*` content (out of bounded scope). This record is a
  four-fact correction, not an all-semantic approval of either skill.
- Skills `README.md` per-skill sha256 records were not in the write scope and
  now trail the manifest; refresh when that file is next authorized.

## Supplemental correction — precedence prose + SYNC.md duplicate (same slice, lead-directed)

The lead caught that the first pass's blanket "query wins when both are set"
was **not fully source-backed**. Re-verified in producer source
(`backend/app/main.py:2457-2461`):

```python
# Merge query/form placements (query wins; form fills in when absent)
collection_id = collection_id or collection_id_form
source = source or source_form
if not start_processing and start_processing_form is not None:
    start_processing = start_processing_form
```

Actual precedence boundary: the inline source **comment** claims query-wins,
but the code cannot distinguish an explicit `start_processing=false` from the
unset default — a form `start_processing=true` overrides **any** query `false`
(explicit or default). For the strings, a nonempty query wins and the form
fills in only when the query is absent/empty. Comments are not proof; the
existing test `test_api_ergonomics.py:223`
(`test_upload_query_param_wins_over_form`) covers `collection_id` (string)
only — nothing exercises the boolean precedence.

Corrections applied (no product behavior change, no test added):

- Removed the unconditional "query wins when both are set" claim from **all**
  four places it appeared: `cortex/SKILL.md`, `upload/SKILL.md`,
  `cortex/references/API.md`, `upload/references/API.md`.
- `SKILL.md` files now carry the concise safe guidance: form fields are
  supported, **use one placement consistently and avoid conflicting
  query/form values** (resolution differs per parameter).
- Both `references/API.md` files additionally document the precise
  source-backed edge: nonempty query `collection_id`/`source` take precedence;
  a form `start_processing=true` overrides a query `false`.
- `upload/references/API.md`: removed the fabricated
  `START_PROCESSING (default true) "Default for the query parameter"` env row —
  **no `START_PROCESSING` env var exists in `backend/app/config.py`**; the
  upload default is not env-configurable.
- `cortex/references/SYNC.md` (line 137 health-version duplicate) — now
  authorized and corrected with the same release-dependent wording and a
  `<instance release>` placeholder; no new hardcoded version claim.

Scope expansion executed: `public/cortex/references/SYNC.md` (this duplicate
only) and Skills `README.md` check. **README finding: the Skills repo
`README.md` contains no per-skill version/sha256 rows** (its "Available
Skills" list is prose only) — the audit's "sha256s in `README.md`" pointer
resolves to the App audit-time evidence README
(`cortex-app/output/sdk-mcp-protocol-20261003/remaining-backlog/README.md`),
which is frozen provenance and was not rewritten. Zero README rows needed
changing to match the generated manifest; nothing was added.

Skill versions stay **2.5.1 / 1.1.1** (same unpublished slice; no second bump).
Manifest regenerated twice (`manifest-run-supplemental-{1,2}.log`): byte
identical, sha256 `13bff10119cd0682b4b58ba139d6edcc400a20f5eba50db89c7e3f807ab40261`
(was `59d0f334…1aa5a` after pass 1, `309ed4ff…f80d` pre-slice). Root
`npm run lint`: exit 0, 0 errors, the same two pre-existing warnings. All
first-run receipts/logs/snapshots preserved append-only in
`cortex-app/output/skill-drift-20261003/` (`RECEIPT.md`,
`index.json.{pre,gen1,gen2}`, `manifest-run.log`, `lint.log`,
`pre/post-edit-sha256.txt`); supplemental evidence
(`RECEIPT-supplemental.md`, `index.json.supplemental-gen{1,2}`,
`manifest-run-supplemental-{1,2}.log`, `lint-supplemental.log`,
`post-edit-sha256-supplemental.txt`) added beside them. Unresolved search
404/503 and community-id claims remain untouched. Independent read-only review
accepted the stable supplemental content and generated manifest; next trace those
three unresolved claims before proposing further prose corrections.
