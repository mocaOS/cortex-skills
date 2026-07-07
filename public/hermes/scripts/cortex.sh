#!/usr/bin/env bash
# cortex.sh — Hermes ↔ Cortex long-term-memory & knowledge helper.
# One clean invocation per operation; all API logic lives here so the agent never
# pastes multi-line bash (Hermes flattens + eval's it, which breaks heredocs).
#
# A "cortex source" is one connection: base URL + API key (+ optional collection).
# You can register several and route to them by name:
#   • your own long-term memory   (read/write)   — the default source
#   • a community cortex           (read-only)    — e.g. Museum of Crypto Art
#   • a company / team cortex      (read or write)
#
# USAGE
#   cortex.sh sources                              # list connected cortexes
#   cortex.sh connect <name> <base_url> <key> [collection] [ro|rw] [label...]
#   cortex.sh use <name>                           # set the default source
#   cortex.sh [--source NAME] status
#   cortex.sh [--source NAME] save   <file>        # upload a file (needs rw)
#   cortex.sh [--source NAME] check  "<question>"  # fast synthesized answer
#   cortex.sh [--source NAME] ask    "<question>"  # deep agentic answer
#   cortex.sh [--source NAME] search "<query>"     # raw top chunks
#   cortex.sh [--source NAME] wait   <doc_id>      # block until searchable
#   cortex.sh [--source NAME] sync                 # push changed ~/.hermes/memories (needs rw)
#
# The DEFAULT source is env (CORTEX_BASE_URL / CORTEX_API_KEY / CORTEX_COLLECTION)
# if set, else the source marked default in sources.json. The personal/env cortex
# is also addressable explicitly as --source mine (aliases: me|self|own|personal|
# default), which round-trips with the name the helper prints. Named sources live in
# ~/.hermes/skills/state/cortex/sources.json. A source whose collection is empty
# or "all" queries the whole instance (no collection scoping) — right for a
# community/company cortex; a personal cortex scopes to its collection (e.g. "Hermes").
set -uo pipefail

STATE="$HOME/.hermes/skills/state/cortex"
SRCFILE="$STATE/sources.json"
mkdir -p "$STATE"
die(){ echo "cortex: $*" >&2; exit 1; }

# ---- source resolution -------------------------------------------------------
SRC=""
if [ "${1:-}" = "--source" ]; then SRC="${2:-}"; shift 2 || true; fi

load_named(){ # $1 = name -> sets BASE_URL/API_KEY/COLLECTION/ACCESS/LABEL
  local row; row=$(jq -c --arg s "$1" '.sources[$s] // empty' "$SRCFILE" 2>/dev/null)
  [ -n "$row" ] || die "unknown cortex source '$1' — see: cortex.sh sources"
  BASE_URL=$(jq -r '.base_url' <<<"$row"); API_KEY=$(jq -r '.api_key' <<<"$row")
  COLLECTION=$(jq -r '.collection // ""' <<<"$row"); ACCESS=$(jq -r '.access // "rw"' <<<"$row")
  LABEL=$(jq -r '.label // ""' <<<"$row"); SRCNAME="$1"
}

# Names that all mean "the personal / env-configured cortex". The helper prints
# "source: mine" and "saved … to 'mine'", so an agent naturally copies "mine"
# back into --source; accepting these aliases makes that round-trip instead of
# failing with "unknown cortex source 'mine'".
is_personal(){ case "$1" in mine|me|self|own|personal|default) return 0;; *) return 1;; esac; }

use_env(){ # populate vars from env; return 1 if the personal cortex isn't configured
  [ -n "${CORTEX_BASE_URL:-}" ] && [ -n "${CORTEX_API_KEY:-}" ] || return 1
  BASE_URL="$CORTEX_BASE_URL"; API_KEY="$CORTEX_API_KEY"
  COLLECTION="${CORTEX_COLLECTION:-Hermes}"; ACCESS="rw"; LABEL="your long-term memory"; SRCNAME="mine"; return 0
}

