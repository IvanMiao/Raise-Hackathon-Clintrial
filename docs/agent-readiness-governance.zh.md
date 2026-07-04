# 企业 Agent 的决策数据治理层

## 核心问题

企业不是缺少 AI agent，而是缺少 agent 可以安全执行的**决策边界**。

权限审批是一个典型场景：人工 reviewer 面对大量重复的 access review 和 renewal request，最终常常变成形式化批准。历史上 95% 的申请被批准，并不等于这些申请都安全；它可能只是说明审核机制已经失灵。

因此，我们不应该直接问：

> 能不能让 AI 自动审批权限？

更好的问题是：

> 在把审批权交给 AI 之前，哪些审批场景有足够证据被自动化，哪些必须保留人工控制？

## 产品定位

这是一个面向企业 AI agent 的 **Decision Data Governance Layer**。

它分析历史权限审批记录、政策规则、权限风险、审批理由和例外模式，生成一份 **Automation Boundary Playbook**，告诉企业：

- 哪些场景可以进入自动化候选池
- 哪些场景适合 AI 推荐 + 人确认
- 哪些场景必须人工审核
- 哪些场景暴露了 policy gap
- 哪些历史 case 应该成为 agent 上线前的测试集

一句话定位：

> We help enterprises decide what not to automate before they give approval power to AI agents.

中文表达：

> 我们帮助企业在把审批权交给 AI 之前，先弄清楚哪些场景绝对不能自动化，哪些场景才有资格自动化。

## 为什么这是数据治理

这里治理的不是普通业务数据，而是**历史决策数据**。

系统需要判断：

- 历史审批字段是否完整
- human decision 是否一致
- approval reason 是否清楚
- permission risk label 是否可信
- 实际审批是否符合正式 policy
- 例外情况是否可解释
- 历史 case 是否能转化为 agent eval dataset

本质上，这解决的是：

> 企业过去的决策数据，是否可靠到足以支撑未来的 AI agent 自动化？

传统数据治理关注 data quality、ownership、lineage、access control。这里进一步关注：

> Decision data 是否足够可靠、可解释、可测试、可审计。

## Agent-Native 架构

这个 readiness 系统本身也可以由 agent 完成，但它必须是一个**低权限、离线、只读、可审计**的 governance agent。

它不是运行时审批 agent，而是帮助企业定义运行时 agent 的边界。

```text
Historical Approval Data
  -> Data Normalization Layer
  -> Policy + Risk Context Layer
  -> Readiness Agent Orchestrator
  -> Specialized Sub-Agents
  -> Evidence Store + Audit Trail
  -> Boundary Playbook / Test Cases / Policy Gap Tickets
  -> Human Approval
  -> Runtime Approval Agent Config
```

核心边界：

| Plane | 作用 | 权限 |
| --- | --- | --- |
| Readiness Plane | 离线分析历史审批数据，生成边界建议 | 只读，不能批准真实权限 |
| Execution Plane | 运行时处理真实权限申请 | 只能执行人类批准后的边界规则 |
| Governance Plane | 批准边界、修正规则、承担责任 | 人类 owner |

可以直接放进 pitch 的一句话：

> Our readiness agent is read-only and offline. It does not approve access. It produces auditable automation boundaries that humans approve before any runtime agent can act.

## 子 Agent 分工

| Agent | 责任 |
| --- | --- |
| Schema Mapping Agent | 理解不同企业的字段命名，把历史记录映射到统一 schema |
| Policy Interpreter Agent | 读取政策文档，提取结构化 policy constraints |
| Pattern Discovery Agent | 从历史记录中发现反复出现的 exception clusters |
| Evidence Scoring Agent | 计算 sample size、decision consistency、reason quality 等指标 |
| Boundary Recommendation Agent | 生成 auto / recommend / human review / policy gap 分类 |
| Red-Team Agent | 挑战结论，识别 rubber-stamping、低质量理由和高风险误判 |
| Test Case Generator Agent | 把边界规则转成 agent 上线前的 regression tests |
| Report / Chat Agent | 支持自然语言问答，但必须引用 evidence store |

关键原则：

> Agent 负责理解语义、组织推理、生成解释；确定性代码负责统计、评分、权限边界和审计。

## Evidence Quality 机制

