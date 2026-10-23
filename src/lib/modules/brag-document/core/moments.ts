import type {
  CareerMoment, CareerOutput, EvidenceRef, NewMomentInput, Period
} from './types.ts';

export class CareerValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'CareerValidationError'; }
}

export function normalizedNote(raw: string): string {
  const note = raw.trim();
  if (!note) throw new CareerValidationError('Write one thing you worked on.');
  if (note.length > 3000) throw new CareerValidationError('Keep each note under 3,000 characters.');
  return note;
}

export function normalizedEvidenceUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  let url: URL;
  try { url = new URL(value); }
  catch { throw new CareerValidationError('Enter a valid evidence URL.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new CareerValidationError('Evidence links must use http or https.');
  }
  if (value.length > 2048) throw new CareerValidationError('Evidence URL is too long.');
  return url.href;
}

export function localISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return [y, m, d].join('-');
}

export function createMoment(
  input: NewMomentInput, id: string, now: Date,
  evidenceId: string
): CareerMoment {
  const note = normalizedNote(input.note);
  const url = normalizedEvidenceUrl(input.evidenceUrl ?? '');
  const project = (input.project ?? '').trim();
  if (project.length > 120) throw new CareerValidationError('Project name is too long.');
  if (!id || !evidenceId) throw new CareerValidationError('Unable to create record identity.');
  return {
    id, note, occurredOn: localISODate(now), project: project || null,
    problem: null, contribution: null, outcome: null,
    verification: 'not-measured',
    evidence: url ? [{ id: evidenceId, url }] : [],
    revision: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    archivedAt: null
  };
}

export function matchesPeriod(date: string, period: Period): boolean {
  if (period.kind === 'all-time') return true;
  if (period.kind === 'year') return date.slice(0, 4) === String(period.year);
  return date.slice(0, 7) === String(period.year) + '-' + String(period.month).padStart(2, '0');
}

export function filterMoments(
  moments: readonly CareerMoment[], query: string,
  options: { includeArchived?: boolean; period?: Period } = {}
): CareerMoment[] {
  const term = query.trim().toLocaleLowerCase();
  return moments.filter(moment =>
    (options.includeArchived || !moment.archivedAt) &&
    (!options.period || matchesPeriod(moment.occurredOn, options.period)) &&
    (!term || [moment.note, moment.project, moment.problem, moment.contribution, moment.outcome]
      .some(text => (text ?? '').toLocaleLowerCase().includes(term)))
  ).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) ||
    b.createdAt.localeCompare(a.createdAt));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isDate = (text: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(text) &&
  !Number.isNaN(Date.parse(text + 'T12:00:00Z')) &&
  new Date(text + 'T12:00:00Z').toISOString().slice(0, 10) === text;

/** Storage is external ingress; never cast persisted unknown into a domain record. */
export function decodeMoment(value: unknown): CareerMoment {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id ||
    typeof value.note !== 'string' || !value.note.trim() || value.note.length > 3000 ||
    typeof value.occurredOn !== 'string' || !isDate(value.occurredOn) ||
    typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
    typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
    typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)) ||
    !Array.isArray(value.evidence) || !['not-measured','observed','measured'].includes(String(value.verification))) {
    throw new CareerValidationError('Stored Career Evidence contains an invalid moment.');
  }
  for (const key of ['project', 'problem', 'contribution', 'outcome', 'archivedAt']) {
    if (value[key] !== null && typeof value[key] !== 'string') {
      throw new CareerValidationError('Stored Career Evidence has invalid fields.');
    }
  }
  const evidence: EvidenceRef[] = value.evidence.map(item => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id ||
      typeof item.url !== 'string' || normalizedEvidenceUrl(item.url) !== item.url ||
      (item.label !== undefined && typeof item.label !== 'string')) {
      throw new CareerValidationError('Stored Career Evidence has an invalid evidence link.');
    }
    return { id: item.id, url: item.url, ...(item.label ? { label: item.label } : {}) };
  });
  return {
    id: value.id, note: value.note, occurredOn: value.occurredOn,
    project: value.project as string | null,
    problem: value.problem as string | null,
    contribution: value.contribution as string | null,
    outcome: value.outcome as string | null,
    verification: value.verification as CareerMoment['verification'],
    evidence, revision: value.revision,
    createdAt: value.createdAt, updatedAt: value.updatedAt,
    archivedAt: value.archivedAt as string | null
  };
}

/** Output-specific narration never modifies source moments. */
export function selectMomentForOutput(
  output: CareerOutput, moment: CareerMoment
): CareerOutput {
  if (output.items.some(item => item.momentId === moment.id)) return output;
  return {
    ...output, items: [...output.items, {
      momentId: moment.id, position: output.items.length,
      narrative: null, sourceRevision: moment.revision
    }]
  };
}

export function setOutputNarrative(
  output: CareerOutput, momentId: string, narrative: string
): CareerOutput {
  if (!output.items.some(item => item.momentId === momentId)) {
    throw new CareerValidationError('Moment is not selected for this document.');
  }
  return { ...output, items: output.items.map(item => item.momentId === momentId
    ? { ...item, narrative: narrative.trim() || null } : item) };
}
