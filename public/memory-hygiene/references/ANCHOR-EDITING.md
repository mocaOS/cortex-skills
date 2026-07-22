# Editing Anchor-Based Memory Tools Safely

**Scope: this file only applies if your platform's memory is edited through an anchor-matching tool** — one where you pass an `old_text` (str_replace-style) and the tool finds and removes/replaces it. Claude's memory tool and OpenClaw's memory editor work this way. If your memory is a plain file you edit with normal file tools (Hermes `MEMORY.md`, Claude Code auto-memory), skip this file — just edit the file.

These mechanics cause most failed migrations on anchor-based platforms. All of them were learned the hard way.

## Rule 1 — Parallel single calls, never one atomic batch

Batched memory operations are typically **atomic**: if one anchor fails to match, the entire batch is rejected and *no* changes apply. One typo wastes the whole pass.

Issue every `remove`/`replace` as its own call, all in the same assistant turn:

```json
{"action": "remove", "old_text": "Short anchor from entry A…"}
{"action": "remove", "old_text": "Short anchor from entry B…"}
{"action": "remove", "old_text": "Short anchor from entry C…"}
```

Each succeeds or fails independently; retry only the failures.

## Rule 2 — Short unique anchors

- Use the **first ~30–60 chars** of the entry (title + opening-sentence prefix).
- Must be **unique across the whole memory file** — if two entries share a prefix, pick a distinctive substring further into the body (keep it short); last resort, include a date stamp.
- **Avoid** segments containing `"` (double quotes), umlauts/non-ASCII, or embedded JSON — these are exactly the characters that hit escaping mismatches.

Long anchors don't add safety; they add more characters that can mismatch.

## Rule 3 — Never copy anchors out of error messages

When a call fails with "no entry matched", the tool's error output shows your `old_text` in **JSON-escaped form** (`\"`, `\\n`, `ü`). Copy-pasting that back into the next attempt double-escapes it — the classic death spiral is triple-escaped quotes by attempt three. Always re-derive the anchor from the *actual memory content*, never from the error display.

## Rule 4 — `replace` for pointers, with a fallback

Entries that should become pointers (see SKILL.md step 4) use `replace` — it's atomic per entry, so the old text never disappears without the pointer landing:

```json
{"action": "replace",
 "old_text": "Short anchor prefix from entry…",
 "new_text": "→ <topic>: see Cortex doc `topic-<slug>.md` (collection <name>). Recall via /cortex ask."}
```

If a `replace` keeps failing on escaping (common when the entry body contains `"` or umlauts), fall back to two independent calls:

```json
{"action": "remove", "old_text": "Short anchor prefix…"}
{"action": "add", "content": "→ <topic>: see Cortex doc `topic-<slug>.md` …"}
```

Do the `remove` + `add` in the same turn so the pointer can't get lost between them — and remember the invariant from SKILL.md: by this point the content is already verified recallable in Cortex, so even a dropped pointer loses convenience, not data.
