import "server-only";

import OpenAI from "openai";

import type { EvidenceCard, InvoiceLine, RetrievalPlan } from "@/lib/agent/types";

type EvidenceRankerProvider =
  | "vultron_rerank"
  | "vultr_chat"
  | "deterministic_fallback";

type EvidenceRelation =
  | "support"
  | "contradiction"
  | "missing_condition"
  | "duplicate_risk"
  | "context";

type RankedEvidencePayload = {
  rankedEvidence?: unknown;
};

type RawRankedEvidence = {
  evidenceId?: unknown;
  relation?: unknown;
  status?: unknown;
  finding?: unknown;
  confidence?: unknown;
};

type EvidenceRankerRequest = {
  line: InvoiceLine;
  plan: RetrievalPlan;
  candidates: EvidenceCard[];
};

type EvidenceRankerResult = {
  evidence: EvidenceCard[];
  provider: EvidenceRankerProvider;
  model?: string;
  warnings: string[];
};

const defaultBaseUrl = "https://api.vultrinference.com/v1";
const defaultEvidenceRankerModels = [
  "vultr/VultronRetrieverPrime-Qwen3.5-8B",
  "vultr/VultronRetrieverCore-Qwen3.5-4.5B",
  "vultr/VultronRetrieverFlash-Qwen3.5-0.8B",
];
const defaultEvidenceRankerTimeoutMs = 20000;
const maxCandidateEvidence = 14;
const maxRankedEvidence = 8;
const maxExcerptLength = 360;

const statusPriority: Record<EvidenceCard["status"], number> = {
  blocked: 5,
  missing: 4,
  partial: 3,
  matched: 2,
};

const relationPriority: Record<EvidenceRelation, number> = {
  duplicate_risk: 6,
  missing_condition: 5,
  contradiction: 4,
  support: 3,
  context: 1,
};

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
    timeout: evidenceRankerTimeoutMs(),
  });
}

function normalizeVultronModelName(model: string): string {
  if (model.startsWith("VultronRetriever")) {
    return `vultr/${model}`;
  }

  return model;
}

function uniqueModelNames(models: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const model of models) {
    const normalized = normalizeVultronModelName(model.trim());

    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function evidenceRankerModels(): string[] {
  const configuredModels =
    envValue("VULTR_EVIDENCE_RANKER_MODELS") ??
    envValue("VULTR_EVIDENCE_RANKER_MODEL");

  if (configuredModels) {
    return uniqueModelNames(configuredModels.split(","));
  }

  return defaultEvidenceRankerModels;
}

function evidenceRankerTimeoutMs(): number {
  const value = Number(envValue("VULTR_EVIDENCE_RANKER_TIMEOUT_MS"));

  if (Number.isFinite(value) && value >= 5000 && value <= 60000) {
    return value;
  }

  return defaultEvidenceRankerTimeoutMs;
}

function evidenceRankerMaxTokens(): number | undefined {
  const value = Number(
    envValue("VULTR_EVIDENCE_RANKER_MAX_TOKENS") ??
      envValue("VULTR_MAX_TOKENS"),
  );

  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return undefined;
}

function isVultronRetrieverModel(model: string): boolean {
  return model.startsWith("vultr/VultronRetriever");
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
  const compacted = compactText(value);

  if (compacted.length <= maxLength) {
    return compacted;
  }

  return `${compacted.slice(0, maxLength - 3)}...`;
}

function numericConfidence(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(typeof value === "string" ? value : "");

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (parsed > 1 && parsed <= 100) {
    return Math.max(0, Math.min(1, parsed / 100));
  }

  return Math.max(0, Math.min(1, parsed));
}

function allowedStatus(value: unknown): EvidenceCard["status"] | null {
  if (
    value === "matched" ||
    value === "partial" ||
    value === "missing" ||
    value === "blocked"
  ) {
    return value;
  }

  return null;
}

function allowedRelation(value: unknown): EvidenceRelation {
  if (
    value === "support" ||
    value === "contradiction" ||
    value === "missing_condition" ||
    value === "duplicate_risk" ||
    value === "context"
  ) {
    return value;
  }

  return "context";
}

function relationFromEvidence(card: EvidenceCard): EvidenceRelation {
  if (card.status === "blocked") {
    return "duplicate_risk";
  }

  const text = `${card.finding} ${card.excerpt}`.toLowerCase();

  if (
    card.status === "missing" ||
    text.includes("missing") ||
    text.includes("required") ||
    text.includes("authorization")
  ) {
    return "missing_condition";
  }

  if (
    text.includes("not routinely") ||
    text.includes("policy gap") ||
    text.includes("does not")
  ) {
    return "contradiction";
  }

  if (card.status === "matched") {
    return "support";
  }

  return "context";
}

function deterministicScore(card: EvidenceCard): number {
  const relation = relationFromEvidence(card);

  return (
    statusPriority[card.status] * 10 +
    relationPriority[relation] * 4 +
    card.confidence
  );
}

function uniqueCandidates(candidates: EvidenceCard[]): EvidenceCard[] {
  const seen = new Set<string>();
  const result: EvidenceCard[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      continue;
    }

    seen.add(candidate.id);
    result.push(candidate);
  }

  return result;
}

