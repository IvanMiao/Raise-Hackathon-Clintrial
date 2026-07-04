import "server-only";

import OpenAI from "openai";

import type { InvoiceLine, RetrievalPlan } from "@/lib/agent/types";

type RetrievalPlannerProvider = "vultr" | "deterministic_fallback";

type RetrievalPlannerResult = {
  plan: RetrievalPlan;
  provider: RetrievalPlannerProvider;
  model?: string;
  warnings: string[];
};

type ItemCodeHint = {
  code: string;
  name: string;
  matchTerms: string[];
  protocolQueries: string[];
  budgetQueries: string[];
  siteEvidenceTerms: string[];
};

const defaultBaseUrl = "https://api.vultrinference.com/v1";
const defaultPlannerModel = "moonshotai/Kimi-K2.6";
const defaultPlannerTimeoutMs = 12000;
const maxQueryLength = 120;
const maxQueriesPerSource = 4;

const itemCodeHints: ItemCodeHint[] = [
  {
    code: "UNDEFINED_REMOTE_MONITORING",
    name: "Remote monitoring fee",
    matchTerms: ["remote monitoring", "monitoring tech", "remote tech"],
    protocolQueries: [
      "remote monitoring protocol support",
      "unscheduled assessments remote monitoring",
    ],
    budgetQueries: [
      "remote monitoring fee",
      "budget policy gap remote monitoring",
    ],
    siteEvidenceTerms: ["remote monitoring note"],
  },
  {
    code: "ENDOSCOPY_V3",
    name: "Visit 3 endoscopy with biopsy",
    matchTerms: ["endoscopy", "biopsy", "mucosal biopsy"],
    protocolQueries: [
      "endoscopy biopsy Visit 3",
      "disease activity assessment Visit 3",
      "unscheduled procedure authorization",
    ],
    budgetQueries: [
      "endoscopy with biopsy",
      "Visit 3 endoscopy authorization",
      "unscheduled procedure authorization",
    ],
    siteEvidenceTerms: ["endoscopy authorization sponsor approval"],
  },
  {
    code: "PK_SAMPLE_V3",
    name: "Visit 3 PK blood sample",
    matchTerms: ["pk", "pharmacokinetic", "blood draw", "sample handling"],
    protocolQueries: [
      "PK blood sample Visit 3",
      "PK subgroup consent",
      "pharmacokinetics assessed only in subgroup",
    ],
    budgetQueries: [
      "PK blood sample handling Visit 3",
      "PK subgroup budget condition",
    ],
    siteEvidenceTerms: ["PK sample PK subgroup consent"],
  },
  {
    code: "IMP_INFUSION_V3",
    name: "Visit 3 TJ301/placebo IV infusion administration",
    matchTerms: ["tj301", "placebo", "infusion", "iv infusion", "day 14"],
    protocolQueries: [
      "TJ301 placebo infusion Day 14",
      "Visit 3 investigational medicinal product administration",
    ],
    budgetQueries: [
      "Visit 3 infusion administration",
      "TJ301 placebo infusion budget",
    ],
    siteEvidenceTerms: ["infusion administration Day 14"],
  },
  {
    code: "ADMIN_FEE",
    name: "Administrative processing fee",
    matchTerms: ["admin", "administrative", "processing fee", "visit package"],
    protocolQueries: [
      "administrative fee completed visit",
      "site operations visit package",
    ],
    budgetQueries: [
      "administrative processing fee",
      "admin fee once per completed visit",
    ],
    siteEvidenceTerms: ["completed visit admin fee"],
  },
  {
    code: "VISIT_FEE_V3",
    name: "Visit 3 site fee",
    matchTerms: ["visit 3 site fee", "site fee", "visit fee", "wk2 completed"],
    protocolQueries: [
      "Visit 3 Week 2 Day 14 treatment period",
      "Visit 3 completed within window",
    ],
    budgetQueries: [
      "Visit 3 site fee",
      "site fee completed EDC visit",
    ],
    siteEvidenceTerms: ["EDC visit completed within window"],
  },
  {
    code: "DISEASE_ASSESS_V3",
    name: "Clinical disease activity assessment",
    matchTerms: ["disease activity", "clinical assessment"],
    protocolQueries: [
      "clinical disease activity Visit 3",
      "disease activity assessments treatment visits",
    ],
    budgetQueries: [
      "clinical disease activity assessment Visit 3",
      "disease assessment budget Visit 3",
    ],
    siteEvidenceTerms: ["disease activity assessment source record"],
  },
  {
    code: "SAFETY_LAB_V3",
    name: "Clinical safety laboratory test",
    matchTerms: ["safety lab", "laboratory", "lab test"],
    protocolQueries: [
      "safety laboratory testing Visit 3",
      "protocol safety assessments treatment visits",
    ],
    budgetQueries: ["safety laboratory test Visit 3"],
    siteEvidenceTerms: ["lab result source record"],
  },
  {
    code: "ECG_V3",
    name: "12-lead ECG",
    matchTerms: ["ecg", "12-lead"],
    protocolQueries: [
      "12-lead ECG Visit 3",
      "protocol ECG treatment visits",
    ],
    budgetQueries: ["12-lead ECG Visit 3"],
    siteEvidenceTerms: ["ECG source record"],
  },
  {
    code: "ROUTINE_UC_MED",
    name: "Stable conventional UC medication",
    matchTerms: ["uc medication", "conventional treatment", "routine care"],
    protocolQueries: [
      "stable conventional ulcerative colitis treatment",
      "routine care medication protocol",
    ],
    budgetQueries: [
      "routine payer conventional UC medication",
      "stable conventional treatment budget",
    ],
    siteEvidenceTerms: ["routine medication clinically indicated"],
  },
];

