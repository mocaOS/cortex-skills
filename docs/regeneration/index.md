# Regeneration index — cortex-skills

Local index for the regenerative-software campaign. The **cross-repo campaign
record** lives in `cortex-app/.claude/regeneration.md` (owned by the cortex-app
writer). Detailed history lives in `records/`; this file stays short.

Baseline `main @ 1156ade`. Campaign scope is recorded per slice in
`records/`; root `CLAUDE.md` is the permanent policy (canonical; `AGENTS.md`
is the fallback adapter).

## Commands

| Gate | Command | Stage |
|---|---|---|
| Lint (site) | `npm run lint` | docs/site changes |
| Manifest generation | `npm run manifest` | regenerates `public/index.json` |
| Manifest idempotency | run `npm run manifest` twice; second run must be **byte-identical** to the first (`diff` before/after) | every `public/**` or generator change |
| Manifest vs committed baseline (CI) | `git diff --exit-code -- public/index.json` | CI only, at a committed baseline |
| SDK contract suite | `cd sdk && npm test` | every `sdk/**` change |
| MCP contract suite | `cd mcp-server && npm test` | every `mcp-server/**` change |
| Site build | `npm run build` | release |

**Manifest clarification:** a dirty `git diff` on `public/index.json` in the
working tree is neither an idempotency failure nor an idempotency proof — it
may just be an intentional committed-pending content change. Idempotency is
proven by byte identity between consecutive generation outputs. The
`git diff --exit-code` form is the CI gate and is valid at a committed
baseline.

Environment: Node v22.22.3, npm 10.9.8, Linux. All gates hermetic (local
fakes / loopback only); no live Cortex instance or model calls.

## Instruction load map

| Entry / harness | Delivered | Read rule | Evidence |
|---|---|---|---|
| Repo root, opencode 1.18.34 | root `AGENTS.md` auto-delivered | fallback adapter → explicit read of `CLAUDE.md` (observed working) | loader observation, `records/2026-10-01-slice-2.md` |
| Repo root, Claude Code-style | root `CLAUDE.md` assumed — UNVERIFIED | canonical is the loaded file | content/pointer check only |
| `public/AGENTS.md`, `public/CLAUDE.md` | served product artifact | NOT repo policy | by construction |

## Contract map (cross-repo)

| Contract | Producer | Consumers | Pinned by |
|---|---|---|---|
| REST request/response fields (`depth` + legacy flags, `X-API-Key`, upload multipart, alias responses) | cortex-app `backend/app/main.py` | `sdk/`, `mcp-server/`, skill docs | SDK suite |
| SSE event contract (LF `data:` frames, `: ping`, `event: shutdown`, `error` frame, `memory_update` after `done`, incremental `onContent`) | cortex-app `/api/ask/stream` | `sdk/src/sse.ts` → MCP + skill aggregators | SDK suite |
| MCP tool surface (12 documented tools, `cortex://stats`/`health`) | `mcp-server/src/index.ts` | MCP clients; `public/mcp/*` | MCP suite |
| Skill content ↔ backend behavior | cortex-app source + `cortex-app/documentation` | `public/**` | drift checks (read-only) |
| Manifest (`/index.json`: frontmatter versions, per-file sha256) | `scripts/build-manifest.mjs` | agent installers | generator output shape |

State ownership: MCP server owns file-backed conversation threads under
`CORTEX_STATE_DIR`; SDK stateless except pluggable thread stores; site/skills
own no server state.

## Capability inventory

| Capability | Disposition | Evidence |
|---|---|---|
| Site serves `public/**` skills | improved | lint + manifest byte-identity + build; navigation completeness manifest-checked |
| Manifest generator | adequate-for-current-needs | idempotent (byte-identical rerun) |
| SDK request/error/event contract (incl. callback timing) | improved | 25 hermetic cases; isolated negative controls + callback-timing gate (see records). Live-instance evidence: none (proposal) |
| MCP tool surface | improved | 6 hermetic cases via real entry path; was uninspected before |
| Skill content ↔ backend semantics | adequate-for-current-needs | endpoint cross-check passed; deep per-field audit deferred |
| CI automation | improved | new workflow (lint, manifest, suites, build) |
| Instruction adoption | improved (one observed path) | opencode loader delivery + fallback read observed; CLAUDE-first harness unobserved; n=1 |