function deterministicRankEvidence(candidates: EvidenceCard[]): EvidenceCard[] {
  return uniqueCandidates(candidates)
    .toSorted((left, right) => deterministicScore(right) - deterministicScore(left))
    .slice(0, maxRankedEvidence);
}

function candidatePayload(candidates: EvidenceCard[]) {
  return uniqueCandidates(candidates)
    .toSorted((left, right) => deterministicScore(right) - deterministicScore(left))
    .slice(0, maxCandidateEvidence)
    .map((candidate) => ({
      id: candidate.id,
      sourceType: candidate.sourceType,
      sourceName: candidate.sourceName,
      locator: candidate.locator,
      currentStatus: candidate.status,
      currentFinding: truncateText(candidate.finding, 220),
      excerpt: truncateText(candidate.excerpt, maxExcerptLength),
      confidence: candidate.confidence,
    }));
}

function evidenceDocumentText(candidate: EvidenceCard): string {
  return [
    `evidence_id=${candidate.id}`,
    `source_type=${candidate.sourceType}`,
    `source_name=${candidate.sourceName}`,
    `locator=${candidate.locator}`,
    `status=${candidate.status}`,
    `finding=${candidate.finding}`,
    `excerpt=${candidate.excerpt}`,
  ].join("\n");
}

function rerankQuery(request: EvidenceRankerRequest): string {
  return compactText(
    [
      request.line.patientId,
      request.line.visitName,
      request.line.rawDescription,
      request.line.amount,
      ...request.plan.candidateItemCodes,
      ...request.plan.coverageQueries,
      ...request.plan.siteEvidenceQueries,
      ...request.plan.ledgerQueries,
    ].join(" "),
  );
}

function systemPrompt(): string {
  return [
    "You are TrialGuard's evidence ranking subagent for a read-only clinical trial payment governance demo.",
    "Rank only the evidence ids supplied by the backend.",
    "Do not invent sources, facts, payment approvals, or final automation boundaries.",
    "Return valid JSON only. Do not reveal hidden reasoning.",
  ].join(" ");
}

function userPrompt(request: EvidenceRankerRequest): string {
  return JSON.stringify(
    {
      invoiceLine: request.line,
      retrievalPlan: request.plan,
      evidenceCandidates: candidatePayload(request.candidates),
      outputShape: {
        rankedEvidence: [
          {
            evidenceId: "source-id-from-candidates-only",
            relation:
              "support | contradiction | missing_condition | duplicate_risk | context",
            status: "matched | partial | missing | blocked",
            finding: "short reviewer-facing finding tied to this source",
            confidence: 0.0,
          },
        ],
      },
      constraints: {
        maxRankedEvidence,
        allowedRelations: [
          "support",
          "contradiction",
          "missing_condition",
          "duplicate_risk",
          "context",
        ],
        allowedStatuses: ["matched", "partial", "missing", "blocked"],
        hardRules: [
          "Only use evidence ids in evidenceCandidates.",
          "A paid duplicate ledger row must be blocked.",
          "Missing authorization or subgroup evidence should be partial or missing, not matched.",
          "Protocol support alone must not imply sponsor billability.",
          "Do not approve payment or release funds.",
        ],
      },
    },
    null,
    2,
  );
}

function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function parseRankerPayload(content: string): RankedEvidencePayload {
  const parsed: unknown = JSON.parse(stripJsonFence(content));

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Evidence ranker response was not a JSON object.");
  }

  return parsed as RankedEvidencePayload;
}

