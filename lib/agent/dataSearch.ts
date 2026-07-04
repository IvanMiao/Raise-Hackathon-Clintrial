import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { CsvParseError, type CsvRecord, parseCsvRecords } from "@/lib/agent/csv";
import { searchDocumentChunks } from "@/lib/agent/documentChunks";
import type { EvidenceCard, EvidenceSource, InvoiceLine } from "@/lib/agent/types";

type CoverageRule = {
  rowNumber: number;
  trialId: string;
  siteId: string;
  itemCode: string;
  itemName: string;
  visitName: string;
  serviceType: string;
  payerRoute: string;
  routingReason: string;
  evidenceRequired: string;
  autoRouteAllowed: string;
  humanConfirmRequired: string;
  blockIf: string;
  demoExpectedDecision: string;
  protocolBasis: string;
  notes: string;
};

type SiteEvidenceRow = {
  rowNumber: number;
  trialId: string;
  siteId: string;
  patientId: string;
  visitName: string;
  protocolDay: string;
  visitDate: string;
  visitStatus: string;
  visitWindowStatus: string;
  pkSubstudy: string;
  completedEvents: string;
  missingEvents: string;
  sourceSystem: string;
  evidenceNotes: string;
};

type PriorLedgerRow = {
  rowNumber: number;
  paymentId: string;
  trialId: string;
  siteId: string;
  patientId: string;
  visitName: string;
  itemCode: string;
  matchedInvoiceId: string;
  paidDate: string;
  amountEur: string;
  status: string;
  matchKey: string;
  notes: string;
};

export type LocalEvidenceSearchInput = {
  invoiceLine?: InvoiceLine;
  candidateItemCodes?: string[];
  queries?: string[];
  patientId?: string;
  visitName?: string;
  itemCode?: string;
  limit?: number;
};

export type LocalEvidenceSearchResult = {
  coverage: EvidenceCard[];
  siteEvidence: EvidenceCard[];
  priorLedger: EvidenceCard[];
  protocol: EvidenceCard[];
  ctaBudget: EvidenceCard[];
};

const coveragePath = join(process.cwd(), "data", "coverage_analysis_billing_grid.csv");
const siteEvidencePath = join(process.cwd(), "data", "site_evidence_log.csv");
const priorLedgerPath = join(process.cwd(), "data", "prior_payment_ledger.csv");

const coverageHeaders = [
  "trial_id",
  "site_id",
  "item_code",
  "item_name",
  "visit_name",
  "service_type",
  "payer_route",
  "routing_reason",
  "evidence_required",
  "auto_route_allowed",
  "human_confirm_required",
  "block_if",
  "demo_expected_decision",
  "protocol_basis",
  "notes",
];

const siteEvidenceHeaders = [
  "trial_id",
  "site_id",
  "patient_id",
  "visit_name",
  "visit_status",
  "visit_window_status",
  "pk_substudy",
  "completed_events",
  "missing_events",
  "source_system",
  "evidence_notes",
];

const priorLedgerHeaders = [
  "payment_id",
  "trial_id",
  "site_id",
  "patient_id",
  "visit_name",
  "item_code",
  "matched_invoice_id",
  "paid_date",
  "amount_eur",
  "status",
  "match_key",
  "notes",
];

let coverageRulesPromise: Promise<CoverageRule[]> | null = null;
let siteEvidencePromise: Promise<SiteEvidenceRow[]> | null = null;
let priorLedgerPromise: Promise<PriorLedgerRow[]> | null = null;

function normalizeTokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function compactExcerpt(parts: string[]): string {
  return parts.filter((part) => part.trim().length > 0).join(" | ");
}

function uniqueTerms(values: string[]): string[] {
  return [...new Set(values.flatMap((value) => normalizeTokens(value)))];
}

function termsFromInput(input: LocalEvidenceSearchInput): string[] {
  return uniqueTerms([
    ...(input.queries ?? []),
    ...(input.candidateItemCodes ?? []),
    input.itemCode ?? "",
    input.invoiceLine?.rawDescription ?? "",
    input.invoiceLine?.visitName ?? "",
    input.invoiceLine?.patientId ?? "",
  ]);
}

