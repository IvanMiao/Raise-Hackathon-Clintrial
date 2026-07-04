import "server-only";

import type {
  Boundary,
  BoundaryRecommendation,
  EvidenceCard,
  InvoiceLine,
  RetrievalPlan,
} from "@/lib/agent/types";

type EvaluationInput = {
  line: InvoiceLine;
  plan: RetrievalPlan;
  evidence: EvidenceCard[];
};

type EvaluationSignals = {
  primaryItemCode: string;
  coverageCard: EvidenceCard | undefined;
  siteEvidenceCards: EvidenceCard[];
  priorLedgerCards: EvidenceCard[];
  protocolCards: EvidenceCard[];
  ctaBudgetCards: EvidenceCard[];
  hasPaidDuplicate: boolean;
  hasPolicyGap: boolean;
  hasCoverageRule: boolean;
  hasAutoCoverage: boolean;
  hasPartialCoverage: boolean;
  hasSiteVisitSupport: boolean;
  hasProtocolSupport: boolean;
  hasBudgetSupport: boolean;
  hasPkSubgroupFailure: boolean;
  hasMissingAuthorization: boolean;
};

function cardText(card: EvidenceCard): string {
  return `${card.finding} ${card.excerpt} ${card.locator}`.toLowerCase();
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hasText(card: EvidenceCard, terms: string[]): boolean {
  const text = cardText(card);

  return terms.some((term) => text.includes(term));
}

function firstCoverageCard(evidence: EvidenceCard[]): EvidenceCard | undefined {
  return evidence.find((card) => card.sourceType === "coverage_grid");
}

function inferPrimaryItemCode(plan: RetrievalPlan, coverageCard: EvidenceCard | undefined): string {
  if (plan.candidateItemCodes[0]) {
    return plan.candidateItemCodes[0];
  }

  const code = coverageCard?.excerpt.split("|")[0]?.trim();

  return code && code.length > 0 ? code : "UNKNOWN_ITEM";
}

function sourceCards(
  evidence: EvidenceCard[],
  sourceType: EvidenceCard["sourceType"],
): EvidenceCard[] {
  return evidence.filter((card) => card.sourceType === sourceType);
}

function hasUsableSourceSupport(cards: EvidenceCard[]): boolean {
  return cards.some(
    (card) => card.status === "matched" || card.status === "partial",
  );
}

function siteVisitSupported(cards: EvidenceCard[]): boolean {
  return cards.some((card) => {
    const text = cardText(card);

    return text.includes("completed") && text.includes("in_window");
  });
}

function policyGapDetected(primaryItemCode: string, coverageCard: EvidenceCard | undefined): boolean {
  if (primaryItemCode === "UNDEFINED_REMOTE_MONITORING") {
    return true;
  }

  if (!coverageCard) {
    return true;
  }

  return (
    coverageCard.status === "missing" ||
    hasText(coverageCard, ["policy_gap", "policy gap", "no coverage", "no supporting rule"])
  );
}

function autoCoverageDetected(coverageCard: EvidenceCard | undefined): boolean {
  if (!coverageCard || coverageCard.status !== "matched") {
    return false;
  }

  return hasText(coverageCard, ["auto_route_to_sponsor", "sponsor"]);
}

function partialCoverageDetected(coverageCard: EvidenceCard | undefined): boolean {
  if (!coverageCard) {
    return false;
  }

  return (
    coverageCard.status === "partial" ||
    hasText(coverageCard, [
      "hold_for_review",
      "finance_confirm",
      "human_confirm_required",
      "sponsor_if_pk_subgroup",
      "hold",
    ])
  );
}

function pkSubgroupFailureDetected(
  primaryItemCode: string,
  evidence: EvidenceCard[],
): boolean {
  if (primaryItemCode !== "PK_SAMPLE_V3") {
    return false;
  }

  return evidence.some((card) =>
    hasText(card, [
      "pk_substudy=false",
      "missing pk_sample",
      "missing pk_consent",
      "not consented",
      "not in pk subgroup",
      "not assigned",
    ]),
  );
}

function missingAuthorizationDetected(
  primaryItemCode: string,
  evidence: EvidenceCard[],
): boolean {
  if (primaryItemCode !== "ENDOSCOPY_V3") {
    return false;
  }

  return evidence.some((card) =>
    hasText(card, [
      "explicit unscheduled procedure authorization",
      "sponsor approval",
      "no authorization",
      "not routinely sponsor-billable",
      "required for review",
      "protocol support alone does not establish sponsor-billable",
    ]),
  );
}

function buildSignals(input: EvaluationInput): EvaluationSignals {
  const coverageCard = firstCoverageCard(input.evidence);
  const primaryItemCode = inferPrimaryItemCode(input.plan, coverageCard);
  const siteEvidenceCards = sourceCards(input.evidence, "site_evidence");
  const priorLedgerCards = sourceCards(input.evidence, "prior_ledger");
  const protocolCards = sourceCards(input.evidence, "protocol");
  const ctaBudgetCards = sourceCards(input.evidence, "cta_budget");

  return {
    primaryItemCode,
    coverageCard,
    siteEvidenceCards,
    priorLedgerCards,
    protocolCards,
    ctaBudgetCards,
    hasPaidDuplicate: priorLedgerCards.some((card) => card.status === "blocked"),
    hasPolicyGap: policyGapDetected(primaryItemCode, coverageCard),
    hasCoverageRule: Boolean(coverageCard && coverageCard.status !== "missing"),
    hasAutoCoverage: autoCoverageDetected(coverageCard),
    hasPartialCoverage: partialCoverageDetected(coverageCard),
    hasSiteVisitSupport: siteVisitSupported(siteEvidenceCards),
    hasProtocolSupport: hasUsableSourceSupport(protocolCards),
    hasBudgetSupport: hasUsableSourceSupport(ctaBudgetCards),
    hasPkSubgroupFailure: pkSubgroupFailureDetected(primaryItemCode, input.evidence),
    hasMissingAuthorization: missingAuthorizationDetected(
      primaryItemCode,
      input.evidence,
    ),
  };
}

function riskFlags(signals: EvaluationSignals): string[] {
  const flags: string[] = [];

  if (signals.hasPaidDuplicate) {
    flags.push("paid_duplicate");
  }

  if (signals.hasPolicyGap) {
    flags.push("policy_or_contract_gap");
  }

  if (signals.hasPkSubgroupFailure) {
    flags.push("pk_subgroup_condition_failed");
  }

  if (signals.hasMissingAuthorization) {
    flags.push("missing_unscheduled_procedure_authorization");
  }

  if (!signals.hasSiteVisitSupport) {
    flags.push("site_visit_evidence_incomplete");
  }

  if (!signals.hasBudgetSupport) {
    flags.push("budget_support_not_found");
  }

  if (!signals.hasProtocolSupport) {
    flags.push("protocol_support_not_found");
  }

  return flags;
}

function scoreForBoundary(boundary: Boundary, flags: string[]): number {
  if (boundary === "Auto-handle candidate") {
    return 0.86;
  }

  if (boundary === "AI recommend + finance confirm") {
    return flags.length > 1 ? 0.62 : 0.7;
  }

  if (boundary === "Human review required") {
    return 0.34;
  }

  return 0.22;
}

function chooseBoundary(signals: EvaluationSignals): Boundary {
  if (signals.hasPaidDuplicate || signals.hasPkSubgroupFailure) {
    return "Human review required";
  }

  if (signals.hasPolicyGap || !signals.hasCoverageRule) {
    return "Policy or contract gap";
  }

  if (signals.hasMissingAuthorization) {
    return "AI recommend + finance confirm";
  }

  if (
    signals.hasAutoCoverage &&
    signals.hasSiteVisitSupport &&
    signals.hasBudgetSupport &&
    signals.hasProtocolSupport
  ) {
    return "Auto-handle candidate";
  }

  if (signals.hasPartialCoverage || signals.hasSiteVisitSupport) {
    return "AI recommend + finance confirm";
  }

  return "Human review required";
}

function decisionReason(boundary: Boundary, signals: EvaluationSignals): string {
  if (signals.hasPaidDuplicate) {
    return "A prior paid ledger row matches the patient, visit, and item code, so automated handling is blocked.";
  }

  if (signals.hasPkSubgroupFailure) {
    return "PK billing depends on PK subgroup consent or assignment, and the site evidence indicates the PK condition is not satisfied.";
  }

  if (signals.hasPolicyGap) {
    return "The local coverage grid does not provide a usable billing rule for this item, so the route remains a policy or contract gap.";
  }

  if (signals.hasMissingAuthorization) {
    return "The item has a coverage rule, but unscheduled procedure authorization and sponsor approval evidence are incomplete.";
  }

  if (boundary === "Auto-handle candidate") {
    return "Coverage, budget/protocol support, site visit evidence, and duplicate controls are sufficient for read-only automated handling.";
  }

  if (boundary === "AI recommend + finance confirm") {
    return "Evidence is partially supportive but one or more finance-control conditions still need confirmation.";
  }

  return "The evidence packet is insufficient for a lower-risk automation boundary.";
}

function auditTrail(input: EvaluationInput, boundary: Boundary, flags: string[]): string[] {
  return [
    `Evaluated invoice line ${input.line.lineNumber}: ${compactText(input.line.rawDescription)}.`,
    `Candidate item codes: ${input.plan.candidateItemCodes.join(", ") || "none"}.`,
    `Reviewed ${input.evidence.length} source-grounded evidence cards.`,
    `Applied deterministic boundary rule: ${boundary}.`,
    flags.length > 0
      ? `Risk flags: ${flags.join(", ")}.`
      : "No blocking risk flags were detected.",
    "No payment was approved or released; this is a read-only recommendation.",
  ];
}

export function evaluatePaymentLine(input: EvaluationInput): BoundaryRecommendation {
  const signals = buildSignals(input);
  const flags = riskFlags(signals);
  const boundary = chooseBoundary(signals);

  return {
    boundary,
    score: scoreForBoundary(boundary, flags),
    riskFlags: flags,
    decisionReason: decisionReason(boundary, signals),
    evidence: input.evidence,
    auditTrail: auditTrail(input, boundary, flags),
  };
}
