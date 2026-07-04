"use client";

import { useEffect, useRef, useState } from "react";

import type {
  AgentEvent,
  AgentReviewMode,
  AgentReviewResult,
  AgentTool,
  AgentTraceEntry,
  AgentTraceKind,
  AgentTracePhase,
  AgentTraceStatus,
  AgentTraceUpdate,
  BoundaryRecommendation,
  EvidenceCard,
  InvoiceLine,
  RetrievalPlan,
} from "@/lib/agent/types";

type ReviewState = "ready" | "running" | "done" | "failed";

type TraceLogFilter = "all" | AgentTraceKind;

const emptyRetrievalPlans: Record<string, RetrievalPlan> = {};
const emptyRecommendations: Record<string, BoundaryRecommendation> = {};
const maxImageUploadSizeBytes = 5 * 1024 * 1024;
const maxImageUploadSizeLabel = "5 MB";

const traceStyles: Record<AgentTraceStatus, string> = {
  queued: "border-slate-200 bg-slate-50 text-slate-700",
  running: "border-blue-200 bg-blue-50 text-blue-800",
  done: "border-emerald-200 bg-emerald-50 text-emerald-800",
  failed: "border-rose-200 bg-rose-50 text-rose-800",
};

const tracePhaseOrder: AgentTracePhase[] = [
  "upload",
  "extraction",
  "planning",
  "search",
  "ranking",
  "evaluation",
  "summary",
];

const traceToolLabels: Record<AgentTool, string> = {
  invoice_vision_extractor: "Invoice vision extractor",
  retrieval_planner: "Evidence planning model",
  coverage_grid_search: "Coverage grid lookup",
  protocol_search: "Protocol document search",
  cta_budget_search: "CTA / budget search",
  site_evidence_search: "Site evidence lookup",
  prior_ledger_search: "Prior payment ledger check",
  evidence_ranker: "VultronRetriever evidence ranker",
  boundary_evaluator: "Read-only boundary evaluator",
  reviewer_summary: "Reviewer summary drafter",
};

const traceKindLabels: Record<AgentTraceKind, string> = {
  agent_decision: "Agent decision",
  tool_call: "Tool call",
  document_retrieval: "Document retrieval",
  evidence_rank: "Evidence rank",
  safety_rule: "Safety rule",
};

const traceLogFilters: Array<{ label: string; value: TraceLogFilter }> = [
  { label: "All", value: "all" },
  { label: "Agent", value: "agent_decision" },
  { label: "Tools", value: "tool_call" },
  { label: "Retrieval", value: "document_retrieval" },
  { label: "Ranking", value: "evidence_rank" },
  { label: "Rules", value: "safety_rule" },
];

const reviewStateStyles: Record<ReviewState, string> = {
  ready: "border-slate-200 bg-slate-50 text-slate-700",
  running: "border-blue-200 bg-blue-50 text-blue-800",
  done: "border-emerald-200 bg-emerald-50 text-emerald-800",
  failed: "border-rose-200 bg-rose-50 text-rose-800",
};

const evidenceStyles: Record<EvidenceCard["status"], string> = {
  matched: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partial: "border-blue-200 bg-blue-50 text-blue-800",
  missing: "border-slate-200 bg-slate-100 text-slate-700",
  blocked: "border-rose-200 bg-rose-50 text-rose-800",
};

const evidenceSourceLabels: Record<EvidenceCard["sourceType"], string> = {
  protocol: "Protocol",
  cta_budget: "CTA / budget",
  coverage_grid: "Coverage grid",
  site_evidence: "Site evidence",
  prior_ledger: "Prior ledger",
  invoice_extraction: "Invoice extraction",
};

const evidenceTitles: Record<EvidenceCard["sourceType"], string> = {
  protocol: "Protocol support",
  cta_budget: "Budget support",
  coverage_grid: "Coverage rule",
  site_evidence: "Site record",
  prior_ledger: "Duplicate payment check",
  invoice_extraction: "Invoice extraction",
};

const evidenceSourceAliases: Record<string, string> = {
  "Prot_000.pdf": "Protocol PDF",
  "CTA_Financial_Appendix_Excerpt.pdf": "CTA financial appendix",
  "coverage_analysis_billing_grid.csv": "Coverage grid",
  "site_evidence_log.csv": "Site evidence log",
  "prior_payment_ledger.csv": "Prior payment ledger",
  "invoice_extraction_fixture.csv": "Invoice extraction fixture",
};

