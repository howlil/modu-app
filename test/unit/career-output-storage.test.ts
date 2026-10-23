import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createMoment } from '../../src/lib/modules/brag-document/core/moments.ts';
import { createOutput, toggleOutputMoment } from '../../src/lib/modules/brag-document/core/outputs.ts';
import {
  addMoment, addOutput, exportMomentsBackup, loadMoments, loadOutputs, openCareerDatabase, replaceOutput
} from '../../src/lib/modules/brag-document/adapters/persistence.ts';

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

const at = new Date('2026-10-24T08:00:00Z');
const goal = {
  kind: 'interview' as const,
  title: 'Associate Backend interview',
  targetRole: 'Backend Engineer',
  organization: 'Example',
  period: { kind: 'year' as const, year: 2026 }
};

describe('Career document IndexedDB persistence', () => {
  it('keeps selected source references and narratives after reload', async () => {
    const source = createMoment({ note: 'Fixed production callbacks' }, 'source', at, 'link');
    const output = toggleOutputMoment(createOutput(goal, 'output', at), source);
    await addMoment(source);
    await addOutput(output);
    const reload = await loadOutputs();
    expect(reload).toEqual([output]);
    const modified = {
      ...output, revision: 2, updatedAt: new Date('2026-10-25T08:00:00Z').toISOString(),
      items: output.items.map(item => ({ ...item, narrative: 'I isolated the failure' }))
    };
    await replaceOutput(modified, 1);
    expect((await loadOutputs())[0]?.items[0]?.narrative).toBe('I isolated the failure');
    expect((await loadMoments())[0]?.note).toBe(source.note);
    const backup = JSON.parse(await exportMomentsBackup());
    expect(backup.version).toBe(3);
    expect(backup.snapshots).toEqual([]);
    expect(backup.moments).toEqual([source]);
    expect(backup.outputs).toEqual([modified]);
  });

  it('prevents duplicate documents and competing updates', async () => {
    const output = createOutput(goal, 'a', at);
    await addOutput(output);
    await expect(addOutput(output)).rejects.toThrow();
    const updated = { ...output, title: 'Revised title', revision: 2 };
    await replaceOutput(updated, 1);
    await expect(replaceOutput({ ...output, title: 'Stale title', revision: 2 }, 1)).rejects.toThrow();
    expect((await loadOutputs())[0]?.title).toBe('Revised title');
  });

  it('refuses to export orphaned references as a valid recovery backup', async () => {
    const source = createMoment({ note: 'Reference no longer available' },
      'missing-source', at, 'missing-evidence');
    const orphanedOutput = toggleOutputMoment(createOutput(goal, 'orphaned-document', at), source);
    await loadOutputs(); // create current database stores
    const db = await openCareerDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('outputs', 'readwrite');
      tx.objectStore('outputs').put(orphanedOutput);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    await expect(exportMomentsBackup()).rejects.toThrow('references');
  });

  it('upgrades the prior M2/M3 database without deleting existing moments', async () => {
    const source = createMoment({ note: 'Existing moment' }, 'existing', at, 'evidence');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('modu-career-evidence', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('moments', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('moments', 'readwrite');
      tx.objectStore('moments').add(source);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    expect(await loadMoments()).toEqual([source]);
    expect(await loadOutputs()).toEqual([]);
    const newOutput = createOutput(goal, 'upgraded-output', at);
    await addOutput(newOutput);
    expect(await loadMoments()).toEqual([source]);
    expect(await loadOutputs()).toEqual([newOutput]);
  });
});