const allowedItemCodes = new Set(itemCodeHints.map((hint) => hint.code));

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();

  return value && value.length > 0 ? value : undefined;
}

function createVultrClient(): OpenAI {
  const apiKey = envValue("VULTR_INFERENCE_KEY");

  if (!apiKey) {
    throw new Error("Missing VULTR_INFERENCE_KEY.");
  }

  return new OpenAI({
    apiKey,
    baseURL: envValue("VULTR_INFERENCE_BASE_URL") ?? defaultBaseUrl,
    maxRetries: 0,
    timeout: plannerTimeoutMs(),
  });
}

function plannerModel(): string {
  return (
    envValue("VULTR_RETRIEVAL_PLANNER_MODEL") ??
    envValue("VULTR_MODEL") ??
    defaultPlannerModel
  );
}

function plannerTimeoutMs(): number {
  const value = Number(envValue("VULTR_RETRIEVAL_PLANNER_TIMEOUT_MS"));

  if (Number.isFinite(value) && value >= 1000 && value <= 60000) {
    return value;
  }

  return defaultPlannerTimeoutMs;
}

function normalizedLineText(line: InvoiceLine): string {
  return [
    line.patientId,
    line.visitName,
    line.rawDescription,
    line.amount,
  ]
    .join(" ")
    .toLowerCase();
}

function matchesHint(lineText: string, hint: ItemCodeHint): boolean {
  return hint.matchTerms.some((term) => lineText.includes(term));
}

function compactString(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const compacted = compactString(value).slice(0, maxQueryLength);
    const key = compacted.toLowerCase();

    if (compacted.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(compacted);
  }

  return result;
}

function queryLimit(values: string[]): string[] {
  return uniqueStrings(values).slice(0, maxQueriesPerSource);
}