resolve(){
  # An explicit personal alias always means the env/personal cortex — never a
  # named source, and never a read-only community default.
  if [ -n "$SRC" ] && is_personal "$SRC"; then
    use_env && return
    die "no personal cortex configured — set CORTEX_BASE_URL + CORTEX_API_KEY in ~/.hermes/.env"
  fi
  if [ -n "$SRC" ]; then load_named "$SRC"; return; fi
  use_env && return
  local def; def=$(jq -r '.default // empty' "$SRCFILE" 2>/dev/null)
  [ -n "$def" ] || die "not connected — set CORTEX_BASE_URL + CORTEX_API_KEY in ~/.hermes/.env, or run: cortex.sh connect <name> <base_url> <key>"
  load_named "$def"
}

api(){ curl -sS -H "X-API-Key: $API_KEY" "$@"; }

# Resolve a collection NAME to an id, creating it when we have write access.
# Empty/"all" collection => echo nothing (query the whole instance).
collection_id(){
  { [ -z "$COLLECTION" ] || [ "$COLLECTION" = all ]; } && return 0
  local id
  id=$(api "$BASE_URL/api/collections" | jq -r --arg n "$COLLECTION" '.collections[]?|select(.name==$n)|.id' | head -n1)
  if { [ -z "$id" ] || [ "$id" = null ]; } && [ "$ACCESS" = rw ]; then
    id=$(api -X POST "$BASE_URL/api/collections" -H "Content-Type: application/json" \
         -d "$(jq -n --arg n "$COLLECTION" '{name:$n,description:"Hermes long-term memory"}')" | jq -r '.id')
  fi
  [ -n "$id" ] && [ "$id" != null ] && echo "$id"
}

need_write(){ [ "$ACCESS" = rw ] || die "source '$SRCNAME' is read-only (recall only). To save, target a read/write cortex — omit --source (or use --source mine) to write to your personal cortex, or use a named source you hold a cortex_rw_ key for."; }

# ask/search JSON with optional collection scoping
ask_body(){ local q="$1" cid="$2" ag="$3"
  if [ -n "$cid" ]; then jq -n --arg q "$q" --arg c "$cid" --argjson a "$ag" '{question:$q,collection_id:$c,use_agentic:$a}'
  else jq -n --arg q "$q" --argjson a "$ag" '{question:$q,use_agentic:$a}'; fi; }
search_body(){ local q="$1" cid="$2"
  if [ -n "$cid" ]; then jq -n --arg q "$q" --arg c "$cid" '{query:$q,top_k:8,filters:{collection_id:$c}}'
  else jq -n --arg q "$q" '{query:$q,top_k:8}'; fi; }

