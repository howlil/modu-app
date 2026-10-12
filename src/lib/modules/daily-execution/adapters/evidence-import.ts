import { isEvidenceKind, type EvidenceRecord, type EvidenceSource } from '../core/evidence.ts';

const MAX_BYTES = 512 * 1024;
const MAX_RECORDS = 100;
function idHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export async function parseLocalEvidenceFile(file: File, now: number): Promise<EvidenceRecord[]> {
  if (file.size > MAX_BYTES) throw new Error('Maximum import size: 512 KB.');
  const raw: unknown = JSON.parse(await file.text());
  if (!Array.isArray(raw) || raw.length > MAX_RECORDS) throw new Error('Import must contain an array of at most 100 evidence records.');
  const acceptedSources: EvidenceSource[] = ['github', 'airtable', 'cs101', 'import'];
  const results: EvidenceRecord[] = [];
  for (const input of raw) {
    if (!input || typeof input !== 'object') throw new Error('Invalid evidence record.');
    const value = input as Record<string, unknown>;
    if (!isEvidenceKind(value.kind) || typeof value.title !== 'string' || !value.title.trim() ||
      typeof value.observation !== 'string' || !value.observation.trim() ||
      typeof value.occurredAt !== 'number' || !Number.isFinite(value.occurredAt) || value.occurredAt > now + 60_000)
      throw new Error('Each record requires kind, title, observation and a valid occurredAt timestamp in milliseconds.');
    const source: EvidenceSource = typeof value.source === 'string' && acceptedSources.includes(value.source as EvidenceSource)
      ? value.source as EvidenceSource : 'import';
    const externalId = typeof value.externalId === 'string' && value.externalId.trim()
      ? value.externalId.trim().slice(0, 160) : undefined;
    const canonical = externalId ? source + ':' + externalId : 'import:' + idHash(JSON.stringify([source,value.kind,value.title,value.observation,value.occurredAt]));
    const assessmentResult = value.assessmentResult === 'needs-practice' || value.assessmentResult === 'passed' ||
      value.assessmentResult === 'informational' ? value.assessmentResult : undefined;
    results.push({
      id: 'imported:' + canonical, externalId, source, kind: value.kind,
      title: value.title.trim().slice(0, 160),
      observation: value.observation.trim().slice(0, 800),
      occurredAt: value.occurredAt, importedAt: now,
      taskId: typeof value.taskId === 'string' ? value.taskId.slice(0, 120) : undefined,
      topic: typeof value.topic === 'string' ? value.topic.trim().slice(0, 80) : undefined,
      assessmentResult,
      url: typeof value.url === 'string' && /^https:\/\//i.test(value.url) ? value.url.slice(0, 500) : undefined,
      // An uploaded JSON claim is NOT a validated provider event.
      verification: 'unverified'
    });
  }
  return results;
}
