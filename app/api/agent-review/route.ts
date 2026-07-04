import { NextResponse } from "next/server";

import { createAgentEventStream } from "@/lib/agent/events";
import {
  extractInvoiceLinesFromFixture,
  InvoiceExtractionError,
} from "@/lib/agent/invoiceExtraction";
import { createRetrievalPlanForInvoiceLine } from "@/lib/agent/vultrRetrievalPlanner";
import type {
  AgentReviewMode,
  InvoiceLine,
  RetrievalPlan,
  UploadedInvoiceSummary,
} from "@/lib/agent/types";

export const runtime = "nodejs";

const maxInvoiceFileSizeBytes = 10 * 1024 * 1024;
const traceDelayMs = 120;
const allowedInvoiceContentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
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
      error: "Invoice must be an SVG, PNG, JPEG, or PDF file.",
    };
  }

  if (invoice.size <= 0) {
    return {
      ok: false,
      status: 400,
      error: "Invoice file must not be empty.",
    };
  }

  if (invoice.size > maxInvoiceFileSizeBytes) {
    return {
      ok: false,
      status: 413,
      error: "Invoice file must be 10 MB or smaller.",
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
      label: "fixture invoice extraction",
      status: "running",
    });
    await pauseTrace();

    let extractedLines: InvoiceLine[];

    try {
      extractedLines = await extractInvoiceLinesFromFixture();
    } catch (error) {
      writer.send({
        type: "step",
        label: "fixture invoice extraction",
        status: "failed",
      });
      writer.send({
        type: "error",
        message:
          error instanceof InvoiceExtractionError
            ? error.message
            : "Demo invoice extraction failed.",
      });
      return;
    }

    writer.send({
      type: "step",
      label: "fixture invoice extraction",
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
