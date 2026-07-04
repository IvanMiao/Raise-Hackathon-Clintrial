import "server-only";

import { type AgentEventWriter } from "@/lib/agent/events";
import { evaluatePaymentLine } from "@/lib/agent/evaluatePaymentLine";
import { verifyEvidencePacket } from "@/lib/agent/evidenceVerification";
import { InvoiceExtractionError } from "@/lib/agent/invoiceExtraction";
import {
  callEvidenceRankerTool,
  callEvidenceSearchTool,
  evidenceSearchToolOrder,
  sourceTitle,
  type EvidenceSearchTool,
} from "@/lib/agent/toolRegistry";
import { extractInvoiceLinesFromUpload } from "@/lib/agent/vultrInvoiceExtraction";
import { createRetrievalPlanForInvoiceLine } from "@/lib/agent/vultrRetrievalPlanner";
import type {
  AgentReviewMode,
  AgentReviewResult,
  AgentTool,
  AgentTraceEntry,
  AgentTraceKind,
  AgentTracePhase,
  AgentTraceStatus,
  BoundaryRecommendation,
  EvidenceCard,
  EvidencePacketVerification,
  EvidenceSource,
  InvoiceLine,
  RetrievalPlan,
  UploadedInvoiceSummary,
} from "@/lib/agent/types";

type ReviewAgentInput = {
  runId: string;
  invoice: UploadedInvoiceSummary;
  invoiceFile: File;
  mode: AgentReviewMode;
};

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

