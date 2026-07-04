export type AgentReviewMode = "demo" | "strict";

export type InvoiceLine = {
  id: string;
  lineNumber: number;
  patientId: string;
  visitName: string;
  rawDescription: string;
  amount: string;
  extractionConfidence: number;
};

export type EvidenceSource =
  | "protocol"
  | "cta_budget"
  | "coverage_grid"
  | "site_evidence"
  | "prior_ledger"
  | "invoice_extraction";

export type EvidenceCard = {
  id: string;
  sourceType: EvidenceSource;
  sourceName: string;
  locator: string;
  status: "matched" | "partial" | "missing" | "blocked";
  excerpt: string;
  finding: string;
  confidence: number;
};

export type EvidenceChunk = {
  id: string;
  sourceType: Extract<EvidenceSource, "protocol" | "cta_budget">;
  sourceName: string;
  locator: string;
  page?: number;
  section?: string;
  text: string;
};

export type RetrievalPlan = {
  candidateItemCodes: string[];
  protocolQueries: string[];
  budgetQueries: string[];
  coverageQueries: string[];
  siteEvidenceQueries: string[];
  ledgerQueries: string[];
};

export type Boundary =
  | "Auto-handle candidate"
  | "AI recommend + finance confirm"
  | "Human review required"
  | "Policy or contract gap";

export type BoundaryRecommendation = {
  boundary: Boundary;
  score: number;
  riskFlags: string[];
  decisionReason: string;
  evidence: EvidenceCard[];
  auditTrail: string[];
};

export type EvidenceGap = {
  kind:
    | "coverage_not_checked"
    | "protocol_not_checked"
    | "budget_not_checked"
    | "site_evidence_not_checked"
    | "ledger_not_checked"
    | "budget_support_not_found"
    | "protocol_support_not_found"
    | "site_evidence_incomplete"
    | "duplicate_risk"
    | "policy_or_contract_gap";
  message: string;
  sourceType?: EvidenceSource;
  suggestedTools: AgentTool[];
};

export type EvidencePacketVerification = {
  verified: boolean;
  checkedSources: EvidenceSource[];
  gaps: EvidenceGap[];
  allowedNextTools: AgentTool[];
};

export type AgentTracePhase =
  | "upload"
  | "extraction"
  | "planning"
  | "search"
  | "ranking"
  | "evaluation"
  | "summary";

export type AgentTraceStatus = "queued" | "running" | "done" | "failed";

export type AgentTool =
  | "invoice_vision_extractor"
  | "retrieval_planner"
  | "coverage_grid_search"
  | "protocol_search"
  | "cta_budget_search"
  | "site_evidence_search"
  | "prior_ledger_search"
  | "evidence_ranker"
  | "boundary_evaluator"
  | "reviewer_summary";

export type AgentTraceKind =
  | "agent_decision"
  | "tool_call"
  | "document_retrieval"
  | "evidence_rank"
  | "safety_rule";

export type AgentTraceUpdate = {
  type: "trace_update";
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
  updatedAt: string;
};

export type AgentTraceEntry = {
  id: string;
  at: string;
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

export type UploadedInvoiceSummary = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

export type AgentReviewResult = {
  runId: string;
  mode: AgentReviewMode;
  uploadedInvoice: UploadedInvoiceSummary;
  extractedLines: InvoiceLine[];
  retrievalPlans?: Record<string, RetrievalPlan>;
  evidenceByLineId?: Record<string, EvidenceCard[]>;
  recommendationsByLineId?: Record<string, BoundaryRecommendation>;
  verificationByLineId?: Record<string, EvidencePacketVerification>;
  traceLog?: AgentTraceEntry[];
  recommendations: BoundaryRecommendation[];
  completedAt: string;
};

export type AgentEvent =
  | { type: "started"; runId: string }
  | AgentTraceUpdate
  | { type: "step"; label: string; status: "running" | "done" | "failed" }
  | { type: "extraction"; lines: InvoiceLine[] }
  | { type: "retrieval_plan"; lineId: string; plan: RetrievalPlan }
  | { type: "search"; lineId: string; query: string; sources: string[] }
  | { type: "evidence"; lineId: string; evidence: EvidenceCard[] }
  | {
      type: "decision";
      lineId: string;
      recommendation: BoundaryRecommendation;
    }
  | { type: "summary"; text: string }
  | { type: "error"; message: string }
  | { type: "complete"; result: AgentReviewResult };
