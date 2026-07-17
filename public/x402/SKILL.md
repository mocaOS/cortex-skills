---
name: x402
description: Use this skill when paying for Cortex queries with x402 micropayments (as an agent holding a monetized key) or when monetizing a Cortex instance (as an operator). Covers the x402 v2 payment handshake, EIP-3009 signing, monetized public keys, the admin config/verify/earnings endpoints, facilitator selection, and the EIP-712 pitfalls that make signatures revert.
---

# x402 — Pay-Per-Query Micropayments

Cortex instances can sell retrieval access via the open [x402 standard](https://github.com/x402-foundation/x402) (HTTP 402 + stablecoin settlement, no accounts). A **monetized public key** (`cortex_pub_…`) carries a price per query; anyone holding it — typically an AI agent — can query the instance's knowledge, paying per request in e.g. USDC. Free member keys are unaffected and run in parallel.

This skill covers both sides: **paying** (you hold a `cortex_pub_` key) and **operating** (you run the instance and want revenue).

## What You Probably Got Wrong

1. **The 402 is not an error — it's the price tag.** Your first unpaid request returns HTTP 402 with a base64 `PAYMENT-REQUIRED` header describing exactly what to pay (amount in atomic units, asset, network, recipient). Decode it, sign, retry. Every paid request starts this way (or you can cache the requirements and pre-attach payment).
2. **The payer needs no ETH/gas — ever.** Payment is an EIP-3009 `transferWithAuthorization`: you sign a typed-data message; the facilitator submits the transaction and pays gas. A wallet holding only USDC can pay.
3. **Use `POST /api/ask/stream`, never the non-streaming `/api/ask`, when paying.** Settlement completes *before* the answer is generated (settle-before-serve). The non-streaming endpoint has a ~28s server deadline that long agentic answers can exceed — you'd pay and receive a 504. The stream endpoint has no deadline; your receipt rides its response headers before the first byte.
4. **Monetized keys reach exactly two capabilities: search and ask.** `POST /api/search`, `POST /api/ask`, `POST /api/ask/stream`, `POST /api/ask/stream/thinking`. Everything else — document listing/download, graph browsing, stats — returns 403. The paid retrieval *is* the product; the raw corpus is not included.
5. **The EIP-712 domain comes from the challenge, not from your assumptions.** Sign with `domain.name = accepts[0].extra.name` and `domain.version = accepts[0].extra.version`. Circle's USDC domain name differs per deployment — `"USD Coin"` on Base/Avalanche mainnets, `"USDC"` on Base Sepolia — and a mismatch makes settlement revert on-chain.
6. **A failed settlement costs you nothing.** If the on-chain transfer reverts or verification fails, you get a second 402 with the reason and no funds move (EIP-3009 is atomic). Replays are impossible too: the signed nonce burns on settlement, so one signature buys exactly one response.

## Paying for queries (agent side)

### The handshake

```
POST /api/ask/stream  (X-API-Key: cortex_pub_…)          → 402 + PAYMENT-REQUIRED header
decode base64 JSON → accepts[0]                            (amount, asset, payTo, network, extra)
sign EIP-3009 TransferWithAuthorization (EIP-712)          (no gas, just a signature)
POST again + PAYMENT-SIGNATURE: base64(PaymentPayload)     → 200 + PAYMENT-RESPONSE header (receipt)
```

### 1. Decode the challenge

```bash
curl -si -X POST "{BASE_URL}/api/ask/stream" \
  -H "X-API-Key: {CORTEX_PUB_KEY}" -H "Content-Type: application/json" \
  -d '{"question": "What does this knowledge base say about X?"}' \
  | grep -i '^payment-required' | cut -d' ' -f2 | base64 -d | jq .
```

```json
{
  "x402Version": 2,
  "resource": {"url": "…/api/ask/stream", "mimeType": "application/json"},
  "accepts": [{
    "scheme": "exact", "network": "eip155:8453",
    "amount": "50000",                                   // atomic units: 0.05 USDC @ 6 decimals
    "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payTo": "0x…", "maxTimeoutSeconds": 60,
    "extra": {"name": "USD Coin", "version": "2"}        // ← EIP-712 domain, sign with THIS
  }],
  "error": "PAYMENT-SIGNATURE header is required"
}
```

### 2. Sign the authorization (viem/wagmi example)

```typescript
const accepted = challenge.accepts[0];
const now = Math.floor(Date.now() / 1000);
const authorization = {
  from: payerAddress,
  to: accepted.payTo,
  value: BigInt(accepted.amount),
  validAfter: BigInt(now - 600),
  validBefore: BigInt(now + Math.max(60, accepted.maxTimeoutSeconds ?? 60)),
  nonce: `0x${crypto.getRandomValues(new Uint8Array(32)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")}`,
};
const signature = await walletClient.signTypedData({
  domain: {
    name: accepted.extra.name,            // per-deployment! "USD Coin" ≠ "USDC"
    version: accepted.extra.version,
    chainId: Number(accepted.network.split(":")[1]),
    verifyingContract: accepted.asset,
  },
  types: { TransferWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" },
    { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
  ]},
  primaryType: "TransferWithAuthorization",
  message: authorization,
});
```

### 3. Retry with payment attached

`PAYMENT-SIGNATURE` = base64 of the v2 PaymentPayload — echo `accepted` **verbatim** (the server matches it field-by-field against its own requirements), uint256s as decimal strings:

```json
{
  "x402Version": 2,
  "resource": { …challenge.resource… },
  "accepted": { …accepts[0] verbatim… },
  "payload": {
    "signature": "0x…",
    "authorization": {
      "from": "0x…", "to": "0x…", "value": "50000",
      "validAfter": "1780000000", "validBefore": "1780000120",
      "nonce": "0x…32 bytes…"
    }
  }
}
```

On success: **200**, the answer (SSE stream for `/api/ask/stream`), and a `PAYMENT-RESPONSE` header — base64 `{success, transaction, network, payer}` with the on-chain tx hash.

### Failure modes

| Response | Meaning | Your move |
|---|---|---|
| 402 (again) | Verification/settlement failed — decode the refreshed `PAYMENT-REQUIRED` header's `error` (e.g. `insufficient_funds`, value mismatch, expired window) | Fix and re-sign (new nonce) |
| 403 | Key not monetized here, endpoint outside the allowlist, or x402 disabled on the instance | Wrong key/endpoint |
| 429 | Instance's monthly quota or rate limit — checked **before** money moves | Retry later |
| 503 + Retry-After | Facilitator unreachable — fail-closed, nothing charged | Retry |

## Monetizing an instance (operator side)

1. Set `X402_ENABLED=true` (the **only** env var). Everything else is runtime config on the **Settings → x402 Payments** admin section (stored in Neo4j; survives redeploys; excluded from library export and system reset).
2. Configure: recipient wallet (global payout), facilitator URL, CAIP-2 network, asset. The UI ships USDC presets with the correct per-network EIP-712 names.
3. **Verify** (one click / `POST /api/admin/x402/verify`): address formats (EIP-55 checksum / base58), facilitator reachability, scheme+network support — all four must pass before priced keys can be created or paid requests served. Changing any payment-relevant field (including the asset name) invalidates verification until re-run.
4. Mint a monetized key: create an API key with `price_per_query` (e.g. `"0.05"`, human units). Enforced read-only (price ⊕ `manage` is rejected), retrieval-endpoints-only, collection-scopable — scope it to sell exactly the slice of knowledge you choose. Different prices → mint multiple keys (cheap search key, premium research key).

### Admin endpoints (root `ADMIN_API_KEY`)

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/admin/x402/config` | Config + verification state (secrets masked) |
| `PUT` | `/api/admin/x402/config` | Save config (payment-relevant changes reset verification) |
| `POST` | `/api/admin/x402/verify` | Run the 4-check verification suite |
| `GET` | `/api/admin/x402/earnings` | Settled totals, overall + per key, with tx hashes |

### Facilitators (the vendor seam)

Cortex speaks the standardized facilitator interface (`GET /supported`, `POST /verify`, `POST /settle`) — any spec-compliant vendor works; it's just a URL (plus optional auth headers, stored encrypted). Cortex itself never touches chain RPCs or private keys; the payout wallet only receives. Known-good as of 2026-07:

- `https://x402.org/facilitator` — **testnets only** (Base Sepolia et al.); good for trials with faucet USDC
- `https://facilitator.xpay.sh` — open, no auth; Base mainnet **and** Base Sepolia (`exact` @ v2)
- `https://facilitator.0xarchive.io` — open, no auth; Base mainnet + HyperEVM

Confirm any facilitator with `curl {URL}/supported | jq .kinds` — you need `{"scheme": "exact", "network": "<your CAIP-2>"}`.

### Operator gotchas (all live-confirmed)

- **`asset_name` is the EIP-712 domain name, not a label.** It must equal the token contract's `name()`: `"USD Coin"` on Base/Avalanche mainnets, `"USDC"` on Base Sepolia. Wrong value = every settlement reverts (payers lose nothing, you earn nothing). The admin presets carry the correct names; verify by calling `name()` on the contract if you use a custom asset.
- **Paid queries still consume the monthly unit quota** (`MAX_QUERIES_PER_MONTH`) — inference cost is real regardless of who pays. Revenue tells you when to raise the cap.
- **402 challenges are excluded from per-key error analytics** — a challenge is the first leg of every paid request, not a failure. Genuine 403s/5xx still count.
- Point integrators at `/api/ask/stream` (see gotcha #3 above) — with settle-before-serve, a post-payment 504 on the non-streaming endpoint is the one outcome that wastes a payer's money.
- Test end-to-end on Base Sepolia first (Circle faucet USDC, x402.org facilitator), then switch network/asset/facilitator and re-verify — the config keys are identical.
