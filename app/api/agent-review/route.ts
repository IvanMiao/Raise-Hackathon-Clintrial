import { NextResponse } from "next/server";

import { createAgentEventStream } from "@/lib/agent/events";
import { runReviewAgent } from "@/lib/agent/reviewAgent";
import type {
  AgentReviewMode,
  UploadedInvoiceSummary,
} from "@/lib/agent/types";

export const runtime = "nodejs";

const bytesPerMegabyte = 1024 * 1024;
const maxImageInvoiceFileSizeBytes = 5 * bytesPerMegabyte;
const maxPdfInvoiceFileSizeBytes = 10 * bytesPerMegabyte;
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
    return "strict";
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
    await runReviewAgent(
      {
        runId,
        invoice: validation.request.invoice,
        invoiceFile: validation.request.invoiceFile,
        mode: validation.request.mode,
      },
      writer,
    );
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
