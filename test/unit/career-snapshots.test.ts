import { describe, expect, it } from 'vitest';
import { createMoment } from '../../src/lib/modules/brag-document/core/moments.ts';
import { createOutput, toggleOutputMoment, updateOutputNarrative } from '../../src/lib/modules/brag-document/core/outputs.ts';
import {
  acknowledgeSourceRevision, buildFinalizedSnapshot, decodeFinalizedSnapshot
} from '../../src/lib/modules/brag-document/core/snapshots.ts';

const now = new Date('2026-10-24T09:00:00Z');
const source = () => createMoment({
  note: 'Resolved routing overlap', evidenceUrl: 'https://github.com/example/pull/7'
}, 'moment-1', now, 'evidence-1');
const output = () => toggleOutputMoment(createOutput({
  kind: 'interview', title: 'Backend interview preparation',
  targetRole: 'Backend Engineer', organization: 'Example',
  period: { kind: 'year', year: 2026 }
}, 'document-1', now), source());

describe('Finalized career document snapshots', () => {
  it('finalizes selected narratives and creates a fully self-contained artifact', () => {
    const draft = updateOutputNarrative(output(), 'moment-1',
      'I developed a deterministic route evaluation to avoid overlapping edges.');
    const snapshot = buildFinalizedSnapshot(draft, [source()], 'snapshot-1', 1, now);
    expect(snapshot.title).toBe('Backend interview preparation');
    expect(snapshot.kind).toBe('interview');
    expect(snapshot.targetRole).toBe('Backend Engineer');
    expect(snapshot.sections[0]?.body).toContain('deterministic route evaluation');
    expect(snapshot.sections[0]?.evidenceUrls).toEqual(['https://github.com/example/pull/7']);
    expect(decodeFinalizedSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    const modified = { ...source(), note: 'A newer source story', revision: 2 };
    expect(snapshot.sections[0]?.heading).toBe('Resolved routing overlap');
    expect(modified.note).not.toBe(snapshot.sections[0]?.heading);
  });
  it('refuses empty, missing and stale source material', () => {
    const draft = output();
    expect(() => buildFinalizedSnapshot({ ...draft, items: [] }, [source()], 's', 1, now)).toThrow();
    expect(() => buildFinalizedSnapshot(draft, [], 's', 1, now)).toThrow();
    const changed = { ...source(), note: 'Changed outside builder', revision: 2 };
    expect(() => buildFinalizedSnapshot(draft, [changed], 's', 1, now)).toThrow('changed');
    const reviewed = acknowledgeSourceRevision(draft, changed);
    expect(buildFinalizedSnapshot(reviewed, [changed], 's', 1, now).sections[0]?.heading)
      .toBe('Changed outside builder');
  });
  it('rejects tampered snapshot payloads and invalid version identifiers', () => {
    const snapshot = buildFinalizedSnapshot(output(), [source()], 's', 1, now);
    expect(() => buildFinalizedSnapshot(output(), [source()], 's', 0, now)).toThrow();
    expect(() => decodeFinalizedSnapshot({ ...snapshot, sections: [] })).toThrow();
    expect(() => decodeFinalizedSnapshot({ ...snapshot, outputRevision: -1 })).toThrow();
    expect(() => decodeFinalizedSnapshot({ ...snapshot, sections: [
      { ...snapshot.sections[0], evidenceUrls: ['javascript:alert(1)'] }
    ] })).toThrow();
  });
});
