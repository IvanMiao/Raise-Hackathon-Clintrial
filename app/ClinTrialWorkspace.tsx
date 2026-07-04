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
  User,
  FlaskConical,
  Eye,
  SlidersHorizontal,
  Bookmark,
  Clock
} from 'lucide-react';
import { INITIAL_ITEMS, INITIAL_TRAIL } from './trialData';
import type { AuditTrailEntry, EvidenceItem, TrialItem } from './trialTypes';
import type {
  AgentEvent,
  AgentReviewMode,
  AgentReviewResult,
  AgentTracePhase,
  AgentTraceStatus,
  AgentTraceUpdate,
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

const agentTracePhaseOrder: AgentTracePhase[] = [
  'upload',
  'extraction',
  'planning',
  'search',
  'ranking',
  'evaluation',
];

const agentTracePhaseDefaults: Record<
  AgentTracePhase,
  { title: string; headline: string }
> = {
  upload: {
    title: 'Upload',
    headline: 'Waiting for invoice handoff.',
  },
  extraction: {
    title: 'Extract',
    headline: 'Waiting to read line items.',
  },
  planning: {
    title: 'Plan',
    headline: 'Waiting to plan evidence searches.',
  },
  search: {
    title: 'Search',
    headline: 'Waiting for read-only evidence tools.',
  },
  ranking: {
    title: 'Rank',
    headline: 'Waiting to rank evidence.',
  },
  evaluation: {
    title: 'Evaluate',
    headline: 'Waiting for boundary checks.',
  },
  summary: {
    title: 'Summary',
    headline: 'Waiting to draft reviewer summary.',
  },
};

const agentTraceStatusStyles: Record<AgentTraceStatus, string> = {
  queued: 'border-slate-200 bg-white text-slate-500',
  running: 'agent-step-thinking border-blue-300 bg-blue-50 text-blue-900 shadow-sm',
  done: 'border-teal-200 bg-teal-50 text-teal-800',
  failed: 'border-rose-200 bg-rose-50 text-rose-800',
};

const agentTraceDotStyles: Record<AgentTraceStatus, string> = {
  queued: 'bg-slate-300',
  running: 'bg-blue-500 animate-pulse',
  done: 'bg-teal-600',
  failed: 'bg-rose-500',
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

const boundaryLabels: Record<BoundaryRecommendation['boundary'], string> = {
  'Auto-handle candidate': 'Auto-clear candidate',
  'AI recommend + finance confirm': 'Finance confirm',
  'Human review required': 'Human review',
  'Policy or contract gap': 'Policy gap',
};

function compactText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, ' ').trim();

  if (compacted.length <= maxLength) {
    return compacted;
  }

  return `${compacted.slice(0, maxLength - 3).trimEnd()}...`;
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

function evidenceReference(evidence: EvidenceCard): string {
  if (!evidence.locator) {
    return evidence.sourceName;
  }

  return `${evidence.sourceName} · ${compactText(evidence.locator, 80)}`;
}

function staggerDelay(index: number): string {
  return `${Math.min(index * 45, 270)}ms`;
}

function traceProgressLabel(progress: AgentTraceUpdate['progress']): string | null {
  if (!progress || progress.total <= 0) {
    return null;
  }

  return `${progress.done}/${progress.total}`;
}

function agentTraceStepView(
  phase: AgentTracePhase,
  update: AgentTraceUpdate | undefined,
) {
  const fallback = agentTracePhaseDefaults[phase];

  return {
    id: phase,
    title: update?.title ?? fallback.title,
    headline: update?.headline ?? fallback.headline,
    status: update?.status ?? 'queued',
    progressLabel: traceProgressLabel(update?.progress),
  };
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

function mapAgentResultToItems(result: AgentReviewResult): TrialItem[] {
  return result.extractedLines.map((line) => {
    const recommendation = result.recommendationsByLineId?.[line.id];
    const evidence = result.evidenceByLineId?.[line.id] ?? recommendation?.evidence ?? [];
    const status = recommendationStatus(recommendation);
    const score = recommendation ? Math.round(recommendation.score * 100) : 0;
    const candidateCode =
      result.retrievalPlans?.[line.id]?.candidateItemCodes[0] ?? 'Agent extracted';
    const riskFlags = recommendation?.riskFlags ?? [];
    const summary =
      recommendation?.decisionReason ??
      'Backend agent extracted this invoice line and is preparing evidence review.';
    const mappedEvidence = evidence.map(mapEvidenceCard);

    return {
      id: displayLineId(line),
      amount: formatInvoiceAmount(line.amount),
      desc: line.rawDescription,
      meta: `${line.patientId} · ${line.visitName} · ${result.uploadedInvoice.fileName}`,
      cat: candidateCode,
      status,
      complianceScore: score,
      aiConfidence: averageConfidence(line, evidence),
      band: recommendationBand(status, score),
      summary,
      gcpRules:
        riskFlags.length > 0
          ? riskFlags
          : ['Read-only evidence packet', 'GCP / finance control'],
      rec: recommendation
        ? `${boundaryLabels[recommendation.boundary]} — ${recommendation.decisionReason}`
        : 'Awaiting deterministic boundary evaluation.',
      evidence:
        mappedEvidence.length > 0
          ? mappedEvidence
          : [
              {
                src: 'edc',
                ref: `${result.uploadedInvoice.fileName} · extracted line ${line.lineNumber}`,
                verdict: 'info',
                text: line.rawDescription,
                ai: `Invoice extraction confidence ${(line.extractionConfidence * 100).toFixed(0)}%.`,
              },
            ],
    };
  });
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

export function ClinTrialWorkspace() {
  // App States
  const [items, setItems] = useState<TrialItem[]>(INITIAL_ITEMS);
  const [visibleItemCount, setVisibleItemCount] = useState<number>(INITIAL_ITEMS.length);
  const [resultSequenceKey, setResultSequenceKey] = useState<number>(0);
  const [selectedId, setSelectedId] = useState<string>('LI-0473');
  const [decision, setDecision] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [trailExpanded, setTrailExpanded] = useState<boolean>(false);
  const [trail, setTrail] = useState<AuditTrailEntry[]>(INITIAL_TRAIL);
  const [showAiNotes, setShowAiNotes] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [evidenceExpanded, setEvidenceExpanded] = useState<boolean>(false);
  const [showGaugeTooltip, setShowGaugeTooltip] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentRunStatus>('idle');
  const [agentMessage, setAgentMessage] = useState<string>(
    'Upload an invoice to run backend review.',
  );
  const [agentError, setAgentError] = useState<string | null>(null);
  const [liveTraceCards, setLiveTraceCards] =
    useState<Partial<Record<AgentTracePhase, AgentTraceUpdate>>>({});
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const revealTimersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      revealTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    };
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
  const selectedItem = useMemo(() => {
    return items.find((it) => it.id === selectedId) || items[0];
  }, [items, selectedId]);

  const prioritizedEvidence = useMemo(() => {
    return sortEvidenceByPriority(selectedItem.evidence);
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
  const canSubmit = !!decision && (
    (decision === 'reject' || decision === 'escalate') 
      ? reason.trim().length > 0 
      : true
  );

  const handleSubmit = () => {
    if (!canSubmit) return;

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
  const selMeta = getStatusMeta(selectedItem.status);
  const selBand = getBandMeta(selectedItem.band);
  const agentStatusStyle = agentStatusStyles[agentStatus];
  const isAgentRunning = agentStatus === 'running';
  const selectedFileError = selectedFile ? invoiceUploadError(selectedFile) : null;
  const canRunAgent = selectedFile !== null && selectedFileError === null && !isAgentRunning;
  const hasAgentTrace = isAgentRunning || Object.keys(liveTraceCards).length > 0;
  const agentTraceSteps = useMemo(() => {
    return agentTracePhaseOrder.map((phase) =>
      agentTraceStepView(phase, liveTraceCards[phase]),
    );
  }, [liveTraceCards]);

  // Split audit trail for rendering
  const latestTrail = trail[0];
  const restTrail = trail.slice(1);

  function clearItemRevealTimers(): void {
    revealTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    revealTimersRef.current = [];
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

  function setLocalTraceCard(
    update: Omit<AgentTraceUpdate, 'type' | 'updatedAt'>,
  ): void {
    setLiveTraceCards((currentTraceCards) => ({
      ...currentTraceCards,
      [update.id]: {
        type: 'trace_update',
        ...update,
        updatedAt: new Date().toISOString(),
      },
    }));
  }

  function applyAgentResult(result: AgentReviewResult): void {
    const nextItems = mapAgentResultToItems(result);

    if (nextItems.length > 0) {
      setItems(nextItems);
      setSelectedId(nextItems[0].id);
      setSelectedCategory('All');
      setSearchQuery('');
      setEvidenceExpanded(true);
      revealAgentItems(nextItems);
    }

    setTrail((prevTrail) => [auditEntryFromAgentResult(result), ...prevTrail]);
    setLastRunId(result.runId);
    setAgentStatus('done');
    setAgentError(null);
    setAgentMessage(
      `Backend workflow completed · ${result.extractedLines.length} lines mapped`,
    );
  }

  function handleAgentEvent(event: AgentEvent): AgentReviewResult | null {
    if (event.type === 'started') {
      setLastRunId(event.runId);
      setAgentMessage(`Backend workflow started · ${event.runId.slice(0, 8)}`);
      return null;
    }

    if (event.type === 'trace_update') {
      setLiveTraceCards((currentTraceCards) => ({
        ...currentTraceCards,
        [event.id]: event,
      }));
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
      setAgentMessage(`Extracted ${event.lines.length} invoice lines.`);
      return null;
    }

    if (event.type === 'retrieval_plan') {
      setAgentMessage(`Retrieval plan ready for ${event.lineId}.`);
      return null;
    }

    if (event.type === 'evidence') {
      setAgentMessage(`Ranked ${event.evidence.length} evidence cards for ${event.lineId}.`);
      return null;
    }

    if (event.type === 'decision') {
      setAgentMessage(`${event.lineId}: ${event.recommendation.boundary}.`);
      return null;
    }

    if (event.type === 'summary') {
      setAgentMessage(event.text);
      return null;
    }

    if (event.type === 'error') {
      setAgentStatus('failed');
      setAgentError(event.message);
      setAgentMessage(event.message);
      setLocalTraceCard({
        id: 'upload',
        status: 'failed',
        title: 'Backend review failed',
        headline: event.message,
      });
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
    setSelectedFile(file);
    setAgentError(null);
    setLiveTraceCards({});

    if (file) {
      const sizeError = invoiceUploadError(file);

      if (sizeError) {
        setAgentStatus('failed');
        setAgentError(sizeError);
        setAgentMessage(sizeError);
      } else {
        setAgentStatus('idle');
        setAgentMessage(`${file.name} ready for backend review.`);
      }
    } else {
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
    setVisibleItemCount(items.length);
    setLiveTraceCards({});
    setAgentStatus('running');
    setAgentError(null);
    setLastRunId(null);
    setAgentMessage(`Uploading ${selectedFile.name} to backend workflow.`);
    setLocalTraceCard({
      id: 'upload',
      status: 'running',
      title: 'Upload',
      headline: `Uploading ${selectedFile.name} to backend workflow.`,
      progress: {
        done: 0,
        total: 1,
      },
    });

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
        setAgentStatus('failed');
        setAgentError('Backend review was canceled.');
        setAgentMessage('Backend review was canceled.');
        setLocalTraceCard({
          id: 'upload',
          status: 'failed',
          title: 'Backend review canceled',
          headline: 'The browser canceled the running review request.',
        });
        return;
      }

      const message =
        error instanceof Error ? error.message : 'Agent review request failed.';
      setAgentStatus('failed');
      setAgentError(message);
      setAgentMessage(message);
      setLocalTraceCard({
        id: 'upload',
        status: 'failed',
        title: 'Request failed',
        headline: message,
      });
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
            {/* Custom high-contrast ClinTrial Logo */}
            <div className="w-8 h-8 rounded bg-[#0f766e] flex items-center justify-center border border-teal-900/10">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-baseline gap-0.5">
              <span className="text-[19px] font-bold tracking-tight text-slate-800">Clin</span>
              <span className="text-[19px] font-bold tracking-tight text-teal-700">Trial</span>
            </div>
            <span className="hidden sm:inline-block ml-3 font-mono text-[10px] tracking-widest text-[#64748b] border-l border-slate-200 pl-3 uppercase">
              Invoice Audit Workspace
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
                <span className={`w-2 h-2 rounded-full ${isAgentRunning ? 'animate-pulse bg-blue-500' : riskCount > 0 ? 'bg-rose-500' : 'bg-teal-600'}`}></span>
              )}
              {isAgentRunning
                ? 'Backend running'
                : agentStatus === 'done'
                  ? 'Backend complete'
                  : agentStatus === 'failed'
                    ? 'Backend issue'
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

            <div className="w-8 h-8 rounded bg-[#0f766e] text-white flex items-center justify-center font-bold text-xs select-none">
              EV
            </div>
          </form>
        </div>

        {/* Protocol Metadata Subheader */}
        <div className="px-5 py-1.5 border-t border-slate-200 flex items-center gap-2.5 flex-wrap bg-slate-50 text-xs">
          <span className="font-mono font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded text-[11px]">
            PRO-2024-0837
          </span>
          <span className="font-semibold text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded text-[11px]">
            Phase III
          </span>
          <span className="text-slate-500 font-medium">Northlake Therapeutics</span>
          <span className="text-slate-300 select-none">·</span>
          <span className="text-slate-500 font-medium">Resistant Hypertension</span>
          <span className="text-slate-300 select-none">·</span>
          
          <div className="flex items-center gap-1.5 font-medium text-slate-700 bg-white border border-slate-200 rounded px-2.5 py-0.5 cursor-pointer hover:bg-slate-50 transition-all text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-600"></span>
            All sites · 12
            <ChevronDown className="w-3 h-3 text-slate-400 stroke-[2.5]" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={`font-mono text-[10px] font-semibold tracking-wider px-2.5 py-1 rounded border ${agentError ? 'text-rose-600 bg-rose-50 border-rose-200' : 'text-slate-600 bg-white border-slate-200'}`}
              role={agentError ? 'alert' : undefined}
            >
              {selectedFile ? compactText(selectedFile.name, 34) : 'No invoice uploaded'}
              {lastRunId ? ` · ${lastRunId.slice(0, 8)}` : ''}
            </span>
            <span className={`hidden md:inline-flex items-center gap-1.5 font-mono text-[10px] tracking-wider px-2.5 py-1 rounded border ${agentStatusStyle}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isAgentRunning ? 'animate-pulse bg-blue-500' : agentStatus === 'failed' ? 'bg-rose-500' : 'bg-teal-700'}`}></span>
              {compactText(agentMessage, 76)}
            </span>
            <div className="hidden md:flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-slate-600 bg-slate-200/60 px-2.5 py-1 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-700"></span>
              GCP · 21 CFR PART 11
            </div>
          </div>
        </div>

        {hasAgentTrace && (
          <div
            aria-label="Live agent reasoning steps"
            className="border-t border-slate-200 bg-white px-5 py-2"
          >
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {agentTraceSteps.map((step, index) => {
                const isRunningStep = step.status === 'running';

                return (
                  <div
                    aria-current={isRunningStep ? 'step' : undefined}
                    className={`min-w-[150px] flex-1 rounded border px-2.5 py-2 transition-all duration-200 ${agentTraceStatusStyles[step.status]}`}
                    key={step.id}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-wider">
                        <span className={`h-1.5 w-1.5 rounded-full ${agentTraceDotStyles[step.status]}`}></span>
                        {String(index + 1).padStart(2, '0')} · {step.title}
                      </span>
                      {step.progressLabel && (
                        <span className="font-mono text-[9px] font-bold tabular-nums">
                          {step.progressLabel}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-[10.5px] font-semibold">
                      {compactText(step.headline, 68)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
                {items.filter(i => i.status === 'pass').length} / {items.length} Cleared
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
                No matching line items found.
              </div>
            ) : (
              visibleFilteredItems.map((item, itemIndex) => {
                const meta = getStatusMeta(item.status);
                const isSelected = item.id === selectedId;

                if (!isSelected) {
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectItem(item.id)}
                      className="line-item-enter group cursor-pointer border-b border-slate-100 transition-all duration-150 flex items-center justify-between gap-2 hover:bg-slate-100"
                      style={{
                        padding: '8px 14px',
                        borderLeft: '4px solid transparent',
                        animationDelay: staggerDelay(itemIndex),
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
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectItem(item.id)}
                    className="line-item-enter group cursor-pointer p-3 border-b border-slate-100 transition-all duration-150 flex flex-col gap-1 bg-white"
                    style={{
                      borderLeft: '4px solid #0f766e',
                      animationDelay: staggerDelay(itemIndex),
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
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* MIDDLE COLUMN: Protocol Evidence Core & Auditor Form */}
        <section className="flex flex-col min-h-0 bg-slate-50/30">
          {/* Header Area */}
          <div className="flex-none p-4 pb-3.5 border-b border-slate-200 bg-white">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-base font-bold tracking-tight text-slate-800">Protocol evidence</span>
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
            </div>
            
            <div className="text-[13px] text-slate-700 mt-1.5 font-semibold">
              {selectedItem.desc}{' '}
              <span className="text-slate-400 font-normal">
                · <span className="font-mono tracking-tight">{selectedItem.amount}</span> · {selectedItem.meta}
              </span>
            </div>
          </div>

          {/* Scrollable Evidence Area */}
          <div className="flex-1 overflow-y-auto min-h-0 p-5">
            
            {/* AI SYNTHESIS HERO CARD */}
            <div 
              className={`border border-l-4 p-4 mb-5 transition-all duration-200 rounded shadow-sm ${
                selectedItem.complianceScore < 85
                  ? 'bg-rose-50/40 border-rose-200 border-l-rose-600'
                  : 'bg-teal-50/40 border-teal-200 border-l-teal-600'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-2.5">
                <span 
                  className={`font-mono text-[9.5px] font-bold tracking-widest text-white px-2 py-0.5 rounded-sm ${
                    selectedItem.complianceScore < 85 ? 'bg-rose-600' : 'bg-teal-700'
                  }`}
                >
                  AI SYNTHESIS
                </span>
                <span className={`text-xs font-bold ${
                  selectedItem.complianceScore < 85 ? 'text-rose-600' : 'text-teal-700'
                }`}>
                  {selBand.label}
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

                            <div className="font-mono text-[11px] text-teal-700 font-semibold mb-1.5">
                              {ev.ref}
                            </div>

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
          </div>

          {/* STICKY BOTTOM AUDITOR DECISION BAR */}
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
        </section>

        {/* RIGHT COLUMN: Compliance Engine & Audit Trail */}
        <section className="flex flex-col min-h-0 bg-white">
          <div className="flex-none p-4 border-b border-slate-200">
            <span className="text-base font-bold tracking-tight text-slate-800">Compliance boundary engine</span>
            <div className="text-xs text-slate-400 mt-0.5">AI assessment mapped to GCP rules</div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-5 bg-slate-50/20">
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

          </div>

          {/* BOTTOM IMMUTABLE AUDIT TRAIL */}
          <div className="flex-none bg-slate-50/50 border-t border-slate-200/60">
            {/* Minimalist toggle header integrating into bottom background */}
            <div 
              onClick={() => setTrailExpanded(!trailExpanded)}
              className="cursor-pointer px-5 py-3 flex items-center justify-between select-none hover:bg-slate-100/60 transition-all text-slate-500 hover:text-slate-800"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-400 stroke-[2.5]" />
                <span className="font-mono text-[10px] font-bold tracking-wider uppercase text-slate-600">
                  AUDIT TRAIL
                </span>
                <span className="font-mono text-[8.5px] bg-slate-200/60 text-slate-600 px-1.5 py-0.5 rounded font-semibold select-none flex items-center gap-1">
                  <Lock className="w-2 h-2 text-slate-500" /> IMMUTABLE · {trail.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[10px] font-semibold text-slate-400">
                  {trailExpanded ? 'Hide history' : 'View history'}
                </span>
                <div className="transition-transform duration-200" style={{ transform: trailExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 stroke-[2.5]" />
                </div>
              </div>
            </div>

            {/* Collapsible scrollable list of all Audit records */}
            {trailExpanded && (
              <div className="max-h-52 overflow-y-auto border-t border-slate-150 bg-white divide-y divide-slate-100">
                {trail.map((row, idx) => (
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
                ))}
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