不能只看历史批准率。一个 cluster 被标为 High，至少需要同时满足：

| 指标 | 问题 |
| --- | --- |
| Sample Size | 样本量是否足够 |
| Decision Consistency | 同类申请是否被一致处理 |
| Reason Quality | 审批理由是否清楚、非模板化 |
| Risk Level | 权限本身是否低风险 |
| Policy Alignment | 历史处理是否符合正式 policy |
| Reversibility | 出错后是否容易撤销 |
| Reviewer Disagreement | 不同 reviewer 是否经常意见不一致 |

核心判断：

> High approval rate 不等于 high automation readiness。

更准确的是：

> 我们不是学习人类过去如何点击 approve，而是评估历史决策是否有足够证据被正式化为自动化边界。

## 输出物

最终产物不是一个普通报告，而是一套 agent 上线前治理包：

1. **Decision Data Quality Report**  
   审批历史数据是否完整、一致、可解释。

2. **Exception Cluster Map**  
   发现真实业务中的重复例外模式。

3. **Automation Boundary Playbook**  
   给每类场景明确处理边界：auto-handle、AI recommend、human review、policy gap。

4. **Policy Gap Backlog**  
   把缺失、冲突、过时的规则转成治理工单。

5. **Agent Eval Dataset**  
   从历史 case 生成上线前 regression test cases。

## MVP 范围

黑客松版本不要做完整 IGA 平台。MVP 可以从 CSV 导入开始：

```text
request_id
user_role
department
access_name
access_risk_level
request_type
usage_last_90_days
policy_expected_action
human_decision
human_reason
reviewer_role
timestamp
```

Demo 流程：

1. 上传历史审批 CSV
2. 系统生成 exception clusters
3. 展示每个 cluster 的 Evidence Quality
4. 输出 automation recommendation
5. 生成 Boundary Playbook
6. 生成 test cases
7. 生成 policy gap tickets
8. 用户通过自然语言提问

示例结果：

```text
Total historical approvals analyzed: 1,240

Auto-handle candidates: 31%
AI recommendation + human confirmation: 27%
Must remain human-reviewed: 26%
Policy gaps: 16%

Estimated manual review reduction: 42%
High-risk permissions auto-approved: 0
Generated regression test cases: 38
Policy gap tickets: 12
```

## 经典分类

| Cluster | Evidence Quality | Recommendation |
| --- | --- | --- |
| Low-risk SaaS access renewal | High | Auto-handle candidate |
| On-call engineer emergency access | Medium | AI recommend + manager confirm |
| Contractor project extension | Medium | AI recommend + owner confirm |
| VIP / executive exception | Low | Human review required |
| Dormant admin access | Low | Security review required |
| Repeated unclear approvals | Low | Policy gap |

## 竞品差异

传统 IGA / access review 工具帮助企业执行权限复核。普通 AI assistant 帮 reviewer 判断单条申请。

我们的差异是：

> 我们不处理“这一条该不该批”，而是处理“这一类未来能不能被 agent 自动化”。

这让产品更像 agent-readiness / governance layer，而不是审批助手。

## 最大风险与防线

风险：

- 历史数据可能反映的是 rubber-stamping，而不是正确判断
- 高风险权限可能因为历史上一致批准而被误判
- 审批理由可能是模板化垃圾文本
- policy 可能过时、缺失或与实际操作冲突
- LLM 可能给出看似合理但证据不足的解释

防线：

- 高风险权限不能仅凭历史一致性自动化
- Evidence Quality 必须包含 risk、policy、sample size 和 reversibility
- 所有建议必须引用 evidence
- Readiness Agent 不能批准真实权限
- Runtime Agent 只能执行人类批准后的 boundary
- 未知场景必须升级给人

## 最终叙事

企业进入 agent era 后，真正稀缺的不是“能执行任务的 AI”，而是“可以被安全执行的业务边界”。

我们做的是企业 agent 上线前的决策数据治理层：

```text
messy historical decisions
  -> governed decision patterns
  -> automation boundaries
  -> agent-ready policy and test data
```

这不是让 AI 替代安全团队，而是让安全团队把精力从重复、低风险、证据充分的审批中释放出来，集中处理真正高风险、模糊和需要判断的权限问题。
