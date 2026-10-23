import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createMoment } from '../../src/lib/modules/brag-document/core/moments.ts';
import { createOutput, toggleOutputMoment } from '../../src/lib/modules/brag-document/core/outputs.ts';
import { acknowledgeSourceRevision } from '../../src/lib/modules/brag-document/core/snapshots.ts';
import {
  addMoment, addOutput, exportMomentsBackup, finalizeSavedOutput,
  loadFinalizedSnapshots, loadMoments, loadOutputs, replaceMoment, replaceOutput
} from '../../src/lib/modules/brag-document/adapters/persistence.ts';

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

const date = new Date('2026-10-24T09:00:00Z');
const source = () => createMoment({ note: 'Improved error recovery',
  evidenceUrl: 'https://github.com/example/pull/42' }, 'm1', date, 'e1');
const draft = () => toggleOutputMoment(createOutput({
  kind: 'interview', title: 'Interview stories',
  targetRole: 'Backend Engineer', organization: 'Example',
  period: { kind: 'year', year: 2026 }
}, 'd1', date), source());

describe('Career snapshot store v3', () => {
  it('persists successive immutable versions, surviving source changes and backup', async () => {
    const moment = source();
    await addMoment(moment);
    await addOutput(draft());
    const first = await finalizeSavedOutput('d1', 1, 's1', date);
    expect(first.version).toBe(1);
    expect(first.sections[0]?.heading).toBe('Improved error recovery');

    const updated = { ...moment, note: 'Changed after delivery',
      revision: 2, updatedAt: new Date('2026-10-25T09:00:00Z').toISOString() };
    await replaceMoment(updated, 1);
    await expect(finalizeSavedOutput('d1', 1, 's-rejected', date)).rejects.toThrow('changed');

    const current = (await loadOutputs())[0]!;
    const refreshed = acknowledgeSourceRevision(current, updated);
    await replaceOutput({ ...refreshed, revision: 2,
      updatedAt: new Date('2026-10-25T09:00:00Z').toISOString() }, 1);
    const second = await finalizeSavedOutput('d1', 2, 's2', date);
    expect(second.version).toBe(2);
    expect(second.sections[0]?.heading).toBe('Changed after delivery');
    const persisted = await loadFinalizedSnapshots();
    expect(persisted.map(s => s.id)).toEqual(['s2', 's1']);
    expect(persisted[1]).toEqual(first);
    const backup = JSON.parse(await exportMomentsBackup());
    expect(backup.version).toBe(3);
    expect(backup.snapshots).toHaveLength(2);
    expect(backup.snapshots.find((s: { id: string }) => s.id === 's1')).toEqual(first);
  });

  it('cannot finalize empty documents, duplicate snapshot IDs or a stale output version', async () => {
    await addOutput(createOutput({
      kind: 'review', title: 'Annual review', targetRole: '', organization: '',
      period: { kind: 'all-time' }
    }, 'empty', date));
    await expect(finalizeSavedOutput('empty', 1, 's0', date)).rejects.toThrow();
    await addMoment(source());
    await addOutput(draft());
    await finalizeSavedOutput('d1', 1, 'unique', date);
    await expect(finalizeSavedOutput('d1', 1, 'unique', date)).rejects.toThrow();
    await expect(finalizeSavedOutput('d1', 5, 's-another', date)).rejects.toThrow();
    expect((await loadFinalizedSnapshots()).map(s => s.id)).toEqual(['unique']);
  });

  it('upgrades existing v2 drafts without erasing the moments or outputs', async () => {
    const moment = source(), document = draft();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('modu-career-evidence', 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('moments', { keyPath: 'id' });
        request.result.createObjectStore('outputs', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['moments','outputs'], 'readwrite');
      tx.objectStore('moments').put(moment);
      tx.objectStore('outputs').put(document);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    expect(await loadMoments()).toEqual([moment]);
    expect(await loadOutputs()).toEqual([document]);
    expect(await loadFinalizedSnapshots()).toEqual([]);
    expect((await finalizeSavedOutput('d1', 1, 's1', date)).version).toBe(1);
  });
});
