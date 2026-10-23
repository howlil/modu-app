import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createMoment } from '../../src/lib/modules/brag-document/core/moments.ts';
import {
  addMoment, loadMoments, replaceMoment, exportMomentsBackup
} from '../../src/lib/modules/brag-document/adapters/persistence.ts';

beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Career Evidence IndexedDB', () => {
  it('does not report save before committing and reloads stored data', async () => {
    const moment = createMoment({ note: 'Delivered an integration test' }, 'id-1',
      new Date('2026-10-23T12:00:00Z'), 'link-1');
    await addMoment(moment);
    expect(await loadMoments()).toEqual([moment]);
    expect(JSON.parse(await exportMomentsBackup()).moments).toEqual([moment]);
  });

  it('rejects duplicate identities instead of silently overwriting', async () => {
    const moment = createMoment({ note: 'Solved a bug' }, 'id-2',
      new Date('2026-10-23T12:00:00Z'), 'link-2');
    await addMoment(moment);
    await expect(addMoment(moment)).rejects.toThrow();
    expect(await loadMoments()).toHaveLength(1);
  });

  it('rejects stale optimistic revisions, preserving committed data', async () => {
    const moment = createMoment({ note: 'Before' }, 'id-3',
      new Date('2026-10-23T12:00:00Z'), 'link-3');
    await addMoment(moment);
    await replaceMoment({ ...moment, note: 'After', revision: 2 }, 1);
    await expect(replaceMoment({ ...moment, note: 'Stale', revision: 2 }, 1)).rejects.toThrow();
    expect((await loadMoments())[0]?.note).toBe('After');
  });
});