function fallbackQueries(line: InvoiceLine): RetrievalPlan {
  const patientVisit = `${line.patientId} ${line.visitName}`;
  const rawDescription = compactString(line.rawDescription);

  return {
    candidateItemCodes: [],
    protocolQueries: queryLimit([rawDescription, `${line.visitName} ${rawDescription}`]),
    budgetQueries: queryLimit([rawDescription]),
    coverageQueries: queryLimit([rawDescription, `${line.visitName} ${rawDescription}`]),
    siteEvidenceQueries: queryLimit([`${patientVisit} ${rawDescription}`]),
    ledgerQueries: queryLimit([`${patientVisit} ${rawDescription}`]),
  };
}

export function createDeterministicRetrievalPlan(line: InvoiceLine): RetrievalPlan {
  const lineText = normalizedLineText(line);
  const matchedHints = itemCodeHints.filter((hint) => matchesHint(lineText, hint));

  if (matchedHints.length === 0) {
    return fallbackQueries(line);
  }

  const primaryHint = matchedHints[0];
  const candidateItemCodes = [primaryHint.code];
  const patientVisit = `${line.patientId} ${line.visitName}`;

  return {
    candidateItemCodes,
    protocolQueries: queryLimit([
      ...primaryHint.protocolQueries,
      `${primaryHint.name} ${line.visitName}`,
    ]),
    budgetQueries: queryLimit([
      ...primaryHint.budgetQueries,
      `${primaryHint.name} ${line.amount}`,
    ]),
    coverageQueries: queryLimit([
      ...candidateItemCodes,
      primaryHint.name,
      line.rawDescription,
    ]),
    siteEvidenceQueries: queryLimit([
      `${patientVisit} ${primaryHint.siteEvidenceTerms[0]}`,
      `${patientVisit} ${line.rawDescription}`,
    ]),
    ledgerQueries: queryLimit(
      candidateItemCodes.flatMap((itemCode) => [
        `${patientVisit} ${itemCode}`,
        `${line.patientId} ${line.visitName} prior payment ${itemCode}`,
      ]),
    ),
  };
}

function systemPrompt(): string {
  return [
    "You are TrialGuard's retrieval planning subagent for a read-only clinical trial payment governance demo.",
    "Your only task is to map one invoice line to local evidence search queries.",
    "Return only one valid JSON object with the exact keys requested by the user.",
    "Do not approve invoices, release funds, choose an automation boundary, or write final recommendations.",
    "Do not reveal hidden reasoning. Queries must be concise search phrases, not conclusions.",
    "candidateItemCodes must be selected only from the allowed item code list. Prefer one code; use at most three.",
    "Use patient id and visit name in site evidence and ledger queries when available.",
  ].join("\n");
}

