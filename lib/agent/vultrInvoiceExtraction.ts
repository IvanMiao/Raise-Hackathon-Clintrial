import "server-only";

import OpenAI from "openai";

import {
  extractInvoiceLinesFromFixture,
  InvoiceExtractionError,
} from "@/lib/agent/invoiceExtraction";
import type { AgentReviewMode, InvoiceLine } from "@/lib/agent/types";

type VisionInvoiceExtractionProvider = "vultr_vision" | "fixture_fallback";

type SupportedImageContentType =
  | "image/jpeg"
  | "image/png"
  | "image/svg+xml"
  | "image/webp";

type UploadedInvoiceExtractionRequest = {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  mode: AgentReviewMode;
  onAttempt?: (event: VisionExtractionAttemptEvent) => void;
};

type UploadedInvoiceExtractionResult = {
  lines: InvoiceLine[];
  provider: VisionInvoiceExtractionProvider;
  model?: string;
  detectedContentType?: SupportedImageContentType;
  attempts: number;
  warnings: string[];
};

type VisionExtractionAttemptEvent = {
  attempt: number;
  maxAttempts: number;
  status: "running" | "failed" | "succeeded";
  message?: string;
  willRetry?: boolean;
};

type RawInvoiceLine = {
  lineNumber?: unknown;
  patientId?: unknown;
  visitName?: unknown;
  rawDescription?: unknown;
  amount?: unknown;
  extractionConfidence?: unknown;
  confidence?: unknown;
};

type RawExtractionPayload = {
  lines?: unknown;
};

const defaultBaseUrl = "https://api.vultrinference.com/v1";
const defaultInvoiceExtractionModel = "Qwen/Qwen3.6-27B";
const defaultInvoiceExtractionTimeoutMs = 20000;
const maxVisionExtractionAttempts = 3;
const minimumReasonableConfidence = 0.35;

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value && value.length > 0 ? value : undefined;
}

function createVultrClient(): OpenAI {
  const apiKey = envValue("VULTR_INFERENCE_KEY");

  if (!apiKey) {
    throw new InvoiceExtractionError("Missing VULTR_INFERENCE_KEY.");
  }

  return new OpenAI({
    apiKey,
    baseURL: envValue("VULTR_INFERENCE_BASE_URL") ?? defaultBaseUrl,
    maxRetries: 0,
    timeout: invoiceExtractionTimeoutMs(),
  });
}

function invoiceExtractionModel(): string {
  return (
    envValue("VULTR_INVOICE_EXTRACTION_MODEL") ??
    defaultInvoiceExtractionModel
  );
}

function invoiceExtractionTimeoutMs(): number {
  const value = Number(envValue("VULTR_INVOICE_EXTRACTION_TIMEOUT_MS"));

  if (Number.isFinite(value) && value >= 5000 && value <= 120000) {
    return value;
  }

  return defaultInvoiceExtractionTimeoutMs;
}

function invoiceExtractionMaxTokens(): number | undefined {
  const value = Number(
    envValue("VULTR_INVOICE_EXTRACTION_MAX_TOKENS") ??
      envValue("VULTR_MAX_TOKENS"),
  );

  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return undefined;
}

function startsWith(bytes: Uint8Array, values: number[]): boolean {
  return values.every((value, index) => bytes[index] === value);
}

function asciiAt(bytes: Uint8Array, start: number, value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[start + index] !== value.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

function textPrefix(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 512))
    .trimStart()
    .toLowerCase();
}

function detectImageContentType(
  bytes: Uint8Array,
  providedContentType: string,
): SupportedImageContentType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    asciiAt(bytes, 0, "RIFF") &&
    asciiAt(bytes, 8, "WEBP")
  ) {
    return "image/webp";
  }

  const prefix = textPrefix(bytes);

  if (prefix.startsWith("<svg") || prefix.includes("<svg")) {
    return "image/svg+xml";
  }

  if (
    providedContentType === "image/jpeg" ||
    providedContentType === "image/png" ||
    providedContentType === "image/svg+xml" ||
    providedContentType === "image/webp"
  ) {
    return providedContentType;
  }

  return null;
}

