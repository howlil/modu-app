import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { applyMomentEdit, setMomentArchived, toMomentEditInput } from '../../src/lib/modules/brag-document/core/enrichment.ts';
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
  it('commits a progressive edit, archive and restore without losing the original note', async () => {
    const original = createMoment({ note: 'Investigated route selection' }, 'id-4',
      new Date('2026-10-23T12:00:00Z'), 'link-4');
    await addMoment(original);
    const draft = toMomentEditInput(original);
    draft.project = 'SOPFlow';
    draft.problem = 'Branches can overlap';
    draft.contribution = 'Investigated a graph routing approach';
    draft.outcome = 'Defined the routing test cases';
    draft.verification = 'observed';
    draft.evidenceUrls = 'https://github.com/example/issues/23';
    const enriched = applyMomentEdit(original, draft, new Date('2026-10-24T12:00:00Z'), () => 'e-4');
    await replaceMoment(enriched, 1);
    expect(await loadMoments()).toEqual([enriched]);
    const archived = setMomentArchived(enriched, true, new Date('2026-10-25T12:00:00Z'));
    await replaceMoment(archived, enriched.revision);
    expect((await loadMoments())[0]?.archivedAt).not.toBeNull();
    const restored = setMomentArchived(archived, false, new Date('2026-10-26T12:00:00Z'));
    await replaceMoment(restored, archived.revision);
    expect((await loadMoments())[0]).toEqual(restored);
    expect(restored.contribution).toBe('Investigated a graph routing approach');
  });

  it('prevents a stale second-tab archive from overwriting newer edits', async () => {
    const initial = createMoment({ note: 'Base' }, 'id-5',
      new Date('2026-10-23T12:00:00Z'), 'link-5');
    await addMoment(initial);
    const updated = { ...initial, note: 'Newer change', revision: 2 };
    await replaceMoment(updated, 1);
    const staleArchive = setMomentArchived(initial, true, new Date('2026-10-24T12:00:00Z'));
    await expect(replaceMoment(staleArchive, 1)).rejects.toThrow();
    expect((await loadMoments())[0]?.note).toBe('Newer change');
    expect((await loadMoments())[0]?.archivedAt).toBeNull();
  });

  it('fails safely when browser storage is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(loadMoments()).rejects.toThrow('unavailable');
  });
});