function rowValue(record: CsvRecord, field: string): string {
  return record.values[field] ?? "";
}

function dataSearchError(message: string): Error {
  return new Error(`Local evidence search failed: ${message}`);
}

async function loadCsvRecords(
  filePath: string,
  requiredHeaders: string[],
): Promise<CsvRecord[]> {
  let content: string;

  try {
    content = await readFile(filePath, "utf8");
  } catch {
    throw dataSearchError("demo data file is unavailable.");
  }

  try {
    return parseCsvRecords(content, requiredHeaders);
  } catch (error) {
    if (error instanceof CsvParseError) {
      throw dataSearchError(error.message);
    }

    throw error;
  }
}

async function loadCoverageRules(): Promise<CoverageRule[]> {
  coverageRulesPromise ??= loadCsvRecords(coveragePath, coverageHeaders).then(
    (records) =>
      records.map((record) => ({
        rowNumber: record.rowNumber,
        trialId: rowValue(record, "trial_id"),
        siteId: rowValue(record, "site_id"),
        itemCode: rowValue(record, "item_code"),
        itemName: rowValue(record, "item_name"),
        visitName: rowValue(record, "visit_name"),
        serviceType: rowValue(record, "service_type"),
        payerRoute: rowValue(record, "payer_route"),
        routingReason: rowValue(record, "routing_reason"),
        evidenceRequired: rowValue(record, "evidence_required"),
        autoRouteAllowed: rowValue(record, "auto_route_allowed"),
        humanConfirmRequired: rowValue(record, "human_confirm_required"),
        blockIf: rowValue(record, "block_if"),
        demoExpectedDecision: rowValue(record, "demo_expected_decision"),
        protocolBasis: rowValue(record, "protocol_basis"),
        notes: rowValue(record, "notes"),
      })),
  );

  return coverageRulesPromise;
}

async function loadSiteEvidence(): Promise<SiteEvidenceRow[]> {
  siteEvidencePromise ??= loadCsvRecords(siteEvidencePath, siteEvidenceHeaders).then(
    (records) =>
      records.map((record) => ({
        rowNumber: record.rowNumber,
        trialId: rowValue(record, "trial_id"),
        siteId: rowValue(record, "site_id"),
        patientId: rowValue(record, "patient_id"),
        visitName: rowValue(record, "visit_name"),
        protocolDay: rowValue(record, "protocol_day"),
        visitDate: rowValue(record, "visit_date"),
        visitStatus: rowValue(record, "visit_status"),
        visitWindowStatus: rowValue(record, "visit_window_status"),
        pkSubstudy: rowValue(record, "pk_substudy"),
        completedEvents: rowValue(record, "completed_events"),
        missingEvents: rowValue(record, "missing_events"),
        sourceSystem: rowValue(record, "source_system"),
        evidenceNotes: rowValue(record, "evidence_notes"),
      })),
  );

  return siteEvidencePromise;
}

async function loadPriorLedger(): Promise<PriorLedgerRow[]> {
  priorLedgerPromise ??= loadCsvRecords(priorLedgerPath, priorLedgerHeaders).then(
    (records) =>
      records.map((record) => ({
        rowNumber: record.rowNumber,
        paymentId: rowValue(record, "payment_id"),
        trialId: rowValue(record, "trial_id"),
        siteId: rowValue(record, "site_id"),
        patientId: rowValue(record, "patient_id"),
        visitName: rowValue(record, "visit_name"),
        itemCode: rowValue(record, "item_code"),
        matchedInvoiceId: rowValue(record, "matched_invoice_id"),
        paidDate: rowValue(record, "paid_date"),
        amountEur: rowValue(record, "amount_eur"),
        status: rowValue(record, "status"),
        matchKey: rowValue(record, "match_key"),
        notes: rowValue(record, "notes"),
      })),
  );

  return priorLedgerPromise;
}

