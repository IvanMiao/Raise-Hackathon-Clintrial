# Decision Data Governance for Enterprise Agents

## Core Problem

Enterprises do not just need more AI agents. They need clear boundaries for what agents can safely do.

Access approval is a strong example. Reviewers face large volumes of repetitive access renewals and access reviews. In practice, many reviews become rubber-stamping. If 95% of requests are approved, that does not prove the requests are safe. It may prove the review mechanism has already degraded.

The wrong question is:

> Can AI approve access automatically?

The better question is:

> Before giving approval power to an AI agent, which approval scenarios have enough evidence to be automated, and which ones must remain under human control?

## Product Positioning

This product is a **Decision Data Governance Layer** for enterprise AI agents.

It analyzes historical access approval records, policies, permission risk levels, human explanations, and exception patterns. The output is an **Automation Boundary Playbook** that tells the enterprise:

- which scenarios are automation candidates
- which scenarios need AI recommendation plus human confirmation
- which scenarios must stay human-reviewed
- which scenarios expose policy gaps
- which historical cases should become pre-launch agent test cases

One-line positioning:

> We help enterprises decide what not to automate before they give approval power to AI agents.

## Why This Is Data Governance

The governed asset is not ordinary business data. It is **decision data**.

The system evaluates whether:

- historical approval fields are complete
- human decisions are consistent
- approval reasons are clear
- permission risk labels are reliable
- actual decisions align with formal policy
- exception cases are explainable
- historical cases can become an agent eval dataset

The deeper question is:

> Is the enterprise's historical decision data reliable enough to support future AI-agent automation?

Traditional data governance focuses on data quality, ownership, lineage, and access control. This extends the question to:

> Is decision data reliable, explainable, testable, and auditable enough for agentic execution?

## Agent-Native Architecture

The readiness system can itself be agentic, but it must be a **low-privilege, offline, read-only, auditable governance agent**.

It is not the runtime approval agent. It defines the boundaries that a runtime agent may later operate within.

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

Key boundary:

| Plane | Purpose | Permission |
| --- | --- | --- |
| Readiness Plane | Offline analysis of historical approval data | Read-only, cannot approve real access |
| Execution Plane | Runtime handling of real access requests | Can only execute human-approved boundaries |
| Governance Plane | Approves boundaries, updates policies, owns accountability | Human owner |

Pitch-ready line:

> Our readiness agent is read-only and offline. It does not approve access. It produces auditable automation boundaries that humans approve before any runtime agent can act.

## Specialized Agents

| Agent | Responsibility |
| --- | --- |
| Schema Mapping Agent | Maps enterprise-specific fields into a unified schema |
| Policy Interpreter Agent | Reads policy documents and extracts structured policy constraints |
| Pattern Discovery Agent | Finds recurring exception clusters in historical records |
| Evidence Scoring Agent | Calculates sample size, decision consistency, reason quality, and other metrics |
| Boundary Recommendation Agent | Produces auto / recommend / human review / policy gap classifications |
| Red-Team Agent | Challenges conclusions and detects rubber-stamping, weak evidence, and risk misclassification |
| Test Case Generator Agent | Converts boundary rules into pre-launch regression tests |
| Report / Chat Agent | Supports natural-language questions while grounding answers in the evidence store |

Architecture principle:

> Agents handle semantic understanding, reasoning orchestration, and explanation. Deterministic systems handle statistics, scoring, permission boundaries, and auditability.

## Evidence Quality

The system must not rely on historical approval rate alone. A cluster should be labeled High only when multiple dimensions are strong:

| Metric | Question |
| --- | --- |
| Sample Size | Are there enough historical cases? |
| Decision Consistency | Were similar requests handled consistently? |
| Reason Quality | Are the explanations clear and non-template-like? |
| Risk Level | Is the permission itself low risk? |
| Policy Alignment | Did historical handling match formal policy? |
| Reversibility | Can an incorrect decision be easily rolled back? |
| Reviewer Disagreement | Did reviewers frequently disagree? |

Core judgment:

> High approval rate is not the same as high automation readiness.

More precisely:

> We are not learning how humans clicked approve in the past. We are evaluating whether historical decisions contain enough evidence to be formalized into automation boundaries.

## Outputs

The final deliverable is not just a report. It is a pre-launch governance package for enterprise agents:

1. **Decision Data Quality Report**  
   Shows whether historical approval data is complete, consistent, and explainable.

2. **Exception Cluster Map**  
   Identifies recurring business exception patterns.

3. **Automation Boundary Playbook**  
   Classifies each scenario as auto-handle, AI recommend, human review, or policy gap.

4. **Policy Gap Backlog**  
   Converts missing, conflicting, or outdated rules into governance tickets.

5. **Agent Eval Dataset**  
   Turns historical cases into regression tests for the runtime approval agent.

## MVP Scope

For a hackathon, do not build a full IGA platform. Start with CSV import:

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

Demo flow:

1. Upload historical approval CSV
2. Generate exception clusters
3. Show Evidence Quality for each cluster
4. Produce automation recommendations
5. Generate the Boundary Playbook
6. Generate test cases
7. Generate policy gap tickets
8. Ask natural-language questions

Example output:

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

## Example Clusters

| Cluster | Evidence Quality | Recommendation |
| --- | --- | --- |
| Low-risk SaaS access renewal | High | Auto-handle candidate |
| On-call engineer emergency access | Medium | AI recommend + manager confirm |
| Contractor project extension | Medium | AI recommend + owner confirm |
| VIP / executive exception | Low | Human review required |
| Dormant admin access | Low | Security review required |
| Repeated unclear approvals | Low | Policy gap |

## Competitive Differentiation

Traditional IGA and access review tools help enterprises execute permission reviews. Generic AI assistants help reviewers decide a single request.

Our distinction:

> We do not answer "Should this request be approved?" We answer "Can this class of future decisions be safely automated by an agent?"

That makes the product an agent-readiness and governance layer, not an approval assistant.

## Key Risks And Guardrails

Risks:

- Historical records may reflect rubber-stamping instead of correct judgment
- High-risk permissions may have been consistently approved in the past
- Approval reasons may be templated or low quality
- Policies may be missing, outdated, or inconsistent with real practice
- LLMs may generate plausible explanations without enough evidence

Guardrails:

- High-risk permissions cannot be automated based on consistency alone
- Evidence Quality must include risk, policy alignment, sample size, and reversibility
- Every recommendation must cite evidence
- The Readiness Agent cannot approve real access
- The Runtime Agent can only execute human-approved boundaries
- Unknown scenarios must escalate to humans

## Final Narrative

In the agent era, the scarce asset is not just an AI that can execute tasks. It is a trustworthy boundary that defines which business actions are safe for agentic execution.

This product is the decision data governance layer before enterprise agents go live:

```text
messy historical decisions
  -> governed decision patterns
  -> automation boundaries
  -> agent-ready policy and test data
```

The goal is not to replace the security team. The goal is to move human attention away from repetitive, low-risk, well-evidenced reviews and toward genuinely risky, ambiguous, judgment-heavy access decisions.
