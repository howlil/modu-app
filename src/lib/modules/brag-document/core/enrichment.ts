import {
  CareerValidationError, decodeMoment, normalizedEvidenceUrl, normalizedNote
} from './moments.ts';
import type {
  CareerMoment, EvidenceRef, MomentEditInput, Verification
} from './types.ts';

export function toMomentEditInput(moment: CareerMoment): MomentEditInput {
  return {
    note: moment.note,
    occurredOn: moment.occurredOn,
    project: moment.project ?? '',
    problem: moment.problem ?? '',
    contribution: moment.contribution ?? '',
    outcome: moment.outcome ?? '',
    verification: moment.verification,
    evidenceUrls: moment.evidence.map(link => link.url).join('\n')
  };
}

export function isValidLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const candidate = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(candidate.valueOf()) &&
    candidate.toISOString().slice(0, 10) === value;
}

function optionalText(value: string, label: string, limit: number): string | null {
  const text = value.trim();
  if (text.length > limit) {
    throw new CareerValidationError(label + ' must be under ' + limit + ' characters.');
  }
  return text || null;
}

export function normalizeEvidence(
  raw: string,
  current: readonly EvidenceRef[],
  newId: () => string
): EvidenceRef[] {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 12) throw new CareerValidationError('Use up to 12 evidence links.');
  const known = new Map(current.map(link => [link.url, link]));
  const seen = new Set<string>();
  const result: EvidenceRef[] = [];
  for (const line of lines) {
    const url = normalizedEvidenceUrl(line);
    if (seen.has(url)) continue;
    seen.add(url);
    const existing = known.get(url);
    result.push(existing ?? { id: newId(), url });
  }
  return result;
}

export function applyMomentEdit(
  current: CareerMoment,
  input: MomentEditInput,
  now: Date,
  newEvidenceId: () => string
): CareerMoment {
  const note = normalizedNote(input.note);
  if (!isValidLocalDate(input.occurredOn)) {
    throw new CareerValidationError('Choose a valid date.');
  }
  if (!['not-measured', 'observed', 'measured'].includes(input.verification)) {
    throw new CareerValidationError('Choose a valid verification level.');
  }
  if (!Number.isSafeInteger(current.revision + 1)) {
    throw new CareerValidationError('The moment revision cannot be advanced.');
  }
  const next: CareerMoment = {
    ...current,
    note,
    occurredOn: input.occurredOn,
    project: optionalText(input.project, 'Project', 120),
    problem: optionalText(input.problem, 'Problem', 2000),
    contribution: optionalText(input.contribution, 'Contribution', 2000),
    outcome: optionalText(input.outcome, 'Outcome', 2000),
    verification: input.verification as Verification,
    evidence: normalizeEvidence(input.evidenceUrls, current.evidence, newEvidenceId),
    revision: current.revision + 1,
    updatedAt: now.toISOString()
  };
  return decodeMoment(next);
}

export function setMomentArchived(
  current: CareerMoment,
  archived: boolean,
  now: Date
): CareerMoment {
  if (Boolean(current.archivedAt) === archived) return current;
  if (!Number.isSafeInteger(current.revision + 1)) {
    throw new CareerValidationError('The moment revision cannot be advanced.');
  }
  return decodeMoment({
    ...current,
    archivedAt: archived ? now.toISOString() : null,
    updatedAt: now.toISOString(),
    revision: current.revision + 1
  });
}