## Checkpoint

- Slice 1 (2026-10-01): adapters, packet, navigation fixes (videogen, x402),
  SDK + MCP contract suites, CI. → `records/2026-10-01-slice-1.md`
- Slice 2 (2026-10-01): CLAUDE.md canonical (80 lines), de-campaigned policy,
  separate Deletion/Compaction, corrected state ownership; negative-control
  evidence corrected + isolated reruns; substitution rehearsal reclassified
  INCONCLUSIVE and closed by the new callback-timing gate; fresh-session probe
  (loader observation). → `records/2026-10-01-slice-2.md`
- Durable control recipes: `records/negative-control-recipes.md`
- Companion checkpoint 2026-10-02: Chat real Next ask/late-memory HTTP evaluation
  completed, with two page-callback defects preserved. Receipt/follow-up (when the
  companion is present): `cortex-chat/docs/regeneration/records/2026-10-02-ask-memory-journey.md`.
  SDK/MCP sources and contracts unchanged; no new SDK/MCP runtime evidence claimed.
- Companion follow-up **`chat-ui-turn-bound-20261002-b`**: authorized Chat page-only
  callback/persistence fix, actual Chromium33/33 and HTTP59 + six positive callback
  gates; broken D/browser baselines retained. Receipt:
  `cortex-chat/docs/regeneration/records/2026-10-02-turn-bound-ui.md` when present.
  SDK/MCP SSE promises, schemas and dependency resolution remain unchanged; this
  introduces no new SDK/MCP execution or production-browser claim.
- Companion **`chat-project-lifecycle-20261002-c`**: Chat project HTTP8/8 and
  Chromium23/23; combined candidate also passes established HTTP59 + six callback
  gates, Chromium33/33 and suite132/132 after changed Chat inputs. Owning receipt:
  `cortex-chat/docs/regeneration/records/2026-10-02-project-lifecycle.md` when present.
  Fixes are Chat view/relay ownership only; server LWW, opaque memory and SDK/MCP
  request/SSE semantics remain intact. No new SDK/MCP execution claim. K/D/b
   evidence preserved; next Chat slice is project edit/refresh/reconnect lifecycle.
- Companion **`chat-project-followup-20261002-b`**: remote-adopted edit/regenerate,
  overlapping reads and missed idle/live-completion recovery pass HTTP6/6 and
  Chromium29/29 v1.2. Page-only open/error handling fixes; combined candidate passes
  project HTTP8/8, browser23/23 and ask HTTP59+six callbacks, browser33/33 under
  fresh IDs after changed inputs. Suite132/132, repo/four evaluation typechecks,
  app docs validator/10 controls PASS. Exact closeout and receipts:
  Chat `docs/regeneration/records/2026-10-02-project-followup.md` when present.
  SDK/MCP sources, SSE promises, schema and dependencies unchanged; no new SDK/MCP
  execution claim. Historical c/b/D/K evidence preserved. Next Chat slice:
  reconnect while teammate remains live and remote writes during own late-memory.
- Companion **`chat-project-continuity-20261002-a`**: still-live repeated native
  reconnect plus remote append/same-exchange adoption during own late-memory passes
  HTTP7/7 and Chromium25/25. Page-only live-overlay/coherent late-selection repair;
  fresh integrated follow-up6/29, project8/23 and ask59+six callbacks/browser33 pass.
  Suite132/132, repo/five evaluation typechecks and app docs validation/10 controls
  pass. Final evidence: Chat
  `docs/regeneration/records/2026-10-02-project-continuity.md` when present.
  SDK/MCP inputs/SSE semantics and server LWW unchanged; no new SDK/MCP execution
  claim. Next: held adoption GET/relay replacement and terminal navigation/recall.
