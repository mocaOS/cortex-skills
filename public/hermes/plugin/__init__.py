"""Cortex memory provider for Hermes Agent.

Turns a Cortex instance (https://github.com/mocaOS/cortex-app) into native
Hermes long-term memory: ambient recall injected before turns (prefetch),
plus first-class tools — cortex_search, cortex_ask, cortex_save, cortex_list.

Complements the `cortex` skill (https://cortexskills.org/hermes/SKILL.md):
the skill is the zero-dependency curl path and covers setup/multi-source
routing; this provider makes the *personal* cortex ambient. Both read the
same env vars, so one set of credentials serves skill, plugin, and MCP.

Install:  ~/.hermes/plugins/memory/cortex/{__init__.py,plugin.yaml}
Activate: `hermes memory setup` (pick cortex), or in ~/.hermes/config.yaml:
            memory:
              provider: cortex
Config:   CORTEX_BASE_URL + CORTEX_API_KEY in ~/.hermes/.env (secrets),
          non-secrets (collection) in $HERMES_HOME/cortex.json.

Design notes:
- stdlib only (urllib) — no pip dependencies.
- sync_turn is deliberately a no-op: Cortex memory is curated (deliberate
  saves via cortex_save / the skill's session dumps), not a raw transcript
  firehose. See LTM.md in the cortex skill for the philosophy.
- A `cortex_ro_` key hides cortex_save (server would 403 anyway).
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from agent.memory_provider import MemoryProvider

logger = logging.getLogger(__name__)

PREFETCH_MIN_QUERY_LEN = 24
PREFETCH_TIMEOUT_S = 2.0
TOOL_TIMEOUT_S = 60.0
ASK_TIMEOUT_S = 120.0


class CortexMemoryProvider(MemoryProvider):
    """Cortex-backed external memory provider."""

    def __init__(self) -> None:
        self._base_url = ""
        self._api_key = ""
        self._collection = "Hermes"
        self._collection_id: Optional[str] = None
        self._access = "ro"
        self._session_id = ""
        self._hermes_home = ""
        self._agent_context = "primary"
        self._prefetch_cache: Dict[str, str] = {}
        self._prefetch_lock = threading.Lock()
        self._prefetch_thread: Optional[threading.Thread] = None

    # -- Identity / availability --------------------------------------------

    @property
    def name(self) -> str:
        return "cortex"

    def is_available(self) -> bool:
        """Configured = base URL + API key resolvable. No network calls."""
        base, key, _ = self._resolve_config()
        return bool(base and key)

    def _config_path(self, hermes_home: str = "") -> Path:
        home = hermes_home or self._hermes_home or os.path.expanduser("~/.hermes")
        return Path(home) / "cortex.json"

    def _resolve_config(self) -> tuple:
        """Env vars win; $HERMES_HOME/cortex.json fills the gaps."""
        base = os.environ.get("CORTEX_BASE_URL", "").strip().rstrip("/")
        key = os.environ.get("CORTEX_API_KEY", "").strip()
        collection = os.environ.get("CORTEX_COLLECTION", "").strip()
        try:
            cfg = json.loads(self._config_path().read_text())
        except (OSError, ValueError):
            cfg = {}
        base = base or str(cfg.get("base_url", "")).strip().rstrip("/")
        collection = collection or str(cfg.get("collection", "")).strip() or "Hermes"
        return base, key, collection

    # -- Lifecycle ------------------------------------------------------------

    def initialize(self, session_id: str, **kwargs) -> None:
        self._session_id = session_id
        self._hermes_home = str(kwargs.get("hermes_home", "")) or os.path.expanduser("~/.hermes")
        self._agent_context = str(kwargs.get("agent_context", "primary"))
        self._base_url, self._api_key, self._collection = self._resolve_config()
        self._access = "ro" if self._api_key.startswith("cortex_ro_") else "rw"
        logger.info(
            "cortex memory provider: %s (%s, collection %s)",
            self._base_url, self._access, self._collection,
        )

    def on_session_switch(self, new_session_id: str, **kwargs) -> None:
        self._session_id = new_session_id
        if kwargs.get("reset"):
            with self._prefetch_lock:
                self._prefetch_cache.clear()

    def shutdown(self) -> None:
        t = self._prefetch_thread
        if t and t.is_alive():
            t.join(timeout=2.0)

    # -- HTTP -----------------------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        timeout: float = TOOL_TIMEOUT_S,
        multipart: Optional[tuple] = None,
    ) -> Dict[str, Any]:
        url = f"{self._base_url}{path}"
        headers = {"X-API-Key": self._api_key}
        data = None
        if multipart is not None:
            filename, content = multipart
            boundary = uuid.uuid4().hex
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
            data = (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                f"Content-Type: text/markdown\r\n\r\n"
            ).encode() + content.encode() + f"\r\n--{boundary}--\r\n".encode()
        elif body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:300]
            raise RuntimeError(f"cortex {e.code} on {path}: {detail}") from e
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise RuntimeError(f"cortex unreachable at {self._base_url}: {e}") from e

    def _collection_filter_id(self) -> Optional[str]:
        """Resolve the configured collection name to an id (cached). Empty/'all' = whole instance."""
        if not self._collection or self._collection.lower() == "all":
            return None
        if self._collection_id:
            return self._collection_id
        try:
            resp = self._request("GET", "/api/collections", timeout=10)
            for col in resp.get("collections", []):
                if col.get("name") == self._collection:
                    self._collection_id = col.get("id")
                    return self._collection_id
            if self._access == "rw":
                created = self._request(
                    "POST", "/api/collections",
                    body={"name": self._collection, "description": "Hermes long-term memory"},
                    timeout=15,
                )
                self._collection_id = created.get("id")
        except RuntimeError as e:
            logger.warning("cortex collection resolve failed: %s", e)
        return self._collection_id

    # -- System prompt / prefetch ----------------------------------------------

    def system_prompt_block(self) -> str:
        if not self._base_url:
            return ""
        save_hint = (
            " Save curated notes with cortex_save at natural boundaries "
            "(decisions, runbooks, session summaries) — receipts to the user."
            if self._access == "rw"
            else " Access is read-only (recall only)."
        )
        return (
            f"Cortex long-term memory is active: {self._base_url} "
            f"(collection: {self._collection or 'whole instance'}, {self._access}). "
            "Recall with cortex_search (verbatim chunks) or cortex_ask "
            "(synthesized, cited); inventory with cortex_list — it is the ground "
            "truth for \"what do you remember\"." + save_hint
        )

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        if self._agent_context != "primary" or len(query or "") < PREFETCH_MIN_QUERY_LEN:
            return ""
        with self._prefetch_lock:
            cached = self._prefetch_cache.pop(session_id or self._session_id, "")
        if cached:
            return cached
        return self._recall_snippets(query, timeout=PREFETCH_TIMEOUT_S)

    def queue_prefetch(self, query: str, *, session_id: str = "") -> None:
        if self._agent_context != "primary" or len(query or "") < PREFETCH_MIN_QUERY_LEN:
            return
        sid = session_id or self._session_id

        def _warm() -> None:
            snippets = self._recall_snippets(query, timeout=10.0)
            if snippets:
                with self._prefetch_lock:
                    self._prefetch_cache[sid] = snippets

        self._prefetch_thread = threading.Thread(target=_warm, daemon=True)
        self._prefetch_thread.start()

    def _recall_snippets(self, query: str, timeout: float) -> str:
        try:
            results = self._search(query, top_k=3, timeout=timeout).get("results", [])
        except RuntimeError:
            return ""
        lines = []
        for r in results:
            score = r.get("score") or 0
            if score < 0.4:
                continue
            label = (r.get("metadata") or {}).get("filename") or r.get("document_title") \
                or (r.get("document_id") or "")[:8]
            snippet = re.sub(r"\s+", " ", r.get("content") or "")[:220]
            lines.append(f"- {label}: {snippet}")
        if not lines:
            return ""
        return "[cortex recall — verify with cortex_search/cortex_ask before relying on it]\n" + "\n".join(lines)

    # -- Tools ------------------------------------------------------------------

    def _current_access(self) -> str:
        """Resolve access from config each call — schema collection may run before initialize()."""
        if self._api_key:
            return self._access
        _, key, _ = self._resolve_config()
        return "ro" if key.startswith("cortex_ro_") else "rw"

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        schemas = [
            {
                "name": "cortex_search",
                "description": (
                    "Hybrid search (vector + keyword + graph) over the Cortex "
                    "long-term memory. Returns verbatim chunks with filenames and "
                    "scores — use for exact wording, receipts, and quick lookups. "
                    "Empty results are not proof of absence: retry with reformulated "
                    "queries (entity names, synonyms) or fall back to cortex_ask "
                    "before telling the user something isn't stored."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search terms — prefer entity names and concrete keywords over vague phrases",
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "Max results (default 8)",
                            "default": 8,
                        },
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "cortex_ask",
                "description": (
                    "Ask the Cortex knowledge base a question and get a synthesized, "
                    "cited answer (RAG). Use for open questions over stored memory; "
                    "cite the returned sources to the user. If the answer comes back "
                    "thin, try cortex_search with reformulated terms; for multi-part "
                    "or cross-document research, load the cortex skill and run its "
                    "deep-research `ask` command."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "question": {
                            "type": "string",
                            "description": (
                                "Self-contained natural-language question. The cortex "
                                "cannot see this conversation — resolve pronouns and "
                                "context, and name entities (people, projects, tools)."
                            ),
                        }
                    },
                    "required": ["question"],
                },
            },
            {
                "name": "cortex_list",
                "description": (
                    "List documents stored in the Cortex memory, newest first. "
                    "Ground truth for inventory questions ('what do you remember?') — "
                    "never answer those from synthesis alone."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Max documents to return (default 10)",
                            "default": 10,
                        }
                    },
                    "required": [],
                },
            },
        ]
        if self._current_access() == "rw":
            schemas.append(
                {
                    "name": "cortex_save",
                    "description": (
                        "Save a curated markdown note into Cortex long-term memory. "
                        "Use at natural boundaries: decisions, runbooks, session "
                        "summaries, non-obvious learnings. Give the user a receipt "
                        "(what was saved, how to recall it). Never save secrets."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string",
                                "description": "Short kebab-case title (becomes the filename)",
                            },
                            "content": {
                                "type": "string",
                                "description": "Markdown body. Start with a one-line 'how to recall me' summary.",
                            },
                        },
                        "required": ["title", "content"],
                    },
                }
            )
        return schemas

    def handle_tool_call(self, tool_name: str, args: Dict[str, Any], **kwargs) -> str:
        try:
            if tool_name == "cortex_search":
                return json.dumps(self._tool_search(args))
            if tool_name == "cortex_ask":
                return json.dumps(self._tool_ask(args))
            if tool_name == "cortex_list":
                return json.dumps(self._tool_list(args))
            if tool_name == "cortex_save":
                return json.dumps(self._tool_save(args))
        except RuntimeError as e:
            return json.dumps({"success": False, "error": str(e)})
        return json.dumps({"success": False, "error": f"unknown tool {tool_name}"})

    def _search(self, query: str, top_k: int, timeout: float = TOOL_TIMEOUT_S) -> Dict[str, Any]:
        body: Dict[str, Any] = {"query": query, "top_k": top_k}
        cid = self._collection_filter_id()
        if cid:
            body["filters"] = {"collection_id": cid}
        return self._request("POST", "/api/search", body=body, timeout=timeout)

    def _tool_search(self, args: Dict[str, Any]) -> Dict[str, Any]:
        query = str(args.get("query", "")).strip()
        if not query:
            return {"success": False, "error": "query is required"}
        top_k = int(args.get("top_k") or 8)
        results = self._search(query, top_k).get("results", [])
        out = []
        for r in results:
            out.append(
                {
                    "filename": (r.get("metadata") or {}).get("filename")
                    or r.get("document_title"),
                    "document_id": r.get("document_id"),
                    "score": r.get("score"),
                    "content": r.get("content"),
                }
            )
        return {"success": True, "count": len(out), "results": out}

    def _tool_ask(self, args: Dict[str, Any]) -> Dict[str, Any]:
        question = str(args.get("question", "")).strip()
        if not question:
            return {"success": False, "error": "question is required"}
        body: Dict[str, Any] = {"question": question, "use_agentic": False}
        cid = self._collection_filter_id()
        if cid:
            body["collection_id"] = cid
        resp = self._request("POST", "/api/ask", body=body, timeout=ASK_TIMEOUT_S)
        sources = [
            {
                "n": i + 1,
                "filename": (s.get("metadata") or {}).get("filename")
                or s.get("document_title") or s.get("document_id"),
                "document_id": s.get("document_id"),
            }
            for i, s in enumerate(resp.get("sources", []))
        ]
        return {
            "success": True,
            "answer": resp.get("answer") or resp.get("detail") or "",
            "sources": sources,
            "note": "[src_N] markers in the answer map to sources[n]; surface citations to the user",
        }

    def _tool_list(self, args: Dict[str, Any]) -> Dict[str, Any]:
        limit = int(args.get("limit") or 10)
        resp = self._request("GET", "/api/documents", timeout=TOOL_TIMEOUT_S)
        docs = resp.get("documents", [])
        cid = self._collection_filter_id()
        if cid:
            docs = [d for d in docs if d.get("collection_id") == cid]
        docs.sort(key=lambda d: str(d.get("created_at") or ""), reverse=True)
        out = [
            {
                "filename": d.get("filename") or d.get("title"),
                "document_id": d.get("id"),
                "created_at": d.get("created_at"),
                "status": d.get("processing_status") or d.get("status"),
            }
            for d in docs[:limit]
        ]
        return {"success": True, "total_in_scope": len(docs), "documents": out}

    def _tool_save(self, args: Dict[str, Any]) -> Dict[str, Any]:
        if self._access != "rw":
            return {"success": False, "error": "read-only key — recall only"}
        title = str(args.get("title", "")).strip()
        content = str(args.get("content", "")).strip()
        if not title or not content:
            return {"success": False, "error": "title and content are required"}
        slug = re.sub(r"[^a-z0-9-]+", "-", title.lower()).strip("-") or "note"
        cid = self._collection_filter_id()
        path = "/api/upload?start_processing=true" + (f"&collection_id={cid}" if cid else "")
        resp = self._request("POST", path, multipart=(f"{slug}.md", content))
        doc_id = resp.get("document_id") or resp.get("id")
        if not doc_id:
            return {"success": False, "error": f"upload failed: {json.dumps(resp)[:200]}"}
        return {
            "success": True,
            "document_id": doc_id,
            "filename": f"{slug}.md",
            "collection": self._collection,
            "receipt": f"Saved {slug}.md to the cortex (collection {self._collection}).",
        }

    # -- Setup (`hermes memory setup`) -------------------------------------------

    def get_config_schema(self) -> List[Dict[str, Any]]:
        return [
            {
                "key": "api_key",
                "description": "Cortex API key (cortex_rw_… read/write, cortex_ro_… recall-only)",
                "secret": True,
                "required": True,
                "env_var": "CORTEX_API_KEY",
                "url": "https://cortexskills.org/auth/SKILL.md",
            },
            {
                "key": "base_url",
                "description": "Cortex base URL (e.g. http://localhost:8000)",
                "secret": True,
                "required": True,
                "env_var": "CORTEX_BASE_URL",
            },
            {
                "key": "collection",
                "description": "Collection for this agent's memory (empty = whole instance)",
                "default": "Hermes",
            },
        ]

    def save_config(self, values: Dict[str, Any], hermes_home: str) -> None:
        path = self._config_path(hermes_home)
        try:
            existing = json.loads(path.read_text())
        except (OSError, ValueError):
            existing = {}
        existing.update({k: v for k, v in values.items() if v is not None})
        path.write_text(json.dumps(existing, indent=2))


def register(ctx) -> None:
    ctx.register_memory_provider(CortexMemoryProvider())
