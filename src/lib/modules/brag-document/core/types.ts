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
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/** Immutable, self-contained copy: rendering never reads current CareerMoment records. */
export interface FinalizedSnapshot {
  id: string;
  outputId: string;
  version: number;
  outputRevision: number;
  finalizedAt: string;
  kind: OutputKind;
  title: string;
  targetRole: string | null;
  organization: string | null;
  period: Period;
  sections: {
    momentId: string;
    heading: string;
    body: string;
    occurredOn: string;
    project: string | null;
    evidenceUrls: string[];
  }[];
}

export type NewMomentInput = { note: string; evidenceUrl?: string; project?: string };

/** Form values are strings to keep editing independent of committed records. */
export interface MomentEditInput {
  note: string;
  occurredOn: string;
  project: string;
  problem: string;
  contribution: string;
  outcome: string;
  verification: Verification;
  /** One HTTP(S) evidence URL per line. */
  evidenceUrls: string;
}

export interface NewOutputInput {
  kind: OutputKind;
  title: string;
  targetRole: string;
  organization: string;
  period: Period;
}