- Portable playbook harvest v2.8.0 generalizes these Chat lifecycle/evaluation
  lessons. Current campaign pointer: `cortex-app/REGENERATIVE-SOFTWARE.md` when the
  companion is present. Historical execution bases and SDK/MCP inputs/evidence
  remain unchanged; this documentation update adds no runtime execution claim.

Earlier companion checkpoint **`chat-project-selection-20261002-a`**: Chat genuine
held GET/relay replacement/tokens and terminal same-exchange navigation/regenerate
pass HTTP6/6 and Chromium29/29. Baseline rejects two lost immutable snapshots;
page-only load repair accepted. Fresh integrated continuity7/25, follow-up6/29,
project8/23, ask HTTP59+six callbacks/browser33; suite132/132, repo/six evaluation
typechecks and docs validator/10 controls pass. Failed target crash/dev-compile
timeout receipts retained. Owning record: Chat
`docs/regeneration/records/2026-10-02-project-selection.md` when present. SDK/MCP
sources/opaque SSE/state/schema/dependencies unchanged; no new SDK/MCP execution
claim. Next Chat action: terminal edit-last/different adopted exchange fallback.

Portable playbook harvest v2.9.0 generalizes that slice's lifecycle, timed-gate,
resumed-stage and process-background network lessons. Current companion guide is
`cortex-app/REGENERATIVE-SOFTWARE.md`; selection's executed v2.8.0 basis and all
SDK/MCP inputs and historical receipts remain unchanged. Documentation-only update.

Earlier companion checkpoint **`chat-project-terminal-20261002-d` — blocked**:
Chat terminal HTTP6/6 passes; Chromium a/b/c/d43/47,20/22,45/47,45/47 remain
unaccepted. Complete runs pass direct terminal edit/different/fresh stored fallback
controls; fresh follow-up feedback races genuine adoption. Final v1.3 frozen and
typechecked but not-run/capacity-blocked. Chat suite122/132 (10 capacity setup/
dependent failures); repo/terminal types and app docs10 controls pass. Runtime/
SDK/MCP/state/schema/dependencies unchanged; no new SDK/MCP execution or product
acceptance claim. Prior selection225 files/10 runtime manifests checked read-only;
all baselines/diagnostics retained. Owning record: Chat
`docs/regeneration/records/2026-10-02-project-terminal.md` when present.
Next: identified owned root-backed capacity≥2GiB plus headroom, then frozen v1.3
browser and blocked Chat suite; keep guards/shared/unknown-owner resources intact.

Earlier companion checkpoint **`chat-project-terminal-20261002-f`**: expanded
capacity verified; Chat terminal **HTTP6/6, Chromium47/47 v1.4, suite132/132**,
repo/terminal types and app docs validator/10 controls pass. v1.3 e's failed
GET-barrier quota is corrected in the terminal-local adapter and re-frozen; no
product runtime fix. All historical receipts/diagnostics preserved; successful
scratch removed after retention. Owning record above; integrated evidence in App
`output/chat-project-terminal-resume-20261002/` when present. SDK/MCP/state/schema/
dependencies unchanged; no new SDK/MCP execution, model or production parity
claim. Next Chat slice: actual Chromium ask-shutdown/resubmit with frozen controls.

Portable harvest **v2.10.0** generalizes the terminal evaluation/resource lessons.
Current companion guide: `cortex-app/REGENERATIVE-SOFTWARE.md`; f retains its
executed v2.9.0 basis and all SDK/MCP/runtime/gate/receipt bytes stay unchanged.
Documentation-only audit: App terminal-resume `playbook-harvest-verification.json`.