function scoreText(terms: string[], text: string): number {
  const haystack = text.toLowerCase();

  return terms.reduce((score, term) => {
    if (haystack.includes(term)) {
      return score + 1;
    }

    return score;
  }, 0);
}

function coverageScore(rule: CoverageRule, input: LocalEvidenceSearchInput): number {
  let score = 0;
  const itemCodes = new Set([
    ...(input.candidateItemCodes ?? []),
    input.itemCode ?? "",
  ].filter(Boolean));

  if (itemCodes.has(rule.itemCode)) {
    score += 10;
  }

  if (input.invoiceLine?.visitName === rule.visitName || rule.visitName === "Any") {
    score += 2;
  }

  score += scoreText(
    termsFromInput(input),
    compactExcerpt([
      rule.itemCode,
      rule.itemName,
      rule.serviceType,
      rule.payerRoute,
      rule.routingReason,
      rule.evidenceRequired,
      rule.blockIf,
      rule.protocolBasis,
      rule.notes,
    ]),
  );

  return score;
}

function coverageMatchesConstraints(
  rule: CoverageRule,
  input: LocalEvidenceSearchInput,
): boolean {
  const itemCodes = new Set([
    ...(input.candidateItemCodes ?? []),
    input.itemCode ?? "",
  ].filter(Boolean));

  if (itemCodes.size > 0 && !itemCodes.has(rule.itemCode)) {
    return false;
  }

  return true;
}

function evidenceStatusForCoverage(rule: CoverageRule): EvidenceCard["status"] {
  if (rule.payerRoute === "POLICY_GAP") {
    return "missing";
  }

  if (rule.autoRouteAllowed === "true" && rule.humanConfirmRequired === "false") {
    return "matched";
  }

  return "partial";
}

function coverageToEvidence(rule: CoverageRule): EvidenceCard {
  return {
    id: `coverage-grid-row-${rule.rowNumber}`,
    sourceType: "coverage_grid",
    sourceName: "coverage_analysis_billing_grid.csv",
    locator: `coverage_analysis_billing_grid.csv#row=${rule.rowNumber}`,
    status: evidenceStatusForCoverage(rule),
    excerpt: compactExcerpt([
      rule.itemCode,
      rule.itemName,
      rule.visitName,
      rule.payerRoute,
      rule.evidenceRequired,
      rule.blockIf,
    ]),
    finding: `${rule.itemCode} maps to ${rule.payerRoute}; expected demo decision is ${rule.demoExpectedDecision}.`,
    confidence: 0.95,
  };
}

function missingEvidenceCard(
  sourceType: EvidenceSource,
  sourceName: string,
  locator: string,
  finding: string,
): EvidenceCard {
  return {
    id: `${sourceType}-missing-${Buffer.from(locator).toString("base64url")}`,
    sourceType,
    sourceName,
    locator,
    status: "missing",
    excerpt: "No matching synthetic evidence row was found for this query.",
    finding,
    confidence: 0.9,
  };
}