function normalizeRankerPayload(
  payload: RankedEvidencePayload,
  candidates: EvidenceCard[],
): EvidenceCard[] {
  if (!Array.isArray(payload.rankedEvidence)) {
    throw new Error("Evidence ranker response did not include rankedEvidence.");
  }

  const candidatesById = new Map(
    uniqueCandidates(candidates).map((candidate) => [candidate.id, candidate]),
  );
  const seen = new Set<string>();
  const ranked: EvidenceCard[] = [];

  for (const item of payload.rankedEvidence) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const rawItem = item as RawRankedEvidence;
    const evidenceId =
      typeof rawItem.evidenceId === "string" ? rawItem.evidenceId : "";
    const candidate = candidatesById.get(evidenceId);

    if (!candidate || seen.has(evidenceId)) {
      continue;
    }

    const relation = allowedRelation(rawItem.relation);
    const status = allowedStatus(rawItem.status) ?? candidate.status;
    const finding =
      typeof rawItem.finding === "string" && rawItem.finding.trim().length > 0
        ? truncateText(rawItem.finding, 260)
        : candidate.finding;

    ranked.push({
      ...candidate,
      status,
      finding: `${finding} Relation: ${relation}.`,
      confidence: numericConfidence(rawItem.confidence, candidate.confidence),
    });
    seen.add(evidenceId);
  }

  if (ranked.length === 0) {
    throw new Error("Evidence ranker response had no usable evidence ids.");
  }

  return ranked.slice(0, maxRankedEvidence);
}

function fallbackResult(
  candidates: EvidenceCard[],
  warnings: string[] = [],
): EvidenceRankerResult {
  return {
    evidence: deterministicRankEvidence(candidates),
    provider: "deterministic_fallback",
    warnings,
  };
}

async function rankWithVultronRetriever(
  request: EvidenceRankerRequest,
  model: string,
): Promise<EvidenceRankerResult> {
  const apiKey = envValue("VULTR_INFERENCE_KEY");

  if (!apiKey) {
    throw new Error("Missing VULTR_INFERENCE_KEY.");
  }

  const candidates = uniqueCandidates(request.candidates)
    .toSorted((left, right) => deterministicScore(right) - deterministicScore(left))
    .slice(0, maxCandidateEvidence);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, evidenceRankerTimeoutMs());

  try {
    const response = await fetch(
      `${envValue("VULTR_INFERENCE_BASE_URL") ?? defaultBaseUrl}/rerank`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          query: rerankQuery(request),
          documents: candidates.map(evidenceDocumentText),
          top_n: Math.min(maxRankedEvidence, candidates.length),
        }),
        signal: controller.signal,
      },
    );
    const payload: unknown = await response.json();

    if (!response.ok) {
      throw new Error("VultronRetriever rerank request failed.");
    }

    if (
      typeof payload !== "object" ||
      payload === null ||
      !Array.isArray((payload as { results?: unknown }).results)
    ) {
      throw new Error("VultronRetriever rerank response was invalid.");
    }

    const ranked = (payload as { results: Array<{ index?: unknown }> }).results
      .map((result) =>
        typeof result.index === "number" ? candidates[result.index] : undefined,
      )
      .filter((candidate): candidate is EvidenceCard => candidate !== undefined);

    if (ranked.length === 0) {
      throw new Error("VultronRetriever rerank response had no usable results.");
    }

    return {
      evidence: ranked,
      provider: "vultron_rerank",
      model,
      warnings: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function rankWithChatModel(
  request: EvidenceRankerRequest,
  model: string,
): Promise<EvidenceRankerResult> {
  const client = createVultrClient();
  const maxTokens = evidenceRankerMaxTokens();
  const completion = await client.chat.completions.create(
    {
      model,
      temperature: 0,
      ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      messages: [
        {
          role: "system",
          content: systemPrompt(),
        },
        {
          role: "user",
          content: userPrompt(request),
        },
      ],
    },
    { timeout: evidenceRankerTimeoutMs() },
  );

  const content = completion.choices[0]?.message.content?.trim();

  if (!content) {
    throw new Error("Evidence ranker response was empty.");
  }

  return {
    evidence: normalizeRankerPayload(
      parseRankerPayload(content),
      request.candidates,
    ),
    provider: "vultr_chat",
    model,
    warnings: [],
  };
}

export async function rankEvidenceForInvoiceLine(
  request: EvidenceRankerRequest,
): Promise<EvidenceRankerResult> {
  if (request.candidates.length === 0) {
    return fallbackResult([], ["No local evidence candidates were available."]);
  }

  if (!envValue("VULTR_INFERENCE_KEY")) {
    return fallbackResult(request.candidates, ["Missing Vultr inference key."]);
  }

  const models = evidenceRankerModels();
  const warnings: string[] = [];

  for (const model of models) {
    if (isVultronRetrieverModel(model)) {
      try {
        const result = await rankWithVultronRetriever(request, model);

        return {
          ...result,
          warnings: [...warnings, ...result.warnings],
        };
      } catch {
        warnings.push(`${model} unavailable.`);
        continue;
      }
    }

    try {
      const result = await rankWithChatModel(request, model);

      return {
        ...result,
        warnings: [...warnings, ...result.warnings],
      };
    } catch {
      warnings.push(`${model} unavailable.`);
    }
  }

  return fallbackResult(request.candidates, [
    ...warnings,
    "Vultr evidence ranker unavailable; deterministic evidence ranking used.",
  ]);
}
