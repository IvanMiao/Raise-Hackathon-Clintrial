export interface EvidenceItem {
  src: 'protocol' | 'irb' | 'contract' | 'edc' | string;
  ref: string;
  locator?: string;
  verdict: 'match' | 'warn' | 'conflict' | 'info';
  text: string;
  ai: string;
}

export interface TrialItem {
  id: string;
  amount: string;
  desc: string;
  meta: string;
  cat: string;
  status: 'pass' | 'flag' | 'block' | 'review' | 'pending';
  complianceScore: number;
  aiConfidence: number;
  band: 'clear' | 'review' | 'hold';
  summary: string;
  gcpRules: string[];
  rec: string;
  evidence: EvidenceItem[];
}

export interface AuditTrailEntry {
  time: string;
  auditor: string;
  item: string;
  action: string;
  actionColor: string;
  actionBg: string;
  justification: string;
}

export interface StatusMeta {
  statusText: string;
  chipColor: string;
  chipBg: string;
  dotColor: string;
}

export interface BandMeta {
  label: string;
  bg: string;
  border: string;
  accent: string;
}
