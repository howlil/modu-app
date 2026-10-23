import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { careerDataPort } from '../../src/lib/modules/brag-document/adapters/data-port.ts';
import {
  addMoment, addOutput, exportMomentsBackup, finalizeSavedOutput,
  loadFinalizedSnapshots, loadMoments, loadOutputs, openCareerDatabase, replaceMoment
} from '../../src/lib/modules/brag-document/adapters/persistence.ts';
import { createMoment } from '../../src/lib/modules/brag-document/core/moments.ts';
import { createOutput, toggleOutputMoment } from '../../src/lib/modules/brag-document/core/outputs.ts';
import { decodeCareerBackup, emptyCareerBackup } from '../../src/lib/modules/brag-document/core/backup.ts';
import type { SequencedSyncOperation } from '../../src/lib/platform/data/sync-protocol.ts';
import { SYNC_META_STORE } from '../../src/lib/platform/data/outbox.ts';

const at = new Date('2026-10-24T09:00:00Z');
let browser = [new IDBFactory(), new IDBFactory()] as const;
const useBrowser = (id: 0 | 1) => vi.stubGlobal('indexedDB', browser[id]);
const m = (id: string) => createMoment({ note: 'Shipped ' + id },
  id, at, 'link-' + id);
const goal = {
  kind: 'interview' as const, title: 'Backend interviews',
  targetRole: 'Backend Engineer', organization: '',
  period: { kind: 'year' as const, year: 2026 }
};
const journal: SequencedSyncOperation[] = [];
async function push(): Promise<void> {
  const pending = await careerDataPort.readPendingSyncOperations();
  for (const entry of pending) {
    const { sequence: _sequence, ...wire } = entry;
    journal.push({ ...wire, sequence: journal.length + 1 });
  }
  await careerDataPort.acknowledgeSyncOperations(pending.map(op => op.operationId));
}
beforeEach(() => {
  browser = [new IDBFactory(), new IDBFactory()];
  journal.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe('Career Evidence global data port', () => {
  it('rejects malformed references before restore and restores the complete graph atomically', async () => {
    useBrowser(0);
    const first = m('m1');
    await addMoment(first);
    const draft = toggleOutputMoment(createOutput(goal, 'd1', at), first);
    await addOutput(draft);
    const finalized = await finalizeSavedOutput('d1', 1, 's1', at);
    const snapshot = await careerDataPort.exportBackup();
    expect((await careerDataPort.inspect()).recordCount).toBe(3);
    await expect(careerDataPort.validateBackup({ ...snapshot,
      outputs: [{ ...draft, items: [{ ...draft.items[0], momentId: 'missing' }] }]
    })).rejects.toThrow('references');
    expect(await loadMoments()).toEqual([first]);
    await careerDataPort.restoreBackup(emptyCareerBackup());
    expect(await loadMoments()).toEqual([]);
    expect(await loadOutputs()).toEqual([]);
    expect(await loadFinalizedSnapshots()).toEqual([]);
    await careerDataPort.restoreBackup(snapshot);
    expect(await loadMoments()).toEqual([first]);
    expect(await loadOutputs()).toEqual([draft]);
    expect(await loadFinalizedSnapshots()).toEqual([finalized]);
    expect(decodeCareerBackup(JSON.parse(await exportMomentsBackup())).snapshots).toEqual([finalized]);
  });

  it('syncs baseline, independent changes and immutable snapshots between browsers', async () => {
    journal.length = 0;
    useBrowser(0);
    const source = m('shared');
    await addMoment(source);
    await addOutput(toggleOutputMoment(createOutput(goal, 'shared-output', at), source));
    await careerDataPort.beginSyncCapture('owner_device_A');
    await push();
    expect(journal.map(op => op.kind)).toEqual(['baseline']);
    await careerDataPort.applyRemoteChanges(journal);
    useBrowser(1);
    await careerDataPort.applyRemoteChanges(journal);
    expect((await loadMoments())[0]?.id).toBe('shared');
    await careerDataPort.beginRemoteSyncCapture('joined_device_B');
    await addMoment(m('joined'));
    await push();
    expect(journal[1]?.entityId).toBe('moment:joined');
    await careerDataPort.applyRemoteChanges(journal.slice(1));
    useBrowser(0);
    await careerDataPort.applyRemoteChanges(journal.slice(1));
    expect((await loadMoments()).map(x => x.id).sort()).toEqual(['joined', 'shared']);
    await finalizeSavedOutput('shared-output', 1, 'final-1', at);
    await push();
    await careerDataPort.applyRemoteChanges(journal.slice(2));
    useBrowser(1);
    await careerDataPort.applyRemoteChanges(journal.slice(2));
    expect((await loadFinalizedSnapshots())[0]?.id).toBe('final-1');
    expect((await careerDataPort.readRemoteCursor())).toBe(3);
    expect((await careerDataPort.readPendingSyncOperations()).length).toBe(0);
  });

  it('rejects corrupted remote events without advancing the cursor', async () => {
    useBrowser(0);
    const before = await careerDataPort.readRemoteCursor();
    const corrupt: SequencedSyncOperation = {
      sequence: before + 1, operationId: 'malformed-remote', moduleId: 'brag-document',
      deviceId: 'third_device', entityId: 'moment:broken', kind: 'upsert',
      payload: { moment: { id: 'broken' } }, baseRevision: null,
      createdAt: 1
    };
    await expect(careerDataPort.applyRemoteChanges([corrupt])).rejects.toThrow();
    expect(await careerDataPort.readRemoteCursor()).toBe(before);
  });

  it('aborts domain mutation if capture metadata is damaged', async () => {
    useBrowser(1);
    await careerDataPort.beginSyncCapture('another_owner_device');
    const db = await openCareerDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SYNC_META_STORE, 'readwrite');
      tx.objectStore(SYNC_META_STORE).put({ key: 'capture', enabled: false });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    const before = (await loadMoments()).length;
    await expect(addMoment(m('must-rollback'))).rejects.toThrow();
    expect((await loadMoments()).length).toBe(before);
  });
});
