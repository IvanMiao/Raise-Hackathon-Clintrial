# ClinTrial 后端 Agent 实现步骤

## 依据与目标

本文档基于当前最新方案文档整理：

- `docs/trialguard-agent-readiness.en.md`
- `docs/trialguard-vultr-workflows.mermaid.en.md`

ClinTrial 是临床试验付款场景的 read-only governance agent。它不批准付款、不释放资金、不写入真实临床或财务系统。后端目标不是实现一个普通的 `prompt -> answer` 接口，而是实现一个可审计的 evidence agent：

```text
上传 invoice 图片或 PDF
  -> 抽取 invoice line
  -> 使用 Vultr 主模型规划证据检索
  -> 搜索 data/ 中的 protocol、CTA、budget、EDC、ledger、billing evidence
  -> 使用 Vultr 主模型辅助判断哪些证据相关
  -> 使用确定性规则引擎生成 automation boundary
  -> 使用 Vultr 主模型生成审计友好的解释
  -> 前端实时展示 agent trace、证据和最终建议
```

核心原则：

- Agent 可以查证据、解释证据、生成查询、总结理由。
- 确定性代码负责最终边界、评分、安全约束和审计结构。
- Vultr Serverless Inference 是主模型，但不能单独决定付款边界。
- 前端展示 observable trace，不展示模型隐藏 chain-of-thought。

## 后端能力边界

### 必须支持

- 上传 invoice 图片或 PDF。
- 从上传文件得到 invoice line。MVP 可以先使用 `data/invoice_extraction_fixture.csv` 作为 mocked OCR / extraction result。
- 搜索 `data/` 中的合成证据：
  - `Prot_000.pdf`
  - `CTA_Financial_Appendix_Excerpt.pdf`
  - `coverage_analysis_billing_grid.csv`
  - `site_evidence_log.csv`
  - `prior_payment_ledger.csv`
  - `invoice_extraction_fixture.csv`
- 用 Vultr 模型生成 retrieval plan，例如 protocol 查询词、budget 查询词、candidate item code。
- 用后端只读工具执行实际搜索，并返回可引用 source。
- 用 Vultr 模型在候选 evidence chunks 中做相关性判断和解释。
- 用确定性规则输出 automation boundary。
- 用流式事件把 agent 进度同步到前端。

### 必须禁止

- 不允许 approve invoice。
- 不允许 release funds。
- 不允许写入真实 payment、ledger、EDC、CTMS、banking system。
- 不允许把 `VULTR_INFERENCE_KEY` 暴露给浏览器。
- 不允许把模型生成内容当成唯一证据。
- 不允许返回未绑定 source 的关键事实。

## 推荐 API 设计

新增 agent 上传接口：

```text
POST /api/agent-review
Content-Type: multipart/form-data
```

请求字段：

```text
invoice: image/png | image/jpeg | image/webp | image/svg+xml | application/pdf
mode?: demo | strict
```

当前实现中：

- `strict` 是默认模式，使用 Vultr vision-capable chat model 从上传图片抽取 invoice line。
- `demo` 模式仅用于合成 demo 入口；当视觉提取不可用时允许使用 fixture fallback。

响应建议使用 `ReadableStream` 返回 newline-delimited JSON events。前端可以边读边渲染 agent trace。

```ts
type AgentEvent =
  | { type: "started"; runId: string }
  | { type: "step"; label: string; status: "running" | "done" | "failed" }
  | { type: "extraction"; lines: InvoiceLine[] }
  | { type: "retrieval_plan"; lineId: string; plan: RetrievalPlan }
  | { type: "search"; lineId: string; query: string; sources: string[] }
  | { type: "evidence"; lineId: string; evidence: EvidenceCard[] }
  | { type: "decision"; lineId: string; recommendation: BoundaryRecommendation }
  | { type: "summary"; text: string }
  | { type: "error"; message: string }
  | { type: "complete"; result: AgentReviewResult };
```

## Agent Trace 展示规则

前端展示的是 agent 的可观察执行过程，不是模型内部思维链。

可以展示：

```text
1. Accepted uploaded invoice PDF.
2. Extracted 6 invoice lines from mocked OCR fixture.
3. Asked Vultr model to generate evidence search plan.
4. Searching protocol for "endoscopy biopsy Visit 3".
5. Found protocol evidence in Prot_000.pdf.
6. Searching prior ledger for patient P-104, Visit 3, ADMIN_FEE.
7. Found paid prior ledger row PAY-2026-0187.
8. Deterministic duplicate control triggered.
9. Boundary: Human review required.
```

不展示：

- 模型隐藏推理全文。
- 原始未裁剪 prompt。
- 敏感上传文件全文。
- 没有 source 的结论。

## 后端模块结构

