import { TrialItem, AuditTrailEntry } from './types';

export const INITIAL_TRAIL: AuditTrailEntry[] = [
  {
    time: '2026-07-03 16:42 UTC',
    auditor: 'Dr. E. Vance · Lead Auditor',
    item: 'LI-0455',
    action: 'Escalated',
    actionColor: '#454F9E',
    actionBg: '#ECEDF7',
    justification: 'Monitoring visit hours exceed CTA Schedule B; requested CRA timesheet from Site 108 before disposition.'
  },
  {
    time: '2026-07-03 14:18 UTC',
    auditor: 'M. Okafor · Financial Auditor',
    item: 'LI-0442',
    action: 'Rejected',
    actionColor: '#B4271A',
    actionBg: '#FBDAD2',
    justification: 'Duplicate of INV-2026-Q1-088 SAE narrative supplement; already reimbursed in Q1.'
  },
  {
    time: '2026-07-03 11:05 UTC',
    auditor: 'System · Boundary Engine',
    item: 'LI-0461',
    action: 'Auto-cleared',
    actionColor: '#1E7A54',
    actionBg: '#E6F1EB',
    justification: 'Compliance score 97% — within auto-clear boundary. Central lab invoice matched to CTA rate card.'
  }
];

export const INITIAL_ITEMS: TrialItem[] = [
  {
    id: 'LI-0473',
    amount: '$420.00',
    desc: 'Patient stipend + travel reimbursement',
    meta: 'Subject S-0219 · Visit 6 (unscheduled) · Site 204 Madrid',
    cat: 'Subject costs',
    status: 'flag',
    complianceScore: 46,
    aiConfidence: 94,
    band: 'review',
    summary: 'Reimbursement for an unscheduled safety visit exceeds the site contract travel cap and falls outside the IRB-approved stipend budget. Evidence points to a budget/protocol deviation requiring auditor review.',
    gcpRules: ['ICH E6(R2) §5.0', 'Protocol §9.2', 'CTA Schedule B', 'IRB Approval 2024/117'],
    rec: 'Hold for auditor review — travel exceeds the contracted cap by ~$170 and the unscheduled visit lacks documented medical-monitor sign-off.',
    evidence: [
      {
        src: 'protocol',
        ref: 'PRO-2024-0837 · §9.2 Subject Reimbursement',
        verdict: 'conflict',
        text: 'Travel is capped at €300 per scheduled visit; unscheduled visits require documented medical-monitor approval prior to reimbursement.',
        ai: 'Claimed $420 (~€388) exceeds the per-visit cap; no monitor approval is attached to the invoice.'
      },
      {
        src: 'irb',
        ref: 'CEIm Hospital Clínic · Approval 2024/117',
        verdict: 'conflict',
        text: 'Approved stipend schedule covers protocol-defined visits V1–V8. Reimbursement for unscheduled safety visits is not included in the approved budget.',
        ai: 'Line item falls outside the IRB-approved budget envelope for this site.'
      },
      {
        src: 'contract',
        ref: 'CTA Site 204 · Schedule B',
        verdict: 'warn',
        text: 'Standard visit travel reimbursement rate is $250. Amounts above this require documented sponsor pre-authorization.',
        ai: '$170 over the Schedule B standard rate; no pre-authorization on file.'
      },
      {
        src: 'edc',
        ref: 'EDC Visit Log · S-0219',
        verdict: 'match',
        text: 'Visit 6 recorded 2026-06-28 as an unscheduled safety visit following an adverse-event report (mild hypertension).',
        ai: 'Visit occurrence is verified against source data — the visit did happen.'
      }
    ]
  },
  {
    id: 'LI-0461',
    amount: '$1,240.00',
    desc: 'Central lab screening panel',
    meta: 'Subject S-0219 · Visit 1 · Central Lab (Q2)',
    cat: 'Laboratory',
    status: 'pass',
    complianceScore: 97,
    aiConfidence: 99,
    band: 'clear',
    summary: 'Screening laboratory panel matches the protocol-required assessments and the contracted central-lab rate card. All source records reconcile — no deviation detected.',
    gcpRules: ['Protocol §7.1', 'CTA Rate Card §L', 'ICH E6(R2) §8'],
    rec: 'Eligible for auto-clear — panel, timing and rate all reconcile against protocol and contract.',
    evidence: [
      {
        src: 'protocol',
        ref: 'PRO-2024-0837 · §7.1 Screening Assessments',
        verdict: 'match',
        text: 'Screening requires a full chemistry and hematology panel at Visit 1 for all enrolled subjects.',
        ai: 'Billed panel matches the protocol-required screening assessments.'
      },
      {
        src: 'contract',
        ref: 'CTA · Central Lab Rate Card §L',
        verdict: 'match',
        text: 'Contracted rate for the full screening panel is $1,240 per subject.',
        ai: 'Invoiced amount is an exact match to the contracted rate.'
      },
      {
        src: 'edc',
        ref: 'EDC Lab Module · S-0219',
        verdict: 'match',
        text: 'Lab results for the screening panel are entered and source-verified for Visit 1.',
        ai: 'Results exist in source data; the service was rendered.'
      }
    ]
  },
  {
    id: 'LI-0455',
    amount: '$3,800.00',
    desc: 'Site monitoring visit (on-site)',
    meta: 'Site 108 Berlin · CRA 2-day visit · Q2',
    cat: 'Monitoring',
    status: 'review',
    complianceScore: 71,
    aiConfidence: 72,
    band: 'review',
    summary: 'Monitoring visit cost is plausible but the invoiced CRA hours appear to exceed the Schedule B allowance. Supporting timesheet is missing, so the item cannot be auto-cleared.',
    gcpRules: ['ICH E6(R2) §5.18', 'Monitoring Plan v3', 'CTA Schedule B'],
    rec: 'Auditor review — request the CRA timesheet to reconcile invoiced hours against the Schedule B allowance before disposition.',
    evidence: [
      {
        src: 'protocol',
        ref: 'Monitoring Plan v3 · §4',
        verdict: 'match',
        text: 'On-site monitoring visits are required at least quarterly for active enrolling sites.',
        ai: 'A Q2 on-site visit is consistent with the monitoring plan.'
      },
      {
        src: 'contract',
        ref: 'CTA Site 108 · Schedule B',
        verdict: 'warn',
        text: 'On-site monitoring is reimbursed at $1,600/day for up to 2 days per visit, plus documented travel.',
        ai: 'Invoiced $3,800 implies charges above the 2-day allowance; needs a timesheet to confirm.'
      },
      {
        src: 'edc',
        ref: 'CTMS Visit Report · Site 108',
        verdict: 'info',
        text: 'Monitoring visit report is filed, but the hourly CRA timesheet is not attached to this invoice.',
        ai: 'Missing timesheet prevents automated reconciliation of hours.'
      }
    ]
  },
  {
    id: 'LI-0448',
    amount: '$18,500.00',
    desc: 'Investigator site start-up fee',
    meta: 'Site 204 Madrid · Milestone M1',
    cat: 'Site fees',
    status: 'pass',
    complianceScore: 93,
    aiConfidence: 96,
    band: 'clear',
    summary: 'One-time start-up fee matches the contracted milestone amount and the IRB-approved site budget. Milestone M1 activation is confirmed in the CTMS.',
    gcpRules: ['CTA Schedule A', 'IRB Budget 2024/117', 'Milestone M1'],
    rec: 'Eligible for auto-clear — milestone amount matches Schedule A and the activation milestone is met.',
    evidence: [
      {
        src: 'contract',
        ref: 'CTA Site 204 · Schedule A',
        verdict: 'match',
        text: 'Site start-up fee is $18,500, payable on completion of activation milestone M1.',
        ai: 'Invoiced amount matches the contracted start-up fee exactly.'
      },
      {
        src: 'irb',
        ref: 'IRB Budget · Approval 2024/117',
        verdict: 'match',
        text: 'Site start-up costs are itemised and approved within the site budget.',
        ai: 'Fee is within the IRB-approved budget for the site.'
      },
      {
        src: 'edc',
        ref: 'CTMS · Site 204 Activation',
        verdict: 'match',
        text: 'Milestone M1 (site activation) recorded complete on 2026-05-02.',
        ai: 'Payment trigger milestone is satisfied.'
      }
    ]
  },
  {
    id: 'LI-0442',
    amount: '$980.00',
    desc: 'SAE narrative supplement',
    meta: 'Subject S-0104 · Pharmacovigilance · Site 108',
    cat: 'Safety',
    status: 'block',
    complianceScore: 9,
    aiConfidence: 97,
    band: 'hold',
    summary: 'This SAE narrative charge duplicates an item already reimbursed in the Q1 batch, and the CTA does not provide for a separate narrative fee. High-confidence duplicate — recommend hold.',
    gcpRules: ['ICH E6(R2) §4.11', 'CTA Schedule B', 'Duplicate check'],
    rec: 'Recommend hold — item duplicates INV-2026-Q1-088 and is not a reimbursable line under the CTA.',
    evidence: [
      {
        src: 'contract',
        ref: 'CTA Site 108 · Schedule B',
        verdict: 'conflict',
        text: 'Pharmacovigilance narrative preparation is included in the per-subject management fee; no separate line-item charge is permitted.',
        ai: 'No contractual basis for a standalone SAE narrative fee.'
      },
      {
        src: 'edc',
        ref: 'Invoice Ledger · INV-2026-Q1-088',
        verdict: 'conflict',
        text: 'An identical SAE narrative supplement for S-0104 was invoiced and reimbursed in Q1 2026.',
        ai: 'Exact duplicate of a previously paid item — double billing.'
      },
      {
        src: 'protocol',
        ref: 'PRO-2024-0837 · §4.11 Safety Reporting',
        verdict: 'match',
        text: 'SAE narratives are a required safety deliverable for all serious adverse events.',
        ai: 'The deliverable is legitimate; the separate charge is not.'
      }
    ]
  },
  {
    id: 'LI-0439',
    amount: '$310.00',
    desc: '12-lead ECG (screening)',
    meta: 'Subject S-0231 · Visit 1 · Site 112 Lyon',
    cat: 'Procedures',
    status: 'pass',
    complianceScore: 98,
    aiConfidence: 98,
    band: 'clear',
    summary: 'Screening ECG matches the protocol schedule of assessments and the contracted procedure rate. Source tracing is complete.',
    gcpRules: ['Protocol §7.1', 'CTA Rate Card §P'],
    rec: 'Eligible for auto-clear — procedure, timing and rate all reconcile.',
    evidence: [
      {
        src: 'protocol',
        ref: 'PRO-2024-0837 · §7.1',
        verdict: 'match',
        text: 'A 12-lead ECG is required at screening for all subjects.',
        ai: 'Procedure matches the protocol schedule of assessments.'
      },
      {
        src: 'contract',
        ref: 'CTA · Procedure Rate Card §P',
        verdict: 'match',
        text: 'Contracted ECG rate is $310.',
        ai: 'Amount matches the contracted procedure rate.'
      },
      {
        src: 'edc',
        ref: 'EDC · ECG Module S-0231',
        verdict: 'match',
        text: 'ECG tracing and interpretation are filed for Visit 1.',
        ai: 'Source records confirm the procedure occurred.'
      }
    ]
  },
  {
    id: 'LI-0431',
    amount: '$2,600.00',
    desc: 'IRB continuing review fee',
    meta: 'Site 108 Berlin · Annual renewal',
    cat: 'Regulatory',
    status: 'pending',
    complianceScore: 58,
    aiConfidence: 55,
    band: 'review',
    summary: 'Continuing-review pass-through fee is permitted by the contract, but the IRB fee receipt has not been attached. Supporting documentation is needed before the item can clear.',
    gcpRules: ['ICH E6(R2) §3', 'CTA §Pass-through'],
    rec: 'Auditor review — request the IRB fee receipt to substantiate the pass-through amount before approval.',
    evidence: [
      {
        src: 'contract',
        ref: 'CTA · Pass-through Costs',
        verdict: 'match',
        text: 'IRB/EC fees are reimbursable pass-through costs at documented cost.',
        ai: 'Fee category is contractually reimbursable.'
      },
      {
        src: 'irb',
        ref: 'IRB Renewal · Site 108',
        verdict: 'info',
        text: 'Continuing review was approved on 2026-06-15; the fee receipt is not yet attached to the invoice.',
        ai: 'Missing receipt prevents confirmation of the exact amount.'
      },
      {
        src: 'edc',
        ref: 'Document Vault · Site 108',
        verdict: 'warn',
        text: 'No matching IRB invoice document indexed for this period.',
        ai: 'Supporting document should be requested from the site.'
      }
    ]
  },
  {
    id: 'LI-0427',
    amount: '$1,150.00',
    desc: 'Central imaging read (MRI)',
    meta: 'Subject S-0198 · Visit 4 · Imaging Core Lab',
    cat: 'Imaging',
    status: 'flag',
    complianceScore: 51,
    aiConfidence: 88,
    band: 'review',
    summary: 'Central read appears to have been billed before the corresponding images were received by the core lab, creating a timing mismatch against source data.',
    gcpRules: ['Imaging Charter v2', 'CTA Rate Card §I', 'Protocol §7.4'],
    rec: 'Auditor review — read billed 2026-06-30 but image receipt logged 2026-07-02; confirm the read was performed before approving.',
    evidence: [
      {
        src: 'protocol',
        ref: 'PRO-2024-0837 · §7.4 Imaging',
        verdict: 'match',
        text: 'Central MRI read is required at Visit 4 per the imaging charter.',
        ai: 'The read is a protocol-required deliverable.'
      },
      {
        src: 'edc',
        ref: 'Imaging Core Lab · Receipt Log',
        verdict: 'conflict',
        text: 'MRI series for S-0198 logged as received 2026-07-02; the read charge is dated 2026-06-30.',
        ai: 'Read billed two days before images were received — timing inconsistency.'
      },
      {
        src: 'contract',
        ref: 'CTA · Imaging Rate Card §I',
        verdict: 'warn',
        text: 'Central read rate is $1,150 per scan, billable on completion of the read.',
        ai: 'Rate matches, but completion timing is unverified.'
      }
    ]
  }
];