const boundaryStyles: Record<BoundaryRecommendation["boundary"], string> = {
  "Auto-handle candidate": "border-emerald-200 bg-emerald-50 text-emerald-800",
  "AI recommend + finance confirm": "border-blue-200 bg-blue-50 text-blue-800",
  "Human review required": "border-rose-200 bg-rose-50 text-rose-800",
  "Policy or contract gap": "border-amber-200 bg-amber-50 text-amber-800",
};

const demoInvoiceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#ffffff"/>
  <text x="40" y="72" font-family="Arial, sans-serif" font-size="28" fill="#111827">TrialGuard demo invoice</text>
  <text x="40" y="124" font-family="Arial, sans-serif" font-size="18" fill="#475569">Fixture-backed upload for manual stream testing.</text>
  <text x="40" y="180" font-family="Arial, sans-serif" font-size="16" fill="#475569">P-101 Visit 3 site fee</text>
  <text x="40" y="214" font-family="Arial, sans-serif" font-size="16" fill="#475569">P-104 PK blood draw / sample handling</text>
  <text x="40" y="248" font-family="Arial, sans-serif" font-size="16" fill="#475569">P-105 Endoscopy w/ biopsy</text>
</svg>`;

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageUpload(file: File): boolean {
  return file.type.startsWith("image/");
}

function imageUploadSizeError(file: File): string | null {
  if (isImageUpload(file) && file.size > maxImageUploadSizeBytes) {
    return `Image uploads must be ${maxImageUploadSizeLabel} or smaller.`;
  }

  return null;
}

function traceStatusLabel(status: AgentTraceStatus): string {
  if (status === "queued") {
    return "Queued";
  }

  if (status === "running") {
    return "Running";
  }

  if (status === "done") {
    return "Done";
  }

  return "Failed";
}

function traceTime(value: string): string {
  return value.length >= 19 ? value.slice(11, 19) : value;
}

function planCount(plans: Record<string, RetrievalPlan>): number {
  return Object.keys(plans).length;
}

function firstCode(plan: RetrievalPlan | undefined): string {
  return plan?.candidateItemCodes[0] ?? "Unplanned";
}

function compactDisplayText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();

  if (compacted.length <= maxLength) {
    return compacted;
  }

  return `${compacted.slice(0, maxLength - 1).trimEnd()}...`;
}

function firstSentence(value: string): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  const sentenceEnd = compacted.search(/[.!?](\s|$)/);

  if (sentenceEnd === -1) {
    return compacted;
  }

  return compacted.slice(0, sentenceEnd + 1);
}

function stripEvidenceRelation(value: string): string {
  return value.replace(/\s*Relation:\s*[^.]+\.?\s*$/i, "").trim();
}

function evidenceSummary(evidence: EvidenceCard): string {
  const cleanedFinding = stripEvidenceRelation(evidence.finding);
  const shouldPreferExcerpt =
    evidence.sourceType === "protocol" ||
    evidence.sourceType === "cta_budget" ||
    cleanedFinding.toLowerCase().startsWith("document chunk matched");
  const summarySource = shouldPreferExcerpt
    ? firstSentence(evidence.excerpt)
    : cleanedFinding;

  return compactDisplayText(summarySource || evidence.finding, 190);
}

function evidenceSourceAlias(sourceName: string): string {
  return evidenceSourceAliases[sourceName] ?? sourceName;
}

function evidenceShortLocator(locator: string): string {
  const rowMatch = locator.match(/#row=([^&#]+)/);

  if (rowMatch) {
    return `row ${decodeURIComponent(rowMatch[1])}`;
  }

  const hashMatch = locator.match(/#([^?&]+)/);

  if (hashMatch) {
    return decodeURIComponent(hashMatch[1]).replaceAll("-", " ");
  }

  return compactDisplayText(locator, 80);
}

function evidenceTitle(evidence: EvidenceCard): string {
  if (evidence.sourceType === "prior_ledger" && evidence.status === "blocked") {
    return "Duplicate payment risk";
  }

  if (evidence.sourceType === "cta_budget" && evidence.status === "partial") {
    return "Budget needs confirmation";
  }

  if (evidence.status === "missing") {
    return `${evidenceTitles[evidence.sourceType]} missing`;
  }

  return evidenceTitles[evidence.sourceType];
}

function evidenceStatusSummary(evidenceItems: EvidenceCard[]): string {
  const matched = evidenceItems.filter((item) => item.status === "matched").length;
  const partial = evidenceItems.filter((item) => item.status === "partial").length;
  const missing = evidenceItems.filter((item) => item.status === "missing").length;
  const blocked = evidenceItems.filter((item) => item.status === "blocked").length;
  const parts = [
    matched > 0 ? `${matched} matched` : "",
    partial > 0 ? `${partial} partial` : "",
    missing > 0 ? `${missing} missing` : "",
    blocked > 0 ? `${blocked} blocking` : "",
  ].filter(Boolean);

  return parts.join(" / ") || "No evidence";
}

function normalizeErrorPayload(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return "Agent review request failed.";
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function EvidenceStatusBadge({ status }: { status: EvidenceCard["status"] }) {
  return (
    <span
      className={`rounded border px-2 py-1 text-xs font-semibold ${evidenceStyles[status]}`}
    >
      {status}
    </span>
  );
}

function EvidenceCardView({ evidence }: { evidence: EvidenceCard }) {
  const sourceLabel = evidenceSourceLabels[evidence.sourceType];
  const sourceAlias = evidenceSourceAlias(evidence.sourceName);
  const locatorLabel = evidenceShortLocator(evidence.locator);

  return (
    <article className="rounded border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
              {sourceLabel}
            </span>
            <span className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500">
              {(evidence.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-slate-950">
            {evidenceTitle(evidence)}
          </h3>
        </div>
        <EvidenceStatusBadge status={evidence.status} />
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-700">
        {evidenceSummary(evidence)}
      </p>

      <details className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-600">
          Citation
        </summary>
        <dl className="mt-2 space-y-2 text-xs leading-5 text-slate-600">
          <div>
            <dt className="font-semibold text-slate-500">Source</dt>
            <dd className="break-words">{sourceAlias}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Locator</dt>
            <dd className="break-words">
              {locatorLabel}
              <span className="sr-only">: {evidence.locator}</span>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Excerpt</dt>
            <dd className="break-words">
              {compactDisplayText(evidence.excerpt, 240)}
            </dd>
          </div>
        </dl>
      </details>
    </article>
  );
}

function BoundaryBadge({
  boundary,
}: {
  boundary: BoundaryRecommendation["boundary"];
}) {
  return (
    <span
      className={`rounded border px-2 py-1 text-xs font-semibold ${boundaryStyles[boundary]}`}
    >
      {boundary}
    </span>
  );
}

function TraceBadge({ status }: { status: AgentTraceStatus }) {
  return (
    <span
      className={`rounded border px-2 py-1 text-xs font-semibold ${traceStyles[status]}`}
    >
      {traceStatusLabel(status)}
    </span>
  );
}

function TraceProgress({
  progress,
}: {
  progress: AgentTraceUpdate["progress"];
}) {
  if (!progress || progress.total <= 0) {
    return null;
  }

  const percent = Math.min(100, Math.round((progress.done / progress.total) * 100));

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        <span>
          {progress.label ? `${progress.label} ` : ""}
          {progress.done}/{progress.total}
        </span>
        <span>{percent}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100">
        <div
          className="h-full rounded bg-blue-600 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function LiveTraceCard({
  index,
  update,
}: {
  index: number;
  update: AgentTraceUpdate;
}) {
  return (
    <li className="trace-card-enter grid grid-cols-[28px_1fr] gap-3 rounded border border-slate-200 bg-white p-3">
      <span className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
        {index + 1}
      </span>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-950">
              {update.title}
            </h3>
            {update.tool ? (
              <p className="mt-1 text-xs font-semibold text-blue-700">
                {traceToolLabels[update.tool]}
              </p>
            ) : null}
          </div>
          <TraceBadge status={update.status} />
        </div>
        <p className="mt-2 text-sm leading-5 text-slate-700">{update.headline}</p>
        {update.detail ? (
          <p className="mt-1 break-words text-sm leading-5 text-slate-500">
            {update.detail}
          </p>
        ) : null}
        <TraceProgress progress={update.progress} />
        {update.highlights && update.highlights.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {update.highlights.map((highlight) => (
              <li
                className="rounded bg-slate-50 px-2 py-1.5 text-xs leading-5 text-slate-600"
                key={highlight}
              >
                {highlight}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function TraceLogEntryCard({
  entry,
  index,
}: {
  entry: AgentTraceEntry;
  index: number;
}) {
  return (
    <article
      className="trace-log-enter rounded border border-slate-200 bg-white p-3"
      style={{ animationDelay: `${Math.min(index * 18, 160)}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
              {traceTime(entry.at)}
            </span>
            <span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
              {traceKindLabels[entry.kind]}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-slate-950">
            {entry.title}
          </h3>
        </div>
        {entry.status ? <TraceBadge status={entry.status} /> : null}
      </div>
      {entry.tool ? (
        <p className="mt-2 text-xs font-semibold text-blue-700">
          {traceToolLabels[entry.tool]}
        </p>
      ) : null}
      {entry.detail ? (
        <p className="mt-2 break-words text-sm leading-5 text-slate-600">
          {entry.detail}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
        {entry.lineId ? (
          <span className="rounded bg-slate-50 px-2 py-1">{entry.lineId}</span>
        ) : null}
        {entry.sources && entry.sources.length > 0 ? (
          <span className="rounded bg-slate-50 px-2 py-1">
            {entry.sources.join(", ")}
          </span>
        ) : null}
        {entry.locator ? (
          <span className="rounded bg-slate-50 px-2 py-1">{entry.locator}</span>
        ) : null}
      </div>
    </article>
  );
}