建议新增：

```text
app/api/agent-review/route.ts

lib/agent/types.ts
lib/agent/events.ts
lib/agent/reviewAgent.ts

lib/agent/invoiceExtraction.ts
lib/agent/documentChunks.ts
lib/agent/dataSearch.ts

lib/agent/vultrRetrievalPlanner.ts
lib/agent/vultrEvidenceRanker.ts
lib/agent/vultrSummary.ts

lib/agent/evaluatePaymentLine.ts
```

职责：

| 文件 | 职责 |
| --- | --- |
| `route.ts` | multipart upload、输入校验、创建 stream、调用 agent orchestrator |
| `types.ts` | 后端共享类型 |
| `events.ts` | agent event 序列化与 stream 写入 |
| `reviewAgent.ts` | 串联 extraction、retrieval、evaluation、summary |
| `invoiceExtraction.ts` | invoice 图片/PDF抽取；MVP 先读 fixture |
| `documentChunks.ts` | protocol / CTA PDF 文本切块和 metadata |
| `dataSearch.ts` | 只读搜索 `data/` 中 CSV 和 document chunks |
| `vultrRetrievalPlanner.ts` | 调用 Vultr 生成检索计划 |
| `vultrEvidenceRanker.ts` | 调用 Vultr 判断候选 evidence 是否相关 |
| `vultrSummary.ts` | 调用 Vultr 生成 reviewer explanation 和 audit draft |
| `evaluatePaymentLine.ts` | 确定性规则引擎，输出 boundary 和 score |

所有 Vultr 相关 server-only 模块都必须 import `server-only`，并通过 OpenAI TypeScript SDK + Vultr OpenAI-compatible `baseURL` 调用。

## 核心类型

建议先稳定这些类型，再写实现：

```ts
type InvoiceLine = {
  id: string;
  lineNumber: number;
  patientId: string;
  visitName: string;
  rawDescription: string;
  amount: string;
  extractionConfidence: number;
};

type EvidenceSource =
  | "protocol"
  | "cta_budget"
  | "coverage_grid"
  | "site_evidence"
  | "prior_ledger"
  | "invoice_extraction";

type EvidenceCard = {
  id: string;
  sourceType: EvidenceSource;
  sourceName: string;
  locator: string;
  status: "matched" | "partial" | "missing" | "blocked";
  excerpt: string;
  finding: string;
  confidence: number;
};

type RetrievalPlan = {
  candidateItemCodes: string[];
  protocolQueries: string[];
  budgetQueries: string[];
  coverageQueries: string[];
  siteEvidenceQueries: string[];
  ledgerQueries: string[];
};

type Boundary =
  | "Auto-handle candidate"
  | "AI recommend + finance confirm"
  | "Human review required"
  | "Policy or contract gap";

type BoundaryRecommendation = {
  boundary: Boundary;
  score: number;
  riskFlags: string[];
  decisionReason: string;
  evidence: EvidenceCard[];
  auditTrail: string[];
};
```

## 分阶段实现步骤

### Phase 1: Agent API 骨架

目标：前端可以上传 invoice，后端返回实时事件。

实现：

1. 新增 `app/api/agent-review/route.ts`。
2. 校验 multipart form：
   - 必须包含 `invoice`
   - 只允许 PNG、JPEG、PDF
   - 限制文件大小
3. 创建 `runId`。
4. 返回 `ReadableStream`。
5. 先发送固定事件：
   - `started`
   - `step: upload accepted`
   - `complete`

验收：

- 无 Vultr key 时接口仍可返回基础事件。
- 非法文件类型返回 400。
- 浏览器不会收到任何 inference key。

### Phase 2: Fixture Invoice Extraction

目标：上传文件后，MVP 使用现有 fixture 作为抽取结果。

实现：

1. 新增 `invoiceExtraction.ts`。
2. 读取 `data/invoice_extraction_fixture.csv`。
3. 映射成 `InvoiceLine[]`。
4. 在 stream 中发送 `extraction` event。

设计备注：

- 上传文件此阶段只作为 demo 入口和用户行为，不作为 source of truth。
- 真实 OCR / vision extraction 后续替换这个模块，不影响 agent pipeline。

验收：

- 上传 `data/mock_site_invoice_scan.svg` 或 PDF 后可以看到 invoice lines。
- 抽取失败时返回清晰错误，不暴露 stack trace。

### Phase 3: 本地 Evidence Search 工具

目标：agent 能只读搜索 `data/` 中的证据。

实现：

1. 新增 `dataSearch.ts`。
2. 支持 CSV 搜索：
   - coverage grid by item code / description
   - site evidence by patient id / visit
   - prior ledger by patient id / visit / item code
