# Sync Workflow Reference

Complete reference for syncing agent memory files to a Cortex knowledge graph. Covers the heartbeat mechanism, directory scanning, deduplication, and troubleshooting.

---

## Overview

The sync workflow uploads local agent memory files (markdown, text, JSON) to a Cortex instance, where they are processed into a searchable knowledge graph. The workflow is designed to be idempotent -- running it multiple times will only upload new or changed files.

---

## When to Sync

| Trigger | Frequency | Description |
|---------|-----------|-------------|
| **Heartbeat (automatic)** | Every 4+ hours | Periodic background task checks for new/changed memory files |
| **Manual request** | On demand | User says "sync memories" or similar |
| **Pre-query** | Before answering | Before answering questions that need historical context not in local memory |

**Do NOT sync:**
- Every few minutes (wastes resources, files may still be mid-write)
- Empty or temporary files
- Files that are actively being written to

---

## What Gets Synced

### Memory Directories

The sync process scans these default directories:

| Directory | Contents |
|-----------|----------|
| `~/.openclaw/memory/` | Primary memory storage (agent-generated memories) |
| `~/.openclaw/conversations/` | Conversation logs |
| `~/.openclaw/agents/main/qmd/sessions/` | QMD (Quick Memory Daemon) session files, when QMD is enabled |

### Supported File Types

Only these extensions are scanned: `.md`, `.txt`, `.json`

### Collection Target

All memory files are uploaded into a single dedicated collection (default name: **OpenClaw**). If the collection does not exist, the sync workflow creates it automatically.

---

## Heartbeat Mechanism

The heartbeat is a periodic task that triggers memory sync. It runs every 4+ hours and performs the following steps:

1. **Check credentials** -- verify `api_key` and `base_url` exist in `~/.openclaw/skills/library/state/credentials.json`
2. **Validate connection** -- call `GET /health` to confirm the Library instance is reachable
3. **Ensure collection** -- find or create the target collection (default: OpenClaw)
4. **Scan directories** -- walk all memory directories for `.md`, `.txt`, `.json` files
5. **Compute hashes** -- calculate SHA-256 for each discovered file
6. **Compare with tracking** -- check each hash against `uploaded_files.json`
7. **Upload changed files** -- upload files that are new or have changed content
8. **Update tracking** -- write the new hash to `uploaded_files.json` immediately after each successful upload

The heartbeat should be triggered by a HEARTBEAT.md file in the skill directory, which agents read on a periodic schedule.

---

## Deduplication Logic

### SHA-256 Content Hashing

Every file is tracked by its absolute path and a SHA-256 hash of its content. The tracking state lives at:

```
~/.openclaw/skills/library/state/uploaded_files.json
```

**Structure:**

```json
{
  "/home/user/.openclaw/memory/2026-03-15-project-notes.md": {
    "sha256": "a1b2c3d4e5f6789...",
    "uploaded_at": "2026-03-15T10:00:00Z",
    "doc_id": "doc_abc123"
  },
  "/home/user/.openclaw/conversations/session-42.md": {
    "sha256": "f6e5d4c3b2a1098...",
    "uploaded_at": "2026-03-15T10:01:00Z",
    "doc_id": "doc_def456"
  }
}
```

### Decision Flow

For each file discovered during a scan:

1. **File not in tracking?** -- Upload it (new file)
2. **File in tracking but hash differs?** -- Re-upload it (content changed)
3. **File in tracking and hash matches?** -- Skip it (no change)

### Immediate Persistence

The tracking file is updated immediately after each successful upload, not batched at the end. This ensures that if the sync process is interrupted (crash, network issue, timeout), already-uploaded files are not re-uploaded on the next run.

### Hash Computation

```bash
# Bash
sha256sum /path/to/file.md | awk '{print $1}'

# Python
import hashlib
hashlib.sha256(open(path, 'rb').read()).hexdigest()
```

---

## Sync Workflow Steps

### Step 1: Load Credentials

```bash
API_KEY=$(jq -r '.api_key' ~/.openclaw/skills/library/state/credentials.json)
API_BASE=$(jq -r '.base_url' ~/.openclaw/skills/library/state/credentials.json)
COLLECTION_ID=$(jq -r '.collection_id' ~/.openclaw/skills/library/state/credentials.json)
```

If `api_key` or `base_url` is missing or null, abort and ask the user to configure credentials.

### Step 2: Validate Connection

```bash
curl -s "$API_BASE/health" -H "X-API-Key: $API_KEY"
```

Expected: `{"status": "healthy", "neo4j_connected": true, "version": "1.0.0"}`

