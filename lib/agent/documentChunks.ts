import "server-only";

import type { EvidenceCard, EvidenceChunk } from "@/lib/agent/types";

type DocumentSearchInput = {
  sourceType?: EvidenceChunk["sourceType"];
  queries: string[];
  limit?: number;
};

type ScoredDocumentChunk = {
  chunk: EvidenceChunk;
  score: number;
  confidence: number;
};

const documentChunks: EvidenceChunk[] = [
  {
    id: "protocol-treatment-visit-3",
    sourceType: "protocol",
    sourceName: "Prot_000.pdf",
    locator: "Prot_000.pdf#trial-flow-treatment-period",
    section: "Trial Flow / Treatment Period",
    text:
      "Visit 3 is the Week 2 / Day 14 treatment-period visit. Trial visits continue through Visit 8 during the double-blind treatment period.",
  },
  {
    id: "protocol-imp-infusion-schedule",
    sourceType: "protocol",
    sourceName: "Prot_000.pdf",
    locator: "Prot_000.pdf#imp-administration",
    section: "Investigational Medicinal Product Administration",
    text:
      "TJ301 or placebo is administered by intravenous infusion every 2 weeks for 12 weeks, with 6 infusions total. The infusion time is 2 hours.",
  },
  {
    id: "protocol-disease-assessments",
    sourceType: "protocol",
    sourceName: "Prot_000.pdf",
    locator: "Prot_000.pdf#clinical-disease-activity",
    section: "Clinical and Endoscopic Disease Activity",
    text:
      "Clinical assessments of disease activity occur at Screening, Randomisation, Visit 3, Visit 4, Visit 5, Visit 6, Visit 7, Visit 8, and follow-up. Endoscopy and mucosal biopsies are tied to Screening and Visit 8 rather than routine Visit 3 billing.",
  },
  {
    id: "protocol-pk-subgroup",
    sourceType: "protocol",
    sourceName: "Prot_000.pdf",
    locator: "Prot_000.pdf#pk-subgroup",
    section: "PK Visits",
    text:
      "TJ301 pharmacokinetics are assessed only in a subgroup of patients. PK subgroup consent or assignment is required before PK sample charges can be treated as supported evidence.",
  },
  {
    id: "protocol-safety-lab-ecg",
    sourceType: "protocol",
    sourceName: "Prot_000.pdf",
    locator: "Prot_000.pdf#safety-assessments",
    section: "Safety Assessments",
    text:
      "Safety laboratory testing and routine 12-lead ECG are protocol safety assessments during treatment visits, including Visit 3.",
  },
  {
    id: "protocol-stable-conventional-treatment",
    sourceType: "protocol",
    sourceName: "Prot_000.pdf",
    locator: "Prot_000.pdf#stable-conventional-treatment",
    section: "Stable Conventional UC Treatment",
    text:
      "Patients should remain on stable conventional ulcerative colitis treatment during the double-blind and follow-up periods unless they cannot tolerate it.",
  },
  {
    id: "protocol-unscheduled-procedures",
    sourceType: "protocol",
    sourceName: "Prot_000.pdf",
    locator: "Prot_000.pdf#unscheduled-assessments",
    section: "Unscheduled Assessments",
    text:
      "Unscheduled visits may include additional assessments deemed necessary by the investigator, but protocol support alone does not establish sponsor-billable procedure authorization.",
  },
  {
    id: "cta-visit-fee-v3",
    sourceType: "cta_budget",
    sourceName: "CTA_Financial_Appendix_Excerpt.pdf",
    locator: "CTA_Financial_Appendix_Excerpt.pdf#budget-visit-fee-v3",
    section: "Budget Schedule",
    text:
      "Visit 3 site fee is a sponsor-routed site operations cost when the EDC visit is completed, within window, scheduled in the payment grid, and not duplicated in the prior ledger.",
  },
  {
    id: "cta-imp-infusion-v3",
    sourceType: "cta_budget",
    sourceName: "CTA_Financial_Appendix_Excerpt.pdf",
    locator: "CTA_Financial_Appendix_Excerpt.pdf#budget-imp-infusion-v3",
    section: "Budget Schedule",
    text:
      "Visit 3 TJ301 or placebo infusion administration is sponsor-routed when Day 14 administration and source evidence are present, the amount matches budget, and no duplicate exists.",
  },
  {
    id: "cta-pk-sample-v3",
    sourceType: "cta_budget",
    sourceName: "CTA_Financial_Appendix_Excerpt.pdf",
    locator: "CTA_Financial_Appendix_Excerpt.pdf#budget-pk-sample-v3",
    section: "Budget Conditions",
    text:
      "Visit 3 PK blood sample handling is sponsor-routed only for patients assigned or consented to the PK substudy and with a recorded PK sample.",
  },
  {
    id: "cta-admin-fee",
    sourceType: "cta_budget",
    sourceName: "CTA_Financial_Appendix_Excerpt.pdf",
    locator: "CTA_Financial_Appendix_Excerpt.pdf#budget-admin-fee",
    section: "Budget Schedule",
    text:
      "Administrative processing fee is a contracted site cost billable once per completed visit. Duplicate admin fee for the same patient and visit blocks automated handling.",
  },
  {
    id: "cta-endoscopy-v3",
    sourceType: "cta_budget",
    sourceName: "CTA_Financial_Appendix_Excerpt.pdf",
    locator: "CTA_Financial_Appendix_Excerpt.pdf#budget-endoscopy-v3",
    section: "Procedure Authorization",
    text:
      "Visit 3 endoscopy with biopsy is not routinely sponsor-billable in the budget excerpt. Explicit unscheduled procedure authorization, PI or CRC note, and sponsor approval are required for review.",
  },
  {
    id: "cta-remote-monitoring-gap",
    sourceType: "cta_budget",
    sourceName: "CTA_Financial_Appendix_Excerpt.pdf",
    locator: "CTA_Financial_Appendix_Excerpt.pdf#budget-policy-gap",
    section: "Policy Gap",
    text:
      "Remote monitoring fee has no supporting CTA, budget amendment, or billing policy rule in the synthetic financial appendix.",
  },
];

function normalizeTokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function uniqueTokens(values: string[]): string[] {
  return [...new Set(values.flatMap((value) => normalizeTokens(value)))];
}

function scoreChunk(chunk: EvidenceChunk, queries: string[]): number {
  const queryTokens = uniqueTokens(queries);

  if (queryTokens.length === 0) {
    return 0;
  }

  const haystack = [
    chunk.id,
    chunk.sourceName,
    chunk.locator,
    chunk.section ?? "",
    chunk.text,
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;

  for (const query of queries) {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery.length > 0 && haystack.includes(normalizedQuery)) {
      score += 4;
    }
  }

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function scoreToConfidence(score: number): number {
  if (score >= 8) {
    return 0.9;
  }

  if (score >= 5) {
    return 0.78;
  }

  if (score >= 3) {
    return 0.64;
  }

  return 0.52;
}

function toEvidenceCard(scoredChunk: ScoredDocumentChunk): EvidenceCard {
  const { chunk, confidence } = scoredChunk;

  return {
    id: chunk.id,
    sourceType: chunk.sourceType,
    sourceName: chunk.sourceName,
    locator: chunk.locator,
    status: "matched",
    excerpt: chunk.text,
    finding: `Document chunk matched ${chunk.section ?? chunk.sourceName}.`,
    confidence,
  };
}

export function getDocumentChunks(): EvidenceChunk[] {
  return documentChunks;
}

export function searchDocumentChunks(input: DocumentSearchInput): EvidenceCard[] {
  const limit = input.limit ?? 5;
  const eligibleChunks = input.sourceType
    ? documentChunks.filter((chunk) => chunk.sourceType === input.sourceType)
    : documentChunks;

  return eligibleChunks
    .map<ScoredDocumentChunk>((chunk) => {
      const score = scoreChunk(chunk, input.queries);

      return {
        chunk,
        score,
        confidence: scoreToConfidence(score),
      };
    })
    .filter((result) => result.score > 0)
    .toSorted((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(toEvidenceCard);
}
