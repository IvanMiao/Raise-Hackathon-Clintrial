import { NextResponse } from "next/server";

import { createAgentEventStream } from "@/lib/agent/events";
import { InvoiceExtractionError } from "@/lib/agent/invoiceExtraction";
import { extractInvoiceLinesFromUpload } from "@/lib/agent/vultrInvoiceExtraction";
import { createRetrievalPlanForInvoiceLine } from "@/lib/agent/vultrRetrievalPlanner";
import type {
  AgentReviewMode,
  InvoiceLine,
  RetrievalPlan,
  UploadedInvoiceSummary,
} from "@/lib/agent/types";

export const runtime = "nodejs";

const bytesPerMegabyte = 1024 * 1024;
const maxImageInvoiceFileSizeBytes = 5 * bytesPerMegabyte;
const maxPdfInvoiceFileSizeBytes = 10 * bytesPerMegabyte;
const traceDelayMs = 120;
const allowedImageInvoiceContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);
const allowedInvoiceContentTypes = new Set([
  "application/pdf",
  ...allowedImageInvoiceContentTypes,
]);

type RetrievalPlanResult = Awaited<
  ReturnType<typeof createRetrievalPlanForInvoiceLine>
>;

type PendingRetrievalPlan = {
  line: InvoiceLine;
  lineIndex: number;
  promise: Promise<{
    line: InvoiceLine;
    lineIndex: number;
    result: RetrievalPlanResult;
  }>;
};

type ValidatedAgentReviewRequest = {
  invoice: UploadedInvoiceSummary;
  invoiceFile: File;
  mode: AgentReviewMode;
};

type ValidationResult =
  | {
      ok: true;
      request: ValidatedAgentReviewRequest;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

function parseMode(value: FormDataEntryValue | null): AgentReviewMode | null {
  if (value === null) {
    return "demo";
  }

  if (typeof value !== "string") {
    return null;
  }

  if (value === "demo" || value === "strict") {
    return value;
  }

  return null;
}

function isImageInvoiceContentType(contentType: string): boolean {
  return allowedImageInvoiceContentTypes.has(contentType);
}

function validateAgentReviewForm(formData: FormData): ValidationResult {
  const invoice = formData.get("invoice");

  if (!isUploadedFile(invoice)) {
    return {
      ok: false,
      status: 400,
      error: "Invoice file is required.",
    };
  }

  if (!allowedInvoiceContentTypes.has(invoice.type)) {
    return {
      ok: false,
      status: 400,
      error: "Invoice must be an SVG, PNG, JPEG, WebP, or PDF file.",
    };
  }

  if (invoice.size <= 0) {
    return {
      ok: false,
      status: 400,
      error: "Invoice file must not be empty.",
    };
  }

  if (
    isImageInvoiceContentType(invoice.type) &&
    invoice.size > maxImageInvoiceFileSizeBytes
  ) {
    return {
      ok: false,
      status: 413,
      error: "Image invoice file must be 5 MB or smaller.",
    };
  }

  if (invoice.type === "application/pdf" && invoice.size > maxPdfInvoiceFileSizeBytes) {
    return {
      ok: false,
      status: 413,
      error: "PDF invoice file must be 10 MB or smaller.",
    };
  }

  const mode = parseMode(formData.get("mode"));

  if (mode === null) {
    return {
      ok: false,
      status: 400,
      error: "Mode must be either demo or strict.",
    };
  }

  return {
    ok: true,
    request: {
      invoice: {
        fileName: invoice.name || "uploaded-invoice",
        contentType: invoice.type,
        sizeBytes: invoice.size,
      },
      invoiceFile: invoice,
      mode,
    },
  };
}

function pauseTrace(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, traceDelayMs);
  });
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request body must be multipart/form-data." },
      { status: 400 },
    );
  }

  const validation = validateAgentReviewForm(formData);

  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status },
    );
  }

  const runId = crypto.randomUUID();
  const stream = createAgentEventStream(async (writer) => {
    writer.send({ type: "started", runId });
    await pauseTrace();

    writer.send({
      type: "step",
      label: "upload accepted",
      status: "done",
    });
    await pauseTrace();

    writer.send({
      type: "step",
      label: "invoice vision extraction",
      status: "running",
    });
    await pauseTrace();

    let extractedLines: InvoiceLine[];
    let extractionProvider = "vultr_vision";

    try {
      const invoiceBytes = new Uint8Array(
        await validation.request.invoiceFile.arrayBuffer(),
      );
      const extraction = await extractInvoiceLinesFromUpload({
        fileName: validation.request.invoice.fileName,
        contentType: validation.request.invoice.contentType,
        bytes: invoiceBytes,
        mode: validation.request.mode,
      });

      extractedLines = extraction.lines;
      extractionProvider = extraction.provider;

      if (extraction.provider === "fixture_fallback") {
        writer.send({
          type: "step",
          label: "invoice vision extraction fallback",
          status: "done",
        });
        await pauseTrace();
      }
    } catch (error) {
      writer.send({
        type: "step",
        label: "invoice vision extraction",
        status: "failed",
      });
      writer.send({
        type: "error",
        message:
          error instanceof InvoiceExtractionError
            ? error.message
            : "Invoice extraction failed.",
      });
      return;
    }

    writer.send({
      type: "step",
      label:
        extractionProvider === "fixture_fallback"
          ? "fixture invoice extraction"
          : "invoice vision extraction",
      status: "done",
    });
    await pauseTrace();

    writer.send({ type: "extraction", lines: extractedLines });
    const pendingRetrievalPlans: PendingRetrievalPlan[] = extractedLines.map(
      (line, lineIndex) => ({
        line,
        lineIndex,
        promise: createRetrievalPlanForInvoiceLine(line).then((result) => ({
          line,
          lineIndex,
          result,
        })),
      }),
    );
    await pauseTrace();

    writer.send({
      type: "step",
      label: "retrieval planning",
      status: "running",
    });
    await pauseTrace();

    const retrievalPlans: Record<string, RetrievalPlan> = {};
    let fallbackPlanCount = 0;
    let pendingPlans = pendingRetrievalPlans;

    while (pendingPlans.length > 0) {
      const settledPlan = await Promise.race(
        pendingPlans.map((pendingPlan) =>
          pendingPlan.promise.then((value) => ({
            pendingPlan,
            value,
          })),
        ),
      );

      pendingPlans = pendingPlans.filter(
        (pendingPlan) => pendingPlan !== settledPlan.pendingPlan,
      );
      const { line, lineIndex, result } = settledPlan.value;

      retrievalPlans[line.id] = result.plan;

      if (result.provider === "deterministic_fallback") {
        fallbackPlanCount += 1;
      }

      writer.send({
        type: "step",
        label: `retrieval plan line ${lineIndex + 1}`,
        status: "done",
      });
      await pauseTrace();

      writer.send({
        type: "retrieval_plan",
        lineId: line.id,
        plan: result.plan,
      });
      await pauseTrace();
    }

    if (fallbackPlanCount > 0) {
      writer.send({
        type: "step",
        label: `${fallbackPlanCount} retrieval plans used deterministic fallback`,
        status: "done",
      });
      await pauseTrace();
    }

    writer.send({
      type: "step",
      label: "retrieval planning",
      status: "done",
    });
    await pauseTrace();

    writer.send({
      type: "complete",
      result: {
        runId,
        mode: validation.request.mode,
        uploadedInvoice: validation.request.invoice,
        extractedLines,
        retrievalPlans,
        recommendations: [],
        completedAt: new Date().toISOString(),
      },
    });
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