function dataUrl(bytes: Uint8Array, contentType: SupportedImageContentType): string {
  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function systemPrompt(): string {
  return [
    "You are ClinTrial's invoice OCR extraction subagent for a read-only clinical trial payment governance demo.",
    "Extract visible invoice service line items only.",
    "Do not recommend payment approval, release funds, or make finance decisions.",
    "Return valid JSON only. Do not wrap the JSON in markdown.",
  ].join(" ");
}

function userPrompt(fileName: string): string {
  return [
    `Extract service line items from the uploaded invoice image named ${fileName}.`,
    "Copy shared patient and visit header fields into each extracted line.",
    "Do not use examples or prior fixture values. Read the uploaded image.",
    "Do not merge separate rows. Do not add administrative fees into procedure amounts.",
    "Return exactly this JSON shape:",
    '{"lines":[{"lineNumber":1,"patientId":"P-000","visitName":"Visit name as shown","rawDescription":"visible service description","amount":"0.00","extractionConfidence":0.0}]}',
  ].join("\n");
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function coerceString(value: unknown): string {
  if (typeof value === "string") {
    return compactText(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function normalizeAmount(value: unknown): string {
  const rawValue =
    typeof value === "number" && Number.isFinite(value)
      ? value.toFixed(2)
      : coerceString(value);

  const normalized = rawValue
    .replace(/\b(?:eur|usd|gbp)\b/gi, "")
    .replace(/[€$£]/g, "")
    .replace(/,/g, "")
    .trim();

  if (!/[0-9]/.test(normalized)) {
    return "";
  }

  return normalized;
}

function coerceLineNumber(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(coerceString(value), 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function coerceConfidence(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(coerceString(value));

  if (!Number.isFinite(parsed)) {
    return minimumReasonableConfidence;
  }

  if (parsed > 1 && parsed <= 100) {
    return Math.max(0, Math.min(1, parsed / 100));
  }

  return Math.max(0, Math.min(1, parsed));
}

function invoiceIdFromFileName(fileName: string): string {
  const baseName = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return baseName || "uploaded-invoice";
}

function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function parseExtractionPayload(content: string): RawExtractionPayload {
  const parsed: unknown = JSON.parse(stripJsonFence(content));

  if (typeof parsed !== "object" || parsed === null || !("lines" in parsed)) {
    throw new InvoiceExtractionError(
      "Invoice extraction response did not include lines.",
    );
  }

  return parsed as RawExtractionPayload;
}

function normalizeRawLine(
  rawLine: RawInvoiceLine,
  index: number,
  invoiceId: string,
): InvoiceLine | null {
  const lineNumber = coerceLineNumber(rawLine.lineNumber, index + 1);
  const rawDescription = coerceString(rawLine.rawDescription);
  const amount = normalizeAmount(rawLine.amount);

  if (!rawDescription || !amount) {
    return null;
  }

  return {
    id: `${invoiceId}-line-${lineNumber}`,
    lineNumber,
    patientId: coerceString(rawLine.patientId) || "Unknown patient",
    visitName: coerceString(rawLine.visitName) || "Unknown visit",
    rawDescription,
    amount,
    extractionConfidence: coerceConfidence(
      rawLine.extractionConfidence ?? rawLine.confidence,
    ),
  };
}

function normalizeExtractionPayload(
  payload: RawExtractionPayload,
  fileName: string,
): InvoiceLine[] {
  if (!Array.isArray(payload.lines)) {
    throw new InvoiceExtractionError(
      "Invoice extraction response lines were not an array.",
    );
  }

  const invoiceId = invoiceIdFromFileName(fileName);
  const lines = payload.lines
    .map((line, index) =>
      typeof line === "object" && line !== null
        ? normalizeRawLine(line as RawInvoiceLine, index, invoiceId)
        : null,
    )
    .filter((line): line is InvoiceLine => line !== null)
    .sort((left, right) => left.lineNumber - right.lineNumber);

  if (lines.length === 0) {
    throw new InvoiceExtractionError(
      "Invoice extraction response contained no usable service lines.",
    );
  }

  return lines;
}

async function extractWithVultrVision(
  request: UploadedInvoiceExtractionRequest,
  detectedContentType: SupportedImageContentType,
): Promise<{ lines: InvoiceLine[]; model: string }> {
  const client = createVultrClient();
  const model = invoiceExtractionModel();
  const maxTokens = invoiceExtractionMaxTokens();
  const completion = await client.chat.completions.create(
    {
      model,
      temperature: 0,
      ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      messages: [
        {
          role: "system",
          content: systemPrompt(),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: userPrompt(request.fileName),
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl(request.bytes, detectedContentType),
              },
            },
          ],
        },
      ],
    },
    { timeout: invoiceExtractionTimeoutMs() },
  );

  const content = completion.choices[0]?.message.content?.trim();

  if (!content) {
    throw new InvoiceExtractionError("Invoice extraction response was empty.");
  }

  return {
    lines: normalizeExtractionPayload(
      parseExtractionPayload(content),
      request.fileName,
    ),
    model,
  };
}

async function extractFixtureFallback(
  warnings: string[],
  attempts: number,
): Promise<UploadedInvoiceExtractionResult> {
  return {
    lines: await extractInvoiceLinesFromFixture(),
    provider: "fixture_fallback",
    attempts,
    warnings,
  };
}

function visionExtractionErrorMessage(error: unknown): string {
  return error instanceof InvoiceExtractionError
    ? error.message
    : "Vultr vision extraction failed.";
}

function shouldRetryVisionExtraction(error: unknown): boolean {
  if (
    error instanceof InvoiceExtractionError &&
    error.message === "Missing VULTR_INFERENCE_KEY."
  ) {
    return false;
  }

  return true;
}

export async function extractInvoiceLinesFromUpload(
  request: UploadedInvoiceExtractionRequest,
): Promise<UploadedInvoiceExtractionResult> {
  const detectedContentType = detectImageContentType(
    request.bytes,
    request.contentType,
  );
  const warnings: string[] = [];

  if (detectedContentType === null || request.contentType === "application/pdf") {
    const message =
      "Vision extraction currently supports uploaded PNG, JPEG, WebP, and SVG images.";

    if (request.mode === "demo") {
      return extractFixtureFallback([message], 0);
    }

    throw new InvoiceExtractionError(message);
  }

  for (let attempt = 1; attempt <= maxVisionExtractionAttempts; attempt += 1) {
    request.onAttempt?.({
      attempt,
      maxAttempts: maxVisionExtractionAttempts,
      status: "running",
    });

    try {
      const result = await extractWithVultrVision(request, detectedContentType);

      request.onAttempt?.({
        attempt,
        maxAttempts: maxVisionExtractionAttempts,
        status: "succeeded",
      });

      return {
        lines: result.lines,
        provider: "vultr_vision",
        model: result.model,
        detectedContentType,
        attempts: attempt,
        warnings,
      };
    } catch (error) {
      const message = visionExtractionErrorMessage(error);
      const willRetry =
        attempt < maxVisionExtractionAttempts &&
        shouldRetryVisionExtraction(error);

      warnings.push(
        `Vision extraction attempt ${attempt}/${maxVisionExtractionAttempts} failed: ${message}`,
      );
      request.onAttempt?.({
        attempt,
        maxAttempts: maxVisionExtractionAttempts,
        status: "failed",
        message,
        willRetry,
      });

      if (willRetry) {
        continue;
      }

      if (request.mode === "demo") {
        return extractFixtureFallback(warnings, attempt);
      }

      throw new InvoiceExtractionError(message);
    }
  }

  if (request.mode === "demo") {
    return extractFixtureFallback(warnings, maxVisionExtractionAttempts);
  }

  throw new InvoiceExtractionError(
    warnings.at(-1) ?? "Vultr vision extraction failed.",
  );
}
