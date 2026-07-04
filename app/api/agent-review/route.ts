import { NextResponse } from "next/server";

import {
  createAgentEventStream,
  type AgentEventWriter,
} from "@/lib/agent/events";
import { evaluatePaymentLine } from "@/lib/agent/evaluatePaymentLine";
import {
  searchAndRankEvidenceForInvoiceLine,
  type RankedEvidenceSearchResult,
} from "@/lib/agent/evidenceSearch";
import { InvoiceExtractionError } from "@/lib/agent/invoiceExtraction";
import { extractInvoiceLinesFromUpload } from "@/lib/agent/vultrInvoiceExtraction";
import { createRetrievalPlanForInvoiceLine } from "@/lib/agent/vultrRetrievalPlanner";
import type {
  AgentReviewMode,
  AgentTool,
  AgentTraceEntry,
  AgentTraceKind,
  AgentTracePhase,
  AgentTraceStatus,
  BoundaryRecommendation,
  EvidenceCard,
  EvidenceSource,
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

type PendingEvidenceSearch = {
  line: InvoiceLine;
  lineIndex: number;
  promise: Promise<{
    line: InvoiceLine;
    lineIndex: number;
    result: RankedEvidenceSearchResult;
  }>;
};

type TraceUpdateInput = {
  id: AgentTracePhase;
  status: AgentTraceStatus;
  title: string;
  headline: string;
  detail?: string;
  tool?: AgentTool;
  progress?: {
    done: number;
    total: number;
  };
  highlights?: string[];
};

type TraceEntryInput = {
  phase: AgentTracePhase;
  kind: AgentTraceKind;
  tool?: AgentTool;
  lineId?: string;
  title: string;
  detail?: string;
  sources?: EvidenceSource[];
  locator?: string;
  status?: AgentTraceStatus;
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

function compactTraceText(value: string, maxLength = 180): string {
  const compacted = value.replace(/\s+/g, " ").trim();

  if (compacted.length <= maxLength) {
    return compacted;
  }

  return `${compacted.slice(0, maxLength - 3)}...`;
}

function lineLabel(line: InvoiceLine): string {
  return `Line ${line.lineNumber}: ${line.patientId} / ${line.visitName}`;
}

function candidateCodeLabel(plan: RetrievalPlan | undefined): string {
  return plan?.candidateItemCodes[0] ?? "unmapped item";
}

function toolForSource(source: EvidenceSource): AgentTool {
  if (source === "coverage_grid") {
    return "coverage_grid_search";
  }

  if (source === "protocol") {
    return "protocol_search";
  }

  if (source === "cta_budget") {
    return "cta_budget_search";
  }

  if (source === "site_evidence") {
    return "site_evidence_search";
  }

  return "prior_ledger_search";
}

function sourceTitle(source: EvidenceSource): string {
  if (source === "coverage_grid") {
    return "Coverage grid lookup";
  }

  if (source === "protocol") {
    return "Protocol document search";
  }

  if (source === "cta_budget") {
    return "CTA / budget search";
  }

  if (source === "site_evidence") {
    return "Site evidence lookup";
  }

  return "Prior payment ledger check";
}

function evidenceStatusSummary(evidence: EvidenceCard[]): string {
  const matched = evidence.filter((card) => card.status === "matched").length;
  const partial = evidence.filter((card) => card.status === "partial").length;
  const missing = evidence.filter((card) => card.status === "missing").length;
  const blocked = evidence.filter((card) => card.status === "blocked").length;

  return `${matched} matched, ${partial} partial, ${missing} missing, ${blocked} blocking`;
}

function evidenceHighlight(line: InvoiceLine, evidence: EvidenceCard[]): string {
  const blockingCard = evidence.find((card) => card.status === "blocked");

  if (blockingCard) {
    return `${lineLabel(line)} found blocking evidence: ${compactTraceText(
      blockingCard.finding,
      110,
    )}`;
  }

  const incompleteCard = evidence.find(
    (card) => card.status === "partial" || card.status === "missing",
  );

  if (incompleteCard) {
    return `${lineLabel(line)} has incomplete evidence: ${compactTraceText(
      incompleteCard.finding,
      110,
    )}`;
  }

  return `${lineLabel(line)} returned ${evidence.length} ranked evidence cards.`;
}

function boundaryHighlight(
  line: InvoiceLine,
  recommendation: BoundaryRecommendation,
): string {
  return `${lineLabel(line)}: ${recommendation.boundary}. ${compactTraceText(
    recommendation.decisionReason,
    110,
  )}`;
}

function appendRecentHighlight(highlights: string[], highlight: string): string[] {
  return [...highlights.filter((item) => item !== highlight), highlight].slice(-3);
}

function sendTraceUpdate(
  writer: AgentEventWriter,
  update: TraceUpdateInput,
): void {
  writer.send({
    type: "trace_update",
    ...update,
    updatedAt: new Date().toISOString(),
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
  const traceLog: AgentTraceEntry[] = [];
  let traceEntryCount = 0;

  function addTraceEntry(entry: TraceEntryInput): void {
    traceEntryCount += 1;
    traceLog.push({
      id: `${runId}-trace-${traceEntryCount}`,
      at: new Date().toISOString(),
      ...entry,
    });
  }

  const stream = createAgentEventStream(async (writer) => {
    writer.send({ type: "started", runId });
    sendTraceUpdate(writer, {
      id: "upload",
      status: "running",
      title: "Upload accepted",
      headline: "Invoice received. Preparing a read-only evidence review.",
      detail: validation.request.invoice.fileName,
      progress: {
        done: 0,
        total: 1,
      },
    });
    await pauseTrace();

    writer.send({
      type: "step",
      label: "upload accepted",
      status: "done",
    });
    addTraceEntry({
      phase: "upload",
      kind: "tool_call",
      title: "Invoice upload accepted",
      detail: `${validation.request.invoice.fileName}, ${validation.request.invoice.contentType}, ${validation.request.invoice.sizeBytes} bytes.`,
      status: "done",
    });
    sendTraceUpdate(writer, {
      id: "upload",
      status: "done",
      title: "Upload accepted",
      headline: `Invoice accepted: ${validation.request.invoice.fileName}.`,
      detail: "No financial or clinical systems will be modified.",
      progress: {
        done: 1,
        total: 1,
      },
      highlights: ["Read-only review boundary confirmed."],
    });
    await pauseTrace();

    writer.send({
      type: "step",
      label: "invoice vision extraction",
      status: "running",
    });
    addTraceEntry({
      phase: "extraction",
      kind: "tool_call",
      tool: "invoice_vision_extractor",
      title: "Started invoice vision extraction",
      detail: "Extracting billable service lines from the uploaded invoice artifact.",
      status: "running",
    });
    sendTraceUpdate(writer, {
      id: "extraction",
      status: "running",
      title: "Invoice extraction",
      headline: "Reading invoice image and extracting billable service lines.",
      tool: "invoice_vision_extractor",
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
      const message =
        error instanceof InvoiceExtractionError
          ? error.message
          : "Invoice extraction failed.";
      addTraceEntry({
        phase: "extraction",
        kind: "tool_call",
        tool: "invoice_vision_extractor",
        title: "Invoice extraction failed",
        detail: message,
        status: "failed",
      });
      sendTraceUpdate(writer, {
        id: "extraction",
        status: "failed",
        title: "Invoice extraction",
        headline: "Invoice extraction failed before evidence review could start.",
        detail: message,
        tool: "invoice_vision_extractor",
      });
      writer.send({
        type: "error",
        message,
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
    addTraceEntry({
      phase: "extraction",
      kind: "tool_call",
      tool: "invoice_vision_extractor",
      title:
        extractionProvider === "fixture_fallback"
          ? "Fixture extraction used"
          : "Invoice vision extraction completed",
      detail: `Extracted ${extractedLines.length} invoice lines with patient, visit, description, and amount fields.`,
      status: "done",
    });
    sendTraceUpdate(writer, {
      id: "extraction",
      status: "done",
      title: "Invoice extraction",
      headline: `Extracted ${extractedLines.length} invoice lines with patient, visit, description, and amount fields.`,
      detail:
        extractionProvider === "fixture_fallback"
          ? "Vision extraction was unavailable. Demo fixture extraction was used for this run."
          : undefined,
      tool: "invoice_vision_extractor",
      progress: {
        done: extractedLines.length,
        total: extractedLines.length,
      },
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
    addTraceEntry({
      phase: "planning",
      kind: "agent_decision",
      tool: "retrieval_planner",
      title: "Started evidence retrieval planning",
      detail: `Planning source-specific evidence searches for ${extractedLines.length} invoice lines.`,
      status: "running",
    });
    sendTraceUpdate(writer, {
      id: "planning",
      status: "running",
      title: "Agent retrieval planning",
      headline: "Agent is planning evidence searches for each invoice line.",
      tool: "retrieval_planner",
      progress: {
        done: 0,
        total: extractedLines.length,
      },
    });
    await pauseTrace();

    const retrievalPlans: Record<string, RetrievalPlan> = {};
    let fallbackPlanCount = 0;
    let pendingPlans = pendingRetrievalPlans;
    let planningDoneCount = 0;
    let planningHighlights: string[] = [];

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

      planningDoneCount += 1;
      const planningHighlight = `${lineLabel(line)} selected ${candidateCodeLabel(
        result.plan,
      )} and prepared protocol, budget, site evidence, and ledger checks.`;
      planningHighlights = appendRecentHighlight(
        planningHighlights,
        planningHighlight,
      );
      addTraceEntry({
        phase: "planning",
        kind: "agent_decision",
        tool: "retrieval_planner",
        lineId: line.id,
        title: `${lineLabel(line)} retrieval plan ready`,
        detail: `${result.plan.candidateItemCodes.join(
          ", ",
        ) || "No candidate code"}; protocol, CTA/budget, coverage, site evidence, and ledger queries prepared.`,
        status: "done",
      });
      sendTraceUpdate(writer, {
        id: "planning",
        status:
          planningDoneCount === extractedLines.length ? "done" : "running",
        title: "Agent retrieval planning",
        headline: `Planned retrieval for ${planningDoneCount}/${extractedLines.length} invoice lines.`,
        tool: "retrieval_planner",
        progress: {
          done: planningDoneCount,
          total: extractedLines.length,
        },
        highlights: planningHighlights,
      });

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
      planningHighlights = appendRecentHighlight(
        planningHighlights,
        `${fallbackPlanCount} retrieval plans used deterministic fallback planning.`,
      );
      addTraceEntry({
        phase: "planning",
        kind: "agent_decision",
        tool: "retrieval_planner",
        title: "Retrieval planner fallback used",
        detail: `${fallbackPlanCount} retrieval plans used deterministic fallback planning.`,
        status: "done",
      });
      sendTraceUpdate(writer, {
        id: "planning",
        status: "done",
        title: "Agent retrieval planning",
        headline: `Planned retrieval for ${planningDoneCount}/${extractedLines.length} invoice lines.`,
        detail: "Some retrieval plans used deterministic fallback planning.",
        tool: "retrieval_planner",
        progress: {
          done: planningDoneCount,
          total: extractedLines.length,
        },
        highlights: planningHighlights,
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
      type: "step",
      label: "evidence search and ranking",
      status: "running",
    });
    const evidenceToolCallTotal = extractedLines.length * 5;
    addTraceEntry({
      phase: "search",
      kind: "tool_call",
      title: "Started read-only evidence tool calls",
      detail: "Calling protocol, CTA/budget, site evidence, coverage grid, and prior ledger tools.",
      status: "running",
    });
    sendTraceUpdate(writer, {
      id: "search",
      status: "running",
      title: "Tool-based evidence search",
      headline:
        "Calling read-only evidence tools across protocol, CTA/budget, site records, coverage grid, and prior ledger.",
      progress: {
        done: 0,
        total: evidenceToolCallTotal,
      },
    });
    sendTraceUpdate(writer, {
      id: "ranking",
      status: "queued",
      title: "Evidence ranking",
      headline: "Waiting for candidate evidence before ranking starts.",
      tool: "evidence_ranker",
      progress: {
        done: 0,
        total: extractedLines.length,
      },
    });
    await pauseTrace();

    const pendingEvidenceSearches: PendingEvidenceSearch[] = extractedLines.map(
      (line, lineIndex) => {
        const plan = retrievalPlans[line.id];

        return {
          line,
          lineIndex,
          promise: searchAndRankEvidenceForInvoiceLine(line, plan).then(
            (result) => ({
              line,
              lineIndex,
              result,
            }),
          ),
        };
      },
    );
    const evidenceByLineId: Record<string, EvidenceCard[]> = {};
    let evidenceFallbackCount = 0;
    let pendingEvidence = pendingEvidenceSearches;
    let evidenceToolCallDone = 0;
    let evidenceSearchHighlights: string[] = [];
    let rankingDoneCount = 0;
    let rankingHighlights: string[] = [];

    while (pendingEvidence.length > 0) {
      const settledEvidence = await Promise.race(
        pendingEvidence.map((pendingSearch) =>
          pendingSearch.promise.then((value) => ({
            pendingSearch,
            value,
          })),
        ),
      );

      pendingEvidence = pendingEvidence.filter(
        (pendingSearch) => pendingSearch !== settledEvidence.pendingSearch,
      );
      const { line, lineIndex, result } = settledEvidence.value;

      evidenceByLineId[line.id] = result.evidence;

      if (result.usedDeterministicFallback) {
        evidenceFallbackCount += 1;
      }

      for (const searchEvent of result.searchEvents) {
        const source = searchEvent.sources[0];
        evidenceToolCallDone += 1;
        evidenceSearchHighlights = appendRecentHighlight(
          evidenceSearchHighlights,
          `${sourceTitle(source)} checked ${lineLabel(line)}.`,
        );
        addTraceEntry({
          phase: "search",
          kind:
            source === "protocol" || source === "cta_budget"
              ? "document_retrieval"
              : "tool_call",
          tool: toolForSource(source),
          lineId: line.id,
          title: `${sourceTitle(source)} called`,
          detail: compactTraceText(searchEvent.query),
          sources: searchEvent.sources,
          status: "done",
        });
        sendTraceUpdate(writer, {
          id: "search",
          status:
            evidenceToolCallDone === evidenceToolCallTotal ? "done" : "running",
          title: "Tool-based evidence search",
          headline: `${evidenceToolCallDone}/${evidenceToolCallTotal} evidence tool calls complete.`,
          tool: toolForSource(source),
          progress: {
            done: evidenceToolCallDone,
            total: evidenceToolCallTotal,
          },
          highlights: evidenceSearchHighlights,
        });
        writer.send({
          type: "search",
          lineId: line.id,
          query: searchEvent.query,
          sources: searchEvent.sources,
        });
        await pauseTrace();
      }

      writer.send({
        type: "step",
        label: `evidence ranked line ${lineIndex + 1}`,
        status: "done",
      });
      rankingDoneCount += 1;
      const nextRankingHighlight = evidenceHighlight(line, result.evidence);
      rankingHighlights = appendRecentHighlight(
        rankingHighlights,
        nextRankingHighlight,
      );
      addTraceEntry({
        phase: "ranking",
        kind: "evidence_rank",
        tool: "evidence_ranker",
        lineId: line.id,
        title: `${lineLabel(line)} evidence ranked`,
        detail: evidenceStatusSummary(result.evidence),
        status: "done",
      });
      for (const evidence of result.evidence) {
        addTraceEntry({
          phase: "ranking",
          kind: "evidence_rank",
          tool: "evidence_ranker",
          lineId: line.id,
          title: `Evidence attached from ${evidence.sourceName}`,
          detail: compactTraceText(evidence.finding),
          sources: [evidence.sourceType],
          locator: evidence.locator,
          status: "done",
        });
      }
      sendTraceUpdate(writer, {
        id: "ranking",
        status:
          rankingDoneCount === extractedLines.length ? "done" : "running",
        title: "Evidence ranking",
        headline: `Ranked evidence for ${rankingDoneCount}/${extractedLines.length} invoice lines.`,
        tool: "evidence_ranker",
        progress: {
          done: rankingDoneCount,
          total: extractedLines.length,
        },
        highlights: rankingHighlights,
      });
      await pauseTrace();

      writer.send({
        type: "evidence",
        lineId: line.id,
        evidence: result.evidence,
      });
      await pauseTrace();
    }

    if (evidenceFallbackCount > 0) {
      writer.send({
        type: "step",
        label: `${evidenceFallbackCount} evidence rankings used deterministic fallback`,
        status: "done",
      });
      rankingHighlights = appendRecentHighlight(
        rankingHighlights,
        `${evidenceFallbackCount} evidence rankings used deterministic fallback scoring.`,
      );
      addTraceEntry({
        phase: "ranking",
        kind: "evidence_rank",
        tool: "evidence_ranker",
        title: "Evidence ranker fallback used",
        detail: `${evidenceFallbackCount} evidence rankings used deterministic fallback scoring.`,
        status: "done",
      });
      sendTraceUpdate(writer, {
        id: "ranking",
        status: "done",
        title: "Evidence ranking",
        headline: `Ranked evidence for ${rankingDoneCount}/${extractedLines.length} invoice lines.`,
        detail: "Some lines used deterministic fallback evidence ranking.",
        tool: "evidence_ranker",
        progress: {
          done: rankingDoneCount,
          total: extractedLines.length,
        },
        highlights: rankingHighlights,
      });
      await pauseTrace();
    }

    writer.send({
      type: "step",
      label: "evidence search and ranking",
      status: "done",
    });
    await pauseTrace();

    writer.send({
      type: "step",
      label: "deterministic boundary evaluation",
      status: "running",
    });
    addTraceEntry({
      phase: "evaluation",
      kind: "safety_rule",
      tool: "boundary_evaluator",
      title: "Started read-only boundary evaluation",
      detail: "Applying deterministic finance-control rules to ranked evidence.",
      status: "running",
    });
    sendTraceUpdate(writer, {
      id: "evaluation",
      status: "running",
      title: "Boundary evaluation",
      headline: "Applying read-only finance-control rules to ranked evidence.",
      tool: "boundary_evaluator",
      progress: {
        done: 0,
        total: extractedLines.length,
      },
    });
    await pauseTrace();

    const recommendationsByLineId: Record<string, BoundaryRecommendation> = {};
    const recommendations: BoundaryRecommendation[] = [];
    let evaluationDoneCount = 0;
    let evaluationHighlights: string[] = [];

    for (const [lineIndex, line] of extractedLines.entries()) {
      const recommendation = evaluatePaymentLine({
        line,
        plan: retrievalPlans[line.id],
        evidence: evidenceByLineId[line.id] ?? [],
      });

      recommendationsByLineId[line.id] = recommendation;
      recommendations.push(recommendation);
      evaluationDoneCount += 1;
      const nextEvaluationHighlight = boundaryHighlight(line, recommendation);
      evaluationHighlights = appendRecentHighlight(
        evaluationHighlights,
        nextEvaluationHighlight,
      );
      addTraceEntry({
        phase: "evaluation",
        kind: "safety_rule",
        tool: "boundary_evaluator",
        lineId: line.id,
        title: `${lineLabel(line)} boundary evaluated`,
        detail: `${recommendation.boundary}: ${recommendation.decisionReason}`,
        status: "done",
      });
      sendTraceUpdate(writer, {
        id: "evaluation",
        status:
          evaluationDoneCount === extractedLines.length ? "done" : "running",
        title: "Boundary evaluation",
        headline: `Evaluated automation boundaries for ${evaluationDoneCount}/${extractedLines.length} invoice lines.`,
        tool: "boundary_evaluator",
        progress: {
          done: evaluationDoneCount,
          total: extractedLines.length,
        },
        highlights: evaluationHighlights,
      });

      writer.send({
        type: "step",
        label: `boundary evaluated line ${lineIndex + 1}`,
        status: "done",
      });
      await pauseTrace();

      writer.send({
        type: "decision",
        lineId: line.id,
        recommendation,
      });
      await pauseTrace();
    }

    writer.send({
      type: "step",
      label: "deterministic boundary evaluation",
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
        evidenceByLineId,
        recommendationsByLineId,
        traceLog,
        recommendations,
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
