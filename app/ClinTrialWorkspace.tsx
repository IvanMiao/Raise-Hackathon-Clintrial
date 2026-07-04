"use client";

import { useState } from "react";

type BoundaryTone = "auto" | "confirm" | "review" | "gap";

type EvidenceStatus = "matched" | "partial" | "missing" | "blocked";

type EvidenceCard = {
  title: string;
  source: string;
  status: EvidenceStatus;
  detail: string;
};

type InvoiceLine = {
  id: string;
  lineNumber: number;
  patientId: string;
  visitName: string;
  itemCode: string;
  itemName: string;
  rawDescription: string;
  amount: string;
  confidence: string;
  boundary: string;
  boundaryTone: BoundaryTone;
  score: number;
  decisionReason: string;
  evidence: EvidenceCard[];
  auditTrail: string[];
};

const invoiceLines: InvoiceLine[] = [
  {
    id: "line-1",
    lineNumber: 1,
    patientId: "P-101",
    visitName: "Visit 3",
    itemCode: "VISIT_FEE_V3",
    itemName: "Visit 3 site fee",
    rawDescription: "Visit 3 site fee - wk2 completed",
    amount: "EUR 450.00",
    confidence: "96%",
    boundary: "Auto-handle candidate",
    boundaryTone: "auto",
    score: 94,
    decisionReason:
      "Coverage rule, completed visit evidence, visit window, and ledger checks all support a low-risk route.",
    evidence: [
      {
        title: "Coverage grid",
        source: "coverage_analysis_billing_grid.csv",
        status: "matched",
        detail:
          "VISIT_FEE_V3 is sponsor-routed when Visit 3 is completed in window and no duplicate exists.",
      },
      {
        title: "Site evidence",
        source: "site_evidence_log.csv",
        status: "matched",
        detail:
          "P-101 Visit 3 completed on 2026-06-10 with in-window status.",
      },
      {
        title: "Prior payments",
        source: "prior_payment_ledger.csv",
        status: "matched",
        detail: "No paid prior ledger row for the same patient, visit, and item.",
      },
    ],
    auditTrail: [
      "Extracted line 1 from uploaded invoice image with 96% confidence.",
      "Matched VISIT_FEE_V3 coverage rule for SITE-PARIS-01.",
      "Recommended future automation boundary only after human-approved playbook adoption.",
    ],
  },
  {
    id: "line-2",
    lineNumber: 2,
    patientId: "P-102",
    visitName: "Visit 3",
    itemCode: "IMP_INFUSION_V3",
    itemName: "TJ301/placebo IV infusion administration",
    rawDescription: "TJ301/placebo IV infusion admin, Day 14",
    amount: "EUR 820.00",
    confidence: "94%",
    boundary: "Auto-handle candidate",
    boundaryTone: "auto",
    score: 92,
    decisionReason:
      "The protocol schedules IMP administration on Day 14 and site evidence contains an infusion record.",
    evidence: [
      {
        title: "Protocol evidence",
        source: "Prot_000.pdf",
        status: "matched",
        detail:
          "TJ301/placebo administrations occur on Days 0, 14, 28, 42, 56, and 70.",
      },
      {
        title: "Site evidence",
        source: "site_evidence_log.csv",
        status: "matched",
        detail:
          "P-102 Visit 3 completed in window with imp_infusion and infusion_record events.",
      },
      {
        title: "Prior payments",
        source: "prior_payment_ledger.csv",
        status: "matched",
        detail: "Same patient has prior Visit 2 activity only; no Visit 3 infusion duplicate.",
      },
    ],
    auditTrail: [
      "Normalized abbreviated invoice wording to IMP_INFUSION_V3.",
      "Confirmed Day 14 protocol support and source-binder infusion evidence.",
      "Marked as an automation candidate, not a payment approval.",
    ],
  },
  {
    id: "line-3",
    lineNumber: 3,
    patientId: "P-104",
    visitName: "Visit 3",
    itemCode: "PK_SAMPLE_V3",
    itemName: "PK blood sample",
    rawDescription: "PK blood draw / sample handling - V3",
    amount: "EUR 275.00",
    confidence: "88%",
    boundary: "Human review required",
    boundaryTone: "review",
    score: 48,
    decisionReason:
      "The item can be sponsor-routed only for PK subgroup patients, but the site evidence says P-104 is not in the subgroup.",
    evidence: [
      {
        title: "Coverage grid",
        source: "coverage_analysis_billing_grid.csv",
        status: "partial",
        detail:
          "PK_SAMPLE_V3 is conditional and requires pk_substudy=true plus PK sample evidence.",
      },
      {
        title: "Site evidence",
        source: "site_evidence_log.csv",
        status: "blocked",
        detail:
          "P-104 Visit 3 exists, but pk_substudy=false and pk_sample evidence is missing.",
      },
      {
        title: "Protocol evidence",
        source: "Prot_000.pdf",
        status: "partial",
        detail:
          "PK is assessed in a subgroup, so protocol support alone is not enough.",
      },
    ],
    auditTrail: [
      "Extracted a messy PK description and mapped it to PK_SAMPLE_V3.",
      "Detected subgroup condition failure for patient P-104.",
      "Drafted reviewer question: was this patient later consented or billed in error?",
    ],
  },
  {
    id: "line-4",
    lineNumber: 4,
    patientId: "P-104",
    visitName: "Visit 3",
    itemCode: "ADMIN_FEE",
    itemName: "Administrative processing fee",
    rawDescription: "Admin processing fee - visit package",
    amount: "EUR 95.00",
    confidence: "91%",
    boundary: "Human review required",
    boundaryTone: "review",
    score: 42,
    decisionReason:
      "The admin fee is normally sponsor-routed, but the same patient, visit, and item has already been paid.",
    evidence: [
      {
        title: "Coverage grid",
        source: "coverage_analysis_billing_grid.csv",
        status: "matched",
        detail:
          "ADMIN_FEE is billable once per completed visit when no duplicate exists.",
      },
      {
        title: "Site evidence",
        source: "site_evidence_log.csv",
        status: "matched",
        detail: "P-104 Visit 3 completed in window.",
      },
      {
        title: "Prior payments",
        source: "prior_payment_ledger.csv",
        status: "blocked",
        detail:
          "PAY-2026-0187 already paid ADMIN_FEE for P-104 Visit 3 on 2026-06-20.",
      },
    ],
    auditTrail: [
      "Matched admin fee against sponsor-routed site operations rule.",
      "Built duplicate key CTJ301UC201|SITE-PARIS-01|P-104|Visit 3|ADMIN_FEE.",
      "Held for finance review because duplicate control fired.",
    ],
  },
  {
    id: "line-5",
    lineNumber: 5,
    patientId: "P-105",
    visitName: "Visit 3",
    itemCode: "ENDOSCOPY_V3",
    itemName: "Endoscopy with biopsy",
    rawDescription: "Endoscopy w/ biopsy, disease activity check",
    amount: "EUR 1,650.00",
    confidence: "90%",
    boundary: "AI recommend + finance confirm",
    boundaryTone: "confirm",
    score: 58,
    decisionReason:
      "Disease activity evidence exists, but Visit 3 endoscopy lacks routine sponsor-billable support and has no attached authorization.",
    evidence: [
      {
        title: "Protocol evidence",
        source: "Prot_000.pdf",
        status: "partial",
        detail:
          "Disease activity assessments occur at Visit 3, but endoscopy and biopsy are described for Screening and Visit 8.",
      },
      {
        title: "Site evidence",
        source: "site_evidence_log.csv",
        status: "missing",
        detail:
          "Site note mentions symptoms, but no procedure source, sponsor approval, or authorization is attached.",
      },
      {
        title: "Coverage grid",
        source: "coverage_analysis_billing_grid.csv",
        status: "partial",
        detail:
          "ENDOSCOPY_V3 requires explicit unscheduled procedure authorization before routing.",
      },
    ],
    auditTrail: [
      "Mapped invoice wording to ENDOSCOPY_V3 with 90% extraction confidence.",
      "Found protocol ambiguity between disease assessment and routine endoscopy support.",
      "Prepared finance-confirm recommendation with missing authorization evidence.",
    ],
  },
  {
    id: "line-6",
    lineNumber: 6,
    patientId: "P-106",
    visitName: "Unscheduled",
    itemCode: "UNDEFINED_REMOTE_MONITORING",
    itemName: "Remote monitoring fee",
    rawDescription: "Remote monitoring tech fee, sponsor billable?",
    amount: "EUR 300.00",
    confidence: "76%",
    boundary: "Policy or contract gap",
    boundaryTone: "gap",
    score: 24,
    decisionReason:
      "The item has no supporting protocol, CTA, budget, or billing rule in the current evidence set.",
    evidence: [
      {
        title: "Coverage grid",
        source: "coverage_analysis_billing_grid.csv",
        status: "missing",
        detail:
          "Remote monitoring is intentionally marked as a policy gap in the demo rule set.",
      },
      {
        title: "Site operations note",
        source: "site_evidence_log.csv",
        status: "partial",
        detail:
          "A local operations note exists, but no budget reference or billing policy rule is linked.",
      },
      {
        title: "Invoice extraction",
        source: "invoice_extraction_fixture.csv",
        status: "partial",
        detail:
          "Low-confidence mapping from free-text invoice description; reviewer should verify the item category.",
      },
    ],
    auditTrail: [
      "Extracted remote monitoring fee with 76% confidence.",
      "No policy or budget basis found in the current evidence set.",
      "Created policy-gap ticket draft for CTA or billing-policy clarification.",
    ],
  },
];

