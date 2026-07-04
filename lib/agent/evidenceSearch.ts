import "server-only";

import {
  searchCoverageEvidence,
  searchCtaBudgetEvidence,
  searchPriorLedgerEvidence,
  searchProtocolEvidence,
  searchSiteEvidence,
} from "@/lib/agent/dataSearch";
import type { EvidenceCard, InvoiceLine, RetrievalPlan } from "@/lib/agent/types";
import { rankEvidenceForInvoiceLine } from "@/lib/agent/vultrEvidenceRanker";

type EvidenceSearchTrace = {
  query: string;
  sources: string[];
};

export type RankedEvidenceSearchResult = {
  evidence: EvidenceCard[];
  searchEvents: EvidenceSearchTrace[];
  usedDeterministicFallback: boolean;
  warnings: string[];
};

const maxTraceQueryLength = 140;

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
) {
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

function uniqueEvidenceCards(groups: EvidenceCard[][]): EvidenceCard[] {
  const seen = new Set<string>();
  const result: EvidenceCard[] = [];

  for (const card of groups.flat()) {
    if (seen.has(card.id)) {
      continue;
    }

    seen.add(card.id);
    result.push(card);
  }

  return result;
}

export async function searchAndRankEvidenceForInvoiceLine(
  line: InvoiceLine,
  plan: RetrievalPlan,
): Promise<RankedEvidenceSearchResult> {
  const [
    coverage,
    siteEvidence,
    priorLedger,
    protocol,
    ctaBudget,
  ] = await Promise.all([
    searchCoverageEvidence(sourceSearchInput(line, plan, plan.coverageQueries)),
    searchSiteEvidence(sourceSearchInput(line, plan, plan.siteEvidenceQueries)),
    searchPriorLedgerEvidence(sourceSearchInput(line, plan, plan.ledgerQueries)),
    Promise.resolve(
      searchProtocolEvidence(sourceSearchInput(line, plan, plan.protocolQueries)),
    ),
    Promise.resolve(
      searchCtaBudgetEvidence(sourceSearchInput(line, plan, plan.budgetQueries)),
    ),
  ]);

  const candidates = uniqueEvidenceCards([
    coverage,
    siteEvidence,
    priorLedger,
    protocol,
    ctaBudget,
  ]);
  const ranking = await rankEvidenceForInvoiceLine({
    line,
    plan,
    candidates,
  });

  return {
    evidence: ranking.evidence,
    usedDeterministicFallback: ranking.provider === "deterministic_fallback",
    warnings: ranking.warnings,
    searchEvents: [
      {
        query: traceQuery(
          [...plan.candidateItemCodes, ...plan.coverageQueries],
          `${line.rawDescription} coverage`,
        ),
        sources: ["coverage_grid"],
      },
      {
        query: traceQuery(plan.protocolQueries, `${line.rawDescription} protocol`),
        sources: ["protocol"],
      },
      {
        query: traceQuery(plan.budgetQueries, `${line.rawDescription} budget`),
        sources: ["cta_budget"],
      },
      {
        query: traceQuery(
          plan.siteEvidenceQueries,
          `${line.patientId} ${line.visitName} site evidence`,
        ),
        sources: ["site_evidence"],
      },
      {
        query: traceQuery(
          plan.ledgerQueries,
          `${line.patientId} ${line.visitName} ledger`,
        ),
        sources: ["prior_ledger"],
      },
    ],
  };
}
