import type {
  CareerMoment, CareerOutput, FinalizedSnapshot, OutputKind, Period
} from './types.ts';
import { CareerValidationError, decodeMoment, normalizedEvidenceUrl } from './moments.ts';
import { isValidLocalDate } from './enrichment.ts';
import { decodeOutput, validPeriod } from './outputs.ts';

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const timestamp = (v: unknown): v is string =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));

export function buildFinalizedSnapshot(
  output: CareerOutput,
  moments: readonly CareerMoment[],
  id: string, version: number, now: Date
): FinalizedSnapshot {
  const document = decodeOutput(output);
  if (!id || !Number.isSafeInteger(version) || version < 1)
    throw new CareerValidationError('Unable to assign a document version.');
  if (document.items.length === 0)
    throw new CareerValidationError('Select at least one experience before finalizing.');
  const byId = new Map(moments.map(moment => [moment.id, decodeMoment(moment)]));
  const sections = document.items.map(item => {
    const source = byId.get(item.momentId);
    if (!source)
      throw new CareerValidationError('A selected experience is missing. Remove it or restore the source.');
    if (source.revision !== item.sourceRevision)
      throw new CareerValidationError('A source experience changed. Review it in the builder before finalizing.');
    const body = (item.narrative || source.contribution || source.note).trim();
    if (!body) throw new CareerValidationError('A selected story has no content.');
    return {
      momentId: item.momentId,
      heading: source.note,
      body,
      occurredOn: source.occurredOn,
      project: source.project,
      evidenceUrls: source.evidence.map(link => link.url)
    };
  });
  return decodeFinalizedSnapshot({
    id, outputId: document.id, outputRevision: document.revision,
    version, finalizedAt: now.toISOString(),
    kind: document.kind, title: document.title,
    targetRole: document.targetRole, organization: document.organization,
    period: document.period, sections
  });
}

/** Once decoded, this record is complete: neither preview nor print requires live sources. */
export function decodeFinalizedSnapshot(value: unknown): FinalizedSnapshot {
  if (!record(value) ||
    typeof value.id !== 'string' || !value.id ||
    typeof value.outputId !== 'string' || !value.outputId ||
    typeof value.title !== 'string' || !value.title.trim() || value.title.length > 160 ||
    !Number.isSafeInteger(value.version) || Number(value.version) < 1 ||
    !Number.isSafeInteger(value.outputRevision) || Number(value.outputRevision) < 1 ||
    !timestamp(value.finalizedAt) ||
    !['interview','application','review'].includes(String(value.kind)) ||
    !validPeriod(value.period) || !Array.isArray(value.sections) || value.sections.length === 0 ||
    (value.targetRole !== null && (typeof value.targetRole !== 'string' || value.targetRole.length > 120)) ||
    (value.organization !== null && (typeof value.organization !== 'string' || value.organization.length > 120))) {
    throw new CareerValidationError('Invalid finalized career document.');
  }
  const seen = new Set<string>();
  const sections: FinalizedSnapshot['sections'] = value.sections.map(section => {
    if (!record(section) ||
      typeof section.momentId !== 'string' || !section.momentId || seen.has(section.momentId) ||
      typeof section.heading !== 'string' || !section.heading.trim() || section.heading.length > 3000 ||
      typeof section.body !== 'string' || !section.body.trim() || section.body.length > 3500 ||
      typeof section.occurredOn !== 'string' || !isValidLocalDate(section.occurredOn) ||
      (section.project !== null && (typeof section.project !== 'string' || section.project.length > 120)) ||
      !Array.isArray(section.evidenceUrls) || section.evidenceUrls.length > 12 ||
      section.evidenceUrls.some(url => typeof url !== 'string' || normalizedEvidenceUrl(url) !== url)) {
      throw new CareerValidationError('Invalid finalized career document section.');
    }
    seen.add(section.momentId);
    return {
      momentId: section.momentId, heading: section.heading, body: section.body,
      occurredOn: section.occurredOn, project: section.project as string | null,
      evidenceUrls: [...section.evidenceUrls] as string[]
    };
  });
  return {
    id: value.id, outputId: value.outputId,
    version: value.version as number, outputRevision: value.outputRevision as number,
    finalizedAt: value.finalizedAt, kind: value.kind as OutputKind,
    title: value.title, targetRole: value.targetRole as string | null,
    organization: value.organization as string | null,
    period: value.period as Period, sections
  };
}

/** Explicit acknowledgement that newly edited source facts were reviewed. */
export function acknowledgeSourceRevision(
  output: CareerOutput, source: CareerMoment
): CareerOutput {
  if (!output.items.some(item => item.momentId === source.id))
    throw new CareerValidationError('Experience is not selected.');
  return { ...output, items: output.items.map(item => item.momentId === source.id
    ? { ...item, sourceRevision: source.revision } : item) };
}
