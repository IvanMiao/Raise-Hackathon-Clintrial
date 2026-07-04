import { NextResponse } from "next/server";

import { requestInference } from "@/lib/vultr";

export const runtime = "nodejs";

const maxPromptLength = 4000;

type ValidationResult =
  | {
      ok: true;
      prompt: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function validatePayload(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      status: 400,
      error: "Request body must be a JSON object.",
    };
  }

  const prompt = (payload as { prompt?: unknown }).prompt;

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Prompt is required.",
    };
  }

  if (prompt.length > maxPromptLength) {
    return {
      ok: false,
      status: 413,
      error: `Prompt must be ${maxPromptLength} characters or fewer.`,
    };
  }

  return {
    ok: true,
    prompt: prompt.trim(),
  };
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const validation = validatePayload(payload);

  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status },
    );
  }

  try {
    const result = await requestInference(validation.prompt);

    return NextResponse.json({ result });
  } catch {
    return NextResponse.json(
      { error: "Inference provider unavailable." },
      { status: 502 },
    );
  }
}