function userPrompt(line: InvoiceLine): string {
  return JSON.stringify(
    {
      invoiceLine: line,
      allowedItemCodes: itemCodeHints.map((hint) => ({
        code: hint.code,
        name: hint.name,
      })),
      outputShape: {
        candidateItemCodes: ["VISIT_FEE_V3"],
        protocolQueries: ["protocol search phrase"],
        budgetQueries: ["CTA or budget search phrase"],
        coverageQueries: ["coverage grid item code or description"],
        siteEvidenceQueries: ["patient visit source evidence search phrase"],
        ledgerQueries: ["patient visit item code prior payment search phrase"],
      },
      constraints: {
        maxCandidateItemCodes: 3,
        maxQueriesPerSource,
        maxQueryLength,
        allowedSources: [
          "protocol",
          "cta_budget",
          "coverage_grid",
          "site_evidence",
          "prior_ledger",
        ],
      },
    },
    null,
    2,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(content: string): unknown {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");

  if (start === -1 || end <= start) {
    throw new Error("Planner response did not contain a JSON object.");
  }

  return JSON.parse(content.slice(start, end + 1)) as unknown;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return uniqueStrings(
    value.filter((item): item is string => typeof item === "string"),
  ).slice(0, maxQueriesPerSource);
}

function itemCodeArray(value: unknown): string[] | null {
  const values = stringArray(value);

  if (values === null) {
    return null;
  }

  return values
    .map((value) => value.toUpperCase())
    .filter((value) => allowedItemCodes.has(value))
    .slice(0, 3);
}

function mergeWithFallback(
  modelPlan: RetrievalPlan,
  fallbackPlan: RetrievalPlan,
): RetrievalPlan {
  return {
    candidateItemCodes:
      modelPlan.candidateItemCodes.length > 0
        ? modelPlan.candidateItemCodes
        : fallbackPlan.candidateItemCodes,
    protocolQueries:
      modelPlan.protocolQueries.length > 0
        ? modelPlan.protocolQueries
        : fallbackPlan.protocolQueries,
    budgetQueries:
      modelPlan.budgetQueries.length > 0
        ? modelPlan.budgetQueries
        : fallbackPlan.budgetQueries,
    coverageQueries:
      modelPlan.coverageQueries.length > 0
        ? modelPlan.coverageQueries
        : fallbackPlan.coverageQueries,
    siteEvidenceQueries:
      modelPlan.siteEvidenceQueries.length > 0
        ? modelPlan.siteEvidenceQueries
        : fallbackPlan.siteEvidenceQueries,
    ledgerQueries:
      modelPlan.ledgerQueries.length > 0
        ? modelPlan.ledgerQueries
        : fallbackPlan.ledgerQueries,
  };
}

function normalizePlannerPayload(
  payload: unknown,
  fallbackPlan: RetrievalPlan,
): RetrievalPlan {
  if (!isRecord(payload)) {
    throw new Error("Planner response must be a JSON object.");
  }

  const candidateItemCodes = itemCodeArray(payload.candidateItemCodes);
  const protocolQueries = stringArray(payload.protocolQueries);
  const budgetQueries = stringArray(payload.budgetQueries);
  const coverageQueries = stringArray(payload.coverageQueries);
  const siteEvidenceQueries = stringArray(payload.siteEvidenceQueries);
  const ledgerQueries = stringArray(payload.ledgerQueries);

  if (
    candidateItemCodes === null ||
    protocolQueries === null ||
    budgetQueries === null ||
    coverageQueries === null ||
    siteEvidenceQueries === null ||
    ledgerQueries === null
  ) {
    throw new Error("Planner response did not match RetrievalPlan shape.");
  }

  return mergeWithFallback(
    {
      candidateItemCodes,
      protocolQueries,
      budgetQueries,
      coverageQueries,
      siteEvidenceQueries,
      ledgerQueries,
    },
    fallbackPlan,
  );
}

function fallbackResult(
  line: InvoiceLine,
  warnings: string[] = [],
): RetrievalPlannerResult {
  return {
    plan: createDeterministicRetrievalPlan(line),
    provider: "deterministic_fallback",
    warnings,
  };
}

export async function createRetrievalPlanForInvoiceLine(
  line: InvoiceLine,
): Promise<RetrievalPlannerResult> {
  if (!envValue("VULTR_INFERENCE_KEY")) {
    return fallbackResult(line, ["Missing Vultr inference key."]);
  }

  const model = plannerModel();
  const fallbackPlan = createDeterministicRetrievalPlan(line);

  try {
    const client = createVultrClient();
    const completion = await client.chat.completions.create(
      {
        model,
        temperature: 0.1,
        max_tokens: 650,
        messages: [
          {
            role: "system",
            content: systemPrompt(),
          },
          {
            role: "user",
            content: userPrompt(line),
          },
        ],
      },
      { timeout: plannerTimeoutMs() },
    );

    const content = completion.choices[0]?.message.content?.trim();

    if (!content) {
      throw new Error("Planner response was empty.");
    }

    return {
      plan: normalizePlannerPayload(parseJsonObject(content), fallbackPlan),
      provider: "vultr",
      model,
      warnings: [],
    };
  } catch {
    return fallbackResult(line, [
      "Vultr retrieval planner unavailable; deterministic fallback used.",
    ]);
  }
}
