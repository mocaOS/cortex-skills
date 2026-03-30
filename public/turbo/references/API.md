# Turbo API Reference

Complete API reference for GPU-accelerated inference via Compute3. All endpoints require the `X-API-Key` header.

---

## Endpoints

### GET /api/turbo/status

Check whether Turbo Mode is configured and whether a GPU job is currently active.

**Request:**

```bash
curl "{BASE_URL}/api/turbo/status" \
  -H "X-API-Key: {API_KEY}"
```

**Response (idle):**

```json
{
  "available": true,
  "configured": true,
  "active_job": null
}
```

**Response (running):**

```json
{
  "enabled": true,
  "status": "running",
  "job_id": "job_abc123",
  "gpu_type": "h100",
  "gpu_count": 4,
  "model": "MiniMaxAI/MiniMax-M2.1",
  "avg_latency_ms": 487,
  "requests_served": 1234,
  "runtime_remaining_seconds": 2847
}
```

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Whether Turbo Mode is currently active |
| `status` | string | `"running"`, `"starting"`, `"stopped"` |
| `job_id` | string | Active job identifier |
| `gpu_type` | string | GPU hardware in use |
| `gpu_count` | integer | Number of GPUs allocated |
| `model` | string | Model running on the GPU instance |
| `avg_latency_ms` | number | Average response latency in milliseconds |
| `requests_served` | integer | Total requests handled by this job |
| `runtime_remaining_seconds` | integer | Seconds remaining before auto-stop |

---

### GET /api/turbo/balance

Check your Compute3 account balance.

```bash
curl "{BASE_URL}/api/turbo/balance" \
  -H "X-API-Key: {API_KEY}"
```

---

### POST /api/turbo/start

Start a new GPU job. The backend provisions GPUs on Compute3, launches a vLLM inference server, and automatically routes entity extraction through the GPU instance.

**Request:**

```bash
curl -X POST "{BASE_URL}/api/turbo/start" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "runtime_seconds": 3600
  }'
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `runtime_seconds` | integer | `COMPUTE3_DEFAULT_RUNTIME` (3600) | Maximum job duration in seconds |

**Response:**

```json
{
  "job_id": "job_abc123",
  "status": "starting",
  "gpu_type": "h100",
  "gpu_count": 4,
  "model": "MiniMaxAI/MiniMax-M2.1",
  "estimated_ready_in_seconds": 120
}
```

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | string | Unique identifier for this GPU job |
| `status` | string | `"starting"` -- becomes `"running"` within ~120s |
| `gpu_type` | string | Allocated GPU type |
| `gpu_count` | integer | Number of GPUs |
| `model` | string | Model to be served |
| `estimated_ready_in_seconds` | integer | Approximate time until the job is ready |

**Behavior:** When a Turbo job is running, the backend overrides both the extraction model and the main model configs, routing all LLM calls through the GPU instance for maximum throughput.

---

### POST /api/turbo/stop

Stop the currently active GPU job to stop billing.

```bash
curl -X POST "{BASE_URL}/api/turbo/stop" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json"
```

After stopping, the system falls back to the standard LLM provider (OpenAI/Anthropic) automatically.

---

### POST /api/turbo/extend

Extend the runtime of an active GPU job if processing is taking longer than expected.

```bash
curl -X POST "{BASE_URL}/api/turbo/extend" \
  -H "X-API-Key: {API_KEY}" \
  -H "Content-Type: application/json"
```

---

### GET /api/turbo/jobs

List all GPU jobs (active and past).

```bash
curl "{BASE_URL}/api/turbo/jobs" \
  -H "X-API-Key: {API_KEY}"
```

---

### GET /api/turbo/jobs/{job_id}

Get detailed status of a specific GPU job.

```bash
curl "{BASE_URL}/api/turbo/jobs/{job_id}" \
  -H "X-API-Key: {API_KEY}"
```

---

### GET /api/turbo/jobs/{job_id}/logs

View logs for a specific Turbo job.

```bash
curl "{BASE_URL}/api/turbo/jobs/{job_id}/logs" \
  -H "X-API-Key: {API_KEY}"
```

---

## GPU Types

| GPU | Parameters | Throughput | Cost Tier | Best For |
|-----|-----------|------------|-----------|----------|
| **B200** | Latest gen | Maximum | Highest | Largest batch jobs, maximum throughput |
| **H100** | 80GB HBM3 | High | High | Recommended default, large batches |
| **A100** | 80GB HBM2e | Good | Medium | Cost-effective, moderate workloads |

---

## Supported Models

| Model | Parameters | Speed | Quality |
|-------|-----------|-------|---------|
| `MiniMaxAI/MiniMax-M2.1` | ~70B | Fast | Excellent |
| `meta-llama/Llama-3.1-70B-Instruct` | 70B | Fast | Excellent |
| `meta-llama/Llama-3.1-8B-Instruct` | 8B | Very Fast | Good |
| `mistralai/Mistral-7B-Instruct-v0.3` | 7B | Very Fast | Good |

---

## Billing

- **Per-second billing.** You pay for the duration the GPU job runs, not per token or per request.
- Billing starts when the job status becomes `"running"` and stops when you call `/api/turbo/stop` or the runtime expires.
- Use `GET /api/turbo/balance` to monitor your Compute3 balance.
- Set `COMPUTE3_DEFAULT_RUNTIME` to limit maximum job duration.

---

## Performance Comparison

| Mode | Latency | Throughput | Cost |
|------|---------|------------|------|
| Standard (OpenAI GPT-4o-mini) | ~1-2s | ~50 req/min | $$$ |
| Turbo (Compute3 Llama-70B) | ~300-500ms | ~200 req/min | $$ |

---

## Fallback Behavior

If Turbo Mode is unavailable (no active job or Compute3 not configured), all processing uses the standard LLM provider automatically. Responses include a flag indicating whether Turbo was used:

```json
{
  "answer": "...",
  "turbo_used": false,
  "fallback_reason": "Turbo job not running"
}
```

---

## Configuration Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COMPUTE3_API_KEY` | Yes (for Turbo) | -- | Compute3 API key from [console.compute3.ai](https://console.compute3.ai) |
| `COMPUTE3_API_BASE` | Yes (for Turbo) | `https://api.compute3.ai` | Compute3 API base URL |
| `COMPUTE3_GPU_TYPE` | No | `h100` | GPU type: `b200`, `h100`, or `a100` |
| `COMPUTE3_GPU_COUNT` | No | `4` | Number of GPUs to allocate |
| `COMPUTE3_MODEL` | No | `MiniMaxAI/MiniMax-M2.1` | Model to run on GPU |
| `COMPUTE3_DOCKER_IMAGE` | No | `vllm/vllm-openai:latest` | Docker image for the vLLM inference server |
| `COMPUTE3_DEFAULT_RUNTIME` | No | `3600` | Default job duration in seconds (1 hour) |

---

## Cost Optimization Tips

1. **Set runtime limits** -- configure `COMPUTE3_DEFAULT_RUNTIME` to prevent runaway costs.
2. **Stop when idle** -- call `POST /api/turbo/stop` immediately after processing completes.
3. **Batch requests** -- upload all documents first with `start_processing=false`, then trigger batch processing while the GPU is active.
4. **Right-size GPUs** -- use fewer GPUs or A100s for lighter workloads; reserve H100/B200 for large batches.
5. **Monitor balance** -- check `GET /api/turbo/balance` before starting jobs.