function ReviewStateBadge({ state }: { state: ReviewState }) {
  const labelByState: Record<ReviewState, string> = {
    ready: "Ready",
    running: "Running",
    done: "Done",
    failed: "Failed",
  };

  return (
    <span
      className={`rounded border px-2 py-1 text-xs font-semibold ${reviewStateStyles[state]}`}
    >
      {labelByState[state]}
    </span>
  );
}

function QueryList({ title, queries }: { title: string; queries: string[] }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <h4 className="text-xs font-semibold uppercase text-slate-500">{title}</h4>
      {queries.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {queries.map((query) => (
            <li
              className="rounded bg-slate-50 px-2 py-1.5 text-sm leading-5 text-slate-700"
              key={query}
            >
              {query}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No query emitted.</p>
      )}
    </div>
  );
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

export function ClinTrialWorkspace() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const [mode, setMode] = useState<AgentReviewMode>("strict");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [liveTraceCards, setLiveTraceCards] =
    useState<Partial<Record<AgentTracePhase, AgentTraceUpdate>>>({});
  const [traceLog, setTraceLog] = useState<AgentTraceEntry[]>([]);
  const [isTraceLogOpen, setIsTraceLogOpen] = useState(false);
  const [traceLogFilter, setTraceLogFilter] = useState<TraceLogFilter>("all");
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]);
  const [retrievalPlans, setRetrievalPlans] =
    useState<Record<string, RetrievalPlan>>(emptyRetrievalPlans);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [evidenceByLineId, setEvidenceByLineId] = useState<
    Record<string, EvidenceCard[]>
  >({});
  const [recommendationsByLineId, setRecommendationsByLineId] =
    useState<Record<string, BoundaryRecommendation>>(emptyRecommendations);
  const [summary, setSummary] = useState<string | null>(null);
  const [result, setResult] = useState<AgentReviewResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const selectedLine =
    invoiceLines.find((line) => line.id === selectedLineId) ??
    invoiceLines[0] ??
    null;
  const selectedPlan = selectedLine ? retrievalPlans[selectedLine.id] : undefined;
  const selectedEvidence = selectedLine
    ? (evidenceByLineId[selectedLine.id] ?? [])
    : [];
  const selectedRecommendation = selectedLine
    ? recommendationsByLineId[selectedLine.id]
    : undefined;
  const completedPlanCount = planCount(retrievalPlans);
  const liveTraceItems = tracePhaseOrder.flatMap((phase) => {
    const update = liveTraceCards[phase];

    return update ? [update] : [];
  });
  const visibleTraceLog =
    traceLogFilter === "all"
      ? traceLog
      : traceLog.filter((entry) => entry.kind === traceLogFilter);
  const reviewState: ReviewState = errorMessage
    ? "failed"
    : isRunning
      ? "running"
      : result
        ? "done"
        : "ready";
  const formControlsDisabled = !hasHydrated || isRunning;
  const canStartReview = hasHydrated && selectedFile !== null && !isRunning;

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  function resetRunState(): void {
    setRunId(null);
    setLiveTraceCards({});
    setTraceLog([]);
    setIsTraceLogOpen(false);
    setTraceLogFilter("all");
    setInvoiceLines([]);
    setRetrievalPlans(emptyRetrievalPlans);
    setSelectedLineId(null);
    setEvidenceByLineId({});
    setRecommendationsByLineId(emptyRecommendations);
    setSummary(null);
    setResult(null);
    setErrorMessage(null);
  }

  function setLocalTraceCard(
    update: Omit<AgentTraceUpdate, "type" | "updatedAt">,
  ): void {
    setLiveTraceCards((items) => ({
      ...items,
      [update.id]: {
        type: "trace_update",
        ...update,
        updatedAt: new Date().toISOString(),
      },
    }));
  }

  function handleAgentEvent(event: AgentEvent): void {
    if (event.type === "started") {
      setRunId(event.runId);
      return;
    }

    if (event.type === "trace_update") {
      setLiveTraceCards((items) => ({
        ...items,
        [event.id]: event,
      }));
      return;
    }

    if (event.type === "step") {
      return;
    }

    if (event.type === "extraction") {
      setInvoiceLines(event.lines);
      setSelectedLineId((currentLineId) => currentLineId ?? event.lines[0]?.id ?? null);
      return;
    }

    if (event.type === "retrieval_plan") {
      setRetrievalPlans((plans) => ({
        ...plans,
        [event.lineId]: event.plan,
      }));
      return;
    }

    if (event.type === "search") {
      return;
    }

    if (event.type === "evidence") {
      setEvidenceByLineId((items) => ({
        ...items,
        [event.lineId]: event.evidence,
      }));
      return;
    }

    if (event.type === "decision") {
      setRecommendationsByLineId((items) => ({
        ...items,
        [event.lineId]: event.recommendation,
      }));
      return;
    }

    if (event.type === "summary") {
      setSummary(event.text);
      return;
    }

    if (event.type === "error") {
      setErrorMessage(event.message);
      return;
    }

    setResult(event.result);
    setRetrievalPlans(event.result.retrievalPlans ?? emptyRetrievalPlans);
    setEvidenceByLineId(event.result.evidenceByLineId ?? {});
    setRecommendationsByLineId(
      event.result.recommendationsByLineId ?? emptyRecommendations,
    );
    setTraceLog(event.result.traceLog ?? []);
  }

  async function readAgentStream(response: Response): Promise<void> {
    if (!response.body) {
      throw new Error("Agent review stream was empty.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");

      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.length === 0) {
          continue;
        }

        handleAgentEvent(JSON.parse(trimmedLine) as AgentEvent);
        await yieldToBrowser();
      }

      if (done) {
        break;
      }
    }

    const finalLine = buffer.trim();

    if (finalLine.length > 0) {
      handleAgentEvent(JSON.parse(finalLine) as AgentEvent);
      await yieldToBrowser();
    }
  }

  async function startReview(): Promise<void> {
    if (!selectedFile) {
      setErrorMessage("Choose an invoice file before starting review.");
      return;
    }

    const sizeError = imageUploadSizeError(selectedFile);

    if (sizeError) {
      setErrorMessage(sizeError);
      return;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    resetRunState();
    setIsRunning(true);

    const formData = new FormData();
    formData.append("invoice", selectedFile);
    formData.append("mode", mode);

    try {
      const response = await fetch("/api/agent-review", {
        method: "POST",
        body: formData,
        signal: abortController.signal,
      });

      if (!response.ok) {
        let payload: unknown = null;

        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        throw new Error(normalizeErrorPayload(payload));
      }

      await readAgentStream(response);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setLocalTraceCard({
          id: "upload",
          status: "failed",
          title: "Review canceled",
          headline: "The browser canceled the running review request.",
        });
        return;
      }

      const message =
        error instanceof Error ? error.message : "Agent review request failed.";
      setErrorMessage(message);
      setLocalTraceCard({
        id: "upload",
        status: "failed",
        title: "Request failed",
        headline: "The review request failed before the backend stream completed.",
        detail: message,
      });
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }

      setIsRunning(false);
    }
  }

  function cancelReview(): void {
    abortControllerRef.current?.abort();
  }

  function useDemoInvoice(): void {
    setSelectedFile(
      new File([demoInvoiceSvg], "mock_site_invoice_scan.svg", {
        type: "image/svg+xml",
      }),
    );
    setMode("demo");
    setErrorMessage(null);
  }

  return (
    <main className="min-h-dvh bg-[#f4f6f8] text-slate-950">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-slate-500">
              TrialGuard
            </p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-slate-950 sm:text-4xl">
              Invoice evidence agent
            </h1>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[420px]">
            <div className="rounded border border-slate-200 bg-white px-3 py-2">
              <div className="text-xl font-bold tabular-nums text-slate-950">
                {invoiceLines.length}
              </div>
              <div className="text-xs font-medium text-slate-500">Lines</div>
            </div>
            <div className="rounded border border-slate-200 bg-white px-3 py-2">
              <div className="text-xl font-bold tabular-nums text-blue-700">
                {completedPlanCount}
              </div>
              <div className="text-xs font-medium text-slate-500">Plans</div>
            </div>
            <div className="rounded border border-slate-200 bg-white px-3 py-2">
              <div
                className={`text-xl font-bold tabular-nums ${
                  reviewState === "failed"
                    ? "text-rose-700"
                    : reviewState === "running"
                      ? "text-blue-700"
                      : reviewState === "done"
                        ? "text-emerald-700"
                        : "text-slate-700"
                }`}
              >
                {reviewState === "running"
                  ? "Run"
                  : reviewState === "done"
                    ? "Done"
                    : reviewState === "failed"
                      ? "Fail"
                      : "Ready"}
              </div>
              <div className="text-xs font-medium text-slate-500">State</div>
            </div>
          </div>
        </header>

        <section
          aria-label="TrialGuard review workspace"
          className="grid flex-1 gap-4 lg:grid-cols-[minmax(300px,0.85fr)_minmax(380px,1.2fr)_minmax(320px,0.95fr)]"
        >
          <section className="min-h-[520px] rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    Upload
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    /api/agent-review
                  </p>
                </div>
                <ReviewStateBadge state={reviewState} />
              </div>

              <div className="mt-4 space-y-3">
                <label
                  className="block text-sm font-semibold text-slate-700"
                  htmlFor="invoice-file"
                >
                  Invoice file
                </label>
                <input
                  accept="image/svg+xml,image/png,image/jpeg,image/webp,application/pdf"
                  className="block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-slate-950 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  disabled={formControlsDisabled}
                  id="invoice-file"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;

                    if (nextFile) {
                      const sizeError = imageUploadSizeError(nextFile);

                      if (sizeError) {
                        event.currentTarget.value = "";
                        setSelectedFile(null);
                        setErrorMessage(sizeError);
                        return;
                      }
                    }

                    setSelectedFile(nextFile);
                    if (nextFile) {
                      setMode("strict");
                    }
                    setErrorMessage(null);
                  }}
                  type="file"
                />
                <p className="text-xs font-medium text-slate-500">
                  Images up to {maxImageUploadSizeLabel}. PDFs up to 10 MB.
                </p>

                <button
                  className="min-h-10 w-full rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                  disabled={formControlsDisabled}
                  onClick={useDemoInvoice}
                  type="button"
                >
                  Use demo invoice
                </button>

                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <select
                    aria-label="Review mode"
                    className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    disabled={formControlsDisabled}
                    onChange={(event) => setMode(event.target.value as AgentReviewMode)}
                    value={mode}
                  >
                    <option value="strict">strict</option>
                    <option value="demo">demo</option>
                  </select>
                  <button
                    className="min-h-11 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={!canStartReview}
                    onClick={startReview}
                    type="button"
                  >
                    Start review
                  </button>
                </div>

                {isRunning ? (
                  <button
                    className="min-h-10 w-full rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
                    onClick={cancelReview}
                    type="button"
                  >
                    Cancel
                  </button>
                ) : null}

                {selectedFile ? (
                  <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    <div className="font-semibold text-slate-900">
                      {selectedFile.name}
                    </div>
                    <div className="mt-1">
                      {selectedFile.type || "unknown"} |{" "}
                      {formatFileSize(selectedFile.size)}
                    </div>
                  </div>
                ) : null}

                {errorMessage ? (
                  <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">
                    {errorMessage}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-950">
                  Live agent trace
                </h2>
                <div className="flex min-w-0 items-center gap-2">
                  {traceLog.length > 0 ? (
                    <button
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-500"
                      onClick={() => setIsTraceLogOpen((isOpen) => !isOpen)}
                      type="button"
                    >
                      {isTraceLogOpen ? "Hide run log" : "View run log"}
                    </button>
                  ) : null}
                  {runId ? (
                    <span className="max-w-[120px] truncate rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
                      {runId}
                    </span>
                  ) : null}
                </div>
              </div>

              {liveTraceItems.length > 0 ? (
                <ol className="space-y-2">
                  {liveTraceItems.map((item, index) => (
                    <LiveTraceCard
                      index={index}
                      key={`${item.id}-${item.updatedAt}`}
                      update={item}
                    />
                  ))}
                </ol>
              ) : (
                <EmptyPanel
                  text="No backend trace event has arrived in this browser session."
                  title="Waiting for stream"
                />
              )}

              {isTraceLogOpen && traceLog.length > 0 ? (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="mb-3 flex flex-wrap gap-2">
                    {traceLogFilters.map((filter) => {
                      const isActive = traceLogFilter === filter.value;

                      return (
                        <button
                          className={`rounded border px-2 py-1 text-xs font-semibold transition ${
                            isActive
                              ? "border-slate-950 bg-slate-950 text-white"
                              : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
                          }`}
                          key={filter.value}
                          onClick={() => setTraceLogFilter(filter.value)}
                          type="button"
                        >
                          {filter.label}
                        </button>
                      );
                    })}
                  </div>

                  {visibleTraceLog.length > 0 ? (
                    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {visibleTraceLog.map((entry, index) => (
                        <TraceLogEntryCard
                          entry={entry}
                          index={index}
                          key={entry.id}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyPanel
                      text="No entries match the selected filter."
                      title="No entries"
                    />
                  )}
                </div>
              ) : null}
            </div>
          </section>

          <section className="min-h-[520px] rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <p className="text-sm font-semibold uppercase text-slate-500">
                Extracted lines
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">
                {selectedLine ? `Line ${selectedLine.lineNumber}` : "No line selected"}
              </h2>
            </div>

            <div className="grid gap-4 p-4 xl:grid-cols-[minmax(220px,0.8fr)_minmax(260px,1fr)]">
              <div className="space-y-2">
                {invoiceLines.length > 0 ? (
                  invoiceLines.map((line) => {
                    const isSelected = line.id === selectedLine?.id;
                    const linePlan = retrievalPlans[line.id];

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={`w-full rounded border p-3 text-left transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-slate-200 bg-white"
                        }`}
                        key={line.id}
                        onClick={() => setSelectedLineId(line.id)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-950">
                              {line.patientId} | {line.visitName}
                            </div>
                            <div className="mt-1 truncate text-sm text-slate-600">
                              {line.rawDescription}
                            </div>
                          </div>
                          <div className="text-right text-sm font-semibold tabular-nums text-slate-950">
                            EUR {line.amount}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                            {(line.extractionConfidence * 100).toFixed(0)}%
                          </span>
                          <span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
                            {firstCode(linePlan)}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <EmptyPanel
                    text="Upload an invoice to receive agent-extracted service lines."
                    title="No extracted lines"
                  />
                )}
              </div>

              <div>
                {selectedLine ? (
                  <div className="space-y-4">
                    <div className="rounded border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-slate-950">
                            {selectedLine.rawDescription}
                          </h3>
                          <p className="mt-2 text-sm text-slate-600">
                            {selectedLine.patientId} | {selectedLine.visitName}
                          </p>
                        </div>
                        <div className="text-right text-base font-bold tabular-nums text-slate-950">
                          EUR {selectedLine.amount}
                        </div>
                      </div>
                    </div>

                    {selectedPlan ? (
                      <div className="space-y-3">
                        <div className="rounded border border-blue-200 bg-blue-50 p-3">
                          <h3 className="text-sm font-semibold text-blue-950">
                            Candidate item codes
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedPlan.candidateItemCodes.map((code) => (
                              <span
                                className="rounded border border-blue-300 bg-white px-2 py-1 text-xs font-semibold text-blue-800"
                                key={code}
                              >
                                {code}
                              </span>
                            ))}
                          </div>
                        </div>

                        <QueryList
                          queries={selectedPlan.protocolQueries}
                          title="Protocol"
                        />
                        <QueryList
                          queries={selectedPlan.budgetQueries}
                          title="CTA / budget"
                        />
                        <QueryList
                          queries={selectedPlan.coverageQueries}
                          title="Coverage grid"
                        />
                        <QueryList
                          queries={selectedPlan.siteEvidenceQueries}
                          title="Site evidence"
                        />
                        <QueryList
                          queries={selectedPlan.ledgerQueries}
                          title="Prior ledger"
                        />
                      </div>
                    ) : (
                      <EmptyPanel
                        text="Retrieval plan events will appear here as the stream advances."
                        title="Planning"
                      />
                    )}
                  </div>
                ) : (
                  <EmptyPanel
                    text="Extracted invoice lines will populate this panel."
                    title="Line detail"
                  />
                )}
              </div>
            </div>
          </section>

          <section className="min-h-[520px] rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <p className="text-sm font-semibold uppercase text-slate-500">
                Evidence and boundary
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">
                {selectedLine ? `Line ${selectedLine.lineNumber} evidence` : "Evidence packet"}
              </h2>
            </div>

            <div className="space-y-4 p-4">
              {selectedEvidence.length > 0 ? (
                <div className="space-y-2">
                  <div className="rounded border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-950">
                        Evidence packet
                      </h3>
                      <span className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                        {selectedEvidence.length} cards
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-slate-600">
                      {evidenceStatusSummary(selectedEvidence)}
                    </p>
                  </div>
                  {selectedEvidence.map((evidence) => (
                    <EvidenceCardView evidence={evidence} key={evidence.id} />
                  ))}
                </div>
              ) : (
                <EmptyPanel
                  text="Evidence cards will appear here after local search and ranker events complete for the selected line."
                  title="Evidence pending"
                />
              )}

              {selectedRecommendation ? (
                <article className="rounded border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">
                        Automation boundary
                      </h3>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        Deterministic read-only recommendation
                      </p>
                    </div>
                    <BoundaryBadge boundary={selectedRecommendation.boundary} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    {selectedRecommendation.decisionReason}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                      Score {(selectedRecommendation.score * 100).toFixed(0)}%
                    </span>
                    {selectedRecommendation.riskFlags.length > 0 ? (
                      selectedRecommendation.riskFlags.map((flag) => (
                        <span
                          className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
                          key={flag}
                        >
                          {flag}
                        </span>
                      ))
                    ) : (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                        no blocking risk flags
                      </span>
                    )}
                  </div>
                  <ol className="mt-3 space-y-2 text-sm leading-5 text-slate-600">
                    {selectedRecommendation.auditTrail.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </article>
              ) : (
                <EmptyPanel
                  text="The deterministic boundary will appear after evidence ranking completes for the selected line."
                  title="Boundary evaluator pending"
                />
              )}

              {summary ? (
                <div className="rounded border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-950">
                    Reviewer summary
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{summary}</p>
                </div>
              ) : null}

              {result ? (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-4">
                  <h3 className="text-sm font-semibold text-emerald-950">
                    Completed
                  </h3>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-emerald-700">Uploaded</dt>
                      <dd className="mt-1 font-semibold text-emerald-950">
                        {result.uploadedInvoice.fileName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-700">Mode</dt>
                      <dd className="mt-1 font-semibold text-emerald-950">
                        {result.mode}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-700">Lines</dt>
                      <dd className="mt-1 font-semibold text-emerald-950">
                        {result.extractedLines.length}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-700">Plans</dt>
                      <dd className="mt-1 font-semibold text-emerald-950">
                        {planCount(result.retrievalPlans ?? emptyRetrievalPlans)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-700">Decisions</dt>
                      <dd className="mt-1 font-semibold text-emerald-950">
                        {result.recommendations.length}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