type PendingEvidenceRanking = {
  line: InvoiceLine;
  lineIndex: number;
  promise: Promise<{
    line: InvoiceLine;
    lineIndex: number;
    evidence: EvidenceCard[];
    usedDeterministicFallback: boolean;
    warnings: string[];
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
    label?: string;
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

const traceDelayMs = 120;
const maxSearchActionsPerLine = 8;

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

function uniqueEvidenceCards(evidence: EvidenceCard[]): EvidenceCard[] {
  const seen = new Set<string>();
  const result: EvidenceCard[] = [];

  for (const card of evidence) {
    if (seen.has(card.id)) {
      continue;
    }

    seen.add(card.id);
    result.push(card);
  }

  return result;
}

function selectNextEvidenceTool(
  verification: EvidencePacketVerification,
  usedTools: Set<EvidenceSearchTool>,
): EvidenceSearchTool | null {
  for (const tool of evidenceSearchToolOrder) {
    if (
      verification.allowedNextTools.includes(tool) &&
      !usedTools.has(tool)
    ) {
      return tool;
    }
  }

  return null;
}

function verificationHighlight(
  line: InvoiceLine,
  verification: EvidencePacketVerification,
): string {
  if (verification.verified) {
    return `${lineLabel(line)} verification complete across ${verification.checkedSources.length} evidence sources.`;
  }

  const nextGap = verification.gaps[0];

  if (!nextGap) {
    return `${lineLabel(line)} verifier found no additional read-only tool to call.`;
  }

  return `${lineLabel(line)} verifier found gap: ${nextGap.message}`;
}

function toolLabel(tool: EvidenceSearchTool): string {
  if (tool === "coverage_grid_search") {
    return "Coverage grid lookup";
  }

  if (tool === "protocol_search") {
    return "Protocol document search";
  }

  if (tool === "cta_budget_search") {
    return "CTA / budget search";
  }

  if (tool === "site_evidence_search") {
    return "Site evidence lookup";
  }

  return "Prior payment ledger check";
}

function toolSelectionHighlight(
  line: InvoiceLine,
  tool: EvidenceSearchTool,
  verification: EvidencePacketVerification,
): string {
  const gap = verification.gaps[0];

  if (!gap) {
    return `Agent selected ${toolLabel(tool)} for ${lineLabel(line)}.`;
  }

  return `Agent selected ${toolLabel(tool)} for ${lineLabel(
    line,
  )} because ${gap.message.toLowerCase()}`;
}

export async function runReviewAgent(
  input: ReviewAgentInput,
  writer: AgentEventWriter,
): Promise<void> {
  const traceLog: AgentTraceEntry[] = [];
  let traceEntryCount = 0;

  function addTraceEntry(entry: TraceEntryInput): void {
    traceEntryCount += 1;
    traceLog.push({
      id: `${input.runId}-trace-${traceEntryCount}`,
      at: new Date().toISOString(),
      ...entry,
    });
  }

  writer.send({ type: "started", runId: input.runId });
  sendTraceUpdate(writer, {
    id: "upload",
    status: "running",
    title: "Upload accepted",
    headline: "Invoice received. Preparing a read-only evidence review.",
    detail: input.invoice.fileName,
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
    detail: `${input.invoice.fileName}, ${input.invoice.contentType}, ${input.invoice.sizeBytes} bytes.`,
    status: "done",
  });
  sendTraceUpdate(writer, {
    id: "upload",
    status: "done",
    title: "Upload accepted",
    headline: `Invoice accepted: ${input.invoice.fileName}.`,
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
    const invoiceBytes = new Uint8Array(await input.invoiceFile.arrayBuffer());
    const extraction = await extractInvoiceLinesFromUpload({
      fileName: input.invoice.fileName,
      contentType: input.invoice.contentType,
      bytes: invoiceBytes,
      mode: input.mode,
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
    planningHighlights = appendRecentHighlight(planningHighlights, planningHighlight);
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
      status: planningDoneCount === extractedLines.length ? "done" : "running",
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
    label: "evidence search and verification",
    status: "running",
  });
  const candidateEvidenceByLineId: Record<string, EvidenceCard[]> = {};
  const verificationByLineId: Record<string, EvidencePacketVerification> = {};
  let evidenceToolCallDone = 0;
  let verifiedLineCount = 0;
  let evidenceSearchHighlights: string[] = [];
  let verificationHighlights: string[] = [];

  addTraceEntry({
    phase: "search",
    kind: "tool_call",
    title: "Started read-only evidence tool loop",
    detail: "Agent will call allowed evidence tools until each line has been checked by the verifier.",
    status: "running",
  });
  sendTraceUpdate(writer, {
    id: "search",
    status: "running",
    title: "Tool-based evidence search",
    headline:
      "Agent is resolving evidence gaps with read-only tools.",
    detail: "Tool calls are recorded in the full run log.",
    progress: {
      done: 0,
      total: extractedLines.length,
      label: "Evidence packets",
    },
  });
  sendTraceUpdate(writer, {
    id: "ranking",
    status: "queued",
    title: "Evidence ranking",
    headline: "Waiting for verified candidate evidence before ranking starts.",
    tool: "evidence_ranker",
    progress: {
      done: 0,
      total: extractedLines.length,
    },
  });
  await pauseTrace();

  for (const line of extractedLines) {
    const plan = retrievalPlans[line.id];
    const usedTools = new Set<EvidenceSearchTool>();
    let lineEvidence: EvidenceCard[] = [];
    let verification = verifyEvidencePacket({
      line,
      plan,
      evidence: lineEvidence,
    });
    let actionsForLine = 0;

    while (!verification.verified && actionsForLine < maxSearchActionsPerLine) {
      const nextTool = selectNextEvidenceTool(verification, usedTools);

      if (!nextTool) {
        break;
      }

      usedTools.add(nextTool);
      actionsForLine += 1;
      verificationHighlights = appendRecentHighlight(
        verificationHighlights,
        toolSelectionHighlight(line, nextTool, verification),
      );
      addTraceEntry({
        phase: "search",
        kind: "agent_decision",
        tool: nextTool,
        lineId: line.id,
        title: `${lineLabel(line)} selected ${nextTool}`,
        detail: verificationHighlight(line, verification),
        status: "running",
      });
      const result = await callEvidenceSearchTool({
        tool: nextTool,
        line,
        plan,
      });

      evidenceToolCallDone += 1;
      lineEvidence = uniqueEvidenceCards([...lineEvidence, ...result.evidence]);
      verification = verifyEvidencePacket({
        line,
        plan,
        evidence: lineEvidence,
      });
      candidateEvidenceByLineId[line.id] = lineEvidence;
      verificationByLineId[line.id] = verification;
      evidenceSearchHighlights = appendRecentHighlight(
        evidenceSearchHighlights,
        `${sourceTitle(result.source)} checked ${lineLabel(line)}.`,
      );
      if (verification.verified) {
        verificationHighlights = appendRecentHighlight(
          verificationHighlights,
          verificationHighlight(line, verification),
        );
      }
      addTraceEntry({
        phase: "search",
        kind:
          result.source === "protocol" || result.source === "cta_budget"
            ? "document_retrieval"
            : "tool_call",
        tool: result.tool,
        lineId: line.id,
        title: `${sourceTitle(result.source)} called`,
        detail: compactTraceText(result.query),
        sources: [result.source],
        status: "done",
      });
      sendTraceUpdate(writer, {
        id: "search",
        status: "running",
        title: "Tool-based evidence search",
        headline: `${verifiedLineCount}/${extractedLines.length} evidence packets verified.`,
        detail: `${evidenceToolCallDone} read-only tool calls recorded in the full run log.`,
        tool: result.tool,
        progress: {
          done: verifiedLineCount,
          total: extractedLines.length,
          label: "Evidence packets",
        },
        highlights: [...evidenceSearchHighlights, ...verificationHighlights].slice(-3),
      });
      writer.send({
        type: "search",
        lineId: line.id,
        query: result.query,
        sources: [result.source],
      });
      await pauseTrace();
    }

    verificationByLineId[line.id] = verification;
    if (verification.verified) {
      verifiedLineCount += 1;
    }
    addTraceEntry({
      phase: "search",
      kind: "safety_rule",
      tool: "boundary_evaluator",
      lineId: line.id,
      title: `${lineLabel(line)} evidence packet verified`,
      detail: verification.verified
        ? `Checked sources: ${verification.checkedSources.join(", ")}.`
        : `Remaining gaps: ${verification.gaps
            .map((gap) => gap.kind)
            .join(", ") || "none"}.`,
      status: verification.verified ? "done" : "failed",
    });
    verificationHighlights = appendRecentHighlight(
      verificationHighlights,
      verificationHighlight(line, verification),
    );
    sendTraceUpdate(writer, {
      id: "search",
      status:
        verifiedLineCount === extractedLines.length ? "done" : "running",
      title: "Tool-based evidence search",
      headline: `${verifiedLineCount}/${extractedLines.length} evidence packets verified.`,
      detail: `${evidenceToolCallDone} read-only tool calls recorded in the full run log.`,
      progress: {
        done: verifiedLineCount,
        total: extractedLines.length,
        label: "Evidence packets",
      },
      highlights: [...evidenceSearchHighlights, ...verificationHighlights].slice(-3),
    });
  }

  writer.send({
    type: "step",
    label: "evidence search and verification",
    status: "done",
  });
  await pauseTrace();

  const pendingRankings: PendingEvidenceRanking[] = extractedLines.map(
    (line, lineIndex) => {
      const plan = retrievalPlans[line.id];
      const candidates = candidateEvidenceByLineId[line.id] ?? [];

      return {
        line,
        lineIndex,
        promise: callEvidenceRankerTool({
          line,
          plan,
          candidates,
        }).then((result) => ({
          line,
          lineIndex,
          evidence: result.evidence,
          usedDeterministicFallback: result.usedDeterministicFallback,
          warnings: result.warnings,
        })),
      };
    },
  );
  const evidenceByLineId: Record<string, EvidenceCard[]> = {};
  let evidenceFallbackCount = 0;
  let pendingEvidence = pendingRankings;
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
    const { line, lineIndex, evidence, usedDeterministicFallback } =
      settledEvidence.value;

    evidenceByLineId[line.id] = evidence;

    if (usedDeterministicFallback) {
      evidenceFallbackCount += 1;
    }

    writer.send({
      type: "step",
      label: `evidence ranked line ${lineIndex + 1}`,
      status: "done",
    });
    rankingDoneCount += 1;
    const nextRankingHighlight = evidenceHighlight(line, evidence);
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
      detail: evidenceStatusSummary(evidence),
      status: "done",
    });
    for (const evidenceCard of evidence) {
      addTraceEntry({
        phase: "ranking",
        kind: "evidence_rank",
        tool: "evidence_ranker",
        lineId: line.id,
        title: `Evidence attached from ${evidenceCard.sourceName}`,
        detail: compactTraceText(evidenceCard.finding),
        sources: [evidenceCard.sourceType],
        locator: evidenceCard.locator,
        status: "done",
      });
    }
    sendTraceUpdate(writer, {
      id: "ranking",
      status: rankingDoneCount === extractedLines.length ? "done" : "running",
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
      evidence,
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
      status: evaluationDoneCount === extractedLines.length ? "done" : "running",
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

  const result: AgentReviewResult = {
    runId: input.runId,
    mode: input.mode,
    uploadedInvoice: input.invoice,
    extractedLines,
    retrievalPlans,
    evidenceByLineId,
    recommendationsByLineId,
    verificationByLineId,
    traceLog,
    recommendations,
    completedAt: new Date().toISOString(),
  };

  writer.send({
    type: "complete",
    result,
  });
}
