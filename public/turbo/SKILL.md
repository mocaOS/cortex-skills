---
name: turbo
description: Use this skill when configuring or using GPU-accelerated inference via Compute3 in Cortex. Covers starting/stopping GPU jobs, per-second billing, supported GPU types, environment configuration, and when to use Turbo Mode vs standard processing.
---

# Turbo — GPU-Accelerated Inference via Compute3

## What You Probably Got Wrong

1. **Turbo Mode is optional and requires a Compute3 account.** It is not enabled by default. You need a `COMPUTE3_API_KEY` to use it.

2. **It accelerates document processing, not search or Q&A.** Turbo Mode runs a dedicated vLLM instance on GPU for faster entity extraction during knowledge graph generation. Search and Ask queries still run through your standard LLM.

3. **Billing is per-second, not per-request.** You start a GPU job, it runs for the duration you specify, and you pay for the seconds used. Not a per-token cost.

4. **The system falls back to standard mode automatically.** If no GPU job is running or Compute3 is not configured, all processing uses the standard LLM (OpenAI/Anthropic).

5. **Best for large batch uploads.** If you are uploading 10+ documents at once, Turbo Mode dramatically speeds up the initial knowledge graph generation. For single documents, standard mode is sufficient.

## When to Use Turbo Mode

| Scenario | Recommendation |
|----------|---------------|
| Uploading 1-5 documents | Standard mode |
| Uploading 10-50 documents | Consider Turbo |
| Uploading 100+ documents | Strongly recommended |
| Initial knowledge base setup | Strongly recommended |
| Ongoing single uploads | Standard mode |

## API Endpoints

### Check Turbo availability

```bash
curl "{BASE_URL}/api/turbo/status" \
  -H "X-API-Key: {API_KEY}"
```

Response:
```json
{
  "available": true,
  "configured": true,
  "active_job": null
}
```

### Check Compute3 balance

```bash
curl "{BASE_URL}/api/turbo/balance" \
  -H "X-API-Key: {API_KEY}"
```

### Start a GPU job

```bash
curl -X POST "{BASE_URL}/api/turbo/start" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json"
```

Returns a `job_id`. The GPU job starts within seconds and the backend automatically routes entity extraction through the GPU instance.

### Stop a GPU job

```bash
curl -X POST "{BASE_URL}/api/turbo/stop" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json"
```

### Extend a GPU job

If processing is taking longer than expected:

```bash
curl -X POST "{BASE_URL}/api/turbo/extend" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json"
```

### List GPU jobs

```bash
curl "{BASE_URL}/api/turbo/jobs" \
  -H "X-API-Key: {API_KEY}"
```

### Get job details

```bash
curl "{BASE_URL}/api/turbo/jobs/{job_id}" \
  -H "X-API-Key: {API_KEY}"
```

## Workflow: Batch Upload with Turbo

```bash
# 1. Start GPU job
curl -X POST "{BASE_URL}/api/turbo/start" \
  -H "X-API-Key: {API_KEY}"

# 2. Upload all documents (they queue for processing)
for file in documents/*.pdf; do
  curl -X POST "{BASE_URL}/api/upload?start_processing=false" \
    -H "X-API-Key: {API_KEY}" \
    -F "file=@$file"
done

# 3. Start batch processing (uses GPU)
curl -X POST "{BASE_URL}/api/documents/process-pending" \
  -H "X-API-Key: {API_KEY}"

# 4. Monitor progress
curl "{BASE_URL}/api/documents/pending" \
  -H "X-API-Key: {API_KEY}"

# 5. Stop GPU when done
curl -X POST "{BASE_URL}/api/turbo/stop" \
  -H "X-API-Key: {API_KEY}"
```

## Configuration

```bash
# Required
COMPUTE3_API_KEY=your-c3-api-key-here
COMPUTE3_API_BASE=https://api.compute3.ai

# GPU configuration
COMPUTE3_GPU_TYPE=h100          # h100, a100, b200
COMPUTE3_GPU_COUNT=4            # Number of GPUs

# Model configuration
COMPUTE3_MODEL=MiniMaxAI/MiniMax-M2.1
COMPUTE3_DOCKER_IMAGE=vllm/vllm-openai:latest

# Runtime
COMPUTE3_DEFAULT_RUNTIME=3600   # Default job duration in seconds (1 hour)
```

## Supported GPU Types

| GPU | Best For | Cost Tier |
|-----|----------|-----------|
| B200 | Maximum throughput, large batches | Highest |
| H100 | High performance, recommended default | High |
| A100 | Good performance, cost-effective | Medium |

## Skill Files

| File | Description |
|------|-------------|
| [references/API.md](references/API.md) | Complete API endpoint reference |

## Resources

- [Turbo Mode Documentation](https://docs.cortex.eco/features/turbo-mode)
- [Compute3](https://compute3.ai)
