# WiseGate

WiseGate is a full-stack TypeScript app built with Next.js. Vultr Serverless
Inference is called only from server-side code.

## Stack

- Next.js App Router
- TypeScript
- React
- TailwindCSS
- OpenAI TypeScript SDK with Vultr's OpenAI-compatible `baseURL`

## Environment

Create `.env` from the example and set the Vultr Serverless Inference key:

```bash
cp .env.example .env
```

```env
VULTR_INFERENCE_KEY=your_serverless_inference_api_key_here
VULTR_MODEL=moonshotai/Kimi-K2.6
VULTR_INVOICE_EXTRACTION_MODEL=Qwen/Qwen3.6-27B
VULTR_INVOICE_EXTRACTION_TIMEOUT_MS=20000
VULTR_RETRIEVAL_PLANNER_MODEL=moonshotai/Kimi-K2.6
VULTR_RETRIEVAL_PLANNER_TIMEOUT_MS=12000
VULTR_EVIDENCE_RANKER_MODELS=vultr/VultronRetrieverPrime-Qwen3.5-8B,vultr/VultronRetrieverCore-Qwen3.5-4.5B,vultr/VultronRetrieverFlash-Qwen3.5-0.8B
VULTR_EVIDENCE_RANKER_TIMEOUT_MS=20000
# Optional: leave unset to avoid truncating reasoning/vision model output.
# VULTR_MAX_TOKENS=2000
# VULTR_INVOICE_EXTRACTION_MAX_TOKENS=2000
# VULTR_RETRIEVAL_PLANNER_MAX_TOKENS=2000
# VULTR_EVIDENCE_RANKER_MAX_TOKENS=2000
```

`VULTR_INFERENCE_KEY` is not the same as the Vultr account `VULTR_API_KEY`.
PNG, JPEG, and WebP invoice uploads use `VULTR_INVOICE_EXTRACTION_MODEL` for
vision extraction. SVG/PDF uploads may use the demo fixture fallback in demo
mode.
`VULTR_RETRIEVAL_PLANNER_MODEL` can point to any Vultr chat-completion model
available to the account; if unset, the retrieval planner uses `VULTR_MODEL`.
`VULTR_EVIDENCE_RANKER_MODELS` defaults to Vultr's `/rerank`-only
VultronRetriever Prime, Core, then Flash models. They rank only
backend-supplied local evidence ids and do not generate facts or boundaries.
Use `VULTR_EVIDENCE_RANKER_MODEL` to force a single model, or set a
comma-separated `VULTR_EVIDENCE_RANKER_MODELS` list to control fallback order.
The evidence ranker does not inherit `VULTR_MODEL`; set it explicitly to a
chat-completion model only when you want the JSON evidence-ranker prompt
instead. If ranking fails, WiseGate falls back to deterministic evidence
ordering.
WiseGate does not send `max_tokens` by default; set `VULTR_MAX_TOKENS` or
`VULTR_INVOICE_EXTRACTION_MAX_TOKENS` /
`VULTR_RETRIEVAL_PLANNER_MAX_TOKENS` /
`VULTR_EVIDENCE_RANKER_MAX_TOKENS` only when you explicitly want a cap.

## Development

```bash
npm install
npm run dev
```

The server-side inference endpoint is:

```txt
POST /api/inference
```

Request body:

```json
{
  "prompt": "Review this invoice line item."
}
```