const boundaryStyles: Record<BoundaryTone, string> = {
  auto: "border-emerald-200 bg-emerald-50 text-emerald-800",
  confirm: "border-blue-200 bg-blue-50 text-blue-800",
  review: "border-amber-200 bg-amber-50 text-amber-900",
  gap: "border-rose-200 bg-rose-50 text-rose-800",
};

const evidenceStyles: Record<EvidenceStatus, string> = {
  matched: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partial: "border-blue-200 bg-blue-50 text-blue-800",
  missing: "border-slate-200 bg-slate-100 text-slate-700",
  blocked: "border-rose-200 bg-rose-50 text-rose-800",
};

function EvidenceStatusBadge({ status }: { status: EvidenceStatus }) {
  const labelByStatus: Record<EvidenceStatus, string> = {
    matched: "Matched",
    partial: "Partial",
    missing: "Missing",
    blocked: "Blocked",
  };

  return (
    <span
      className={`rounded border px-2 py-1 text-xs font-semibold ${evidenceStyles[status]}`}
    >
      {labelByStatus[status]}
    </span>
  );
}

function BoundaryBadge({
  boundary,
  tone,
}: {
  boundary: string;
  tone: BoundaryTone;
}) {
  return (
    <span
      className={`inline-flex rounded border px-3 py-1.5 text-xs font-semibold ${boundaryStyles[tone]}`}
    >
      {boundary}
    </span>
  );
}

