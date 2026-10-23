/** Feature-owned domain records. No browser or Svelte dependencies. */
export type Verification = 'not-measured' | 'observed' | 'measured';
export type OutputKind = 'interview' | 'application' | 'review';
export type Period =
  | { kind: 'all-time' }
  | { kind: 'year'; year: number }
  | { kind: 'month'; year: number; month: number };

export type EvidenceRef = { id: string; url: string; label?: string };

export interface CareerMoment {
  id: string;
  note: string;
  occurredOn: string;
  project: string | null;
  problem: string | null;
  contribution: string | null;
  outcome: string | null;
  verification: Verification;
  evidence: EvidenceRef[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface CareerOutputItem {
  momentId: string;
  position: number;
  narrative: string | null;
  sourceRevision: number;
}

export interface CareerOutput {
  id: string;
  kind: OutputKind;
  title: string;
  targetRole: string | null;
  organization: string | null;
  period: Period;
  items: CareerOutputItem[];
  createdAt: string;
  updatedAt: string;
}

export interface FinalizedSnapshot {
  id: string;
  outputId: string;
  finalizedAt: string;
  title: string;
  sections: { heading: string; body: string; evidenceUrls: string[] }[];
}

export type NewMomentInput = { note: string; evidenceUrl?: string; project?: string };
