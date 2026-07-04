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
  recommendations: BoundaryRecommendation[];
  completedAt: string;
};

export type AgentEvent =
  | { type: "started"; runId: string }
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
