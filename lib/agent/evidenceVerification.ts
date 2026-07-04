import "server-only";

import type {
  AgentTool,
  EvidenceCard,
  EvidenceGap,
  EvidencePacketVerification,
  EvidenceSource,
  InvoiceLine,
  RetrievalPlan,
} from "@/lib/agent/types";

type RequiredSource = Extract<
  EvidenceSource,
  "coverage_grid" | "protocol" | "cta_budget" | "site_evidence" | "prior_ledger"
>;

const requiredSources: RequiredSource[] = [
  "coverage_grid",
  "protocol",
  "cta_budget",
  "site_evidence",
  "prior_ledger",
];

const sourceTools: Record<RequiredSource, AgentTool> = {
  coverage_grid: "coverage_grid_search",
  protocol: "protocol_search",
  cta_budget: "cta_budget_search",
  site_evidence: "site_evidence_search",
  prior_ledger: "prior_ledger_search",
};

function sourceCards(
  evidence: EvidenceCard[],
  sourceType: EvidenceSource,
): EvidenceCard[] {
  return evidence.filter((card) => card.sourceType === sourceType);
}

function sourceChecked(evidence: EvidenceCard[], sourceType: EvidenceSource): boolean {
  return sourceCards(evidence, sourceType).length > 0;
}

function hasUsableSupport(evidence: EvidenceCard[], sourceType: EvidenceSource): boolean {
  return sourceCards(evidence, sourceType).some(
    (card) => card.status === "matched" || card.status === "partial",
  );
}

function hasMissingOnly(evidence: EvidenceCard[], sourceType: EvidenceSource): boolean {
  const cards = sourceCards(evidence, sourceType);

  return cards.length > 0 && cards.every((card) => card.status === "missing");
}

function hasBlockingEvidence(
  evidence: EvidenceCard[],
  sourceType: EvidenceSource,
): boolean {
  return sourceCards(evidence, sourceType).some((card) => card.status === "blocked");
}

function gapForUncheckedSource(sourceType: RequiredSource): EvidenceGap {
  const labels: Record<RequiredSource, EvidenceGap["kind"]> = {
    coverage_grid: "coverage_not_checked",
    protocol: "protocol_not_checked",
    cta_budget: "budget_not_checked",
    site_evidence: "site_evidence_not_checked",
    prior_ledger: "ledger_not_checked",
  };

  const messages: Record<RequiredSource, string> = {
    coverage_grid: "Coverage grid has not been checked for this invoice line.",
    protocol: "Protocol evidence has not been checked for this invoice line.",
    cta_budget: "CTA or budget evidence has not been checked for this invoice line.",
    site_evidence: "Site evidence has not been checked for this patient and visit.",
    prior_ledger: "Prior payment ledger has not been checked for duplicate risk.",
  };

  return {
    kind: labels[sourceType],
    message: messages[sourceType],
    sourceType,
    suggestedTools: [sourceTools[sourceType]],
  };
}

function evidenceGap(
  kind: EvidenceGap["kind"],
  message: string,
  sourceType: EvidenceSource,
): EvidenceGap {
  return {
    kind,
    message,
    sourceType,
    suggestedTools: [],
  };
}

export function verifyEvidencePacket(input: {
  line: InvoiceLine;
  plan: RetrievalPlan;
  evidence: EvidenceCard[];
}): EvidencePacketVerification {
  const checkedSources = requiredSources.filter((sourceType) =>
    sourceChecked(input.evidence, sourceType),
  );
  const uncheckedSources = requiredSources.filter(
    (sourceType) => !checkedSources.includes(sourceType),
  );
  const gaps: EvidenceGap[] = uncheckedSources.map(gapForUncheckedSource);

  if (hasMissingOnly(input.evidence, "coverage_grid")) {
    gaps.push(
      evidenceGap(
        "policy_or_contract_gap",
        "Coverage grid search completed, but no usable billing rule was found.",
        "coverage_grid",
      ),
    );
  }

  if (hasMissingOnly(input.evidence, "protocol")) {
    gaps.push(
      evidenceGap(
        "protocol_support_not_found",
        "Protocol search completed, but no usable protocol support was found.",
        "protocol",
      ),
    );
  }

  if (hasMissingOnly(input.evidence, "cta_budget")) {
    gaps.push(
      evidenceGap(
        "budget_support_not_found",
        "CTA or budget search completed, but no usable budget support was found.",
        "cta_budget",
      ),
    );
  }

  if (
    sourceChecked(input.evidence, "site_evidence") &&
    !hasUsableSupport(input.evidence, "site_evidence")
  ) {
    gaps.push(
      evidenceGap(
        "site_evidence_incomplete",
        "Site evidence search completed, but patient or visit support remains incomplete.",
        "site_evidence",
      ),
    );
  }

  if (hasBlockingEvidence(input.evidence, "prior_ledger")) {
    gaps.push(
      evidenceGap(
        "duplicate_risk",
        "Prior ledger search found blocking duplicate payment evidence.",
        "prior_ledger",
      ),
    );
  }

  return {
    verified: uncheckedSources.length === 0,
    checkedSources,
    gaps,
    allowedNextTools: uncheckedSources.map((sourceType) => sourceTools[sourceType]),
  };
}
