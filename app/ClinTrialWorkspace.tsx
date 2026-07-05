"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Lock, 
  Search, 
  X, 
  ChevronDown, 
  ChevronUp, 
  CornerDownRight, 
  Info, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  FileText,
  Activity,
  FlaskConical,
  Eye,
  SlidersHorizontal,
  Bookmark,
  Clock,
  RotateCcw
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  InvoiceScanPreview,
  type InvoiceScanPhase,
} from './InvoiceScanPreview';
import type { AuditTrailEntry, EvidenceItem, TrialItem } from './trialTypes';
import type {
  AgentEvent,
  AgentReviewMode,
  AgentReviewResult,
  AgentTraceEntry,
  AgentTracePhase,
  AgentTraceKind,
  AgentTraceStatus,
  BoundaryRecommendation,
  EvidenceCard,
  EvidenceSource,
  InvoiceLine,
} from '@/lib/agent/types';

type AgentRunStatus = 'idle' | 'running' | 'done' | 'failed';

type AgentStreamReadResult = {
  result: AgentReviewResult | null;
  errorMessage: string | null;
};

type SavedAgentTrace = {
  runId: string;
  completedAt: string;
  uploadedFileName: string;
  entries: AgentTraceEntry[];
};

type LiveAgentStep = {
  id: AgentTracePhase;
  status: AgentTraceStatus;
  title: string;
  headline: string;
  detail?: string;
  tool?: AgentTraceEntry['tool'];
  progress?: {
    done: number;
    total: number;
    label?: string;
  };
  highlights?: string[];
  updatedAt: string;
};

type AgentLineItemInput = {
  uploadedFileName: string;
  candidateCode?: string;
  evidence?: EvidenceCard[];
  recommendation?: BoundaryRecommendation;
  includeExtractionEvidenceFallback?: boolean;
};

const agentReviewMode: AgentReviewMode = 'demo';
const acceptedInvoiceFileTypes = [
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
].join(',');
const maxImageUploadSizeBytes = 5 * 1024 * 1024;
const maxPdfUploadSizeBytes = 10 * 1024 * 1024;

const agentStatusStyles: Record<AgentRunStatus, string> = {
  idle: 'text-slate-600 bg-slate-100 border-slate-200',
  running: 'text-blue-700 bg-blue-50 border-blue-200',
  done: 'text-teal-700 bg-teal-50 border-teal-200',
  failed: 'text-rose-600 bg-rose-50 border-rose-200',
};

const evidenceVerdictPriority: Record<EvidenceItem['verdict'], number> = {
  conflict: 0,
  warn: 1,
  match: 2,
  info: 3,
};

const evidenceSourceToUiSource: Record<EvidenceSource, string> = {
  protocol: 'protocol',
  cta_budget: 'contract',
  coverage_grid: 'contract',
  site_evidence: 'edc',
  prior_ledger: 'edc',
  invoice_extraction: 'edc',
};

const evidenceSourceTitles: Record<EvidenceSource, string> = {
  protocol: 'Protocol',
  cta_budget: 'CTA budget',
  coverage_grid: 'Coverage grid',
  site_evidence: 'Site evidence log',
  prior_ledger: 'Prior payment ledger',
  invoice_extraction: 'Invoice extraction',
};

const locatorAcronyms: Record<string, string> = {
  cta: 'CTA',
  ecg: 'ECG',
  edc: 'EDC',
  imp: 'IMP',
  pk: 'PK',
  uc: 'UC',
};

const boundaryLabels: Record<BoundaryRecommendation['boundary'], string> = {
  'Auto-handle candidate': 'Auto-clear candidate',
  'AI recommend + finance confirm': 'Finance confirm',
  'Human review required': 'Human review',
  'Policy or contract gap': 'Policy gap',
};

const traceStorageKey = 'wisegate.latestAgentTrace';

const traceKindLabels: Record<AgentTraceKind, string> = {
  agent_decision: 'Agent',
  tool_call: 'Tool',
  document_retrieval: 'Retrieval',
  evidence_rank: 'Ranking',
  safety_rule: 'Rule',
};

const traceStatusStyles: Record<NonNullable<AgentTraceEntry['status']>, string> = {
  queued: 'bg-slate-100 text-slate-500',
  running: 'bg-blue-50 text-blue-700',
  done: 'bg-teal-50 text-teal-700',
  failed: 'bg-rose-50 text-rose-600',
};

const liveTracePhaseOrder: AgentTracePhase[] = [
  'upload',
  'extraction',
  'planning',
  'search',
  'ranking',
  'evaluation',
  'summary',
];

const liveTracePhaseLabels: Record<AgentTracePhase, string> = {
  upload: 'Upload',
  extraction: 'Invoice extraction',
  planning: 'Retrieval planning',
  search: 'Evidence search',
  ranking: 'Evidence ranking',
  evaluation: 'Boundary evaluation',
  summary: 'Summary',
};

const liveTraceStatusLabels: Record<AgentTraceStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Complete',
  failed: 'Stopped',
};

function compactText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, ' ').trim();

  if (compacted.length <= maxLength) {
    return compacted;
  }

  return `${compacted.slice(0, maxLength - 3).trimEnd()}...`;
}

function traceTimeLabel(value: string): string {
  const parsed = new Date(value);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(11, 19);
  }

  return value.length >= 19 ? value.slice(11, 19) : value;
}

function tracePhaseLabel(phase: AgentTraceEntry['phase']): string {
  return phase.replace(/_/g, ' ').toUpperCase();
}

function traceToolLabel(tool: AgentTraceEntry['tool']): string {
  return tool ? tool.replace(/_/g, ' ') : 'backend workflow';
}

function liveTracePhaseIndex(phase: AgentTracePhase): number {
  const index = liveTracePhaseOrder.indexOf(phase);

  return index === -1 ? liveTracePhaseOrder.length : index;
}

function upsertLiveAgentStep(
  steps: LiveAgentStep[],
  nextStep: LiveAgentStep,
): LiveAgentStep[] {
  const nextSteps = steps.some((step) => step.id === nextStep.id)
    ? steps.map((step) => (step.id === nextStep.id ? nextStep : step))
    : [...steps, nextStep];

  return nextSteps.sort(
    (left, right) => liveTracePhaseIndex(left.id) - liveTracePhaseIndex(right.id),
  );
}

function progressRatio(progress: LiveAgentStep['progress']): number {
  if (!progress || progress.total <= 0) {
    return 0;
  }

  return Math.min(Math.max(progress.done / progress.total, 0), 1);
}