### Step 3: Ensure Collection Exists

```bash
COLLECTIONS=$(curl -s "$API_BASE/api/collections" -H "X-API-Key: $API_KEY")
COLLECTION_ID=$(echo "$COLLECTIONS" | jq -r ".collections[] | select(.name == \"OpenClaw\") | .id" | head -n1)

if [ -z "$COLLECTION_ID" ] || [ "$COLLECTION_ID" = "null" ]; then
  CREATE_RESULT=$(curl -s -X POST "$API_BASE/api/collections" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"name": "OpenClaw", "description": "Memory files synced from agent"}')
  COLLECTION_ID=$(echo "$CREATE_RESULT" | jq -r '.id')
fi
```

### Step 4: Scan and Upload

For each memory directory, find all supported files, compute their SHA-256 hash, compare with the tracking file, and upload changed or new files.

**Upload pattern (single file):**

```bash
curl -X POST "$API_BASE/api/upload?collection_id=$COLLECTION_ID&start_processing=true" \
  -H "X-API-Key: $API_KEY" \
  -F "file=@/path/to/memory.md"
```

**Upload pattern (bulk -- recommended for 10+ files):**

```bash
# Upload all without processing
for file in $FILES_TO_UPLOAD; do
  curl -X POST "$API_BASE/api/upload?collection_id=$COLLECTION_ID&start_processing=false" \
    -H "X-API-Key: $API_KEY" \
    -F "file=@$file"
done

# Trigger batch processing
curl -X POST "$API_BASE/api/documents/process-pending" \
  -H "X-API-Key: $API_KEY"
```

### Step 5: Update Tracking

After each successful upload, immediately update the tracking file with the new hash, timestamp, and doc_id.

---

## Bulk Sync Strategy

When many files need uploading (10+), use the bulk pattern to avoid overwhelming the processing pipeline:

1. Upload all files with `start_processing=false`
2. Call `POST /api/documents/process-pending` once to start batch processing
3. Optionally monitor progress via `GET /api/documents/pending`

---

## QMD (Quick Memory Daemon) Support

When QMD is enabled, session files are stored at:

```
~/.openclaw/agents/main/qmd/sessions/
```

These are included in the standard directory scan. QMD session files follow the same deduplication logic -- they are tracked by path and SHA-256 hash like any other memory file.

---

## Error Handling

| Error | Cause | Action |
|-------|-------|--------|
| Missing credentials | `credentials.json` missing or incomplete | Ask the user for both base URL and API key |
| 401 Unauthorized | API key invalid or expired | Ask the user for a new API key |
| Connection refused | Library instance is down | Retry on next heartbeat; do not retry in a loop |
| Collection not found | Collection was deleted externally | Auto-create a new one |
| Upload failed (network) | Transient network error | File is not tracked, will be retried on next sync |
| Upload failed (413) | File exceeds MAX_FILE_SIZE_MB | Skip file and log a warning |

### Partial Failure Recovery

Because the tracking file is updated after each individual upload, a sync that fails midway will resume correctly on the next run. Already-uploaded files will be skipped (hashes match), and the remaining files will be picked up.

---

## Credentials File

Location: `~/.openclaw/skills/library/state/credentials.json`

```json
{
  "api_key": "cortex_user_your_key_here",
  "base_url": "https://library.example.com",
  "collection_id": "coll_abc123"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `api_key` | Yes | API key with at least `read` and `manage` permissions |
| `base_url` | Yes | Full URL to the Cortex instance |
| `collection_id` | Auto-populated | ID of the target collection (set during first sync) |

---

## Troubleshooting

### Sync runs but no files uploaded

- Check that memory directories exist and contain `.md`, `.txt`, or `.json` files
- Verify files are not empty (empty files are skipped)
- Check `uploaded_files.json` -- if hashes match, files were already uploaded

### Files uploaded but not appearing in Library

- Check document status via `GET /api/documents?status=pending` -- they may be awaiting processing
- If `start_processing=false` was used, trigger processing with `POST /api/documents/process-pending`

### Duplicate documents in Library

- The SHA-256 tracking prevents duplicate uploads from the agent side
- Duplicates may occur if the tracking file (`uploaded_files.json`) was deleted or if the same file was uploaded manually through the web UI
- Use the entity deduplication endpoints to clean up any resulting duplicate entities

### Connection errors during sync

- Verify the Library instance is running: `curl {BASE_URL}/health`
- Check that the API key has not expired
- Ensure network access from the agent to the Library instance is not blocked
