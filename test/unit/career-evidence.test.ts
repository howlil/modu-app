import { describe, expect, it } from 'vitest';
import {
  createMoment, decodeMoment, filterMoments, matchesPeriod,
  normalizedEvidenceUrl, normalizedNote, selectMomentForOutput, setOutputNarrative
} from '../../src/lib/modules/brag-document/core/moments.ts';
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
      items: [], createdAt: at.toISOString(), updatedAt: at.toISOString()
    });
    const first = setOutputNarrative(selectMomentForOutput(base('a'), source), source.id, 'Backend story');
    const second = setOutputNarrative(selectMomentForOutput(base('b'), source), source.id, 'Cloud story');
    expect(first.items[0]?.narrative).toBe('Backend story');
    expect(second.items[0]?.narrative).toBe('Cloud story');
    expect(source.note).toBe('Fixed authentication retry behavior');
    expect(selectMomentForOutput(first, source).items).toHaveLength(1);
  });
});
