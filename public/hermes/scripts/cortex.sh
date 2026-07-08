#!/usr/bin/env bash
# cortex.sh — Hermes ↔ Cortex long-term-memory & knowledge helper.
# One clean invocation per operation; all API logic lives here so the agent never
# pastes multi-line bash (Hermes flattens + eval's it, which breaks heredocs).
#
# A "cortex source" is one connection: base URL + API key (+ optional collection).
# You can register several and route to them by name:
#   • your own long-term memory   (read/write)   — the default source
#   • a community cortex           (read-only)    — a shared public knowledge base
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
#   cortex.sh [--source NAME] list   [n]           # newest saved docs (ground truth, default 10)
#   cortex.sh [--source NAME] show   <doc_id>      # print a saved doc's full content
#   cortex.sh [--source NAME] forget <doc_id>      # delete a saved doc (needs rw)
#   cortex.sh [--source NAME] wait   <doc_id>      # block until searchable
#   cortex.sh [--source NAME] sync                 # push changed ~/.hermes/memories (needs rw)
#   cortex.sh setup dir=<path> provider=<venice|openai|openrouter|custom> key=<api_key>
#            [base=<url>] [model=<id>] [emb_key=] [emb_base=] [emb_model=] [emb_dim=] [offset=<N>]
#                                                  # self-host a NEW Cortex from scratch (detached boot)
#   cortex.sh setup-status dir=<path>              # poll the boot; when healthy, mint key + connect
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
    base="${2:?base_url required}"; key="${3:?api key required}"; coll="${4:-}"; acc="${5:-}"; shift 5 2>/dev/null || true; label="${*:-}"
    # Access is inferred from the key prefix when not given — and a cortex_ro_
    # key is ALWAYS recorded read-only: the server refuses its writes anyway,
    # and recording it rw would let it slip past the read-only default guard.
    case "$key" in
      cortex_ro_*) [ "$acc" = rw ] && echo "note: key is read-only (cortex_ro_) — recording source as ro"; acc=ro;;
      *) [ -n "$acc" ] || acc=rw;;
    esac
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
    # A busy/slow LLM backend trips the non-streaming endpoint's server deadline;
    # the streaming path has none — tell the agent the right next move.
    grep -q "deadline" <<<"$resp" && echo "hint: the backend LLM is busy/slow — use the streaming path instead: cortex.sh ask \"$q\""
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
  list|recent)
    # Ground-truth inventory — GET /api/documents takes no query params, so
    # collection scoping and "newest first" happen client-side. Use this (not
    # check/ask) for "what's in your cortex": synthesis is not inventory.
    resolve
    n="${1:-10}"; case "$n" in ''|*[!0-9]*) die "usage: cortex.sh list [n]";; esac
    cid=$(collection_id)
    resp=$(api "$BASE_URL/api/documents")
    jq -e '.documents' >/dev/null 2>&1 <<<"$resp" || die "list failed: $(jq -r '.detail // .' 2>/dev/null <<<"$resp" | head -c 200)"
    total=$(jq -r --arg c "$cid" '[.documents[]|select(($c=="") or (.collection_id==$c))]|length' <<<"$resp")
    echo "$total doc(s) in '$SRCNAME'${cid:+ (collection $COLLECTION)} — newest first:"
    jq -r --arg c "$cid" --argjson n "$n" \
      '[.documents[]|select(($c=="") or (.collection_id==$c))]|sort_by(.upload_date)|reverse|.[0:$n][]|"• \(.filename)  \(.upload_date[0:16])  [\(.processing_status)]  \(.id)"' <<<"$resp"
    [ "$total" -gt "$n" ] && echo "(showing $n of $total — cortex.sh list $total for all)"
    exit 0
    ;;
  show|get|read)
    resolve; d="${1:-}"; [ -n "$d" ] || die "usage: cortex.sh show <doc_id>  (find ids with: cortex.sh list)"
    # full_content is assembled from chunks, so a just-saved doc reads empty
    # until processing finishes — point at wait instead of showing a blank note.
    api "$BASE_URL/api/documents/$d/content" \
      | jq -r 'if ((.full_content // "")|length) > 0 then "— \(.filename)  (\(.upload_date[0:10]), \(.chunk_count) chunk(s))\n\n\(.full_content)" elif .filename then "cortex: \(.filename) has no readable content yet (still processing?) — try: cortex.sh wait \(.id)" else "cortex: " + (.detail // "no content for that doc id") end'
    ;;
  forget|delete|remove)
    resolve; need_write
    d="${1:-}"; [ -n "$d" ] || die "usage: cortex.sh forget <doc_id>  (find ids with: cortex.sh list)"
    fn=$(api "$BASE_URL/api/documents/$d" | jq -r '.filename // empty')
    [ -n "$fn" ] || die "no document '$d' in '$SRCNAME' — see: cortex.sh list"
    code=$(api -o /dev/null -w '%{http_code}' -X DELETE "$BASE_URL/api/documents/$d")
    [ "$code" = 200 ] || die "delete failed (HTTP $code)"
    echo "forgot '$fn' (doc ${d:0:8}) from '$SRCNAME' — its chunks and entities are gone"
    ;;
  setup)
    # Self-host a brand-new Cortex instance from scratch. All heredocs/loops live
    # HERE (safe in a script file) — never in the agent's terminal. The docker
    # build+boot runs DETACHED so no terminal timeout can kill it; finish with
    # `setup-status`. Args are order-independent key=value pairs.
    DIR=""; PROVIDER=""; KEY=""; BASE=""; MODEL=""; EKEY=""; EBASE=""; EMODEL=""; EDIM=""; OFFSET=0; REPO="https://github.com/mocaOS/cortex-app.git"
    HOSTADDR="localhost"; SENDDIMS=""; TUNING=""
    for a in "$@"; do case "$a" in
      dir=*) DIR="${a#dir=}";; provider=*) PROVIDER="${a#provider=}";; key=*) KEY="${a#key=}";;
      base=*) BASE="${a#base=}";; model=*) MODEL="${a#model=}";;
      emb_key=*) EKEY="${a#emb_key=}";; emb_base=*) EBASE="${a#emb_base=}";;
      emb_model=*) EMODEL="${a#emb_model=}";; emb_dim=*) EDIM="${a#emb_dim=}";;
      offset=*) OFFSET="${a#offset=}";; repo=*) REPO="${a#repo=}";;
      host=*) HOSTADDR="${a#host=}";; send_dims=*) SENDDIMS="${a#send_dims=}";; tuning=*) TUNING="${a#tuning=}";;
      *) die "setup: unknown arg '$a' (use key=value)";;
    esac; done
    [ "$PROVIDER" = ollama ] && KEY="${KEY:-ollama}"   # ollama ignores API keys
    [ -n "$DIR" ] && [ -n "$PROVIDER" ] && [ -n "$KEY" ] || die "usage: cortex.sh setup dir=<path> provider=<ollama|venice|openai|openrouter|custom> key=<api_key> [base=] [model=] [emb_key=] [emb_base=] [emb_model=] [emb_dim=] [send_dims=true|false] [host=<lan-ip-or-domain>] [tuning=fast|bench] [offset=N] [repo=]"
    case "$OFFSET" in ''|*[!0-9]*) die "setup: offset must be a number";; esac
    case "$HOSTADDR" in http://*|https://*) die "setup: host= takes a bare hostname/IP, no scheme — e.g. host=192.168.1.50 (it's where BROWSERS reach the dashboard; the agent keeps using localhost)";; esac
    case "$SENDDIMS" in ''|true|false) ;; *) die "setup: send_dims must be true or false";; esac
    case "$TUNING" in ''|fast|bench) ;; *) die "setup: tuning must be fast (local/slow models) or bench (cloud-provider defaults)";; esac
    DIR="${DIR/#\~/$HOME}"
    # Provider presets — encode the embeddings caveat: not every provider serves
    # embedding models. openrouter is chat-only in practice, so it REQUIRES a
    # separate embedding key (ask your human for one; don't guess).
    case "$PROVIDER" in
      ollama)  # fully local, zero cloud keys: chat + embeddings served by ollama.
               # Docker containers can't reach 127.0.0.1 on the host — use the
               # docker bridge address unless the caller overrides base=.
               BASE="${BASE:-http://172.17.0.1:11434/v1}"; MODEL="${MODEL:-hf.co/bartowski/NousResearch_Hermes-4-14B-GGUF:Q8_0}"
               EMODEL="${EMODEL:-nomic-embed-text}"; EDIM="${EDIM:-768}"
               OLL="${BASE%/v1}"
               curl -sf -m 5 "$OLL/api/tags" >/dev/null 2>&1 || die "setup: ollama not reachable at $OLL — install/start it (https://ollama.com), or pass base= for a different host"
               for m in "$MODEL" "$EMODEL"; do
                 curl -sf -m 5 "$OLL/api/tags" | jq -e --arg m "$m" '.models[]|select(.name==$m or (.name|startswith($m)))' >/dev/null 2>&1 \
                   || die "setup: model '$m' not pulled yet — run: ollama pull $m   (then re-run setup)"
               done;;
      venice)  BASE="${BASE:-https://api.venice.ai/api/v1}"; MODEL="${MODEL:-google-gemma-4-26b-a4b-it}"
               EMODEL="${EMODEL:-text-embedding-qwen3-8b}"; EDIM="${EDIM:-4096}";;
      openai)  BASE="${BASE:-https://api.openai.com/v1}"; MODEL="${MODEL:-gpt-4o-mini}"
               EMODEL="${EMODEL:-text-embedding-3-small}"; EDIM="${EDIM:-1536}";;
      openrouter) BASE="${BASE:-https://openrouter.ai/api/v1}"; MODEL="${MODEL:-google/gemini-2.5-flash}"
               [ -n "$EKEY" ] || die "setup: OpenRouter serves chat but not embeddings — pass emb_key= (an OpenAI or Venice key; ask your human) plus optional emb_base=/emb_model=/emb_dim="
               EBASE="${EBASE:-https://api.openai.com/v1}"; EMODEL="${EMODEL:-text-embedding-3-small}"; EDIM="${EDIM:-1536}";;
      custom)  [ -n "$BASE" ] && [ -n "$MODEL" ] || die "setup: provider=custom needs base= and model= (and emb_model=/emb_dim= if the base serves embeddings, else emb_key=/emb_base=/emb_model=/emb_dim=)"
               [ -n "$EMODEL" ] || die "setup: provider=custom needs emb_model= (+ emb_dim=)"; EDIM="${EDIM:-1536}";;
      *) die "setup: unknown provider '$PROVIDER' (venice|openai|openrouter|custom)";;
    esac
    # Fixed-output-dimension embedding models 400 when the backend sends the
    # OpenAI `dimensions` parameter (litellm routes them into the
    # text-embedding-3 group). Auto-set EMBEDDING_SEND_DIMENSIONS=false for the
    # known ones; send_dims= overrides either way.
    if [ -z "$SENDDIMS" ]; then
      case "$EMODEL" in
        qwen3-vl-embedding*|*/qwen3-vl-embedding*|bge-*|*/bge-*|e5-*|*/e5-*|gte-*|*/gte-*|nomic-embed*|*/nomic-embed*) SENDDIMS=false;;
        *) SENDDIMS=true;;
      esac
    fi
    # Tuning: local/slow models need smaller extraction contexts + reasoning off
    # or graph extraction times out; cloud providers keep upstream defaults.
    [ -z "$TUNING" ] && case "$PROVIDER" in ollama|custom) TUNING=fast;; *) TUNING=bench;; esac
    BPORT=$((8000+OFFSET)); FPORT=$((3000+OFFSET)); N1=$((7474+OFFSET)); N2=$((7687+OFFSET))
    PUBURL="http://$HOSTADDR:$BPORT"
    # Preflight
    command -v git >/dev/null || die "setup: git not installed"
    command -v curl >/dev/null || die "setup: curl not installed"
    command -v jq >/dev/null || die "setup: jq not installed"
    docker compose version >/dev/null 2>&1 || die "setup: docker compose v2 not available (install Docker + Compose, or ask your human to)"
    docker info >/dev/null 2>&1 || die "setup: docker daemon not reachable (is it running? do you have permission?)"
    for p in "$BPORT" "$FPORT" "$N1" "$N2"; do
      if (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then exec 3>&- 3<&-; die "setup: port $p is already in use — pass a different offset=N (shifts all ports by N)"; fi
    done
    # A parallel/finished setup at this offset may hold the container names even
    # while its ports aren't bound yet (during build) — check names too.
    SUF=""; [ "$OFFSET" -gt 0 ] && SUF="-$OFFSET"
    if docker ps -a --format '{{.Names}}' | grep -qxE "cortex-(backend|frontend|neo4j)$SUF"; then
      die "setup: containers named cortex-*$SUF already exist (another instance at this offset) — pick a different offset=N or remove them"
    fi
    # Compose derives the project (and VOLUME namespace) from the dir basename —
    # two checkouts both named "cortex-app" would silently SHARE volumes, and one
    # stack's cleanup can destroy the other's graph. Pin an explicit project name.
    PROJ="cortex-hermes$SUF"
    docker volume ls --format '{{.Name}}' | grep -q "^${PROJ}_" && die "setup: volumes for project '$PROJ' already exist — another instance at this offset? pick a different offset=N"
    # Clone (or reuse an existing clone)
    if [ -d "$DIR/.git" ]; then echo "using existing checkout: $DIR"
    else git clone --depth 1 "$REPO" "$DIR" || die "setup: git clone failed — is the repo reachable? (a mirror or local checkout works too: repo=<url-or-path>)"; fi
    [ -f "$DIR/.env" ] && die "setup: $DIR/.env already exists — refusing to overwrite an existing instance's config (use setup-status, or a fresh dir)"
    cp "$DIR/.env.example" "$DIR/.env" 2>/dev/null || touch "$DIR/.env"
    # .env.example ships some of these as uncommented placeholders — remove any
    # existing occurrences so ours are the only (and unambiguous) values.
    # NOTE: values are written WITHOUT inline comments — dotenv parses
    # `KEY=val  # comment` as the whole string and bool coercion silently
    # falls back to the field default. Never append `# ...` after a value.
    sed -i -E '/^(COMPOSE_PROJECT_NAME|SERVICE_PASSWORD_NEO4J|OPENAI_API_KEY|OPENAI_API_BASE|OPENAI_MODEL|EMBEDDING_API_KEY|EMBEDDING_API_BASE|EMBEDDING_MODEL|EMBEDDING_DIMENSION|EMBEDDING_SEND_DIMENSIONS|NEXT_PUBLIC_API_URL|ADMIN_EMAIL|ADMIN_PASSWORD|ADMIN_API_KEY|SESSION_SECRET)=/d' "$DIR/.env"
    [ "$TUNING" = fast ] && sed -i -E '/^(GRAPH_EXTRACTION_MAX_CONTEXT|EXTRACTION_MAX_OUTPUT_TOKENS|EMBEDDING_MAX_INPUT_TOKENS|EXTRACTION_REASONING_MODE|RELATIONSHIP_REASONING_MODE|VISION_REASONING_MODE|DEFAULT_REASONING_MODE|CONCURRENT_EXTRACTIONS|CONCURRENT_RELATIONS|VISION_MAX_CONCURRENT|BATCH_PROCESSING_CONCURRENCY)=/d' "$DIR/.env"
    NEO_PW=$(openssl rand -hex 16); ADMIN_PW=$(openssl rand -base64 18 | tr -d '=+/'); ADMIN_KEY="cortex_admin_$(openssl rand -hex 24)"
    {
      echo ""; echo "# --- written by cortex.sh setup $(date -u +%Y-%m-%dT%H:%MZ) ---"
      echo "COMPOSE_PROJECT_NAME=$PROJ"
      echo "SERVICE_PASSWORD_NEO4J=$NEO_PW"
      echo "OPENAI_API_KEY=$KEY"
      echo "OPENAI_API_BASE=$BASE"
      echo "OPENAI_MODEL=$MODEL"
      [ -n "$EKEY" ] && echo "EMBEDDING_API_KEY=$EKEY"
      [ -n "$EBASE" ] && echo "EMBEDDING_API_BASE=$EBASE"
      echo "EMBEDDING_MODEL=$EMODEL"
      echo "EMBEDDING_DIMENSION=$EDIM"
      echo "EMBEDDING_SEND_DIMENSIONS=$SENDDIMS"
      echo "NEXT_PUBLIC_API_URL=$PUBURL"
      echo "ADMIN_EMAIL=admin@localhost.local"
      echo "ADMIN_PASSWORD=$ADMIN_PW"
      echo "ADMIN_API_KEY=$ADMIN_KEY"
      echo "SESSION_SECRET=$(openssl rand -base64 32)"
      if [ "$TUNING" = fast ]; then
        echo "GRAPH_EXTRACTION_MAX_CONTEXT=24000"
        echo "EXTRACTION_MAX_OUTPUT_TOKENS=8000"
        echo "EMBEDDING_MAX_INPUT_TOKENS=5400"
        echo "EXTRACTION_REASONING_MODE=off"
        echo "RELATIONSHIP_REASONING_MODE=off"
        echo "VISION_REASONING_MODE=off"
        echo "DEFAULT_REASONING_MODE=off"
        echo "CONCURRENT_EXTRACTIONS=4"
        echo "CONCURRENT_RELATIONS=4"
        echo "VISION_MAX_CONCURRENT=4"
        echo "BATCH_PROCESSING_CONCURRENCY=3"
      fi
    } >> "$DIR/.env"
    chmod 600 "$DIR/.env"
    # The override is written UNCONDITIONALLY: the upstream compose file
    # hardcodes NEXT_PUBLIC_API_URL=http://localhost:8000 in the frontend's
    # environment block, which beats .env — without this override the dashboard
    # is broken from every browser that isn't on the host itself ("session
    # expired" / ERR_CONNECTION_REFUSED to localhost:8000).
    if [ "$OFFSET" -gt 0 ]; then
      cat > "$DIR/docker-compose.override.yml" <<EOF
services:
  neo4j:
    container_name: cortex-neo4j-$OFFSET
    ports: !override
      - "$N1:7474"
      - "$N2:7687"
  backend:
    container_name: cortex-backend-$OFFSET
    ports: !override
      - "$BPORT:8000"
  frontend:
    container_name: cortex-frontend-$OFFSET
    ports: !override
      - "$FPORT:3000"
    environment:
      NEXT_PUBLIC_API_URL: $PUBURL
EOF
    else
      cat > "$DIR/docker-compose.override.yml" <<EOF
services:
  frontend:
    environment:
      NEXT_PUBLIC_API_URL: $PUBURL
EOF
    fi
    # NEXT_PUBLIC_* is baked into the frontend bundle at build time, and the
    # repo's frontend/.next build cache is COPY'd into the image — a stale cache
    # silently wins over env changes even with --no-cache. Purge it and keep it
    # out of the build context for future rebuilds.
    rm -rf "$DIR/frontend/.next"
    grep -qxF '.next' "$DIR/frontend/.dockerignore" 2>/dev/null || echo '.next' >> "$DIR/frontend/.dockerignore"
    jq -n --argjson o "$OFFSET" --argjson bp "$BPORT" --argjson fp "$FPORT" --arg h "$HOSTADDR" \
      '{offset:$o, backend_port:$bp, frontend_port:$fp, host:$h}' > "$DIR/.hermes-cortex-setup.json"
    ( cd "$DIR" && nohup docker compose up -d --build > "$DIR/setup.log" 2>&1 & )
    echo "setup: Cortex is building + booting in the background (first build can take 5-15 min)."
    echo "  dir: $DIR   backend: http://localhost:$BPORT   dashboard: http://$HOSTADDR:$FPORT   tuning: $TUNING   send_dims: $SENDDIMS"
    [ "$HOSTADDR" = localhost ] && echo "  note: dashboard will only work from a browser ON this machine — for LAN access re-run with host=<this-box's-ip>"
    echo "  next: run  cortex.sh setup-status dir=$DIR  (repeat until it reports connected)"
    ;;
  setup-status)
    DIR=""; for a in "$@"; do case "$a" in dir=*) DIR="${a#dir=}";; esac; done
    [ -n "$DIR" ] || die "usage: cortex.sh setup-status dir=<path>"
    DIR="${DIR/#\~/$HOME}"; ST="$DIR/.hermes-cortex-setup.json"
    [ -f "$ST" ] || die "setup-status: no setup state in $DIR (run cortex.sh setup first)"
    BPORT=$(jq -r '.backend_port' "$ST")
    if ! curl -sf -m 5 "http://localhost:$BPORT/health" >/dev/null 2>&1; then
      echo "not healthy yet (normal during first build/boot: images build 5-15 min, then Neo4j needs 30-60s)."
      echo "--- containers ---"; (cd "$DIR" && docker compose ps --format '{{.Name}} {{.Status}}' 2>/dev/null) || true
      echo "--- last build/boot log lines ---"; tail -5 "$DIR/setup.log" 2>/dev/null || true
      echo "run  cortex.sh setup-status dir=$DIR  again in a minute."
      exit 0
    fi
    echo "healthy: $(curl -sf -m 5 "http://localhost:$BPORT/health")"
    # Idempotent: if this instance is already a connected source, don't mint
    # another key on every re-run.
    if jq -e --arg u "http://localhost:$BPORT" '.sources[]? | select(.base_url==$u)' "$SRCFILE" >/dev/null 2>&1; then
      echo "already connected (see: cortex.sh sources). Try: cortex.sh --source local status"
      exit 0
    fi
    # Mint a least-privilege rw key for day-to-day memory work. The admin key
    # never leaves $DIR/.env.
    # tail -1: dotenv gives the LAST occurrence precedence if duplicates exist
    ADMIN_KEY=$(grep '^ADMIN_API_KEY=' "$DIR/.env" | tail -1 | cut -d= -f2-)
    RWKEY=$(curl -sf -X POST "http://localhost:$BPORT/api/admin/api-keys" -H "X-API-Key: $ADMIN_KEY" -H "Content-Type: application/json" -d '{"name":"hermes-agent","permissions":["read","manage"]}' | jq -r '.key // empty')
    [ -n "$RWKEY" ] || die "setup-status: healthy, but minting an API key failed — check ADMIN_API_KEY in $DIR/.env"
    if grep -q '^CORTEX_BASE_URL=' "$HOME/.hermes/.env" 2>/dev/null; then
      # A personal cortex is already configured — register the new instance as a
      # named source instead of clobbering the existing connection.
      bash "$0" connect local "http://localhost:$BPORT" "$RWKEY" Hermes rw "self-hosted Cortex ($DIR)"
      echo "connected as named source 'local' (your env-configured personal cortex stays the default)."
    else
      { echo ""; echo "# Cortex long-term memory (written by cortex.sh setup)"
        echo "CORTEX_BASE_URL=http://localhost:$BPORT"
        echo "CORTEX_API_KEY=$RWKEY"
        echo "CORTEX_COLLECTION=Hermes"; } >> "$HOME/.hermes/.env"
      # Env vars reach future sessions; register a named source too so it works
      # RIGHT NOW (this session's terminal doesn't see the fresh env vars).
      bash "$0" connect local "http://localhost:$BPORT" "$RWKEY" Hermes rw "your self-hosted long-term memory"
      echo "connected: CORTEX_BASE_URL/CORTEX_API_KEY written to ~/.hermes/.env (your personal cortex)."
      echo "  usable immediately (named source 'local' is the default until the env vars load); verify with: cortex.sh status"
    fi
    DASH_HOST=$(jq -r '.host // "localhost"' "$ST"); DASH_PORT=$(jq -r '.frontend_port // (3000 + (.offset // 0))' "$ST")
    echo "dashboard for your human: http://$DASH_HOST:$DASH_PORT  (login: ADMIN_EMAIL / ADMIN_PASSWORD from $DIR/.env)"
    echo "IMPORTANT next steps for the agent:"
    echo "  1. store the native routing memory (see SKILL.md Validate)"
    echo "  2. never use the admin key for memory work — it stays in $DIR/.env"
    echo "  3. try: cortex.sh status && cortex.sh list"
    echo "  4. if you ever edit $DIR/.env: docker compose up -d --force-recreate (a plain restart does NOT reload env); NEXT_PUBLIC_* changes also need rm -rf frontend/.next + rebuild"
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
    die "usage: cortex.sh [--source NAME] {sources|connect|use|status|save <file>|check \"<q>\"|ask \"<q>\"|search \"<q>\"|list [n]|show <id>|forget <id>|wait <id>|sync|setup dir=... provider=... key=...|setup-status dir=...}"
    ;;
esac
