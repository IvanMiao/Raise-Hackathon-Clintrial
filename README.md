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
```

`VULTR_INFERENCE_KEY` is not the same as the Vultr account `VULTR_API_KEY`.

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