3. 新增 `documentChunks.ts`。
4. 将 protocol 和 CTA/budget PDF 转换成 searchable chunks。
5. 每个 chunk 必须带 metadata：

```ts
type EvidenceChunk = {
  id: string;
  sourceName: string;
  page?: number;
  section?: string;
  text: string;
};
```

MVP 选择：

- 如果 PDF text extraction 复杂，可以先维护轻量 text cache 或 hard-coded synthetic chunks。
- 但返回给前端的 evidence 必须标明原始 source，例如 `Prot_000.pdf`。

验收：

- 可以按 item code 找到 coverage rule。
- 可以按 patient / visit 找到 site evidence。
- 可以识别 paid prior payment 和 voided prior payment 的区别。
- 可以返回 protocol / CTA 的 source locator。

### Phase 4: Vultr Retrieval Planner

目标：让 Vultr 主模型参与 evidence retrieval，而不只是写 summary。

实现：

1. 新增 `vultrRetrievalPlanner.ts`。
2. 输入一条 `InvoiceLine` 和少量 schema 提示。
3. 输出严格 JSON `RetrievalPlan`。
4. 计划中包含：
   - candidate item codes
   - protocol queries
   - budget queries
   - coverage queries
   - site evidence queries
   - ledger queries

示例：

```json
{
  "candidateItemCodes": ["ENDOSCOPY_V3"],
  "protocolQueries": [
    "endoscopy biopsy Visit 3",
    "disease activity assessment Visit 3",
    "unscheduled procedure authorization"
  ],
  "budgetQueries": [
    "endoscopy with biopsy",
    "unscheduled procedure authorization"
  ],
  "coverageQueries": ["ENDOSCOPY_V3"],
  "siteEvidenceQueries": ["P-105 Visit 3 endoscopy authorization"],
  "ledgerQueries": ["P-105 Visit 3 ENDOSCOPY_V3"]
}
```

安全约束：

- 如果 Vultr 失败，后端应 fallback 到 deterministic query generation。
- 模型只生成 search plan，不生成最终 boundary。
- search plan 必须被本地工具执行后才算 evidence。

验收：

- messy invoice description 可以映射到合理 candidate item code。
- plan JSON 解析失败时有 fallback。
- stream 中能展示 `retrieval_plan` event。

### Phase 5: Vultr Evidence Ranker

目标：在本地搜索返回多个候选 chunk 时，让 Vultr 判断哪些证据真正相关。

实现：

1. 新增 `vultrEvidenceRanker.ts`。
2. 输入：
   - invoice line
   - retrieval plan
   - top local search results
3. 输出：
   - relevant evidence ids
   - relation type: support / contradiction / missing_condition / duplicate_risk
   - short finding
   - confidence

安全约束：

- 只能引用传入的 evidence id。
- 不允许模型发明 source。
- 模型输出要经过后端校验。
- 低 confidence evidence 不能支撑 auto-handle candidate。

验收：

- protocol 中只说明 procedure 存在时，不能自动等价为 sponsor billable。
- budget / authorization 缺失时，应生成 partial 或 missing evidence。
- duplicate ledger row 应被标记为 blocking evidence。

### Phase 6: 确定性 Boundary Evaluator

目标：最终 automation boundary 由规则引擎生成。

实现：

1. 新增 `evaluatePaymentLine.ts`。
2. 输入：
   - invoice line
   - coverage evidence
   - protocol / CTA evidence
   - site evidence
   - ledger evidence
   - Vultr-ranked evidence findings
3. 固定检查顺序：
   - 是否找到 coverage rule
   - 是否有 protocol / CTA / budget 支持
   - 是否满足 site visit evidence
   - 是否满足 subgroup / condition
   - 是否存在 prior paid duplicate
   - 是否需要 missing authorization
   - 是否存在 policy gap
4. 输出 `BoundaryRecommendation`。

建议规则：

| 情况 | Boundary |
| --- | --- |
| coverage、site evidence、ledger check 都通过且低风险 | Auto-handle candidate |
| evidence 部分支持，但需要 finance confirm | AI recommend + finance confirm |
| duplicate、subgroup failure、高风险例外 | Human review required |
| rule missing、contract unclear、evidence conflict | Policy or contract gap |

硬性规则：

- paid duplicate 不能是 auto-handle candidate。
- subgroup condition failure 不能是 auto-handle candidate。
- missing authorization 不能是 auto-handle candidate。
- protocol 支持不等于 budget 可付款。
- voided prior ledger row 不应阻断付款。

验收：

- line 1 / line 2 进入 auto-handle candidate。
- PK subgroup failure 进入 human review required。
- ADMIN_FEE duplicate 进入 human review required。
- ENDOSCOPY missing authorization 进入 AI recommend + finance confirm 或 policy gap。
- 未定义 remote monitoring 进入 policy or contract gap。

