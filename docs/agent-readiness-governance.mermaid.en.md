# Decision Data Governance for Enterprise Agents: Mermaid Diagrams

This document turns the product logic from `agent-readiness-governance.en.md` into Mermaid diagrams covering the core problem, system architecture, specialized agents, Evidence Quality, MVP flow, deliverables, and guardrails.

## 1. Core Judgment

```mermaid
flowchart TD
  A["Enterprise wants AI agents to handle access approval"] --> B{"Ask directly whether access can be auto-approved"}
  B --> C["Wrong focus: whether one request should be approved"]
  A --> D{"Ask which scenarios have enough evidence first"}
  D --> E["Automation candidates"]
  D --> F["AI recommendation plus human confirmation"]
  D --> G["Must remain human-reviewed"]
  D --> H["Exposes a policy gap"]
  E --> I["Automation Boundary Playbook"]
  F --> I
  G --> I
  H --> I
  I --> J["Runtime agent can act only after human approval"]
```

## 2. Product Positioning

```mermaid
flowchart LR
  A["Historical access approval records"] --> G["Decision Data Governance Layer"]
  B["Policy rules"] --> G
  C["Permission risk labels"] --> G
  D["Approval reasons"] --> G
  E["Exception patterns"] --> G
  G --> P["Automation Boundary Playbook"]
  P --> O1["Which scenarios can be automated"]
  P --> O2["Which scenarios need human confirmation"]
  P --> O3["Which scenarios must stay human-reviewed"]
  P --> O4["Which rules have gaps"]
  P --> O5["Which historical cases become test cases"]
```

## 3. Agent-Native Architecture

```mermaid
flowchart TD
  A["Historical Approval Data"] --> B["Data Normalization Layer"]
  B --> C["Policy and Risk Context Layer"]
  C --> D["Readiness Agent Orchestrator"]
  D --> E["Specialized Sub-Agents"]
  E --> F["Evidence Store and Audit Trail"]
  F --> G["Boundary Playbook"]
  F --> H["Test Cases"]
  F --> I["Policy Gap Tickets"]
  G --> J["Human Approval"]
  H --> J
  I --> J
  J --> K["Runtime Approval Agent Config"]
```

## 4. Three Governance Planes

```mermaid
flowchart TB
  R["Readiness Plane<br/>Offline historical-data analysis<br/>Read-only, cannot approve real access"]
  G["Governance Plane<br/>Approves boundaries and updates rules<br/>Human owner is accountable"]
  E["Execution Plane<br/>Handles real requests at runtime<br/>Executes approved boundaries only"]

  R -->|"Produces boundary recommendations"| G
  G -->|"Approves boundary rules"| E
  E -->|"Escalates unknown or out-of-bound scenarios"| G
```

## 5. Specialized Agents

```mermaid
flowchart TD
  O["Readiness Agent Orchestrator"] --> A1["Schema Mapping Agent"]
  O --> A2["Policy Interpreter Agent"]
  O --> A3["Pattern Discovery Agent"]
  O --> A4["Evidence Scoring Agent"]
  O --> A5["Boundary Recommendation Agent"]
  O --> A6["Red-Team Agent"]
  O --> A7["Test Case Generator Agent"]
  O --> A8["Report and Chat Agent"]

  A1 --> S["Unified Schema"]
  A2 --> P["Structured Policy Constraints"]
  A3 --> C["Exception Clusters"]
  A4 --> Q["Evidence Quality Scores"]
  A5 --> B["Automation Boundary Categories"]
  A6 --> R["Risk challenges and counter-evidence"]
  A7 --> T["Regression Test Cases"]
  A8 --> N["Evidence-grounded natural-language answers"]

  S --> Z["Evidence Store and Audit Trail"]
  P --> Z
  C --> Z
  Q --> Z
  B --> Z
  R --> Z
  T --> Z
  N --> Z
```

## 6. Evidence Quality Mechanism

```mermaid
flowchart TD
  C["One approval-scenario cluster"] --> M1{"Sample size is sufficient"}
  M1 --> M2{"Decision consistency is high"}
  M2 --> M3{"Reason quality is clear"}
  M3 --> M4{"Risk level is low"}
  M4 --> M5{"Policy alignment is strong"}
  M5 --> M6{"Reversibility is high"}
  M6 --> M7{"Reviewer disagreement is low"}

  M1 -- "No" --> L["Low or Medium Evidence"]
  M2 -- "No" --> L
  M3 -- "No" --> L
  M4 -- "No" --> L
  M5 -- "No" --> L
  M6 -- "No" --> L
  M7 -- "No" --> L

  M7 -- "Yes" --> H["High Evidence Quality"]
  H --> A["Enter automation candidate pool"]
  L --> B["Keep human control or mark as policy gap"]
```