Earlier companion checkpoint **`chat-ask-shutdown-20261002-a`**, translate/v2.10.0:
Chat frozen partial-answer shutdown/reset/resubmit/exhaustion gate passes **HTTP7/7,
actual Chromium31/31, suite136/136**, repo/shutdown types and App docs validator/
10 controls. Stable request IDs/identical bodies, exact durable history/opaque recall,
direct no-GET feedback/regenerate, immutable snapshots and settled/legacy controls
pass. No runtime repair; four comparator controls reject eight faulty observations.
Historical gates/diagnostics preserved and current inputs audited read-only. Owning
receipt: Chat `docs/regeneration/records/2026-10-02-ask-shutdown.md` when present;
App `output/chat-ask-shutdown-20261002/` holds integrated evidence. SDK/MCP/state/
schema/dependencies unchanged; no new SDK/MCP execution, production or model claim.
Next Chat slice: actual project owner-share-modal grant/revoke, fresh member admission
and exact preserved state; extract open-feed membership-snapshot semantics first.

Earlier companion checkpoint **`chat-project-sharing-20261002-b`**, translate/v2.10.0:
Chat owner-modal grant/revoke/group-union/regain passes **HTTP11/11 v1 and actual
Chromium25/25 v1.1**, unchanged runtime. Exact preserved chat state/opaque recall,
member continuation and fresh admission pass; open-feed admission remains connect-time.
Browser a25/24's peer-read counting failure and no-op feedback gap retained; corrected
adapter requires actor-owned no-GET and a new changed-rating commit. HTTP reuse is
backed by exact relevant-input comparison. Owning Chat
`docs/regeneration/records/2026-10-02-project-sharing.md`; App
`output/chat-project-sharing-20261002/` when present. SDK/MCP/state/schema/dependencies
unchanged; no new SDK/MCP execution or production/model claim. Next Chat action:
actual own-chat drag/drop shared-project move with consent/state/consumer gates.
Chat suite138/138, repo/sharing types and App docs validator/10 controls pass.
Two grant comparator self-controls reject five faulty stored sets; no new SDK/MCP
runtime execution follows from those Chat results.

Earlier companion **`chat-project-move-20261002-d`**, translate/v2.10.0: move HTTP8/
Chromium23 v1.3 passes after two real failed page context gates and a client404 gate.
Patch only Chat `page.tsx`/`chatHistory.ts`; LWW/opaque recall/immutable snapshots and
SDK/MCP/API/schema/dependencies unchanged. Fresh18 integrated Chat stages pass:
sharing11/25, shutdown7/31, terminal6/47, selection6/29, continuity7/25, follow-up6/29,
project8/23, ask59+six callbacks/33. Gate/machinery failures and all historical receipts
preserved. Owning Chat `docs/regeneration/records/2026-10-02-project-move.md`; App
`output/chat-project-move-20261002/` when present. No new SDK/MCP/model/production
execution claim. Next Chat slice: actual project deletion/explicit detach, surviving
author-owned chat state and late acknowledgment/compaction consumers.
Chat suite142/142, repo/move types and App docs validator/10 controls pass; all18
new executions reconcile against one combined Chat source manifest.

Current portable guidance is **v2.14.0** (`cortex-app/REGENERATIVE-SOFTWARE.md` when
present): authoritative association/read-view ownership, commit/ack discrimination,
post-commit delivery loss, adapter fidelity and corrected review claims, plus
build-variant prerequisites, valid synthetic telemetry sinks, filtered observers,
failed-run retention and atomic publication composition. Overlap c
retains executedv2.12.0, rejection b v2.11.0, move d v2.10.0; SDK/MCP/runtime/gate/
receipt bytes stay intact. Separate audit: App overlap `playbook-harvest-verification.json`;
this documentation-only harvest adds no journey or SDK/MCP execution.

