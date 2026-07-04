# TrialGuard: Agent Readiness Layer for Clinical Trial Payments

## One-Line Pitch

TrialGuard helps clinical trial teams decide which payment decisions are safe for AI agents to automate, which need human review, and which reveal contract, budget, protocol, or billing policy gaps.

## Problem

Clinical trial payments are hard to review because one invoice line may depend on many evidence sources:

- clinical protocol
- schedule of assessments
- clinical trial agreement
- site budget
- budget amendments
- EDC or CTMS visit records
- prior payment history
- billing or coverage policy

A procedure may appear in the protocol but still be unsafe to pay automatically. The real question is not:

> Can AI approve this invoice?

The safer question is:

> Is there enough evidence for this type of payment decision to be handled by an agent?

## Product

TrialGuard is a read-only governance agent for clinical trial payments.

It does not release funds, approve invoices, or replace finance and compliance teams. It reviews historical invoices and trial documents, then creates automation boundaries for future payment agents.

## Core Workflow

```text
Invoice line item
  -> retrieve protocol evidence
  -> retrieve CTA and budget evidence
  -> check EDC visit evidence
  -> check prior payments
  -> check amendment version
  -> check billing policy
  -> score evidence quality
  -> recommend automation boundary
  -> generate audit trail
```

## Automation Boundaries

TrialGuard classifies each payment pattern into one of four groups:

| Boundary | Meaning |
| --- | --- |
| Auto-handle candidate | Strong evidence, low risk, human-approved boundary |
| AI recommend + finance confirm | Useful AI suggestion, but human confirmation required |
| Human review required | High risk, weak evidence, or sensitive exception |
| Policy or contract gap | Missing, unclear, or conflicting rule |

## Core Outputs

1. **Invoice Evidence Quality Report**  
   Shows whether each invoice line has enough supporting evidence.

2. **Payment Automation Boundary Playbook**  
   Defines which future payment scenarios an agent may handle.

3. **Clinical Trial Payment Exception Map**  
   Groups common issues such as duplicate payments, budget mismatches, missing visit evidence, wrong amendment versions, and screen failure charges.

4. **Policy Gap Tickets**  
   Turns unclear contract or billing rules into action items.

5. **Agent Regression Test Dataset**  
   Converts historical payment exceptions into test cases for future payment agents.

## Hackathon MVP

The MVP should use synthetic clinical trial finance data:

- one mock protocol PDF
- one mock CTA and site budget PDF
- one mock invoice CSV or PDF
- one mock EDC visit log CSV
- one prior payment ledger CSV
- one short billing policy document

The demo should show:

- invoice line items on the left
- retrieved evidence cards in the middle
- automation boundary recommendation on the right
- reviewer override with audit trail

## Why This Is Different

TrialGuard is not a clinical trial payment platform. It is a governance layer above payment systems.

Existing tools help process invoices and payments. TrialGuard answers a different question:

> Before we let a payment agent act, what exactly is it allowed to automate?

## Positioning

TrialGuard combines a vertical healthcare demo with a broader enterprise agent governance idea.

```text
Decision Data Governance = core product philosophy
Clinical trial payments = high-value vertical demo
Document retrieval = technical proof point
Audit UI = visual demo moment
Boundary playbook = business differentiation
```

## Final Pitch

TrialGuard is not an autonomous payment approver. It is a clinical trial payment governance agent that audits invoice evidence and defines safe automation boundaries before financial agents are allowed to act.