export function ClinTrialWorkspace() {
  const [selectedLineId, setSelectedLineId] = useState(invoiceLines[0].id);
  const selectedLine =
    invoiceLines.find((line) => line.id === selectedLineId) ?? invoiceLines[0];

  return (
    <main className="min-h-dvh bg-[#f4f6f8] text-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-slate-500">
              ClinTrial
            </p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-slate-950 sm:text-4xl">
              Payment evidence review
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
              Read-only governance workspace for uploaded clinical trial site
              invoices, extracted line items, evidence retrieval, and automation
              boundary recommendations.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
            <div className="rounded border border-slate-200 bg-white px-3 py-2">
              <div className="text-xl font-bold text-slate-950">6</div>
              <div className="text-xs font-medium text-slate-500">Lines</div>
            </div>
            <div className="rounded border border-slate-200 bg-white px-3 py-2">
              <div className="text-xl font-bold text-amber-700">3</div>
              <div className="text-xs font-medium text-slate-500">Review</div>
            </div>
            <div className="rounded border border-slate-200 bg-white px-3 py-2">
              <div className="text-xl font-bold text-rose-700">1</div>
              <div className="text-xs font-medium text-slate-500">Gap</div>
            </div>
          </div>
        </header>

        <section
          aria-label="ClinTrial invoice review workspace"
          className="grid flex-1 gap-4 lg:grid-cols-[minmax(280px,0.95fr)_minmax(360px,1.2fr)_minmax(320px,0.9fr)]"
        >
          <section className="min-h-[420px] rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    Uploaded invoice
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    INV-SITE-PARIS-2026-0042
                  </p>
                </div>
                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                  OCR ready
                </span>
              </div>
              <div className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50 p-3">
                <div className="aspect-[5/3] rounded bg-white p-3 shadow-sm">
                  <div className="mb-3 h-5 w-32 rounded bg-slate-800" />
                  <div className="space-y-2">
                    <div className="h-2 w-full rounded bg-slate-200" />
                    <div className="h-2 w-5/6 rounded bg-slate-200" />
                    <div className="h-2 w-4/6 rounded bg-slate-200" />
                  </div>
                  <div className="mt-5 grid grid-cols-[40px_1fr_80px] gap-2">
                    {invoiceLines.slice(0, 5).map((line) => (
                      <div className="contents" key={line.id}>
                        <div className="h-2 rounded bg-slate-300" />
                        <div className="h-2 rounded bg-slate-200" />
                        <div className="h-2 rounded bg-slate-300" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 p-3">
              {invoiceLines.map((line) => {
                const isSelected = line.id === selectedLine.id;

                return (
                  <button
                    aria-pressed={isSelected}
                    className={`w-full cursor-pointer rounded border p-3 text-left transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      isSelected
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white"
                    }`}
                    key={line.id}
                    onClick={() => setSelectedLineId(line.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-950">
                          Line {line.lineNumber} - {line.patientId}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {line.itemName}
                        </div>
                      </div>
                      <div className="text-right text-sm font-semibold tabular-nums text-slate-950">
                        {line.amount}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <BoundaryBadge
                        boundary={line.boundary}
                        tone={line.boundaryTone}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="min-h-[420px] rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <p className="text-sm font-semibold uppercase text-slate-500">
                Evidence packet
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">
                {selectedLine.itemCode}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {selectedLine.rawDescription}
              </p>
            </div>

            <div className="space-y-3 p-4">
              {selectedLine.evidence.map((evidence) => (
                <article
                  className="rounded border border-slate-200 bg-white p-4"
                  key={`${selectedLine.id}-${evidence.title}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">
                        {evidence.title}
                      </h3>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {evidence.source}
                      </p>
                    </div>
                    <EvidenceStatusBadge status={evidence.status} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    {evidence.detail}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="min-h-[420px] rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <p className="text-sm font-semibold uppercase text-slate-500">
                Boundary recommendation
              </p>
              <div className="mt-3">
                <BoundaryBadge
                  boundary={selectedLine.boundary}
                  tone={selectedLine.boundaryTone}
                />
              </div>
            </div>

            <div className="space-y-5 p-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700">
                    Evidence quality
                  </span>
                  <span className="font-bold tabular-nums text-slate-950">
                    {selectedLine.score}/100
                  </span>
                </div>
                <div className="h-3 rounded bg-slate-100">
                  <div
                    className={`h-3 rounded ${
                      selectedLine.boundaryTone === "auto"
                        ? "bg-emerald-500"
                        : selectedLine.boundaryTone === "confirm"
                          ? "bg-blue-500"
                          : selectedLine.boundaryTone === "review"
                            ? "bg-amber-500"
                            : "bg-rose-500"
                    }`}
                    style={{ width: `${selectedLine.score}%` }}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  Decision rationale
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {selectedLine.decisionReason}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  Audit trail draft
                </h3>
                <ol className="mt-3 space-y-3">
                  {selectedLine.auditTrail.map((entry, index) => (
                    <li
                      className="grid grid-cols-[28px_1fr] gap-3 text-sm leading-6 text-slate-700"
                      key={entry}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                        {index + 1}
                      </span>
                      <span>{entry}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded border border-slate-200 bg-slate-50 p-3">
                <label
                  className="text-sm font-semibold text-slate-950"
                  htmlFor="reviewer-note"
                >
                  Reviewer note
                </label>
                <textarea
                  className="mt-2 min-h-24 w-full resize-none rounded border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  defaultValue="No payment action taken. Boundary recommendation recorded for finance review."
                  id="reviewer-note"
                />
                <button
                  className="mt-3 min-h-11 w-full cursor-pointer rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  type="button"
                >
                  Save audit note
                </button>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