Earlier companion **`chat-project-delete-20261003-c`**, translate/v2.11.0: frozen
delete HTTP9/Chromium21 v1.1 passes after unchanged-page b21/20 rejects a delayed
delete acknowledgment clearing a different project's selected context. Page-only
pure current-state comparison fix; exact multi-author detach, native confirmation,
held compaction/direct immutable consumers and fresh admission pass. Fresh20 combined
Chat executions plus suite144/types/docs10 controls pass. Owning Chat
`docs/regeneration/records/2026-10-03-project-delete.md`; App
`output/chat-project-delete-20261003/` when present. Failed adapter/product attempts,
old receipts and owned diagnostics retained; no SDK/MCP/state/schema/dependency changes
or new SDK/MCP execution claim. This packet's lint passes (two existing warnings),
manifest twice unchanged byte-for-byte. Next Chat gate: pre-commit DELETE transport
failure, exact unchanged state and direct selected-project context/recall before repairs.

Earlier companion **`chat-project-delete-rejection-20261003-b`**, translate/v2.11.0:
frozen Chromium23 passes after baseline23/21 rejects lost project context through
direct regenerate/edit following genuine pre-dispatch DELETE failure. Page-only
catch early return;21 combined runtime stages, suite147/types/docs10 controls pass.
Owning Chat `docs/regeneration/records/2026-10-03-project-delete-rejection.md`; App
`output/chat-project-delete-rejection-20261003/` when present. Old evidence/diagnostics,
LWW/opaque state/snapshots and SDK/MCP/schema/dependency inputs preserved; no new
SDK/MCP execution claim. Skills lint passes (two existing warnings); manifest remains
byte-identical. Next: remote project deletion with selected member-owned held work;
distinguish author rights/fresh admission from non-author ongoing-feed/operation policy.

Earlier companion **`chat-project-remote-delete-20261003-b`**, translate/v2.12.0:
frozen remote HTTP10/Chromium31 v1.1 passes after browser a31/29 rejects stale context
in direct member-author edit/regenerate. Page-only flat-list association update keeps
history/recall/immutable snapshots/LWW;23 fresh combined stages and suite147/types/
docs10 controls pass. Non-author fresh read/save/feed404 is separate from admitted
ask/relay completion and open-feed delivery; late browser PATCH404 leaves storage
unchanged. HTTP optional-kind evaluator failure and all prior diagnostics retained.
Owning Chat `docs/regeneration/records/2026-10-03-project-remote-delete.md`; App
`output/chat-project-remote-delete-20261003/` when present. Skills lint passes (two
existing warnings), manifest before/twice generated unchanged; SDK/MCP/state/schema/
dependency contracts preserved with no new SDK/MCP execution claim. Next Chat gate:
delayed personal flat-list responses across acknowledged moves/current selection;
direct association/immutable consumers and healthy controls before fixes.

Earlier companion **`chat-project-association-list-20261003-c`**, translate/v2.12.0:
frozen Chromium27 v1.1 passes after b27/25 rejects old personal-list context losses
across acknowledged move and navigation. Page-only request/view guards preserve
LWW/opaque state/snapshots;24 fresh combined stages/suite147/types/docs10 controls pass.
Failed notification trigger/baseline diagnostics and all prior evidence retained.
Owning Chat `docs/regeneration/records/2026-10-03-project-association-list.md`; App
`output/chat-project-association-list-20261003/` when present. Skills lint (two existing
warnings)/byte-identical manifest pass; SDK/MCP/state/schema/dependencies unchanged,
no new SDK/MCP execution claim. Next Chat gate: post-dispatch genuine DELETE response
loss; caller failure/committed detach/reconciliation/direct immutable consumers/no
automatic replay, with pre-dispatch/success controls before fixes.

Earlier companion **`chat-project-delete-response-loss-20261003-a`**, translate/v2.12.0:
frozen Chromium26 v1 passes unchanged runtime: real committed DELETE200 then lost
delivery/no caller ack; supported reconciliation/late memory/direct immutable personal
context/no automatic replay and pre-dispatch/cancel/success controls pass. One fresh
journey +24 unchanged-input accepted stages/147-test result reconciled; old runs not
replayed/relabeled. Owning Chat `docs/regeneration/records/2026-10-03-project-delete-response-loss.md`;
App `output/chat-project-delete-response-loss-20261003/` when present. Types/docs10/
Skills lint two existing warnings/byte-identical manifest pass. SDK/MCP/state/schema/
dependencies unchanged; no new SDK/MCP execution. Next Chat gate: overlapping own-chat
move acknowledgments delivered opposite observed commit order, with exact state/direct
immutable consumers and healthy controls before fixes; retain LWW.