### Phase 7: Vultr Reviewer Summary

目标：用 Vultr 生成面向 reviewer 的解释和 audit draft。

实现：

1. 新增 `vultrSummary.ts`。
2. 输入必须是后端裁剪后的 compact evidence，不是完整原始文件。
3. 输出：
   - reviewer explanation
   - missing evidence question
   - audit trail draft

安全约束：

- summary 不能覆盖 deterministic boundary。
- summary 必须引用 evidence source。
- provider 失败时，仍返回 deterministic result，只是没有 AI summary。

验收：

- Vultr 不可用时 demo 不崩。
- summary 不包含“approved”“released funds”等动作性措辞。

### Phase 8: 前端实时集成

目标：页面同步展示 agent 运行过程和最终结果。

实现：

1. 前端上传 invoice 到 `/api/agent-review`。
2. 逐行读取 streamed JSON events。
3. 展示：
   - upload status
   - extraction result
   - retrieval plan
   - evidence cards
   - deterministic decision
   - final summary
4. 对错误状态显示可恢复信息。

展示原则：

- 展示 trace，不展示 hidden reasoning。
- evidence card 要显示 source 和 locator。
- boundary 文案必须保持 read-only recommendation。

验收：

- 用户上传后能看到 agent 逐步工作。
- 至少一条 invoice line 完整跑通 extraction -> retrieval -> evidence -> decision -> summary。
- failure state 清楚可见。

## Vultr 架构演进

### MVP: Local Data Search + Vultr Serverless Inference

当前 repo 的 `data/` 已经足够支持 hackathon demo。第一版应优先使用本地 fixture 和本地搜索，Vultr 模型负责：

- retrieval plan
- evidence ranking
- reviewer summary

这样实现速度最快，也最稳定。

### Next: Vultr Object Storage

将 protocol、CTA、budget、invoice artifact 上传到 Vultr Object Storage。后端仍然只读访问，并把 object key 作为 evidence locator。

```text
Vultr Object Storage
  -> PDFs / CSVs / invoice artifacts
  -> backend document loader
  -> document chunks
```

### Next: Vultr Vector Store

当 protocol / CTA / budget 文档变多时，引入 Vultr Vector Store 或兼容向量检索层：

```text
document chunks
  -> embeddings / vector index
  -> top-k evidence retrieval
  -> Vultr evidence ranker
  -> deterministic evaluator
```

即使引入 vector search，最终 boundary 仍由 deterministic evaluator 生成。

## 错误处理策略

| 错误 | 处理 |
| --- | --- |
| 非法上传类型 | 400，返回清晰 message |
| invoice extraction 失败 | stream `error` event，停止 run |
| CSV fixture 缺失 | 500，返回 demo data unavailable |
| Vultr retrieval planner 失败 | fallback 到 deterministic queries |
| Vultr evidence ranker 失败 | 使用本地 search ranking，标低 confidence |
| Vultr summary 失败 | 返回 deterministic result，无 summary |
| 未找到 evidence | 标记 missing / policy gap，不编造 |

## 测试计划

优先测试纯逻辑模块：

1. `invoiceExtraction.ts`
   - fixture CSV 正常解析
   - 缺字段时返回错误
2. `dataSearch.ts`
   - coverage rule lookup
   - site evidence lookup
   - prior paid duplicate lookup
   - voided ledger row 不阻断
3. `evaluatePaymentLine.ts`
   - auto-handle happy path
   - PK subgroup failure
   - duplicate admin fee
   - missing authorization
   - undefined remote monitoring policy gap
4. `route.ts`
   - invalid upload
   - valid upload returns event stream
   - Vultr failure fallback

每次代码变更后至少运行：

```bash
npm run typecheck
```

较大改动或 demo 前运行：

```bash
npm run build
```

## 实施顺序总结

推荐严格按以下顺序落地：

1. 定义 `lib/agent/types.ts`。
2. 实现 event stream 基础设施。
3. 实现 `/api/agent-review` 上传入口。
4. 实现 fixture invoice extraction。
5. 实现 CSV 和 document chunk 本地搜索。
6. 实现 Vultr retrieval planner。
7. 实现 Vultr evidence ranker。
8. 实现 deterministic boundary evaluator。
9. 实现 Vultr reviewer summary。
10. 前端接入 streamed agent events。
11. 补 evaluator 和 data search 测试。
12. 跑 `npm run typecheck` 和必要的 `npm run build`。

最终后端应该呈现为：

```text
Vultr model = semantic retrieval + evidence interpretation + reviewer explanation
Backend tools = read-only evidence search and source grounding
Rules engine = boundary decision and safety controls
Frontend = live observable agent trace and audit-friendly result
```
