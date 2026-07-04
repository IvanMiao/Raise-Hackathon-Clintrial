# TrialGuard

TrialGuard is a full-stack TypeScript app built with Next.js. Vultr Serverless
Inference is called only from server-side code.

## Stack

- Next.js App Router
- TypeScript
- React
- TailwindCSS
- OpenAI TypeScript SDK with Vultr's OpenAI-compatible `baseURL`

## Frontend Features & User Experience

The UI is built with a dark, modern dashboard theme and features high interactivity (implemented in `app/ClinTrialWorkspace.tsx` as a Client Component):

1. **Multi-Step Audit Workflow**:
   - **Step 1: Ingestion & Mobile Capture**: Allows uploading of invoices or simulating a mobile photo scan. Features an interactive scanner alignment grid, shutter controls, and a simulated flash effect.
   - **Step 2: Processing Laser Scan**: Simulates OCR extraction and compliance alignment with progress bars, step-by-step tasks, and background trace logging.
   - **Step 3: Audit Synthesis**: A rich dashboard displaying results.

2. **Compliance Synthesis Dashboard**:
   - **Dynamic Ledger Table**: Displays invoice line items with color-coded compliance states:
     - 🟢 **Reimbursable (Success)**: Fully verified protocol and CTA visits.
     - 🟡 **To Confirm (Warning)**: Incomplete or mismatched details (e.g., standard ECG vs required triplicate ECG).
     - 🔴 **Standard Care (Error)**: Excluded comfort expenses (e.g., private room upgrades).
     - ⚫ **Canceled / Excluded**: Excluded manually or from the final ledger.
   - **Compliance Drawers**: Expanding a table row reveals the detailed AI compliance reasoning and exact quote citations.
   - **Manual Overrides**: Humans can override any decision (e.g. approving coverage, changing to Standard Care, excluding lines).
   - **Finalization Modal**: Locking the audit computes statistics, logs final payout ledgers, and shows a secure SHA-256 confirmation hash.

3. **Active Protocol Corpus Graph (SVG)**:
   - Visualizes real-time database query paths to database nodes (Protocol SoA, Budget CTA, Consent, Patient EHR, Billing Rules, Payment History).
   - Draws dynamic Bezier curve connection lines that light up in real-time matching the selected line item's compliance color.

4. **Terminal Logger**:
   - Live CLI stream tracing (`clintrial-agent-trace.log`) that logs OCR successes, JSON outputs, database queries, and manual override actions.

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
