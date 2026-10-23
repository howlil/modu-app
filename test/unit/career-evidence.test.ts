import { describe, expect, it } from 'vitest';
import {
  createMoment, decodeMoment, filterMoments, matchesPeriod,
  normalizedEvidenceUrl, normalizedNote, selectMomentForOutput, setOutputNarrative
} from '../../src/lib/modules/brag-document/core/moments.ts';
import { applyMomentEdit, isValidLocalDate, normalizeEvidence, setMomentArchived, toMomentEditInput } from '../../src/lib/modules/brag-document/core/enrichment.ts';
import type { CareerOutput } from '../../src/lib/modules/brag-document/core/types.ts';

const at = new Date('2026-10-23T12:00:00Z');
const moment = () => createMoment(
  { note: 'Fixed authentication retry behavior', evidenceUrl: 'https://github.com/example/pr/1' },
  'moment-1', at, 'evidence-1'
);

describe('Career Evidence domain', () => {
  it('accepts one sentence and no mandatory metrics, roles or tags', () => {
    const result = createMoment({ note: '  Improved docs  ' }, 'm', at, 'e');
    expect(result.note).toBe('Improved docs');
    expect(result.outcome).toBeNull();
    expect(result.verification).toBe('not-measured');
    expect(result.evidence).toEqual([]);
  });
  it('rejects empty notes and unsafe links', () => {
    expect(() => normalizedNote(' \n ')).toThrow();
    expect(() => normalizedEvidenceUrl('javascript:alert(1)')).toThrow();
  });
  it('decodes persisted records and rejects corrupted records', () => {
    expect(decodeMoment(moment())).toEqual(moment());
    expect(() => decodeMoment({ ...moment(), revision: 0 })).toThrow();
    expect(() => decodeMoment({ ...moment(), evidence: [{ id: 'x', url: 'file:///secret' }] })).toThrow();
  });
  it('searches source facts and matches selected periods', () => {
    expect(filterMoments([moment()], 'AUTHENTICATION')).toHaveLength(1);
    expect(matchesPeriod('2026-10-23', { kind: 'month', year: 2026, month: 10 })).toBe(true);
    expect(matchesPeriod('2026-10-23', { kind: 'year', year: 2025 })).toBe(false);
  });
  it('reuses one moment in multiple outputs without mutating the source', () => {
    const source = moment();
    const base = (id: string): CareerOutput => ({
      id, kind: 'interview', title: 'Interview', targetRole: 'Backend Engineer',
      organization: null, period: { kind: 'all-time' },
      items: [], revision: 1, createdAt: at.toISOString(), updatedAt: at.toISOString()
    });
    const first = setOutputNarrative(selectMomentForOutput(base('a'), source), source.id, 'Backend story');
    const second = setOutputNarrative(selectMomentForOutput(base('b'), source), source.id, 'Cloud story');
    expect(first.items[0]?.narrative).toBe('Backend story');
    expect(second.items[0]?.narrative).toBe('Cloud story');
    expect(source.note).toBe('Fixed authentication retry behavior');
    expect(selectMomentForOutput(first, source).items).toHaveLength(1);
  });
  it('enriches optional story fields and preserves evidence identity', () => {
    const original = moment();
    const draft = toMomentEditInput(original);
    draft.note = ' Fixed the login flow ';
    draft.project = ' NOX ';
    draft.problem = ' Callback failure ';
    draft.contribution = ' Added an explicit recovery state ';
    draft.outcome = ' Sign-in failure is recoverable ';
    draft.verification = 'observed';
    draft.evidenceUrls = original.evidence[0]!.url + '\nhttps://github.com/example/pr/2';
    let nextId = 1;
    const updated = applyMomentEdit(original, draft, new Date('2026-10-24T12:00:00Z'),
      () => 'new-' + nextId++);
    expect(updated.note).toBe('Fixed the login flow');
    expect(updated.project).toBe('NOX');
    expect(updated.contribution).toBe('Added an explicit recovery state');
    expect(updated.revision).toBe(original.revision + 1);
    expect(updated.evidence.map(link => link.id)).toEqual(['evidence-1', 'new-1']);
    expect(original.contribution).toBeNull();
    expect(original.evidence).toHaveLength(1);
  });
  it('rejects invalid form data without changing the saved record', () => {
    const original = moment();
    const draft = toMomentEditInput(original);
    draft.occurredOn = '2026-02-30';
    expect(isValidLocalDate(draft.occurredOn)).toBe(false);
    expect(() => applyMomentEdit(original, draft, at, () => 'new')).toThrow();
    draft.occurredOn = '2026-10-23';
    draft.evidenceUrls = 'file:///secret';
    expect(() => applyMomentEdit(original, draft, at, () => 'new')).toThrow();
    draft.evidenceUrls = '';
    draft.problem = 'x'.repeat(2001);
    expect(() => applyMomentEdit(original, draft, at, () => 'new')).toThrow();
    expect(original.revision).toBe(1);
  });
  it('deduplicates links and archives and restores without deleting facts', () => {
    const original = moment();
    const links = normalizeEvidence(
      'https://github.com/example/pr/1\nhttps://github.com/example/pr/1',
      original.evidence, () => 'new'
    );
    expect(links).toEqual(original.evidence);
    const archived = setMomentArchived(original, true, new Date('2026-10-24T00:00:00Z'));
    expect(archived.archivedAt).not.toBeNull();
    expect(filterMoments([archived], '')).toEqual([]);
    expect(filterMoments([archived], '', { includeArchived: true })).toHaveLength(1);
    const restored = setMomentArchived(archived, false, new Date('2026-10-25T00:00:00Z'));
    expect(restored.archivedAt).toBeNull();
    expect(restored.revision).toBe(archived.revision + 1);
    expect(restored.note).toBe(original.note);
    expect(setMomentArchived(restored, false, at)).toBe(restored);
  });
  it('can find source evidence URLs using History search', () => {
    expect(filterMoments([moment()], 'github.com/example/pr/1')).toHaveLength(1);
  });
});