cmd="${1:-}"; [ $# -gt 0 ] && shift

case "$cmd" in
  sources)
    # The personal/env cortex is always addressable as mine|me|self|personal and,
    # when configured, wins for any unnamed call — so list it first with a '*'.
    envset=""
    if [ -n "${CORTEX_BASE_URL:-}" ] && [ -n "${CORTEX_API_KEY:-}" ]; then
      envset=1
      echo "* mine  [rw]  ${CORTEX_BASE_URL}  ${CORTEX_COLLECTION:-Hermes}  — your personal long-term memory (env); default for unnamed calls"
    fi
    if [ -f "$SRCFILE" ]; then
      def=$(jq -r '.default // ""' "$SRCFILE")
      jq -r --arg d "$def" --arg e "$envset" '.sources | to_entries[] | "\(if ((.key==$d) and ($e=="")) then "* " else "  " end)\(.key)  [\(.value.access // "rw")]  \(.value.base_url)  \(.value.collection // "all")  — \(.value.label // "")"' "$SRCFILE"
    fi
    if [ -z "$envset" ] && [ ! -f "$SRCFILE" ]; then
      echo "no cortex connected yet. Set CORTEX_BASE_URL + CORTEX_API_KEY in ~/.hermes/.env, or: cortex.sh connect <name> <base_url> <key>"
    fi
    exit 0
    ;;
  connect)
    name="${1:?usage: connect <name> <base_url> <key> [collection] [ro|rw] [label...]}"
    base="${2:?base_url required}"; key="${3:?api key required}"; coll="${4:-}"; acc="${5:-rw}"; shift 5 2>/dev/null || true; label="${*:-}"
    [ -f "$SRCFILE" ] || echo '{"sources":{}}' > "$SRCFILE"
    tmp=$(mktemp)
    # Only a read/write source may auto-become the default — a read-only source
    # (e.g. a community cortex) must never silently become the write target.
    jq --arg n "$name" --arg b "$base" --arg k "$key" --arg c "$coll" --arg a "$acc" --arg l "$label" \
       '.sources[$n]={base_url:$b,api_key:$k,collection:$c,access:$a,label:$l} | (if (((.default//"")=="") and ($a=="rw")) then .default=$n else . end)' \
       "$SRCFILE" > "$tmp" && mv "$tmp" "$SRCFILE"
    chmod 600 "$SRCFILE"
    echo "connected cortex source '$name' ($acc) -> $base ${coll:+[collection: $coll]}"
    ;;
  use)
    name="${1:?usage: use <name>}"
    if is_personal "$name"; then   # clear the named default -> env/personal wins
      [ -f "$SRCFILE" ] && { tmp=$(mktemp); jq '.default=""' "$SRCFILE" > "$tmp" && mv "$tmp" "$SRCFILE"; }
      echo "default cortex is now your personal (env) cortex"; exit 0
    fi
    [ -f "$SRCFILE" ] || die "no sources yet"
    jq -e --arg s "$name" '.sources[$s]' "$SRCFILE" >/dev/null || die "unknown source '$name' — see: cortex.sh sources"
    tmp=$(mktemp); jq --arg s "$name" '.default=$s' "$SRCFILE" > "$tmp" && mv "$tmp" "$SRCFILE"
    echo "default cortex is now '$name'"
    ;;
  status)
    resolve
    echo "source: $SRCNAME ($ACCESS)${LABEL:+ — $LABEL}"
    api "$BASE_URL/health"; echo
    cid=$(collection_id); echo "collection: ${COLLECTION:-<whole instance>}${cid:+ -> $cid}"
    ;;
  save|dump)
    resolve; need_write
    f="${1:-}"; [ -n "$f" ] || die "usage: cortex.sh save <file>"; [ -f "$f" ] || die "no such file: $f"
    cid=$(collection_id)
    resp=$(api -X POST "$BASE_URL/api/upload?collection_id=$cid&start_processing=true" -F "file=@$f")
    docid=$(jq -r '.document_id // .id // empty' <<<"$resp")
    [ -n "$docid" ] || die "upload failed: $resp"
    echo "saved doc $docid to '$SRCNAME'${cid:+ (collection $COLLECTION)}"
    ;;
  # Render a sources array (from ask/search responses) as a numbered footer.
  # Numbers are 1-based in API order, so they line up with the [src_N] markers
  # the answer embeds. Reads the sources JSON array on stdin.
  # (defined inline below via print_sources)
  check)
    # fast synthesized answer — non-streaming /api/ask (use_agentic:false).
    # Returns the answer AND a numbered "sources:" footer so [src_N] is resolvable.
    resolve
    q="${1:-}"; [ -n "$q" ] || die "usage: cortex.sh check \"<question>\""
    cid=$(collection_id)
    resp=$(api -X POST "$BASE_URL/api/ask" -H "Content-Type: application/json" -d "$(ask_body "$q" "$cid" false)")
    jq -r '.answer // .detail.message // "cortex: no answer in response"' <<<"$resp"
    jq -r 'if (.sources|length)>0 then "\nsources (matches [src_N] in the answer):\n" + ([.sources|to_entries[]|"  [\(.key+1)] \(.value.metadata.filename // .value.document_title // .value.document_id) — score \((.value.score // .value.metadata.rerank_score // 0)|tostring|.[0:5]) — doc \(.value.document_id[0:8])"]|join("\n")) else empty end' <<<"$resp"
    ;;
  ask)
    # deep agentic research — MUST use the streaming endpoint (non-streaming /api/ask
    # rejects use_agentic:true with 400 agentic_requires_streaming). Reconstruct the
    # answer from SSE "content" events, and capture the "sources" event for the footer.
    resolve
    q="${1:-}"; [ -n "$q" ] || die "usage: cortex.sh ask \"<question>\""
    cid=$(collection_id)
    if [ -n "$cid" ]; then body=$(jq -n --arg q "$q" --arg c "$cid" '{question:$q,collection_id:$c,use_agentic:true}')
    else body=$(jq -n --arg q "$q" '{question:$q,use_agentic:true}'); fi
    SRCF=$(mktemp)
    api -N -X POST "$BASE_URL/api/ask/stream" -H "Content-Type: application/json" -H "Accept: text/event-stream" -d "$body" \
      | while IFS= read -r line; do
          [ "${line#data: }" = "$line" ] && continue
          json="${line#data: }"
          printf '%s' "$(jq -r 'if has("content") then .content elif has("error") then "\n[cortex error] "+(.error|tostring) else empty end' 2>/dev/null <<<"$json")"
          jq -e 'has("sources")' >/dev/null 2>&1 <<<"$json" && printf '%s' "$json" > "$SRCF"
        done
    echo
    [ -s "$SRCF" ] && jq -r 'if (.sources|length)>0 then "\nsources (matches [src_N] in the answer):\n" + ([.sources|to_entries[]|"  [\(.key+1)] \(.value.metadata.filename // .value.document_title // .value.document_id) — doc \(.value.document_id[0:8])"]|join("\n")) else empty end' "$SRCF"
    rm -f "$SRCF"
    ;;
  search)
    resolve
    q="${1:-}"; [ -n "$q" ] || die "usage: cortex.sh search \"<query>\""; cid=$(collection_id)
    # Search results carry no document_title (always null) — the human-readable
    # label lives in metadata.filename. Fall back to a short doc id if absent.
    api -X POST "$BASE_URL/api/search" -H "Content-Type: application/json" -d "$(search_body "$q" "$cid")" \
      | jq -r '(.results // [])[] | "• \(.metadata.filename // .document_title // (.document_id[0:8]))  (score \((.score // 0)|tostring|.[0:5]))\n  \(.content[0:240] | gsub("[[:space:]]+";" "))"'
    ;;
  wait)
    resolve; d="${1:-}"; [ -n "$d" ] || die "usage: cortex.sh wait <doc_id>"
    for _ in $(seq 1 60); do
      s=$(api "$BASE_URL/api/documents/$d" | jq -r '.processing_status // .status // empty')
      case "$s" in completed|processed|ready|indexed) echo completed; exit 0;; failed|error) die "processing failed for $d";; esac
      sleep 3
    done; die "timeout waiting for $d"
    ;;
  sync)
    resolve; need_write; cid=$(collection_id)
    TRACK="$STATE/uploaded.json"; [ -f "$TRACK" ] || echo '{}' > "$TRACK"; shopt -s nullglob; n=0
    for f in "$HOME/.hermes/memories/"*.md "$STATE/outbox/"*.md; do
      [ -f "$f" ] || continue
      h=$(sha256sum "$f" | awk '{print $1}')
      [ "$h" = "$(jq -r --arg f "$f" '.[$f].sha256 // empty' "$TRACK")" ] && { echo "skip: $f"; continue; }
      if api -X POST "$BASE_URL/api/upload?collection_id=$cid&start_processing=true" -F "file=@$f" >/dev/null; then
        jq --arg f "$f" --arg h "$h" '.[$f]={sha256:$h}' "$TRACK" > "$TRACK.tmp" && mv "$TRACK.tmp" "$TRACK"; echo "synced: $f"; n=$((n+1))
      fi
    done; echo "synced $n file(s) to '$SRCNAME'"
    ;;
  *)
    die "usage: cortex.sh [--source NAME] {sources|connect|use|status|save <file>|check \"<q>\"|ask \"<q>\"|search \"<q>\"|wait <id>|sync}"
    ;;
esac
