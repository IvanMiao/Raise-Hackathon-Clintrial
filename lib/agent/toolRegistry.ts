import "server-only";

import {
  searchCoverageEvidence,
  searchCtaBudgetEvidence,
  searchPriorLedgerEvidence,
  searchProtocolEvidence,
  searchSiteEvidence,
  type LocalEvidenceSearchInput,
} from "@/lib/agent/dataSearch";
import { rankEvidenceForInvoiceLine } from "@/lib/agent/vultrEvidenceRanker";
import type {
  AgentTool,
  EvidenceCard,
  EvidenceSource,
  InvoiceLine,
  RetrievalPlan,
} from "@/lib/agent/types";

export type EvidenceSearchTool = Extract<
  AgentTool,
  | "coverage_grid_search"
  | "protocol_search"
  | "cta_budget_search"
  | "site_evidence_search"
  | "prior_ledger_search"
>;

export type EvidenceSearchToolResult = {
  tool: EvidenceSearchTool;
  source: EvidenceSource;
  query: string;
  evidence: EvidenceCard[];
};

export type EvidenceRankToolResult = {
  evidence: EvidenceCard[];
  usedDeterministicFallback: boolean;
  provider: string;
  model?: string;
  warnings: string[];
};

const maxTraceQueryLength = 140;

export const evidenceSearchToolOrder: EvidenceSearchTool[] = [
  "coverage_grid_search",
  "protocol_search",
  "cta_budget_search",
  "site_evidence_search",
  "prior_ledger_search",
];

const sourceByTool: Record<EvidenceSearchTool, EvidenceSource> = {
  coverage_grid_search: "coverage_grid",
  protocol_search: "protocol",
  cta_budget_search: "cta_budget",
  site_evidence_search: "site_evidence",
  prior_ledger_search: "prior_ledger",
};

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function traceQuery(values: string[], fallback: string): string {
  const query = compactText(values.filter(Boolean).join(" | "));

  if (query.length === 0) {
    return fallback;
  }

  if (query.length <= maxTraceQueryLength) {
    return query;
  }

  return `${query.slice(0, maxTraceQueryLength - 3)}...`;
}

function sourceSearchInput(
  line: InvoiceLine,
  plan: RetrievalPlan,
  queries: string[],
): LocalEvidenceSearchInput {
  return {
    invoiceLine: line,
    candidateItemCodes: plan.candidateItemCodes,
    queries,
    patientId: line.patientId,
    visitName: line.visitName,
    itemCode: plan.candidateItemCodes[0],
    limit: 4,
  };
}

function queriesForTool(
  tool: EvidenceSearchTool,
  line: InvoiceLine,
  plan: RetrievalPlan,
): string[] {
  if (tool === "coverage_grid_search") {
    return [...plan.candidateItemCodes, ...plan.coverageQueries];
  }

  if (tool === "protocol_search") {
    return plan.protocolQueries;
  }

  if (tool === "cta_budget_search") {
    return plan.budgetQueries;
  }

  if (tool === "site_evidence_search") {
    return plan.siteEvidenceQueries;
  }

  return plan.ledgerQueries;
}

function fallbackQuery(
  tool: EvidenceSearchTool,
  line: InvoiceLine,
): string {
  if (tool === "coverage_grid_search") {
    return `${line.rawDescription} coverage`;
  }

  if (tool === "protocol_search") {
    return `${line.rawDescription} protocol`;
  }

  if (tool === "cta_budget_search") {
    return `${line.rawDescription} budget`;
  }

  if (tool === "site_evidence_search") {
    return `${line.patientId} ${line.visitName} site evidence`;
  }

  return `${line.patientId} ${line.visitName} ledger`;
}

export function sourceTitle(source: EvidenceSource): string {
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

export async function callEvidenceSearchTool(input: {
  tool: EvidenceSearchTool;
  line: InvoiceLine;
  plan: RetrievalPlan;
}): Promise<EvidenceSearchToolResult> {
  const source = sourceByTool[input.tool];
  const queries = queriesForTool(input.tool, input.line, input.plan);
  const searchInput = sourceSearchInput(input.line, input.plan, queries);
  let evidence: EvidenceCard[];

  if (input.tool === "coverage_grid_search") {
    evidence = await searchCoverageEvidence(searchInput);
  } else if (input.tool === "protocol_search") {
    evidence = searchProtocolEvidence(searchInput);
  } else if (input.tool === "cta_budget_search") {
    evidence = searchCtaBudgetEvidence(searchInput);
  } else if (input.tool === "site_evidence_search") {
    evidence = await searchSiteEvidence(searchInput);
  } else {
    evidence = await searchPriorLedgerEvidence(searchInput);
  }

  return {
    tool: input.tool,
    source,
    query: traceQuery(queries, fallbackQuery(input.tool, input.line)),
    evidence,
  };
}

export async function callEvidenceRankerTool(input: {
  line: InvoiceLine;
  plan: RetrievalPlan;
  candidates: EvidenceCard[];
}): Promise<EvidenceRankToolResult> {
  const ranking = await rankEvidenceForInvoiceLine({
    line: input.line,
    plan: input.plan,
    candidates: input.candidates,
  });

  return {
    evidence: ranking.evidence,
    usedDeterministicFallback: ranking.provider === "deterministic_fallback",
    provider: ranking.provider,
    model: ranking.model,
    warnings: ranking.warnings,
  };
}