function LiveAgentTracePanel({
  agentMessage,
  agentStatus,
  shouldReduceMotion,
  steps,
}: {
  agentMessage: string;
  agentStatus: AgentRunStatus;
  shouldReduceMotion: boolean;
  steps: LiveAgentStep[];
}) {
  const visibleSteps: LiveAgentStep[] = steps.length > 0
    ? steps
    : [
        {
          id: 'upload',
          status: agentStatus === 'failed' ? 'failed' : 'running',
          title: 'Preparing backend workflow',
          headline: agentMessage,
          updatedAt: '',
        },
      ];
  const runningStep =
    visibleSteps.find((step) => step.status === 'running') ??
    visibleSteps.at(-1);
  const panelTone = agentStatus === 'failed'
    ? {
        frame: 'border-rose-200 bg-rose-50/40',
        badge: 'border-rose-200 bg-rose-50 text-rose-600',
        icon: 'text-rose-600',
      }
    : {
        frame: 'border-blue-100 bg-blue-50/50',
        badge: 'border-blue-200 bg-blue-50 text-blue-700',
        icon: 'text-blue-600',
      };

  return (
    <motion.div
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      aria-live="polite"
      className="min-h-full"
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      transition={{ duration: shouldReduceMotion ? 0.01 : 0.2 }}
    >
      <div className={`rounded border p-4 shadow-sm ${panelTone.frame}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Activity
                className={`h-4 w-4 ${panelTone.icon} ${
                  agentStatus === 'running' && !shouldReduceMotion ? 'animate-pulse' : ''
                }`}
              />
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-600">
                {agentStatus === 'failed' ? 'Agent stopped' : 'Agent is working'}
              </span>
            </div>
            <div className="mt-1 text-[13px] font-bold leading-snug text-slate-800">
              {runningStep?.headline ?? agentMessage}
            </div>
          </div>
          <span
            className={`flex-none rounded border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${panelTone.badge}`}
          >
            {agentStatus === 'failed' ? 'Stopped' : 'Live'}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        <AnimatePresence initial={false}>
          {visibleSteps.map((step, index) => {
            const isRunningStep = step.status === 'running';
            const isDoneStep = step.status === 'done';
            const isFailedStep = step.status === 'failed';
            const ratio = progressRatio(step.progress);
            const rowTone = isRunningStep
              ? 'border-blue-200 bg-white shadow-sm ring-1 ring-blue-100'
              : isFailedStep
                ? 'border-rose-200 bg-white'
                : 'border-slate-200 bg-white/80';
            const iconTone = isRunningStep
              ? 'border-blue-200 bg-blue-50 text-blue-700'
              : isFailedStep
                ? 'border-rose-200 bg-rose-50 text-rose-600'
                : 'border-slate-200 bg-slate-50 text-slate-400';
            const textTone = isRunningStep
              ? 'text-slate-900'
              : isFailedStep
                ? 'text-rose-700'
                : 'text-slate-500';

            return (
              <motion.div
                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                className={`rounded border p-3 transition-colors ${rowTone}`}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
                key={step.id}
                layout={!shouldReduceMotion}
                transition={{
                  delay: motionStaggerDelay(index, shouldReduceMotion),
                  duration: shouldReduceMotion ? 0.01 : 0.18,
                }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border ${iconTone}`}
                  >
                    {isRunningStep ? (
                      <Activity
                        className={`h-3.5 w-3.5 ${
                          shouldReduceMotion ? '' : 'animate-pulse'
                        }`}
                      />
                    ) : isFailedStep ? (
                      <AlertCircle className="h-3.5 w-3.5" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[12.5px] font-bold leading-snug ${textTone}`}>
                        {step.title}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase ${
                          isRunningStep
                            ? 'bg-blue-50 text-blue-700'
                            : isFailedStep
                              ? 'bg-rose-50 text-rose-600'
                              : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {liveTraceStatusLabels[step.status]}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-wider text-slate-500">
                        {liveTracePhaseLabels[step.id]}
                      </span>
                      {step.tool && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[8.5px] font-semibold text-slate-500">
                          {traceToolLabel(step.tool)}
                        </span>
                      )}
                    </div>

                    <div className={`mt-2 text-[11.5px] leading-relaxed ${isDoneStep ? 'text-slate-400' : 'text-slate-600'}`}>
                      {compactText(step.detail ?? step.headline, 140)}
                    </div>

                    {step.progress && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between gap-2 font-mono text-[8.5px] font-semibold uppercase tracking-wider text-slate-400">
                          <span>{step.progress.label ?? 'Progress'}</span>
                          <span>
                            {step.progress.done}/{step.progress.total}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-slate-100">
                          <motion.div
                            animate={{ scaleX: ratio }}
                            className={`h-full origin-left rounded ${
                              isFailedStep
                                ? 'bg-rose-500'
                                : isDoneStep
                                  ? 'bg-slate-300'
                                  : 'bg-blue-500'
                            }`}
                            initial={false}
                            transition={{ duration: shouldReduceMotion ? 0.01 : 0.18 }}
                          />
                        </div>
                      </div>
                    )}

                    {isRunningStep && step.highlights && step.highlights.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {step.highlights.slice(0, 2).map((highlight) => (
                          <div
                            className="rounded border border-blue-100 bg-blue-50/60 px-2 py-1 text-[10.5px] font-semibold leading-snug text-blue-700"
                            key={highlight}
                          >
                            {compactText(highlight, 96)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function parseSavedAgentTrace(rawValue: string | null): SavedAgentTrace | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<SavedAgentTrace>;

    if (
      typeof parsed.runId !== 'string' ||
      typeof parsed.completedAt !== 'string' ||
      typeof parsed.uploadedFileName !== 'string' ||
      !Array.isArray(parsed.entries)
    ) {
      return null;
    }

    return {
      runId: parsed.runId,
      completedAt: parsed.completedAt,
      uploadedFileName: parsed.uploadedFileName,
      entries: parsed.entries as AgentTraceEntry[],
    };
  } catch {
    return null;
  }
}

function persistSavedAgentTrace(trace: SavedAgentTrace): void {
  try {
    window.localStorage.setItem(traceStorageKey, JSON.stringify(trace));
  } catch {
    // Non-critical: the in-memory trace remains available in the workspace.
  }
}

function removeSavedAgentTrace(): void {
  try {
    window.localStorage.removeItem(traceStorageKey);
  } catch {
    // Non-critical: resetting in-memory state still returns the workspace to idle.
  }
}

function normalizeErrorPayload(payload: unknown): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error;
  }

  return 'Agent review request failed.';
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function invoiceUploadError(file: File): string | null {
  if (file.type.startsWith('image/') && file.size > maxImageUploadSizeBytes) {
    return 'Image invoice files must be 5 MB or smaller.';
  }

  if (file.type === 'application/pdf' && file.size > maxPdfUploadSizeBytes) {
    return 'PDF invoice files must be 10 MB or smaller.';
  }

  return null;
}

function formatInvoiceAmount(amount: string): string {
  const compacted = amount.trim();

  if (/^[€$£]/.test(compacted)) {
    return compacted;
  }

  return `$${compacted}`;
}

function displayLineId(line: InvoiceLine): string {
  return `LI-${String(line.lineNumber).padStart(4, '0')}`;
}

function evidenceVerdict(status: EvidenceCard['status']): EvidenceItem['verdict'] {
  if (status === 'matched') {
    return 'match';
  }

  if (status === 'blocked') {
    return 'conflict';
  }

  if (status === 'partial' || status === 'missing') {
    return 'warn';
  }

  return 'info';
}

function readableLocatorFragment(fragment: string): string {
  return fragment
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      const lowerToken = token.toLowerCase();
      const acronym = locatorAcronyms[lowerToken];

      if (acronym) {
        return acronym;
      }

      return `${lowerToken.slice(0, 1).toUpperCase()}${lowerToken.slice(1)}`;
    })
    .join(' ');
}

function evidenceReference(evidence: EvidenceCard): string {
  const sourceTitle = evidenceSourceTitles[evidence.sourceType];

  if (!evidence.locator) {
    return sourceTitle;
  }

  const [, rawFragment = ''] = evidence.locator.split('#');

  if (!rawFragment) {
    return sourceTitle;
  }

  const locatorParams = new URLSearchParams(rawFragment);
  const rowNumber = locatorParams.get('row');

  if (rowNumber) {
    return `${sourceTitle} · Row ${rowNumber}`;
  }

  const context = [
    locatorParams.get('patient'),
    locatorParams.get('visit'),
    locatorParams.get('item'),
  ].filter((value): value is string => Boolean(value));

  if (context.length > 0) {
    const label = evidence.status === 'missing' ? 'No matching row for' : 'Search';
    return `${sourceTitle} · ${label} ${context.join(' / ')}`;
  }

  return `${sourceTitle} · ${readableLocatorFragment(rawFragment)}`;
}

function staggerDelay(index: number): string {
  return `${Math.min(index * 45, 270)}ms`;
}

function motionStaggerDelay(index: number, shouldReduceMotion: boolean): number {
  return shouldReduceMotion ? 0 : Math.min(index * 0.045, 0.27);
}

function sortEvidenceByPriority(evidence: EvidenceItem[]): EvidenceItem[] {
  return evidence
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const priorityDelta =
        evidenceVerdictPriority[left.item.verdict] -
        evidenceVerdictPriority[right.item.verdict];

      return priorityDelta === 0 ? left.index - right.index : priorityDelta;
    })
    .map(({ item }) => item);
}

function mapEvidenceCard(evidence: EvidenceCard): EvidenceItem {
  return {
    src: evidenceSourceToUiSource[evidence.sourceType] ?? evidence.sourceType,
    ref: evidenceReference(evidence),
    locator: evidence.locator,
    verdict: evidenceVerdict(evidence.status),
    text: evidence.excerpt || evidence.finding,
    ai: evidence.finding,
  };
}

function recommendationStatus(recommendation: BoundaryRecommendation | undefined) {
  if (!recommendation) {
    return 'pending';
  }

  if (recommendation.evidence.some((evidence) => evidence.status === 'blocked')) {
    return 'block';
  }

  if (recommendation.boundary === 'Auto-handle candidate') {
    return 'pass';
  }

  if (recommendation.boundary === 'Policy or contract gap') {
    return 'block';
  }

  if (recommendation.boundary === 'Human review required') {
    return 'flag';
  }

  return 'review';
}

function recommendationBand(status: TrialItem['status'], score: number) {
  if (status === 'pass' && score >= 85) {
    return 'clear';
  }

  if (status === 'block') {
    return 'hold';
  }

  return 'review';
}

function averageConfidence(line: InvoiceLine, evidence: EvidenceCard[]): number {
  const values = [line.extractionConfidence, ...evidence.map((item) => item.confidence)]
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return 0;
  }

  return Math.round(
    (values.reduce((total, value) => total + value, 0) / values.length) * 100,
  );
}

function mapInvoiceLineToTrialItem(
  line: InvoiceLine,
  input: AgentLineItemInput,
): TrialItem {
  const evidence = input.evidence ?? input.recommendation?.evidence ?? [];
  const status = recommendationStatus(input.recommendation);
  const score = input.recommendation
    ? Math.round(input.recommendation.score * 100)
    : 0;
  const riskFlags = input.recommendation?.riskFlags ?? [];
  const mappedEvidence = evidence.map(mapEvidenceCard);
  const shouldUseExtractionFallback =
    input.includeExtractionEvidenceFallback === true && mappedEvidence.length === 0;
  const extractionEvidence: EvidenceItem[] = [
    {
      src: 'edc',
      ref: `${input.uploadedFileName} · extracted line ${line.lineNumber}`,
      verdict: 'info',
      text: line.rawDescription,
      ai: `Invoice extraction confidence ${(line.extractionConfidence * 100).toFixed(0)}%.`,
    },
  ];
  const evidenceItems = shouldUseExtractionFallback
    ? extractionEvidence
    : mappedEvidence;

  return {
    id: displayLineId(line),
    amount: formatInvoiceAmount(line.amount),
    desc: line.rawDescription,
    meta: `${line.patientId} · ${line.visitName} · ${input.uploadedFileName}`,
    cat: input.candidateCode ?? 'Agent extracted',
    status,
    complianceScore: score,
    aiConfidence: averageConfidence(line, evidence),
    band: recommendationBand(status, score),
    summary:
      input.recommendation?.decisionReason ??
      (mappedEvidence.length > 0
        ? 'Evidence sources are being ranked while boundary evaluation continues.'
        : 'Invoice line extracted. Agent is searching evidence sources.'),
    gcpRules:
      riskFlags.length > 0
        ? riskFlags
        : mappedEvidence.length > 0
          ? ['Evidence search in progress', 'Boundary pending']
          : ['Invoice extraction complete', 'Evidence search pending'],
    rec: input.recommendation
      ? `${boundaryLabels[input.recommendation.boundary]} — ${input.recommendation.decisionReason}`
      : 'Awaiting deterministic boundary evaluation.',
    evidence: evidenceItems,
  };
}

function mapAgentResultToItems(result: AgentReviewResult): TrialItem[] {
  return result.extractedLines.map((line) => (
    mapInvoiceLineToTrialItem(line, {
      uploadedFileName: result.uploadedInvoice.fileName,
      candidateCode:
        result.retrievalPlans?.[line.id]?.candidateItemCodes[0] ?? undefined,
      evidence: result.evidenceByLineId?.[line.id],
      recommendation: result.recommendationsByLineId?.[line.id],
      includeExtractionEvidenceFallback: true,
    })
  ));
}

function auditEntryFromAgentResult(result: AgentReviewResult): AuditTrailEntry {
  const completedAt = new Date(result.completedAt);
  const dateLabel = Number.isNaN(completedAt.getTime())
    ? new Date().toISOString().slice(0, 16).replace('T', ' ')
    : completedAt.toISOString().slice(0, 16).replace('T', ' ');

  return {
    time: `${dateLabel} UTC`,
    auditor: 'System · Backend Agent',
    item: result.runId.slice(0, 8),
    action: 'Reviewed',
    actionColor: '#0f766e',
    actionBg: '#f0fdfa',
    justification: `Read-only backend workflow completed for ${result.uploadedInvoice.fileName}; ${result.extractedLines.length} line items mapped into the workspace.`,
  };
}

function savedTraceFromAgentResult(result: AgentReviewResult): SavedAgentTrace {
  return {
    runId: result.runId,
    completedAt: result.completedAt,
    uploadedFileName: result.uploadedInvoice.fileName,
    entries: result.traceLog ?? [],
  };
}

export function ClinTrialWorkspace() {
  // App States
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [items, setItems] = useState<TrialItem[]>([]);
  const [visibleItemCount, setVisibleItemCount] = useState<number>(0);
  const [resultSequenceKey, setResultSequenceKey] = useState<number>(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [trailExpanded, setTrailExpanded] = useState<boolean>(false);
  const [trail, setTrail] = useState<AuditTrailEntry[]>([]);
  const [agentTraceExpanded, setAgentTraceExpanded] = useState<boolean>(false);
  const [agentTraceSnapshot, setAgentTraceSnapshot] =
    useState<SavedAgentTrace | null>(null);
  const [liveAgentSteps, setLiveAgentSteps] = useState<LiveAgentStep[]>([]);
  const [showAiNotes, setShowAiNotes] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [evidenceExpanded, setEvidenceExpanded] = useState<boolean>(false);
  const [showGaugeTooltip, setShowGaugeTooltip] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [invoicePreviewUrl, setInvoicePreviewUrl] = useState<string | null>(null);
  const [scanPreviewVisible, setScanPreviewVisible] = useState<boolean>(false);
  const [scanPreviewPhase, setScanPreviewPhase] =
    useState<InvoiceScanPhase>('ready');
  const [lastExtractedLineCount, setLastExtractedLineCount] =
    useState<number>(0);
  const [agentStatus, setAgentStatus] = useState<AgentRunStatus>('idle');
  const [agentMessage, setAgentMessage] = useState<string>(
    'Upload an invoice to run backend review.',
  );
  const [agentError, setAgentError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const revealTimersRef = useRef<number[]>([]);
  const scanExitTimerRef = useRef<number | null>(null);
  const invoiceLineByIdRef = useRef<Map<string, InvoiceLine>>(new Map());
  const invoiceInputRef = useRef<HTMLInputElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      revealTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      if (scanExitTimerRef.current !== null) {
        window.clearTimeout(scanExitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!selectedFile || !selectedFile.type.startsWith('image/')) {
      setInvoicePreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setInvoicePreviewUrl(nextPreviewUrl);

    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [selectedFile]);

  useEffect(() => {
    try {
      setAgentTraceSnapshot(
        parseSavedAgentTrace(window.localStorage.getItem(traceStorageKey)),
      );
    } catch {
      setAgentTraceSnapshot(null);
    }
  }, []);

  // Selection helper to auto-reset evidence accordion state
  const handleSelectItem = (id: string) => {
    setSelectedId(id);
    setEvidenceExpanded(false);
  };

  // Categories list derived from items
  const categories = useMemo(() => {
    const cats = new Set(items.map((item) => item.cat));
    return ['All', ...Array.from(cats)];
  }, [items]);

  // Filter and search items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = 
        item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.meta.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === 'All' || item.cat === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [items, searchQuery, selectedCategory]);

  const visibleFilteredItems = useMemo(() => {
    return filteredItems.slice(0, Math.min(visibleItemCount, filteredItems.length));
  }, [filteredItems, visibleItemCount]);

  // Find currently selected item
  const selectedItem = useMemo<TrialItem | null>(() => {
    if (!selectedId) {
      return items[0] ?? null;
    }

    return items.find((it) => it.id === selectedId) ?? items[0] ?? null;
  }, [items, selectedId]);

  const prioritizedEvidence = useMemo(() => {
    return selectedItem ? sortEvidenceByPriority(selectedItem.evidence) : [];
  }, [selectedItem]);

  // Calculate risk items remaining (any item with band !== 'clear')
  const riskCount = useMemo(() => {
    return items.filter((i) => i.band !== 'clear' && i.status !== 'pass').length;
  }, [items]);

  // Handle status meta formatting
  const getStatusMeta = (status: string) => {
    const m: Record<string, { label: string; color: string; bg: string; dot: string; border: string }> = {
      pass: { label: 'Cleared', color: '#0f766e', bg: '#f0fdfa', dot: '#0d9488', border: '#99f6e4' },
      flag: { label: 'At risk', color: '#e11d48', bg: '#fff1f2', dot: '#e11d48', border: '#fecdd3' },
      block: { label: 'Blocked', color: '#e11d48', bg: '#fff1f2', dot: '#e11d48', border: '#fecdd3' },
      review: { label: 'Review', color: '#b45309', bg: '#fffbeb', dot: '#d97706', border: '#fde68a' },
      pending: { label: 'Pending', color: '#475569', bg: '#f1f5f9', dot: '#64748b', border: '#cbd5e1' },
    };
    return m[status] || m.pending;
  };

  // Handle band metadata styling
  const getBandMeta = (band: string) => {
    const m: Record<string, { label: string; bg: string; border: string; accent: string }> = {
      clear: { label: 'Within auto-clear boundary', bg: '#f0fdfa', border: '#99f6e4', accent: '#0f766e' },
      review: { label: 'Auditor review required', bg: '#fff1f2', border: '#fecdd3', accent: '#e11d48' },
      hold: { label: 'Recommend hold — high risk', bg: '#fff1f2', border: '#fecdd3', accent: '#e11d48' },
    };
    return m[band] || m.review;
  };

  const getBandRouting = (band: string) => {
    const m: Record<string, string> = {
      clear: 'Eligible for auto-clear',
      review: 'Routed to auditor for decision',
      hold: 'Routed to auditor — hold recommended',
    };
    return m[band] || m.review;
  };

  const getRecVerb = (band: string) => {
    const m: Record<string, string> = {
      clear: 'Approve',
      review: 'Review',
      hold: 'Hold',
    };
    return m[band] || 'Review';
  };

  const getVerdictMeta = (v: string) => {
    const m: Record<string, { label: string; color: string; bg: string; border: string }> = {
      match: { label: 'Match', color: '#0f766e', bg: '#f0fdfa', border: '#cbd5e1' },
      warn: { label: 'Caution', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
      conflict: { label: 'Conflict', color: '#e11d48', bg: '#fff1f2', border: '#fecdd3' },
      info: { label: 'Info', color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' },
    };
    return m[v] || m.info;
  };

  const getSourceLabel = (s: string) => {
    const m: Record<string, string> = {
      protocol: 'PROTOCOL',
      irb: 'IRB / ETHICS',
      contract: 'SITE CONTRACT',
      edc: 'SOURCE DATA · EDC',
    };
    return m[s] || s.toUpperCase();
  };

  // Decision submit handler
  const canSubmit = selectedItem !== null && !!decision && (
    (decision === 'reject' || decision === 'escalate') 
      ? reason.trim().length > 0 
      : true
  );

  const handleSubmit = () => {
    if (!canSubmit || !selectedItem) return;

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');

    const map: Record<string, [string, string, string]> = {
      approve: ['Approved', '#0f766e', '#f0fdfa'],
      partial: ['Partial approval', '#b45309', '#fffbeb'],
      reject: ['Rejected', '#e11d48', '#fff1f2'],
      escalate: ['Escalated', '#475569', '#f1f5f9'],
    };

    const [actionLabel, actionColor, actionBg] = map[decision];

    const defaultReasons: Record<string, string> = {
      approve: 'Approved — Line item complies fully with protocol specifications.',
      partial: 'Partial approval — Approved with secondary site verification.',
    };
    const finalReason = reason.trim() || defaultReasons[decision] || '';

    const entry: AuditTrailEntry = {
      time: `2026-07-04 ${hh}:${mm} UTC`,
      auditor: 'Dr. E. Vance · Lead Auditor',
      item: selectedItem.id,
      action: actionLabel,
      actionColor,
      actionBg,
      justification: finalReason,
    };

    // Update items state with new status based on decision
    setItems((prevItems) => {
      return prevItems.map((item) => {
        if (item.id === selectedItem.id) {
          let updatedStatus = item.status;
          if (decision === 'approve') updatedStatus = 'pass';
          else if (decision === 'partial' || decision === 'escalate') updatedStatus = 'review';
          else if (decision === 'reject') updatedStatus = 'block';

          return { ...item, status: updatedStatus };
        }
        return item;
      });
    });

    // Add entry to audit trail
    setTrail((prevTrail) => [entry, ...prevTrail]);

    // Reset decision fields
    setDecision('');
    setReason('');
  };

  // Navigation Items
  const selMeta = selectedItem ? getStatusMeta(selectedItem.status) : getStatusMeta('pending');
  const selBand = selectedItem ? getBandMeta(selectedItem.band) : getBandMeta('review');
  const selectedEvidenceReady = prioritizedEvidence.length > 0;
  const selectedBoundaryReady = selectedItem !== null && selectedItem.status !== 'pending';
  const shouldShowLiveAgentTrace =
    agentStatus === 'running' ||
    agentStatus === 'failed' ||
    (liveAgentSteps.length > 0 && agentStatus !== 'done' && !selectedBoundaryReady);
  const shouldShowBoundaryResult =
    selectedBoundaryReady && selectedItem !== null && !shouldShowLiveAgentTrace;
  const evidenceHeroTone = !selectedBoundaryReady
    ? {
        card: 'bg-blue-50/40 border-blue-100 border-l-blue-500',
        badge: 'bg-blue-600',
        text: 'text-blue-700',
        label: 'Evidence ranking in progress',
      }
    : selectedItem && selectedItem.complianceScore < 85
      ? {
          card: 'bg-rose-50/40 border-rose-200 border-l-rose-600',
          badge: 'bg-rose-600',
          text: 'text-rose-600',
          label: selBand.label,
        }
      : {
          card: 'bg-teal-50/40 border-teal-200 border-l-teal-600',
          badge: 'bg-teal-700',
          text: 'text-teal-700',
          label: selBand.label,
        };
  const agentStatusStyle = agentStatusStyles[agentStatus];
  const isAgentRunning = agentStatus === 'running';
  const selectedFileError = selectedFile ? invoiceUploadError(selectedFile) : null;
  const canRunAgent = selectedFile !== null && selectedFileError === null && !isAgentRunning;
  const canResetAnalysis =
    !isAgentRunning &&
    (
      items.length > 0 ||
      trail.length > 0 ||
      agentTraceSnapshot !== null ||
      agentStatus !== 'idle' ||
      agentError !== null
    );
  const agentTraceLog = agentTraceSnapshot?.entries ?? [];
  const agentTraceRunLabel = agentTraceSnapshot
    ? `${agentTraceSnapshot.runId.slice(0, 8)} · ${compactText(agentTraceSnapshot.uploadedFileName, 28)}`
    : 'No saved run';
  const shouldShowInvoiceScanPreview = scanPreviewVisible && selectedFile !== null;
  const emptyLineItemsMessage = shouldShowInvoiceScanPreview && isAgentRunning
    ? 'Scanning invoice. Extracted line items will appear here.'
    : shouldShowInvoiceScanPreview
      ? 'Invoice staged. Run review to extract line items.'
      : items.length === 0
        ? 'No invoice line items yet.'
        : 'No matching line items found.';

  function currentUploadedFileName(): string {
    return selectedFile?.name ?? agentTraceSnapshot?.uploadedFileName ?? 'Uploaded invoice';
  }

  function clearItemRevealTimers(): void {
    revealTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    revealTimersRef.current = [];
  }

  function clearScanExitTimer(): void {
    if (scanExitTimerRef.current !== null) {
      window.clearTimeout(scanExitTimerRef.current);
      scanExitTimerRef.current = null;
    }
  }

  function finishScanPreview(lineCount: number): void {
    clearScanExitTimer();
    setLastExtractedLineCount(lineCount);
    setScanPreviewPhase('complete');
  }

  function releaseScanPreviewForReadyEvidence(lineId: string): void {
    const line = invoiceLineByIdRef.current.get(lineId);

    if (!line) {
      return;
    }

    const uiLineId = displayLineId(line);
    const selectedLineId = selectedIdRef.current;

    if (selectedLineId !== null && selectedLineId !== uiLineId) {
      return;
    }

    clearScanExitTimer();
    setScanPreviewVisible(false);
  }

  function resetAnalysis(): void {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    clearItemRevealTimers();
    clearScanExitTimer();
    invoiceLineByIdRef.current = new Map();

    if (invoiceInputRef.current) {
      invoiceInputRef.current.value = '';
    }

    setItems([]);
    setVisibleItemCount(0);
    setResultSequenceKey((currentKey) => currentKey + 1);
    setSelectedId(null);
    setDecision('');
    setReason('');
    setTrailExpanded(false);
    setTrail([]);
    setAgentTraceExpanded(false);
    setAgentTraceSnapshot(null);
    setLiveAgentSteps([]);
    removeSavedAgentTrace();
    setSearchQuery('');
    setSelectedCategory('All');
    setEvidenceExpanded(false);
    setShowGaugeTooltip(false);
    setSelectedFile(null);
    setScanPreviewVisible(false);
    setScanPreviewPhase('ready');
    setLastExtractedLineCount(0);
    setAgentStatus('idle');
    setAgentError(null);
    setAgentMessage('Upload an invoice to run backend review.');
  }

  function revealAgentItems(nextItems: TrialItem[]): void {
    clearItemRevealTimers();
    setVisibleItemCount(nextItems.length > 0 ? 1 : 0);
    setResultSequenceKey((currentKey) => currentKey + 1);

    for (let index = 2; index <= nextItems.length; index += 1) {
      const timerId = window.setTimeout(() => {
        setVisibleItemCount(index);
      }, (index - 1) * 70);

      revealTimersRef.current.push(timerId);
    }
  }

  function applyExtractedLines(lines: InvoiceLine[]): void {
    invoiceLineByIdRef.current = new Map(lines.map((line) => [line.id, line]));
    const uploadedFileName = currentUploadedFileName();
    const nextItems = lines.map((line) => (
      mapInvoiceLineToTrialItem(line, {
        uploadedFileName,
        includeExtractionEvidenceFallback: false,
      })
    ));

    setItems(nextItems);
    setSelectedId((currentSelectedId) => {
      if (currentSelectedId && nextItems.some((item) => item.id === currentSelectedId)) {
        return currentSelectedId;
      }

      return nextItems[0]?.id ?? null;
    });
    setSelectedCategory('All');
    setSearchQuery('');
    setEvidenceExpanded(false);
    revealAgentItems(nextItems);
  }

  function updateAgentLineItem(
    lineId: string,
    update: {
      candidateCode?: string;
      evidence?: EvidenceCard[];
      recommendation?: BoundaryRecommendation;
      expandEvidence?: boolean;
    },
  ): void {
    const line = invoiceLineByIdRef.current.get(lineId);

    if (!line) {
      return;
    }

    const uiLineId = displayLineId(line);
    const uploadedFileName = currentUploadedFileName();

    setItems((currentItems) => currentItems.map((item) => {
      if (item.id !== uiLineId) {
        return item;
      }

      if (update.evidence === undefined && update.recommendation === undefined) {
        return {
          ...item,
          cat: update.candidateCode ?? item.cat,
        };
      }

      return mapInvoiceLineToTrialItem(line, {
        uploadedFileName,
        candidateCode: update.candidateCode ?? item.cat,
        evidence: update.evidence,
        recommendation: update.recommendation,
        includeExtractionEvidenceFallback: false,
      });
    }));

    setResultSequenceKey((currentKey) => currentKey + 1);

    if (update.expandEvidence) {
      setEvidenceExpanded((isExpanded) => {
        if (selectedId !== null && selectedId !== uiLineId) {
          return isExpanded;
        }

        return true;
      });
    }
  }

  function applyAgentResult(result: AgentReviewResult): void {
    const nextItems = mapAgentResultToItems(result);
    const nextTraceSnapshot = savedTraceFromAgentResult(result);

    clearScanExitTimer();
    setScanPreviewVisible(false);
    setLastExtractedLineCount(result.extractedLines.length);
    setItems(nextItems);
    invoiceLineByIdRef.current = new Map(
      result.extractedLines.map((line) => [line.id, line]),
    );
    setAgentTraceSnapshot(nextTraceSnapshot);
    persistSavedAgentTrace(nextTraceSnapshot);

    if (nextItems.length > 0) {
      setSelectedId((currentSelectedId) => {
        if (currentSelectedId && nextItems.some((item) => item.id === currentSelectedId)) {
          return currentSelectedId;
        }

        return nextItems[0].id;
      });
      setSelectedCategory('All');
      setSearchQuery('');
      setEvidenceExpanded(true);
      revealAgentItems(nextItems);
    } else {
      setSelectedId(null);
      setEvidenceExpanded(false);
      setVisibleItemCount(0);
    }

    setTrail((prevTrail) => [auditEntryFromAgentResult(result), ...prevTrail]);
    setAgentStatus('done');
    setAgentError(null);
    setAgentMessage(
      `Backend workflow completed · ${result.extractedLines.length} lines mapped`,
    );
  }

  function handleAgentEvent(event: AgentEvent): AgentReviewResult | null {
    if (event.type === 'started') {
      setAgentMessage(`Backend workflow started · ${event.runId.slice(0, 8)}`);
      return null;
    }

    if (event.type === 'trace_update') {
      setLiveAgentSteps((currentSteps) => upsertLiveAgentStep(currentSteps, {
        id: event.id,
        status: event.status,
        title: event.title,
        headline: event.headline,
        detail: event.detail,
        tool: event.tool,
        progress: event.progress,
        highlights: event.highlights,
        updatedAt: event.updatedAt,
      }));
      if (event.id === 'upload' || event.id === 'extraction') {
        setScanPreviewPhase(event.id);
      }
      setAgentMessage(event.headline);
      return null;
    }

    if (event.type === 'step') {
      if (event.status === 'running') {
        setAgentMessage(`Agent is running: ${event.label}.`);
      }

      return null;
    }

    if (event.type === 'extraction') {
      applyExtractedLines(event.lines);
      finishScanPreview(event.lines.length);
      setAgentMessage(
        `Extracted ${event.lines.length} invoice lines. Keeping the invoice preview visible while evidence is ranked.`,
      );
      return null;
    }

    if (event.type === 'retrieval_plan') {
      updateAgentLineItem(event.lineId, {
        candidateCode: event.plan.candidateItemCodes[0] ?? 'Agent extracted',
      });
      setAgentMessage(`Retrieval plan ready for ${event.lineId}.`);
      return null;
    }

    if (event.type === 'search') {
      setAgentMessage(`Searching ${event.sources.length} sources for ${event.lineId}.`);
      return null;
    }

    if (event.type === 'evidence') {
      updateAgentLineItem(event.lineId, {
        evidence: event.evidence,
        expandEvidence: true,
      });
      if (event.evidence.length > 0) {
        releaseScanPreviewForReadyEvidence(event.lineId);
      }
      setAgentMessage(`Ranked ${event.evidence.length} evidence cards for ${event.lineId}.`);
      return null;
    }

    if (event.type === 'decision') {
      updateAgentLineItem(event.lineId, {
        evidence: event.recommendation.evidence,
        recommendation: event.recommendation,
        expandEvidence: true,
      });
      if (event.recommendation.evidence.length > 0) {
        releaseScanPreviewForReadyEvidence(event.lineId);
      }
      setAgentMessage(`${event.lineId}: ${event.recommendation.boundary}.`);
      return null;
    }

    if (event.type === 'summary') {
      setAgentMessage(event.text);
      return null;
    }

    if (event.type === 'error') {
      clearScanExitTimer();
      setScanPreviewVisible(true);
      setScanPreviewPhase('failed');
      setAgentStatus('failed');
      setAgentError(event.message);
      setAgentMessage(event.message);
      return null;
    }

    if (event.type === 'complete') {
      applyAgentResult(event.result);
      return event.result;
    }

    return null;
  }

  async function readAgentStream(response: Response): Promise<AgentStreamReadResult> {
    if (!response.body) {
      throw new Error('Agent review stream was empty.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completeResult: AgentReviewResult | null = null;
    let streamError: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.length === 0) {
          continue;
        }

        const event = JSON.parse(trimmedLine) as AgentEvent;

        if (event.type === 'error') {
          streamError = event.message;
        }

        completeResult = handleAgentEvent(event) ?? completeResult;
        await yieldToBrowser();
      }

      if (done) {
        break;
      }
    }

    const finalLine = buffer.trim();

    if (finalLine.length > 0) {
      const event = JSON.parse(finalLine) as AgentEvent;

      if (event.type === 'error') {
        streamError = event.message;
      }

      completeResult = handleAgentEvent(event) ?? completeResult;
      await yieldToBrowser();
    }

    return {
      result: completeResult,
      errorMessage: streamError,
    };
  }

  function handleInvoiceFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    clearScanExitTimer();
    setSelectedFile(file);
    setAgentError(null);
    setLastExtractedLineCount(0);
    setLiveAgentSteps([]);

    if (file) {
      const sizeError = invoiceUploadError(file);
      setScanPreviewVisible(true);

      if (sizeError) {
        setScanPreviewPhase('failed');
        setAgentStatus('failed');
        setAgentError(sizeError);
        setAgentMessage(sizeError);
      } else {
        setScanPreviewPhase('ready');
        setAgentStatus('idle');
        setAgentMessage(`${file.name} ready for backend review.`);
      }
    } else {
      setScanPreviewVisible(false);
      setScanPreviewPhase('ready');
      setAgentStatus('idle');
      setAgentMessage('Upload an invoice to run backend review.');
    }
  }

  async function startBackendReview(): Promise<void> {
    if (!selectedFile) {
      setAgentStatus('failed');
      setAgentError('Choose an invoice file before running review.');
      setAgentMessage('Choose an invoice file before running review.');
      return;
    }

    const sizeError = invoiceUploadError(selectedFile);

    if (sizeError) {
      setAgentStatus('failed');
      setAgentError(sizeError);
      setAgentMessage(sizeError);
      return;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    clearItemRevealTimers();
    clearScanExitTimer();
    invoiceLineByIdRef.current = new Map();
    setItems([]);
    setSelectedId(null);
    setSelectedCategory('All');
    setSearchQuery('');
    setEvidenceExpanded(false);
    setAgentTraceExpanded(false);
    setLiveAgentSteps([]);
    setDecision('');
    setReason('');
    setVisibleItemCount(0);
    setScanPreviewVisible(true);
    setScanPreviewPhase('upload');
    setLastExtractedLineCount(0);
    setAgentStatus('running');
    setAgentError(null);
    setAgentMessage(`Uploading ${selectedFile.name} to backend workflow.`);

    const formData = new FormData();
    formData.append('invoice', selectedFile);
    formData.append('mode', agentReviewMode);

    try {
      const response = await fetch('/api/agent-review', {
        method: 'POST',
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

      const streamResult = await readAgentStream(response);

      if (streamResult.errorMessage) {
        throw new Error(streamResult.errorMessage);
      }

      if (!streamResult.result) {
        throw new Error('Backend workflow ended without a completion event.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        clearScanExitTimer();
        setScanPreviewVisible(true);
        setScanPreviewPhase('failed');
        setAgentStatus('failed');
        setAgentError('Backend review was canceled.');
        setAgentMessage('Backend review was canceled.');
        return;
      }

      const message =
        error instanceof Error ? error.message : 'Agent review request failed.';
      clearScanExitTimer();
      setScanPreviewVisible(true);
      setScanPreviewPhase('failed');
      setAgentStatus('failed');
      setAgentError(message);
      setAgentMessage(message);
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  }

  function cancelBackendReview(): void {
    abortControllerRef.current?.abort();
  }

  // Dynamic values for decision option buttons
  const getDecisionOptionStyle = (v: string, label: string) => {
    const on = decision === v;
    
    if (v === 'reject') {
      return (
        <button
          key={v}
          onClick={() => setDecision(v)}
          className={`cursor-pointer font-sans text-[12.5px] px-4 py-1.5 rounded transition-all duration-150 active:scale-95 border ${
            on 
              ? 'bg-rose-600 text-white border-transparent font-bold shadow-sm ring-2 ring-rose-500 ring-offset-1' 
              : 'bg-rose-600 text-white border-transparent shadow-sm font-semibold hover:bg-rose-700'
          }`}
        >
          {label}
        </button>
      );
    }

    // Approve, Partial, Escalate
    return (
      <button
        key={v}
        onClick={() => setDecision(v)}
        className={`cursor-pointer font-sans text-[12.5px] px-4 py-1.5 rounded transition-all duration-150 active:scale-95 border ${
          on 
            ? 'bg-slate-800 text-white border-slate-800 font-bold shadow-sm' 
            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 font-medium'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden font-sans text-slate-800 bg-slate-50 antialiased">
      
      {/* ============ PROJECT HEADER ============ */}
      <header className="flex-none bg-white border-b border-slate-200">
        <div className="px-5 py-2.5 flex items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            {/* Custom high-contrast ClienTrial logo */}
            <div className="w-8 h-8 rounded bg-[#0f766e] flex items-center justify-center border border-teal-900/10">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-[19px] font-bold tracking-tight text-slate-800">Clien</span>
              <span className="text-[19px] font-bold tracking-tight text-teal-700">Trial</span>
            </div>
            <span className="hidden sm:inline-block ml-3 font-mono text-[10px] tracking-widest text-[#64748b] border-l border-slate-200 pl-3 uppercase">
              Workspace
            </span>
          </div>
          
          <form
            className="flex items-center justify-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void startBackendReview();
            }}
          >
            <div className={`hidden lg:flex items-center gap-2 font-mono text-[11px] px-3 py-2 border transition-all duration-200 rounded ${agentStatusStyle}`}>
              {agentStatus === 'failed' ? (
                <AlertCircle className="w-3.5 h-3.5" />
              ) : agentStatus === 'done' ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <span className={`w-2 h-2 rounded-full ${isAgentRunning ? 'animate-pulse bg-blue-500' : items.length === 0 ? 'bg-slate-400' : riskCount > 0 ? 'bg-rose-500' : 'bg-teal-600'}`}></span>
              )}
              {isAgentRunning
                ? 'Backend running'
                : agentStatus === 'done'
                  ? 'Backend complete'
                  : agentStatus === 'failed'
                    ? 'Backend issue'
                    : items.length === 0
                      ? 'No invoice lines'
                      : riskCount > 0
                      ? `${riskCount} items need decision`
                      : 'All items cleared'}
            </div>

            <label
              className={`min-h-11 cursor-pointer flex items-center gap-2 rounded border px-3 text-[11px] font-bold transition-all duration-150 active:scale-95 ${
                isAgentRunning
                  ? 'pointer-events-none border-slate-200 bg-slate-100 text-slate-400'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              htmlFor="invoice-upload"
            >
              <FileText className="w-3.5 h-3.5" />
              {selectedFile ? 'Replace invoice' : 'Upload invoice'}
            </label>
            <input
              accept={acceptedInvoiceFileTypes}
              className="sr-only"
              disabled={isAgentRunning}
              id="invoice-upload"
              onChange={handleInvoiceFileChange}
              ref={invoiceInputRef}
              type="file"
            />

            <button
              className={`min-h-11 rounded px-3 text-[11px] font-bold transition-all duration-150 active:scale-95 ${
                canRunAgent
                  ? 'cursor-pointer bg-[#0f766e] text-white hover:bg-teal-800'
                  : 'cursor-not-allowed bg-slate-200 text-slate-500'
              }`}
              disabled={!canRunAgent}
              type="submit"
            >
              {isAgentRunning ? 'Running...' : 'Run review'}
            </button>

            {canResetAnalysis && (
              <button
                aria-label="Reset analysis"
                className="min-h-11 cursor-pointer whitespace-nowrap rounded border border-slate-300 bg-white px-3 text-[11px] font-bold text-slate-600 transition-all duration-150 hover:bg-slate-50 hover:text-slate-900 active:scale-95"
                onClick={resetAnalysis}
                title="Reset analysis"
                type="button"
              >
                <span className="inline-flex items-center gap-2">
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reset analysis</span>
                </span>
              </button>
            )}

            {isAgentRunning && (
              <button
                aria-label="Cancel backend review"
                className="min-h-11 min-w-11 cursor-pointer rounded border border-slate-300 bg-white px-3 text-slate-500 transition-all duration-150 hover:bg-slate-50 hover:text-slate-800 active:scale-95"
                onClick={cancelBackendReview}
                type="button"
              >
                <X className="mx-auto h-3.5 w-3.5" />
              </button>
            )}

          </form>
        </div>

        {/* Protocol Metadata Subheader */}
        <div className="px-5 py-1.5 border-t border-slate-200 flex items-center gap-2.5 flex-wrap bg-slate-50 text-xs">
          <span className="font-mono font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded text-[11px]">
            <span className="mr-1 font-sans font-bold text-teal-900/60">Protocol</span>
            CTJ301UC201
          </span>
          <span className="font-semibold text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded text-[11px]">
            <span className="mr-1 font-bold text-slate-500">Phase</span>
            II
          </span>
          <span className="text-slate-500 font-medium">NeonBlanc Hospital</span>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <span
              className={`inline-flex min-w-0 max-w-[460px] items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[10px] tracking-wider ${agentStatusStyle}`}
              role={agentError ? 'alert' : 'status'}
            >
              <span className={`h-1.5 w-1.5 flex-none rounded-full ${isAgentRunning ? 'animate-pulse bg-blue-500' : agentStatus === 'failed' ? 'bg-rose-500' : agentStatus === 'done' ? 'bg-teal-700' : 'bg-slate-400'}`}></span>
              <span className="truncate">
              {compactText(agentMessage, 76)}
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* ============ CORE WORKSPACE BODY ============ */}
      <main className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[260px_1.5fr_1fr] divide-x divide-slate-200">
        
        {/* LEFT COLUMN: Line Items Navigator */}
        <section className="flex flex-col min-h-0 bg-slate-50/50">
          {/* Header & Stats */}
          <div className="flex-none p-3 border-b border-slate-200 bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] tracking-wider uppercase text-slate-500 font-semibold">
                Line items
              </span>
              <span className="font-mono text-[10px] text-slate-400 font-semibold">
                {items.length > 0
                  ? `${items.filter(i => i.status === 'pass').length} / ${items.length} Cleared`
                  : 'Awaiting upload'}
              </span>
            </div>

            {/* Quick search input */}
            <div className="relative mb-2">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </span>
              <input
                type="text"
                placeholder="Search code, desc..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1 bg-white border border-slate-200 rounded text-[11px] placeholder-slate-400 text-slate-800 focus:outline-none focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-2 flex items-center"
                >
                  <X className="h-3 w-3 text-slate-400 hover:text-slate-800" />
                </button>
              )}
            </div>

            {/* Category pills */}
            <div className="flex gap-1 overflow-x-auto pb-1 mt-1 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-[8.5px] font-mono whitespace-nowrap px-2 py-0.5 rounded cursor-pointer transition-all border ${
                    selectedCategory === cat
                      ? 'bg-[#0f766e] text-white border-[#0f766e]'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {cat.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* List Wrapper */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 font-medium">
                {emptyLineItemsMessage}
              </div>
            ) : (
              <AnimatePresence initial={false} mode="popLayout">
                {visibleFilteredItems.map((item, itemIndex) => {
                const meta = getStatusMeta(item.status);
                const isSelected = item.id === selectedId;

                if (!isSelected) {
                  return (
                    <motion.div
                      key={item.id}
                      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
                      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
                      layout={!shouldReduceMotion}
                      onClick={() => handleSelectItem(item.id)}
                      className="group cursor-pointer border-b border-slate-100 transition-colors duration-150 flex items-center justify-between gap-2 hover:bg-slate-100"
                      style={{
                        padding: '8px 14px',
                        borderLeft: '4px solid transparent',
                      }}
                      transition={{
                        delay: motionStaggerDelay(itemIndex, shouldReduceMotion),
                        duration: shouldReduceMotion ? 0.01 : 0.18,
                      }}
                      id={`sidebar-item-compact-${item.id}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: meta.dot }}></span>
                        <span className="font-mono tracking-tight text-[10px] font-bold text-slate-500 group-hover:text-teal-700 truncate">
                          {item.id}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="font-mono tracking-tight text-[10.5px] font-bold text-slate-700">
                          {item.amount}
                        </span>
                        <span
                          className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-sm select-none"
                          style={{ color: meta.color, backgroundColor: meta.bg }}
                        >
                          {meta.label}
                        </span>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={item.id}
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
                    initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
                    layout={!shouldReduceMotion}
                    onClick={() => handleSelectItem(item.id)}
                    className="group cursor-pointer p-3 border-b border-slate-100 transition-colors duration-150 flex flex-col gap-1 bg-white"
                    style={{
                      borderLeft: '4px solid #0f766e',
                    }}
                    transition={{
                      delay: motionStaggerDelay(itemIndex, shouldReduceMotion),
                      duration: shouldReduceMotion ? 0.01 : 0.18,
                    }}
                    id={`sidebar-item-active-${item.id}`}
                  >
                    <div className="flex justify-between items-center gap-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.dot }}></span>
                        <span className="font-mono tracking-tight text-[11px] font-bold text-[#0f766e]">
                          {item.id}
                        </span>
                      </span>
                      <span className="font-mono tracking-tight text-[12px] font-bold text-slate-800">
                        {item.amount}
                      </span>
                    </div>
                    
                    <div className="text-[12px] font-bold text-slate-800 leading-snug">
                      {item.desc}
                    </div>

                    <div className="flex justify-between items-center mt-0.5">
                      <span className="font-mono text-[8.5px] text-slate-400 font-semibold uppercase tracking-wider">
                        {item.cat}
                      </span>
                      <span
                        className="text-[9px] font-bold px-2 py-0.5 rounded-sm select-none border"
                        style={{ 
                          color: meta.color, 
                          backgroundColor: meta.bg, 
                          borderColor: meta.border || 'transparent' 
                        }}
                      >
                        {meta.label}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
              </AnimatePresence>
            )}
          </div>
        </section>

        {/* MIDDLE COLUMN: Protocol Evidence Core & Auditor Form */}
        <section className="flex flex-col min-h-0 bg-slate-50/30">
          {/* Header Area */}
          <div className="flex-none p-4 pb-3.5 border-b border-slate-200 bg-white">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-base font-bold tracking-tight text-slate-800">Protocol evidence</span>
              {selectedItem ? (
                <>
                  <span className="font-mono tracking-tight text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                    {selectedItem.id}
                  </span>
                  <span
                    className="text-[10px] font-bold px-2.5 py-0.5 rounded-sm border"
                    style={{
                      color: selMeta.color,
                      backgroundColor: selMeta.bg,
                      borderColor: selMeta.border || 'transparent'
                    }}
                  >
                    {selMeta.label}
                  </span>

                  {/* Toggle to turn on/off AI Notes dynamically */}
                  <button
                    onClick={() => setShowAiNotes(!showAiNotes)}
                    className={`ml-auto flex items-center gap-1.5 text-[10.5px] font-bold px-2.5 py-1 rounded transition-all border ${
                      showAiNotes
                        ? 'bg-[#3b427a] text-white border-[#3b427a]'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {showAiNotes ? 'AI Notes Active' : 'Show AI Notes'}
                  </button>
                </>
              ) : (
                <span className="font-mono text-[10px] font-bold tracking-wider text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded">
                  No line selected
                </span>
              )}
            </div>
            
            {selectedItem ? (
              <div className="text-[13px] text-slate-700 mt-1.5 font-semibold">
                {selectedItem.desc}{' '}
                <span className="text-slate-400 font-normal">
                  · <span className="font-mono tracking-tight">{selectedItem.amount}</span> · {selectedItem.meta}
                </span>
              </div>
            ) : (
              <div className="text-[13px] text-slate-500 mt-1.5 font-medium">
                No invoice evidence has been loaded.
              </div>
            )}
          </div>

          {/* Scrollable Evidence Area */}
          <div className="flex-1 overflow-y-auto min-h-0 p-5">
            <AnimatePresence initial={false} mode="wait">
            {shouldShowInvoiceScanPreview ? (
              <InvoiceScanPreview
                key="invoice-scan-preview"
                canRunReview={canRunAgent}
                fileName={selectedFile.name}
                fileType={selectedFile.type}
                lineCount={lastExtractedLineCount}
                message={agentMessage}
                onRunReview={() => {
                  void startBackendReview();
                }}
                phase={scanPreviewPhase}
                previewUrl={invoicePreviewUrl}
              />
            ) : (
              <motion.div
                key={selectedItem ? `workspace-${selectedItem.id}-${selectedEvidenceReady ? 'ready' : 'pending'}` : 'workspace-empty'}
                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                className="h-full"
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                transition={{
                  duration: shouldReduceMotion ? 0.01 : 0.18,
                }}
              >
              {selectedItem ? (
              selectedEvidenceReady ? (
                <>
            
            {/* AI SYNTHESIS HERO CARD */}
            <div 
              className={`border border-l-4 p-4 mb-5 transition-all duration-200 rounded shadow-sm ${evidenceHeroTone.card}`}
            >
              <div className="flex items-center gap-2.5 mb-2.5">
                <span 
                  className={`font-mono text-[9.5px] font-bold tracking-widest text-white px-2 py-0.5 rounded-sm ${evidenceHeroTone.badge}`}
                >
                  AI SYNTHESIS
                </span>
                <span className={`text-xs font-bold ${evidenceHeroTone.text}`}>
                  {evidenceHeroTone.label}
                </span>
                <span className="ml-auto font-mono text-[10px] text-slate-400 font-semibold">
                  {prioritizedEvidence.length} sources analyzed
                </span>
              </div>
              <div className="text-[13.5px] text-slate-800 leading-relaxed font-medium">
                {selectedItem.summary}
              </div>
            </div>

            {/* EVIDENCE - CROSS-REFERENCE MAPPING Accordion */}
            {(() => {
              const conflictCount = prioritizedEvidence.filter(ev => ev.verdict === 'conflict').length;
              const warnCount = prioritizedEvidence.filter(ev => ev.verdict === 'warn').length;
              return (
                <div className="mb-6">
                  <button
                    onClick={() => setEvidenceExpanded(!evidenceExpanded)}
                    className="w-full flex items-center justify-between p-3.5 bg-white border border-slate-200 hover:bg-slate-50 rounded transition-all cursor-pointer shadow-sm group"
                    id="evidence-accordion-trigger"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-2 w-2 relative">
                        {conflictCount > 0 && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        )}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${conflictCount > 0 ? 'bg-rose-500' : 'bg-amber-500'}`}></span>
                      </span>
                      <span className="font-sans text-[13.5px] font-bold text-slate-800 group-hover:text-teal-700 transition-colors">
                        View Evidence Sources ({conflictCount} {conflictCount === 1 ? 'Conflict' : 'Conflicts'}{warnCount > 0 ? `, ${warnCount} Warning${warnCount === 1 ? '' : 's'}` : ''})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 font-semibold group-hover:text-teal-700 transition-colors">
                      <span>{evidenceExpanded ? 'Collapse' : 'Expand'}</span>
                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 stroke-[2.5] ${evidenceExpanded ? 'rotate-180 text-teal-700' : 'text-slate-400'}`} />
                    </div>
                  </button>

                  {evidenceExpanded && (
                    <div
                      className="mt-4 flex flex-col gap-3"
                      id="evidence-accordion-content"
                      key={`${selectedItem.id}-${resultSequenceKey}`}
                    >
                      {prioritizedEvidence.map((ev, idx) => {
                        const verdict = getVerdictMeta(ev.verdict);
                        return (
                          <div
                            key={`${ev.src}-${ev.ref}-${idx}`}
                            className="evidence-source-enter bg-white border rounded p-4 transition-all hover:shadow-sm"
                            style={{
                              borderColor: verdict.border,
                              animationDelay: staggerDelay(idx),
                            }}
                          >
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded tracking-wider">
                                {getSourceLabel(ev.src)}
                              </span>
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-sm"
                                style={{ color: verdict.color, backgroundColor: verdict.bg }}
                              >
                                {verdict.label}
                              </span>
                            </div>

                            <div
                              className="font-mono text-[11px] text-teal-700 font-semibold mb-1.5"
                              title={ev.locator}
                            >
                              {ev.ref}
                            </div>

                            {ev.locator && (
                              <details className="group mb-2">
                                <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-700 [&::-webkit-details-marker]:hidden">
                                  Audit locator
                                  <ChevronDown className="h-3 w-3 stroke-[2.5] text-slate-400 transition-transform group-open:rotate-180" />
                                </summary>
                                <div className="mt-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] leading-relaxed text-slate-500 break-all">
                                  {ev.locator}
                                </div>
                              </details>
                            )}

                            <div className="text-[13px] text-slate-700 leading-relaxed">
                              {ev.text}
                            </div>

                            {/* AI Notes - with showAiNotes toggle state */}
                            {showAiNotes && (
                              (() => {
                                const aiStyle = ev.verdict === 'conflict'
                                  ? { bg: '#fff1f2', border: '#f43f5e', badgeBg: '#e11d48', text: '#e11d48' }
                                  : ev.verdict === 'warn'
                                  ? { bg: '#fffbeb', border: '#fde68a', badgeBg: '#d97706', text: '#b45309' }
                                  : ev.verdict === 'match'
                                  ? { bg: '#f0fdfa', border: '#99f6e4', badgeBg: '#0f766e', text: '#0f766e' }
                                  : { bg: '#f8fafc', border: '#cbd5e1', badgeBg: '#475569', text: '#334155' };
                                return (
                                  <div 
                                    className="mt-3.5 flex gap-2.5 items-start border-l-2 rounded-r p-2.5 transition-all"
                                    style={{ backgroundColor: aiStyle.bg, borderLeftColor: aiStyle.border }}
                                  >
                                    <span 
                                      className="font-mono text-[9px] font-bold text-white px-1.5 py-0.5 rounded-sm mt-0.5 select-none"
                                      style={{ backgroundColor: aiStyle.badgeBg }}
                                    >
                                      AI
                                    </span>
                                    <span className="text-[12px] leading-relaxed" style={{ color: aiStyle.text }}>
                                      {ev.ai}
                                    </span>
                                  </div>
                                );
                              })()
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
                </>
              ) : (
                <div className="h-full min-h-[280px] flex items-center justify-center text-center">
                  <div className="max-w-xs">
                    <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded border border-blue-100 bg-blue-50 text-blue-500">
                      <Activity className={`h-4 w-4 ${isAgentRunning ? 'animate-pulse' : ''}`} />
                    </div>
                    <div className="text-[13px] font-bold text-slate-700">
                      Evidence search in progress
                    </div>
                    <div className="mt-1 text-[12px] leading-relaxed text-slate-400">
                      Evidence cards will appear here as soon as source ranking completes for this line.
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="h-full min-h-[280px] flex items-center justify-center text-center">
                <div className="max-w-xs">
                  <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded border border-slate-200 bg-white text-slate-400">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="text-[13px] font-bold text-slate-700">
                    No evidence packet yet
                  </div>
                  <div className="mt-1 text-[12px] leading-relaxed text-slate-400">
                    Upload an invoice and run review to populate evidence sources.
                  </div>
                </div>
              </div>
            )}
              </motion.div>
            )}
            </AnimatePresence>
          </div>

          {/* STICKY BOTTOM AUDITOR DECISION BAR */}
          {selectedItem ? (
          <div className="flex-none bg-slate-100/50 border-t border-slate-200/80 p-4 transition-all duration-300">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm bg-teal-700"></span>
                <span className="font-mono text-[11px] font-bold tracking-wider text-teal-700">
                  AUDITOR DECISION
                </span>
                <span className="text-xs text-slate-500 hidden sm:inline">
                  AI recommends <strong style={{ color: selBand.accent }}>{getRecVerb(selectedItem.band)}</strong> — human sign-off required
                </span>
              </div>
              
              <span className="font-mono text-[10.5px] font-semibold text-slate-600 bg-slate-200/50 px-2 py-0.5 rounded">
                <span className="font-mono tracking-tight">{selectedItem.id}</span> · <span className="font-mono tracking-tight">{selectedItem.amount}</span>
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {/* Row 1: Decision options and inline Quick Sign if applicable */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white/60 p-2 rounded-lg border border-slate-200/50">
                <div className="flex gap-1.5 flex-wrap">
                  {getDecisionOptionStyle('approve', 'Approve')}
                  {getDecisionOptionStyle('partial', 'Partial')}
                  {getDecisionOptionStyle('escalate', 'Escalate')}
                  {getDecisionOptionStyle('reject', 'Reject')}
                </div>

                {/* Quick sign action for Approve or Partial (since justification is optional) */}
                {(decision === 'approve' || decision === 'partial') && (
                  <button
                    onClick={handleSubmit}
                    className="cursor-pointer font-sans text-[12px] font-bold px-4 py-1.5 rounded bg-teal-700 text-white hover:bg-teal-800 transition-all duration-150 active:scale-95 shadow-sm"
                  >
                    Quick Sign &amp; Log
                  </button>
                )}
              </div>

              {/* Collapsible area for Mandatory Justification (Reject / Escalate) */}
              <div 
                className={`transition-all duration-300 ease-in-out overflow-hidden ${
                  (decision === 'reject' || decision === 'escalate') 
                    ? 'max-h-56 opacity-100 mt-1' 
                    : 'max-h-0 opacity-0 pointer-events-none'
                }`}
              >
                <div className="flex gap-4 flex-col lg:flex-row items-stretch pt-2 border-t border-slate-200/50">
                  <div className="flex-1 flex flex-col gap-2">
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={
                        decision === 'reject' 
                          ? "Mandatory justification — state the evidence-based rationale for Rejecting this line item…" 
                           : "Mandatory justification — explain the reasons for Escalating this to review board…"
                      }
                      className="w-full h-14 resize-none font-sans text-[12px] text-slate-800 leading-relaxed p-2 border border-slate-200 rounded outline-none bg-white focus:border-teal-700 focus:ring-1 focus:ring-teal-700 transition-all placeholder-slate-400"
                    ></textarea>
                  </div>

                  <div className="flex-none flex flex-row lg:flex-col justify-between items-end gap-2.5">
                    <div className="text-right text-[11px] text-slate-400 leading-tight hidden lg:block">
                      <span className="text-slate-600 font-bold">Dr. E. Vance</span>
                      <br />
                      <span className="font-mono text-[9.5px]">AUD-0231 · signed</span>
                    </div>
                    <button
                      disabled={!canSubmit}
                      onClick={handleSubmit}
                      className="cursor-pointer font-sans text-[12.5px] font-bold px-4 py-2 rounded whitespace-nowrap transition-all duration-150 active:scale-95 border border-transparent shadow-sm"
                      style={{
                        backgroundColor: canSubmit ? (decision === 'reject' ? '#dc2626' : '#1e293b') : '#cbd5e1',
                        color: canSubmit ? '#FFFFFF' : '#64748b',
                      }}
                    >
                      Sign &amp; Log {decision === 'reject' ? 'Rejection' : 'Escalation'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          ) : (
            <div className="flex-none bg-slate-100/50 border-t border-slate-200/80 p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-sm bg-slate-300"></span>
                  <span className="font-mono text-[11px] font-bold tracking-wider text-slate-500">
                    AUDITOR DECISION
                  </span>
                </div>
                <span className="font-mono text-[10.5px] font-semibold text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded">
                  No line selected
                </span>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: Compliance Engine & Audit Trail */}
        <section className="flex flex-col min-h-0 bg-white">
          <div className="flex-none p-4 border-b border-slate-200">
            <span className="text-base font-bold tracking-tight text-slate-800">Compliance boundary engine</span>
            <div className="text-xs text-slate-400 mt-0.5">AI assessment mapped to GCP rules</div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-5 bg-slate-50/20">
            <AnimatePresence initial={false} mode="wait">
            {shouldShowBoundaryResult && selectedItem ? (
              <motion.div
                key={`boundary-result-${selectedItem.id}-${resultSequenceKey}`}
                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                className="min-h-full"
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                transition={{ duration: shouldReduceMotion ? 0.01 : 0.2 }}
              >
            {/* HERO SCORE & CONFIDENCE BLOCK */}
            <div 
              className={`border p-4.5 transition-all duration-200 rounded shadow-sm ${
                selectedItem.complianceScore < 85
                  ? 'bg-rose-50/40 border-rose-200'
                  : 'bg-teal-50/40 border-teal-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className={`font-mono text-[10px] tracking-wider uppercase font-semibold ${
                    selectedItem.complianceScore < 85 ? 'text-rose-600' : 'text-teal-700'
                  }`}>
                    Compliance score
                  </div>
                  <div 
                    className={`text-[60px] font-semibold tracking-tighter leading-none mt-1.5 font-mono tabular-nums ${
                      selectedItem.complianceScore < 85 ? 'text-rose-600' : 'text-teal-700'
                    }`}
                  >
                    {selectedItem.complianceScore}%
                  </div>
                  <div className={`text-[12.5px] font-bold mt-1.5 ${
                    selectedItem.complianceScore < 85 ? 'text-rose-600' : 'text-teal-700'
                  }`}>
                    {selBand.label}
                  </div>
                </div>
                
                <div className={`text-right border-l pl-4 ${
                  selectedItem.complianceScore < 85 ? 'border-rose-200' : 'border-teal-200'
                }`}>
                  <div className="font-mono text-[10px] tracking-wider uppercase text-slate-500 font-semibold">
                    AI confidence
                  </div>
                  <div className="text-[32px] font-semibold tracking-tighter text-slate-700 leading-tight mt-1.5 font-mono tabular-nums">
                    {selectedItem.aiConfidence}%
                  </div>
                  <div className="text-[10.5px] text-slate-400 mt-0.5 font-medium">model certainty</div>
                </div>
              </div>
            </div>

            {/* Threshold Gauge Block */}
            <div className="mt-4 border border-slate-200 rounded p-4 relative bg-white shadow-sm">
              <div className="flex items-center gap-1.5 mb-4 select-none">
                <span className="font-mono text-[9.5px] tracking-wider uppercase text-slate-500 font-semibold">
                  Boundary threshold gauge
                </span>
                <div 
                  className="relative flex items-center"
                  onMouseEnter={() => setShowGaugeTooltip(true)}
                  onMouseLeave={() => setShowGaugeTooltip(false)}
                >
                  <button 
                    onClick={() => setShowGaugeTooltip(!showGaugeTooltip)}
                    className="p-0.5 rounded hover:bg-slate-100 transition-all text-slate-400 hover:text-slate-800 cursor-pointer"
                    id="gauge-info-button"
                  >
                    <Info className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                  {showGaugeTooltip && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 bg-slate-900 text-white text-[11.5px] leading-relaxed rounded p-3 shadow-lg z-50 pointer-events-auto border border-slate-800">
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-[6px] border-transparent border-t-slate-900"></div>
                      The compliance engine never auto-rejects. Line items with safety or protocol deviations scoring below the <strong className="text-teal-400">auto-clear boundary (85%)</strong> are routed to human auditors.
                    </div>
                  )}
                </div>
              </div>
              
              {/* Dynamic pointer position */}
              <div className="relative h-7">
                <div 
                  className="absolute top-0 transform -translate-x-1/2 flex flex-col items-center transition-all duration-300"
                  style={{ left: `${selectedItem.complianceScore}%` }}
                >
                  <span 
                    className="font-mono tracking-tight text-[10px] font-bold text-white px-1.5 py-0.5 rounded shadow-sm animate-pulse"
                    style={{ backgroundColor: selBand.accent }}
                  >
                    {selectedItem.complianceScore}%
                  </span>
                  <span className="w-0.5 h-1.5" style={{ backgroundColor: selBand.accent }}></span>
                </div>
              </div>

              {/* Gauge Bar */}
              <div className="relative mt-0.5">
                <div className="flex h-1.5 rounded overflow-hidden">
                  <div className="w-[40%] bg-rose-500" title="Hold zone (0-40%)"></div>
                  <div className="w-[45%] bg-amber-500" title="Auditor review zone (40-85%)"></div>
                  <div className="w-[15%] bg-teal-600" title="Auto-clear zone (85-100%)"></div>
                </div>
                {/* 85% Auto-clear threshold line */}
                <div className="absolute left-[85%] top-[-4px] bottom-[-4px] border-l-2 border-dashed border-slate-900/60" title="Auto-clear threshold at 85%"></div>
                {/* Precise black vertical indicator cutting through the gauge bar */}
                <div 
                  className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-black z-10 shadow-sm transition-all duration-300" 
                  style={{ left: `${selectedItem.complianceScore}%` }}
                >
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-full w-0 h-0 border-[3.5px] border-transparent border-t-black"></div>
                </div>
              </div>

              {/* Gauge labels */}
              <div className="flex justify-between mt-2.5 font-mono text-[9px] tracking-wider text-slate-400 font-bold uppercase select-none">
                <span className="text-rose-600">Hold</span>
                <span className="text-amber-600">Auditor review</span>
                <span className="text-teal-700">Auto-clear (85%)</span>
              </div>
            </div>

            {/* GCP Rules mapped */}
            <div className="mt-4">
              <div className="font-mono text-[9.5px] tracking-wider uppercase text-slate-500 font-semibold mb-2">
                GCP rule mapping
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedItem.gcpRules.map((rule) => (
                  <span 
                    key={rule}
                    className="font-mono text-[10.5px] text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded"
                  >
                    {rule}
                  </span>
                ))}
              </div>
            </div>

            {/* Bottom recommendation card */}
            <div 
              className="mt-4 border-l-4 p-3.5 transition-all duration-200 rounded shadow-sm"
              style={{
                backgroundColor: selBand.bg,
                borderColor: selBand.border,
                borderLeftColor: selBand.accent
              }}
            >
              <div className="flex items-center mb-2">
                <span className="font-mono text-[9.5px] font-bold tracking-widest text-white bg-[#3b427a] px-2 py-0.5 rounded-sm select-none">
                  AI RECOMMENDATION
                </span>
              </div>
              <div className="text-[13px] text-slate-800 leading-relaxed font-medium">
                {selectedItem.rec}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11.5px] font-bold" style={{ color: selBand.accent }}>
                <span className="text-[13px]">&rarr;</span> {getBandRouting(selectedItem.band)}
              </div>
            </div>
              </motion.div>
            ) : shouldShowLiveAgentTrace ? (
              <LiveAgentTracePanel
                key="live-agent-trace"
                agentMessage={agentMessage}
                agentStatus={agentStatus}
                shouldReduceMotion={shouldReduceMotion}
                steps={liveAgentSteps}
              />
            ) : (
              <motion.div
                key="boundary-empty"
                animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                className="h-full min-h-[360px] flex items-center justify-center text-center"
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                transition={{ duration: shouldReduceMotion ? 0.01 : 0.18 }}
              >
                <div className="max-w-xs">
                  <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded border border-slate-200 bg-white text-slate-400">
                    <SlidersHorizontal className="h-4 w-4" />
                  </div>
                  <div className="text-[13px] font-bold text-slate-700">
                    {selectedItem ? 'Boundary evaluation in progress' : 'No boundary result yet'}
                  </div>
                  <div className="mt-1 text-[12px] leading-relaxed text-slate-400">
                    {selectedItem
                      ? 'Compliance score and routing will appear as soon as the agent emits a boundary decision.'
                      : 'Compliance scores appear after backend review completes.'}
                  </div>
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>

          {/* BOTTOM TRACE AND AUDIT LOGS */}
          <div className="flex-none bg-slate-50/50 border-t border-slate-200/60">
            <button
              aria-expanded={agentTraceExpanded}
              className="w-full cursor-pointer px-5 py-3 flex items-center justify-between select-none hover:bg-slate-100/60 transition-all text-slate-500 hover:text-slate-800"
              onClick={() => setAgentTraceExpanded((isExpanded) => !isExpanded)}
              type="button"
            >
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-slate-400 stroke-[2.5]" />
                <span className="font-mono text-[10px] font-bold tracking-wider uppercase text-slate-600">
                  AGENT TRACE
                </span>
                <span className="font-mono text-[8.5px] bg-slate-200/60 text-slate-600 px-1.5 py-0.5 rounded font-semibold select-none">
                  SAVED · {agentTraceLog.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[10px] font-semibold text-slate-400">
                  {agentTraceExpanded ? 'Hide trace' : 'Read trace'}
                </span>
                <div className="transition-transform duration-200" style={{ transform: agentTraceExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 stroke-[2.5]" />
                </div>
              </div>
            </button>

            {agentTraceExpanded && (
              <div className="max-h-64 overflow-y-auto border-t border-slate-150 bg-white divide-y divide-slate-100">
                {agentTraceLog.length === 0 ? (
                  <div className="px-5 py-4 text-[11px] font-medium text-slate-400">
                    No saved agent trace yet.
                  </div>
                ) : (
                  <>
                    <div className="px-5 py-2 flex items-center justify-between gap-3 bg-slate-50/70">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Latest run
                      </span>
                      <span className="min-w-0 truncate font-mono text-[9.5px] font-semibold text-slate-500">
                        {agentTraceRunLabel}
                      </span>
                    </div>
                    {agentTraceLog.map((entry, idx) => (
                      <div
                        key={entry.id}
                        className="trace-log-enter px-5 py-2.5 hover:bg-slate-50/50 transition-colors"
                        style={{ animationDelay: staggerDelay(idx) }}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-0.5 rounded px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase ${
                              entry.status
                                ? traceStatusStyles[entry.status]
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {entry.status ?? 'done'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <span className="font-mono text-[9px] text-slate-400">
                                {traceTimeLabel(entry.at)}
                              </span>
                              <span className="font-mono text-[9px] font-bold uppercase text-slate-500">
                                {traceKindLabels[entry.kind]}
                              </span>
                              <span className="font-mono text-[9px] uppercase text-slate-400">
                                {tracePhaseLabel(entry.phase)}
                              </span>
                              {entry.lineId && (
                                <span className="font-mono text-[9px] font-bold text-emerald-800">
                                  {entry.lineId}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-[11.5px] font-bold leading-snug text-slate-800">
                              {entry.title}
                            </div>
                            {entry.detail && (
                              <div className="mt-1 text-[11px] leading-relaxed text-slate-600">
                                {compactText(entry.detail, 150)}
                              </div>
                            )}
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[8.5px] font-semibold text-slate-500">
                                {traceToolLabel(entry.tool)}
                              </span>
                              {entry.locator && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[8.5px] font-semibold text-slate-500">
                                  {compactText(entry.locator, 40)}
                                </span>
                              )}
                              {entry.sources?.slice(0, 3).map((source, sourceIdx) => (
                                <span
                                  key={`${entry.id}-${source}-${sourceIdx}`}
                                  className="rounded bg-teal-50 px-1.5 py-0.5 font-mono text-[8.5px] font-semibold text-teal-700"
                                >
                                  {evidenceSourceToUiSource[source] ?? source}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            <button
              aria-expanded={trailExpanded}
              className="w-full cursor-pointer px-5 py-3 flex items-center justify-between select-none hover:bg-slate-100/60 transition-all text-slate-500 hover:text-slate-800 border-t border-slate-200/60"
              onClick={() => setTrailExpanded((isExpanded) => !isExpanded)}
              type="button"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-400 stroke-[2.5]" />
                <span className="font-mono text-[10px] font-bold tracking-wider uppercase text-slate-600">
                  AUDIT TRAIL
                </span>
                <span className="font-mono text-[8.5px] bg-slate-200/60 text-slate-600 px-1.5 py-0.5 rounded font-semibold select-none flex items-center gap-1">
                  <Lock className="w-2 h-2 text-slate-500" /> DECISION RECORDS · {trail.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[10px] font-semibold text-slate-400">
                  {trailExpanded ? 'Hide records' : 'View records'}
                </span>
                <div className="transition-transform duration-200" style={{ transform: trailExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 stroke-[2.5]" />
                </div>
              </div>
            </button>

            {trailExpanded && (
              <div className="max-h-52 overflow-y-auto border-t border-slate-150 bg-white divide-y divide-slate-100">
                {trail.length === 0 ? (
                  <div className="px-5 py-4 text-[11px] font-medium text-slate-400">
                    No audit records yet.
                  </div>
                ) : (
                  trail.map((row, idx) => (
                    <div key={idx} className="px-5 py-2.5 flex items-start gap-2.5 hover:bg-slate-50/50 transition-colors">
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm select-none font-sans"
                        style={{ color: row.actionColor, backgroundColor: row.actionBg }}
                      >
                        {row.action}
                      </span>
                      <div className="min-w-0">
                        <div className="flex gap-2 items-baseline flex-wrap">
                          <span className="font-mono tracking-tight text-[10px] font-bold text-emerald-800">{row.item}</span>
                          <span className="text-[11px] text-slate-700 font-bold">{row.auditor}</span>
                          <span className="font-mono text-[9px] text-slate-400">{row.time}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 leading-relaxed mt-1 font-medium">
                          {row.justification}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