export async function searchCoverageEvidence(
  input: LocalEvidenceSearchInput,
): Promise<EvidenceCard[]> {
  const limit = input.limit ?? 5;
  const rules = await loadCoverageRules();
  const scoredRules = rules
    .filter((rule) => coverageMatchesConstraints(rule, input))
    .map((rule) => ({
      rule,
      score: coverageScore(rule, input),
    }))
    .filter((result) => result.score > 0)
    .toSorted((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((result) => coverageToEvidence(result.rule));

  if (scoredRules.length > 0) {
    return scoredRules;
  }

  return [
    missingEvidenceCard(
      "coverage_grid",
      "coverage_analysis_billing_grid.csv",
      `coverage_analysis_billing_grid.csv#search=${encodeURIComponent(
        (input.itemCode ?? input.queries?.join(" ") ?? "unknown").slice(0, 80),
      )}`,
      "No coverage or billing grid rule matched the invoice line.",
    ),
  ];
}

function siteEvidenceScore(row: SiteEvidenceRow, input: LocalEvidenceSearchInput): number {
  let score = 0;
  const patientId = input.patientId ?? input.invoiceLine?.patientId;
  const visitName = input.visitName ?? input.invoiceLine?.visitName;

  if (patientId && row.patientId === patientId) {
    score += 8;
  }

  if (visitName && row.visitName === visitName) {
    score += 5;
  }

  score += scoreText(
    termsFromInput(input),
    compactExcerpt([
      row.patientId,
      row.visitName,
      row.visitStatus,
      row.visitWindowStatus,
      row.completedEvents,
      row.missingEvents,
      row.sourceSystem,
      row.evidenceNotes,
    ]),
  );

  return score;
}

function siteEvidenceMatchesConstraints(
  row: SiteEvidenceRow,
  input: LocalEvidenceSearchInput,
): boolean {
  const patientId = input.patientId ?? input.invoiceLine?.patientId;
  const visitName = input.visitName ?? input.invoiceLine?.visitName;

  if (patientId && row.patientId !== patientId) {
    return false;
  }

  if (visitName && row.visitName !== visitName) {
    return false;
  }

  return true;
}

function siteEvidenceToCard(row: SiteEvidenceRow): EvidenceCard {
  const hasMissingEvents = row.missingEvents !== "" && row.missingEvents !== "none";

  return {
    id: `site-evidence-row-${row.rowNumber}`,
    sourceType: "site_evidence",
    sourceName: "site_evidence_log.csv",
    locator: `site_evidence_log.csv#row=${row.rowNumber}`,
    status: hasMissingEvents ? "partial" : "matched",
    excerpt: compactExcerpt([
      row.patientId,
      row.visitName,
      row.visitStatus,
      row.visitWindowStatus,
      `completed=${row.completedEvents}`,
      `missing=${row.missingEvents}`,
    ]),
    finding: hasMissingEvents
      ? `Site evidence is present, but missing ${row.missingEvents}.`
      : "Site evidence supports the patient and visit context.",
    confidence: 0.94,
  };
}

export async function searchSiteEvidence(
  input: LocalEvidenceSearchInput,
): Promise<EvidenceCard[]> {
  const limit = input.limit ?? 5;
  const rows = await loadSiteEvidence();
  const matches = rows
    .filter((row) => siteEvidenceMatchesConstraints(row, input))
    .map((row) => ({
      row,
      score: siteEvidenceScore(row, input),
    }))
    .filter((result) => result.score > 0)
    .toSorted((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((result) => siteEvidenceToCard(result.row));

  if (matches.length > 0) {
    return matches;
  }

  return [
    missingEvidenceCard(
      "site_evidence",
      "site_evidence_log.csv",
      `site_evidence_log.csv#patient=${encodeURIComponent(
        input.patientId ?? input.invoiceLine?.patientId ?? "unknown",
      )}&visit=${encodeURIComponent(input.visitName ?? input.invoiceLine?.visitName ?? "unknown")}`,
      "No EDC, source-binder, or site-operations evidence matched the patient and visit.",
    ),
  ];
}

function ledgerScore(row: PriorLedgerRow, input: LocalEvidenceSearchInput): number {
  let score = 0;
  const patientId = input.patientId ?? input.invoiceLine?.patientId;
  const visitName = input.visitName ?? input.invoiceLine?.visitName;
  const itemCode = input.itemCode ?? input.candidateItemCodes?.[0];

  if (patientId && row.patientId === patientId) {
    score += 8;
  }

  if (visitName && row.visitName === visitName) {
    score += 5;
  }

  if (itemCode && row.itemCode === itemCode) {
    score += 10;
  }

  score += scoreText(
    termsFromInput(input),
    compactExcerpt([
      row.paymentId,
      row.patientId,
      row.visitName,
      row.itemCode,
      row.status,
      row.matchKey,
      row.notes,
    ]),
  );

  return score;
}

function ledgerMatchesConstraints(
  row: PriorLedgerRow,
  input: LocalEvidenceSearchInput,
): boolean {
  const patientId = input.patientId ?? input.invoiceLine?.patientId;
  const visitName = input.visitName ?? input.invoiceLine?.visitName;
  const itemCodes = new Set([
    ...(input.candidateItemCodes ?? []),
    input.itemCode ?? "",
  ].filter(Boolean));

  if (patientId && row.patientId !== patientId) {
    return false;
  }

  if (visitName && row.visitName !== visitName) {
    return false;
  }

  if (itemCodes.size > 0 && !itemCodes.has(row.itemCode)) {
    return false;
  }

  return true;
}

function ledgerToCard(row: PriorLedgerRow): EvidenceCard {
  const status = row.status === "paid" ? "blocked" : "matched";
  const finding =
    row.status === "paid"
      ? `Prior paid ledger row ${row.paymentId} is a duplicate risk.`
      : `Prior ledger row ${row.paymentId} has status ${row.status}; it should not block as a paid duplicate.`;

  return {
    id: `prior-ledger-row-${row.rowNumber}`,
    sourceType: "prior_ledger",
    sourceName: "prior_payment_ledger.csv",
    locator: `prior_payment_ledger.csv#row=${row.rowNumber}`,
    status,
    excerpt: compactExcerpt([
      row.paymentId,
      row.patientId,
      row.visitName,
      row.itemCode,
      row.amountEur,
      row.status,
      row.matchKey,
    ]),
    finding,
    confidence: 0.96,
  };
}

export async function searchPriorLedgerEvidence(
  input: LocalEvidenceSearchInput,
): Promise<EvidenceCard[]> {
  const limit = input.limit ?? 5;
  const rows = await loadPriorLedger();
  const matches = rows
    .filter((row) => ledgerMatchesConstraints(row, input))
    .map((row) => ({
      row,
      score: ledgerScore(row, input),
    }))
    .filter((result) => result.score > 0)
    .toSorted((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((result) => ledgerToCard(result.row));

  if (matches.length > 0) {
    return matches;
  }

  return [
    missingEvidenceCard(
      "prior_ledger",
      "prior_payment_ledger.csv",
      `prior_payment_ledger.csv#patient=${encodeURIComponent(
        input.patientId ?? input.invoiceLine?.patientId ?? "unknown",
      )}&visit=${encodeURIComponent(
        input.visitName ?? input.invoiceLine?.visitName ?? "unknown",
      )}&item=${encodeURIComponent(input.itemCode ?? input.candidateItemCodes?.[0] ?? "unknown")}`,
      "No prior paid or voided ledger row matched the patient, visit, and item code.",
    ),
  ];
}

export function searchProtocolEvidence(input: LocalEvidenceSearchInput): EvidenceCard[] {
  return searchDocumentChunks({
    sourceType: "protocol",
    queries: input.queries ?? [
      ...(input.candidateItemCodes ?? []),
      input.itemCode ?? "",
      input.invoiceLine?.rawDescription ?? "",
      input.invoiceLine?.visitName ?? "",
    ],
    limit: input.limit,
  });
}

export function searchCtaBudgetEvidence(input: LocalEvidenceSearchInput): EvidenceCard[] {
  return searchDocumentChunks({
    sourceType: "cta_budget",
    queries: input.queries ?? [
      ...(input.candidateItemCodes ?? []),
      input.itemCode ?? "",
      input.invoiceLine?.rawDescription ?? "",
      input.invoiceLine?.visitName ?? "",
    ],
    limit: input.limit,
  });
}

export async function searchLocalEvidence(
  input: LocalEvidenceSearchInput,
): Promise<LocalEvidenceSearchResult> {
  const [coverage, siteEvidence, priorLedger] = await Promise.all([
    searchCoverageEvidence(input),
    searchSiteEvidence(input),
    searchPriorLedgerEvidence(input),
  ]);

  return {
    coverage,
    siteEvidence,
    priorLedger,
    protocol: searchProtocolEvidence(input),
    ctaBudget: searchCtaBudgetEvidence(input),
  };
}