Earlier companion **`chat-project-move-overlap-20261003-c`**, translate/v2.12.0:
frozen Chromium21 v1.1 accepts page-only authoritative positive association binding
after b21/19 rejects stale A context with stored B. Native commit A/B and ack B/A,
valid late compaction/direct immutable consumers/LWW pass;26 fresh combined journeys/
suite147/types/docs10 controls, Skills lint2 existing warnings/unchanged manifest pass.
Delegated evaluator and independent read-only reviewer; overlay failure/gates/diagnostics
and all prior evidence kept. Owning Chat `docs/regeneration/records/2026-10-03-project-move-overlap.md`;
App `output/chat-project-move-overlap-20261003/` when present. SDK/MCP/state/schema/
dependencies unchanged, no new SDK/MCP execution; no commit/deploy/publication/live/paid.
Next Chat gate: gestures A/B with reverse commits B/A via pre-forward A hold; final
association/direct immutable context A, both accepted outcomes/healthy controls, no CAS.

Current companion **`chat-project-move-reverse-20261003-b`**, translate/v2.13.0:
frozen reverse Chromium21 v1.1 passes unchanged runtime. Actual A pre-forward hold
proves no commit/response/move ack; native B commits/acks200, then A commits/acks200
last. Final association/direct immutable context A, exact state/valid compaction/
personality association and healthy controls pass; both accepted outcomes/LWW remain.
One fresh journey integrates26 unchanged-input c executions, explicitly inherited
after full source/evaluator/installed-lock/tool/evidence reconciliation. a12/8's
mis-scoped no-ack gate, original bytes/diagnostics and teardown failures retained;
independent reviewer accepts corrected b. Owning Chat `records/2026-10-03-project-move-reverse.md`,
App `output/chat-project-move-reverse-20261003/` when present. c's executedv2.12.0/
original receipts stay immutable. SDK/MCP/skills/schema/dependency inputs unchanged;
no new SDK/MCP execution or commit/deploy/publication/live/paid changes. Packet
lintPASS (two existing warnings)/unchanged manifest verified at closeout. Next Chat gate: genuine older
positive B project-list delivered after newer A lists across reverse commits; direct
context A/immutable consumers/healthy controls, no latest-gesture/CAS or early fix.

2026-10-03 App-led **`release-readiness-20261003`**: Skills lint (two pre-existing
warnings), site build, SDK25 and MCP6 all pass on a hash-verified owned copy as
part of the three-repo release gate; independent review confirms no Skills runtime
delta (mcp-server package.json test script + workspace lockfile metadata only).
Verdict READY-conditional, source-built path selected; commit composition and
authorization tracked in App `output/release-readiness-20261003/` (VERDICT.md,
HANDOFF-source-built.md). No commit/push; dirty tree preserved.

Publication addendum: user authorized all three repos' commit/push to `main`
after the App technical changelog and v2.14.0 harvest. Backups are covered by
separate user routines; no instances auto-deploy on push. Git publication adds
no deployment or HTTPS-smoke claim and changes no SDK/MCP runtime. Receipts:
App `output/release-readiness-20261003/authorized-publication-20261003/` when present.

## Backlog

1. CLAUDE-first harness probe (when such a harness is available) + an
   edit-decision probe (small doc fix by a fresh agent).
2. Per-skill semantic drift audit vs cortex-app source (cortex, ask, search,
   upload first).
3. Runtime-owner decisions: CRLF SSE framing fix; MCP version-constant
   (0.2.0 vs 0.3.1) reconciliation.
4. Optional: MCP suite coverage for resources (`cortex://stats`/`health`) and
   `CORTEX_STATE_DIR` thread persistence.