## 7. Decision Classification Rules

```mermaid
flowchart TD
  A["Approval-scenario cluster"] --> Q{"Evidence Quality"}
  Q -- "High" --> R1{"Low risk and policy-aligned"}
  R1 -- "Yes" --> C1["Auto-handle Candidate"]
  R1 -- "No" --> C2["AI Recommend plus Human Confirm"]

  Q -- "Medium" --> R2{"Clear owner or manager exists"}
  R2 -- "Yes" --> C2
  R2 -- "No" --> C3["Human Review Required"]

  Q -- "Low" --> R3{"Caused by missing or conflicting rules"}
  R3 -- "Yes" --> C4["Policy Gap"]
  R3 -- "No" --> C3
```

## 8. MVP Demo Flow

```mermaid
flowchart LR
  A["Upload historical approval CSV"] --> B["Generate exception clusters"]
  B --> C["Show Evidence Quality for each cluster"]
  C --> D["Produce automation recommendations"]
  D --> E["Generate Boundary Playbook"]
  E --> F["Generate test cases"]
  F --> G["Generate policy gap tickets"]
  G --> H["User asks natural-language questions"]
  H --> I["Answers must cite the Evidence Store"]
```

## 9. Input Fields To Governance Output

```mermaid
flowchart TD
  subgraph Input["CSV Input Fields"]
    A1["request_id"]
    A2["user_role"]
    A3["department"]
    A4["access_name"]
    A5["access_risk_level"]
    A6["request_type"]
    A7["usage_last_90_days"]
    A8["policy_expected_action"]
    A9["human_decision"]
    A10["human_reason"]
    A11["reviewer_role"]
    A12["timestamp"]
  end

  Input --> N["Data Normalization"]
  N --> S["Evidence Scoring"]
  S --> R["Boundary Recommendation"]
  R --> O["Governance Package"]
```

## 10. Final Governance Package

```mermaid
flowchart TB
  A["Pre-launch Governance Package"] --> O1["Decision Data Quality Report"]
  A --> O2["Exception Cluster Map"]
  A --> O3["Automation Boundary Playbook"]
  A --> O4["Policy Gap Backlog"]
  A --> O5["Agent Eval Dataset"]

  O1 --> G["Human Governance Review"]
  O2 --> G
  O3 --> G
  O4 --> G
  O5 --> G
  G --> C["Pre-launch Runtime Agent Config"]
```

## 11. Example Cluster Classification

```mermaid
flowchart TD
  A["Low-risk SaaS access renewal"] --> H["High Evidence"]
  H --> R1["Auto-handle candidate"]

  B["On-call engineer emergency access"] --> M1["Medium Evidence"]
  M1 --> R2["AI recommend plus manager confirm"]

  C["Contractor project extension"] --> M2["Medium Evidence"]
  M2 --> R3["AI recommend plus owner confirm"]

  D["VIP or executive exception"] --> L1["Low Evidence"]
  L1 --> R4["Human review required"]

  E["Dormant admin access"] --> L2["Low Evidence"]
  L2 --> R5["Security review required"]

  F["Repeated unclear approvals"] --> L3["Low Evidence"]
  L3 --> R6["Policy gap"]
```

## 12. Risks And Guardrails

```mermaid
flowchart TD
  subgraph Risks["Key Risks"]
    R1["Historical data may reflect rubber-stamping"]
    R2["High-risk permissions may have been consistently approved"]
    R3["Approval reasons may be templated low-quality text"]
    R4["Policies may be outdated, missing, or conflicting"]
    R5["LLMs may generate explanations without enough evidence"]
  end

  subgraph Guardrails["Guardrails"]
    G1["High-risk permissions cannot be automated on consistency alone"]
    G2["Evidence Quality must include risk and policy alignment"]
    G3["Every recommendation must cite evidence"]
    G4["Readiness Agent cannot approve real access"]
    G5["Runtime Agent executes only human-approved boundaries"]
    G6["Unknown scenarios must escalate to humans"]
  end

  R1 --> G2
  R2 --> G1
  R3 --> G2
  R4 --> G3
  R5 --> G3
  G4 --> G5
  G5 --> G6
```

## 13. Final Narrative

```mermaid
flowchart LR
  A["Messy Historical Decisions"] --> B["Governed Decision Patterns"]
  B --> C["Automation Boundaries"]
  C --> D["Agent-ready Policy and Test Data"]
  D --> E["Human-approved Runtime Agent"]
```
