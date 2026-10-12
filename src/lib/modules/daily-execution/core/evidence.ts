import type { ExecutionTask } from './planning.ts';

export type EvidenceKind = 'deliverable' | 'assessment' | 'application' | 'interview' | 'milestone';
export type EvidenceSource = 'manual' | 'task-outcome' | 'github' | 'airtable' | 'cs101' | 'import';
export type EvidenceVerification = 'user-reported' | 'source-confirmed' | 'unverified';

export interface EvidenceRecord {
  id: string;
  taskId?: string;
  kind: EvidenceKind;
  source: EvidenceSource;
  externalId?: string;
  title: string;
  observation: string;
  occurredAt: number;
  importedAt?: number;
  url?: string;
  topic?: string;
  assessmentResult?: 'needs-practice' | 'passed' | 'informational';
  verification: EvidenceVerification;
  archivedAt?: number;
}

export function projectTaskOutcomes(tasks: ExecutionTask[]): EvidenceRecord[] {
  return tasks.filter((task) => task.status === 'done' && !!task.outcome?.trim() && !!task.completedAt)
    .map((task) => ({
      id: 'task-outcome:' + task.id,
      taskId: task.id,
      kind: 'deliverable' as const,
      source: 'task-outcome' as const,
      externalId: task.id,
      title: task.title,
      observation: task.outcome!.trim(),
      occurredAt: task.completedAt!,
      url: task.evidenceUrl,
      verification: 'user-reported' as const
    }));
}

export function evidenceIdentity(record: Pick<EvidenceRecord, 'id' | 'source' | 'externalId'>): string {
  return record.externalId ? record.source + ':' + record.externalId : record.id;
}

export function uniqueEvidence(records: EvidenceRecord[]): EvidenceRecord[] {
  const keys = new Set<string>();
  return records.filter((record) => {
    const key = evidenceIdentity(record);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

export function combineEvidence(stored: EvidenceRecord[], tasks: ExecutionTask[]): EvidenceRecord[] {
  return uniqueEvidence([...projectTaskOutcomes(tasks), ...stored.filter((record) => !record.archivedAt)]).sort((a, b) => b.occurredAt - a.occurredAt);
}

export function isEvidenceKind(value: unknown): value is EvidenceKind {
  return value === 'deliverable' || value === 'assessment' || value === 'application' ||
    value === 'interview' || value === 'milestone';
}
