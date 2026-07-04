# Engineering Rules (TrialGuard) - Non-Negotiables

This repo is TrialGuard: a full-stack TypeScript app built with Next.js App
Router + React + TypeScript.

TrialGuard is a guarded decision-governance demo for clinical trial payment and
finance-control workflows. It must stay read-only: it can recommend automation
boundaries, surface evidence, and draft audit trails, but it must not approve
payments, release funds, or mutate real financial/clinical systems.

These rules are written for AI coding agents. If a tradeoff is needed, prefer
shipping a stable, demoable vertical slice over scope creep, while keeping the
codebase maintainable.

## 0) Golden Rules

- Keep changes small, reviewable, and reversible.
- Prefer simple, explicit code over clever abstractions.
- Avoid breaking public contracts: API routes, types, and env vars.
- Do not add dependencies unless they unlock a critical capability.

## 1) Repo Structure

The current project uses root-level Next.js folders, not a `src/` layout.

- `app/`: routes, layouts, route handlers, and route-local styles.
- `app/api/`: typed route handlers. Keep these small and explicit.
- `lib/`: shared utilities and server adapters.
- `docs/`: product and architecture notes.

Rules:

- Prefer the existing root-level structure unless a migration is explicitly
  requested.
- Keep file paths shallow when practical. Nested `app/**` routes are allowed
  when route structure requires it.
- Avoid "misc" folders. Name folders by responsibility.
- No barrel exports (`index.ts`) by default; import directly.

## 2) Module Boundaries

- Browser code must never receive `VULTR_INFERENCE_KEY` or any inference key.
- Third-party AI calls live only in server-side code: server-only modules under
  `lib/` or route handlers under `app/api/`.
- Vultr Serverless Inference must be called through the OpenAI TypeScript SDK
  with Vultr's OpenAI-compatible `baseURL`.
- Server-only Vultr adapters must import `server-only`.
- UI may call local API routes, but must not call Vultr or other third-party AI
  providers directly.
- Prefer Server Components. Add `"use client"` only for real interactivity.

Layering:

- UI layer: `app/**` components and route-local styles. Keep this focused on
  rendering, formatting, and interaction wiring.
- Domain/util layer: `lib/**`. Keep reusable logic typed and testable. Code that
  reads secrets or calls AI providers must be server-only.
- API layer: `app/api/**`. Validate inputs, call server adapters, and return a
  clear JSON shape.

## 3) Next.js / React Performance Rules

- Prefer Server Components by default.
- Keep Client Components small and local to interactive UI.
- Avoid async waterfalls: start independent work early and `await` late.
- Use `Promise.all()` for independent work.
- Minimize data sent to the client.
- Avoid barrel imports; import the exact file needed.
- Dynamically import genuinely heavy, non-critical components.
- Do not memoize trivial values; memoize only when the work is measurably
  expensive or prevents meaningful rerenders.

## 4) API & Runtime Rules

- Route handlers must be deterministic, typed, and explicit.
- Routes that call Vultr or read secrets must run server-side. Use
  `export const runtime = "nodejs"` when Node runtime behavior is required.
- Every API route must have:
  - input validation using local typed checks unless a schema dependency is
    already justified;
  - clear error responses with no raw stack traces;
  - bounded outputs suitable for the browser.
- Keep system prompts concise and domain-specific.

## 5) TypeScript, Style, and Code Hygiene

- TypeScript only. Avoid `any`; document it when no reasonable alternative
  exists.
- Files must be highly readable at a glance: clear names, obvious control flow,
  and small focused sections.
- Do not create very long files. Split by responsibility before a file becomes
  hard to scan or review.
- Use consistent naming:
  - Components: `PascalCase`
  - Functions and variables: `camelCase`
  - Types: `PascalCase`
- Keep generated dependency directories and build artifacts out of commits.

## 6) Secrets, Privacy, and Logging

- Never commit secrets. Use `.env.local` locally and document required keys in
  `.env.example`.
- `VULTR_INFERENCE_KEY` is the Vultr Serverless Inference key, not the Vultr
  account API key.
- Do not log raw documents, full prompts with sensitive data, screenshots, or
  user-provided financial/clinical records in production logs.
- Store only what the demo needs. Prefer synthetic data for clinical trial and
  finance examples.

## 7) Git Workflow

- Make atomic commits: one logical change per commit.
- Use conventional prefixes when committing: `feat:`, `fix:`, `chore:`,
  `docs:`.
- Do not mix drive-by refactors with feature work.

## 8) Definition of Done

- Works end-to-end for at least one happy path.
- Has a basic error path for invalid input or provider failure.
- Run `npm run typecheck` after code changes.
- Run `npm run build` before shipping larger changes.
- UI is demo-ready: loading, success, and failure states are visible when the
  touched workflow needs them.
