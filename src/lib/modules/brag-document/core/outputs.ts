import type {
  CareerMoment, CareerOutput, CareerOutputItem, NewOutputInput, Period
} from './types.ts';
import { CareerValidationError, filterMoments, matchesPeriod } from './moments.ts';

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const timestamp = (v: unknown): v is string =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));

export function validPeriod(value: unknown): value is Period {
  if (!object(value)) return false;
  if (value.kind === 'all-time') return true;
  if ((typeof value.year !== 'number' || !Number.isInteger(value.year)) || Number(value.year) < 1 || Number(value.year) > 9999)
    return false;
  return value.kind === 'year' ||
    (value.kind === 'month' && typeof value.month === 'number' && Number.isInteger(value.month) &&
      Number(value.month) >= 1 && Number(value.month) <= 12);
}

function cleanText(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== 'string') throw new CareerValidationError(label + ' must be text.');
  const text = value.trim();
  if ((required && !text) || text.length > max) {
    throw new CareerValidationError(label + (required && !text ? ' is required.' : ' is too long.'));
  }
  return text;
}

export function decodeOutput(value: unknown): CareerOutput {
  if (!object(value) || typeof value.id !== 'string' || !value.id ||
    !['interview', 'application', 'review'].includes(String(value.kind)) ||
    !validPeriod(value.period) || !Array.isArray(value.items) ||
    (typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision)) || Number(value.revision) < 1 ||
    !timestamp(value.createdAt) || !timestamp(value.updatedAt)) {
    throw new CareerValidationError('Stored career document is invalid.');
  }
  const title = cleanText(value.title, 'Document title', 160, true);
  const targetRole = value.targetRole === null ? null :
    cleanText(value.targetRole, 'Target role', 120) || null;
  const organization = value.organization === null ? null :
    cleanText(value.organization, 'Organization', 120) || null;
  const seen = new Set<string>();
  const items: CareerOutputItem[] = value.items.map((v, i) => {
    if (!object(v) || typeof v.momentId !== 'string' || !v.momentId ||
      seen.has(v.momentId) || v.position !== i ||
      (typeof v.sourceRevision !== 'number' || !Number.isSafeInteger(v.sourceRevision)) || Number(v.sourceRevision) < 1 ||
      (v.narrative !== null && (typeof v.narrative !== 'string' || v.narrative.length > 3500))) {
      throw new CareerValidationError('Document contains an invalid or duplicate evidence item.');
    }
    seen.add(v.momentId);
    return { momentId: v.momentId, position: i,
      narrative: v.narrative as string | null, sourceRevision: v.sourceRevision as number };
  });
  return {
    id: value.id, kind: value.kind as CareerOutput['kind'], title,
    targetRole, organization, period: value.period as Period,
    items, revision: value.revision as number,
    createdAt: value.createdAt, updatedAt: value.updatedAt
  };
}

export function createOutput(input: NewOutputInput, id: string, now: Date): CareerOutput {
  const result: CareerOutput = {
    id,
    kind: input.kind,
    title: input.title,
    targetRole: input.targetRole.trim() || null,
    organization: input.organization.trim() || null,
    period: input.period,
    items: [],
    revision: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  return decodeOutput(result);
}

/** Period narrows discovery, not selected evidence: changing a date never deletes a reference. */
export function outputCandidates(moments: readonly CareerMoment[], output: CareerOutput, search = '') {
  return filterMoments(moments, search, { period: output.period });
}

export function updateOutputGoal(output: CareerOutput, input: NewOutputInput): CareerOutput {
  return decodeOutput({
    ...output, kind: input.kind, title: input.title, targetRole: input.targetRole.trim() || null,
    organization: input.organization.trim() || null, period: input.period
  });
}

export function toggleOutputMoment(
  output: CareerOutput, moment: CareerMoment
): CareerOutput {
  const existing = output.items.some(item => item.momentId === moment.id);
  const items = existing
    ? output.items.filter(item => item.momentId !== moment.id)
    : [...output.items, {
      momentId: moment.id, position: output.items.length,
      narrative: null, sourceRevision: moment.revision
    }];
  return {
    ...output,
    items: items.map((item, position) => ({ ...item, position }))
  };
}

export function moveOutputMoment(
  output: CareerOutput, momentId: string, direction: -1 | 1
): CareerOutput {
  const index = output.items.findIndex(item => item.momentId === momentId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= output.items.length) return output;
  const items = [...output.items];
  const first = items[index]!;
  items[index] = items[nextIndex]!;
  items[nextIndex] = first;
  return { ...output, items: items.map((item, position) => ({ ...item, position })) };
}

export function updateOutputNarrative(
  output: CareerOutput, momentId: string, narrative: string
): CareerOutput {
  if (narrative.length > 3500) throw new CareerValidationError('Narrative is too long.');
  if (!output.items.some(item => item.momentId === momentId)) {
    throw new CareerValidationError('Select the experience before editing its narrative.');
  }
  return {
    ...output,
    items: output.items.map(item => item.momentId === momentId
      ? { ...item, narrative: narrative || null } : item)
  };
}

export function committedOutputDraft(draft: CareerOutput, base: CareerOutput, now: Date) {
  if (draft.id !== base.id || draft.revision !== base.revision)
    throw new CareerValidationError('Document revision has changed.');
  if (!Number.isSafeInteger(base.revision + 1))
    throw new CareerValidationError('Document revision has reached its limit.');
  return decodeOutput({ ...draft, revision: base.revision + 1, updatedAt: now.toISOString() });
}

export type PreviewItem = {
  momentId: string; title: string; narrative: string; evidenceUrls: string[];
  sourceChanged: boolean; outOfPeriod: boolean; archived: boolean; missing: boolean;
};

/** Pure projection: never invent claims or silently rewrite source notes. */
export function projectOutputItems(
  output: CareerOutput, moments: readonly CareerMoment[]
): PreviewItem[] {
  const byId = new Map(moments.map(moment => [moment.id, moment]));
  return output.items.map(item => {
    const source = byId.get(item.momentId);
    return {
      momentId: item.momentId,
      title: source?.note ?? 'Unavailable source moment',
      narrative: item.narrative ?? source?.contribution ?? source?.note ?? '',
      evidenceUrls: source?.evidence.map(link => link.url) ?? [],
      sourceChanged: !!source && item.sourceRevision !== source.revision,
      outOfPeriod: !!source && !matchesPeriod(source.occurredOn, output.period),
      archived: !!source?.archivedAt,
      missing: !source
    };
  });
}
