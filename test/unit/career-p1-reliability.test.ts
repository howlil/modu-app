import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createMoment } from '../../src/lib/modules/brag-document/core/moments.ts';
import { createOutput, toggleOutputMoment } from '../../src/lib/modules/brag-document/core/outputs.ts';
import { decodeCareerBackup } from '../../src/lib/modules/brag-document/core/backup.ts';
import { addMoment, addOutput, loadOutputs, replaceOutput } from '../../src/lib/modules/brag-document/adapters/persistence.ts';
import type { CareerOutput } from '../../src/lib/modules/brag-document/core/types.ts';

const at = new Date('2026-10-24T09:00:00Z');
const goal = { kind: 'interview' as const, title: 'Backend interview',
  targetRole: '', organization: '', period: { kind: 'all-time' as const } };
const source = (id: string) => createMoment({ note: id }, id, at, 'link-' + id);

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

describe('Career P1 write invariants', () => {
  it('does not commit an output with a missing source', async () => {
    const absent = source('missing');
    const invalid = toggleOutputMoment(createOutput(goal, 'd1', at), absent);
    await expect(addOutput(invalid)).rejects.toThrow('references');
    expect(await loadOutputs()).toEqual([]);
  });

  it('preserves the prior committed output on a future source revision', async () => {
    const moment = source('exists');
    await addMoment(moment);
    const first = toggleOutputMoment(createOutput(goal, 'd1', at), moment);
    await addOutput(first);
    const invalid: CareerOutput = {
      ...first, revision: 2, items: first.items.map(item => ({
        ...item, sourceRevision: moment.revision + 5
      }))
    };
    await expect(replaceOutput(invalid, 1)).rejects.toThrow('references');
    expect((await loadOutputs())[0]).toEqual(first);
  });

  it('accepts independent immutable snapshots with equal device-local version numbers', () => {
    const moment = source('same');
    const output = toggleOutputMoment(createOutput(goal, 'd1', at), moment);
    const section = { momentId: moment.id, heading: moment.note, body: moment.note,
      occurredOn: moment.occurredOn, project: null, evidenceUrls: [] };
    const snapshot = {
      outputId: output.id, version: 1, outputRevision: 1,
      finalizedAt: at.toISOString(), kind: output.kind,
      title: output.title, targetRole: null, organization: null,
      period: output.period, sections: [section]
    };
    const backup = {
      format: 'modu-career-evidence-local', version: 3, exportedAt: at.toISOString(),
      moments: [moment], outputs: [output], snapshots: [
        { id: 'device-a-snapshot', ...snapshot }, { id: 'device-b-snapshot', ...snapshot }
      ]
    };
    expect(decodeCareerBackup(backup).snapshots.map(s => s.id))
      .toEqual(['device-a-snapshot', 'device-b-snapshot']);
  });
});
