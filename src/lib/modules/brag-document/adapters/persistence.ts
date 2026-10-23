import { decodeMoment } from '../core/moments.ts';
import { assertOutputReferences, decodeOutput } from '../core/outputs.ts';
import { buildFinalizedSnapshot, decodeFinalizedSnapshot } from '../core/snapshots.ts';
import { verifyCareerState } from '../core/backup.ts';
import type { CareerMoment, CareerOutput, FinalizedSnapshot } from '../core/types.ts';
import { OUTBOX_STORE, SYNC_META_STORE, ensureOutboxStores, queueLocalMutation, assertQueueableSyncOperation } from '#lib/platform/data/outbox.ts';
import { ensureInboxStores } from '#lib/platform/data/inbox.ts';

const DATABASE = 'modu-career-evidence';
const VERSION = 4;
export const CAREER_MOMENTS_STORE = 'moments';
const STORE = CAREER_MOMENTS_STORE;
export const CAREER_OUTPUTS_STORE = 'outputs';
const OUTPUTS = CAREER_OUTPUTS_STORE;
export const CAREER_SNAPSHOTS_STORE = 'snapshots';
const SNAPSHOTS = CAREER_SNAPSHOTS_STORE;
const EVENT = 'modu:career-evidence-changed';
const CHANNEL = 'modu-career-evidence-changes';
export class CareerStorageError extends Error {
  constructor(message: string) { super(message); this.name = 'CareerStorageError'; }
}

export function openCareerDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new CareerStorageError('Browser storage is unavailable.')); return;
    }
    const request = indexedDB.open(DATABASE, VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('occurredOn', 'occurredOn');
      }
      if (!db.objectStoreNames.contains(OUTPUTS)) {
        const store = db.createObjectStore(OUTPUTS, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(SNAPSHOTS)) {
        const store = db.createObjectStore(SNAPSHOTS, { keyPath: 'id' });
        store.createIndex('outputId', 'outputId', { unique: false });
      }
      ensureOutboxStores(db);
      ensureInboxStores(db);
    };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(new CareerStorageError('Could not open Career Evidence storage.'));
    request.onblocked = () => {
      blocked = true;
      reject(new CareerStorageError('Close other tabs blocking the database upgrade, then retry.'));
    };
  });
}

async function withDatabase<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openCareerDatabase();
  try { return await run(db); }
  finally { db.close(); }
}

function committedRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: typeof STORE | typeof OUTPUTS | typeof SNAPSHOTS = STORE,
  onQueue?: (tx: IDBTransaction) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(mode === 'readwrite'
      ? [storeName, OUTBOX_STORE, SYNC_META_STORE] : [storeName], mode);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(new CareerStorageError(
      tx.error?.message || 'Career Evidence storage transaction failed.'
    ));
    try {
      const op = request(tx.objectStore(storeName));
      onQueue?.(tx);
      op.onsuccess = () => { result = op.result; };
    } catch (error) {
      try { tx.abort(); } catch { /* tx may already have completed */ }
      reject(error instanceof Error ? error : new CareerStorageError('Invalid storage operation.'));
    }
  });
}

/** Load all records atomically, validate external data before exposing it to UI. */
export async function loadMoments(): Promise<CareerMoment[]> {
  return withDatabase(async db => {
    const raw = await committedRequest<unknown[]>(db, 'readonly', store => store.getAll());
    return raw.map(decodeMoment);
  });
}

export function notifyCareerChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENT));
  if (typeof BroadcastChannel === 'undefined') return;
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.postMessage('changed');
  } catch { /* notification failure cannot undo a committed write */ }
  finally { channel?.close(); }
}

export async function addMoment(moment: CareerMoment): Promise<void> {
  const valid = decodeMoment(moment);
  assertQueueableSyncOperation('brag-document', 'moment:' + valid.id,
    'upsert', { moment: valid }, null);
  await withDatabase(db => committedRequest(db, 'readwrite', store => store.add(valid),
    STORE, tx => queueLocalMutation(tx, 'brag-document', 'moment:' + valid.id,
      'upsert', { moment: valid })));
  notifyCareerChange();
}

/** Optimistic revision enforcement stays inside one IDB transaction. */
export async function replaceMoment(next: CareerMoment, expectedRevision: number): Promise<void> {
  const valid = decodeMoment(next);
  assertQueueableSyncOperation('brag-document', 'moment:' + valid.id,
    'upsert', { moment: valid }, String(expectedRevision));
  await withDatabase(db => new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, OUTBOX_STORE, SYNC_META_STORE], 'readwrite');
    const store = tx.objectStore(STORE);
    let failure: Error | null = null;
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure ?? new CareerStorageError('Unable to update moment.'));
    const query = store.get(valid.id);
    query.onsuccess = () => {
      let current: CareerMoment;
      try {
        if (!query.result) throw new CareerStorageError('The moment no longer exists.');
        current = decodeMoment(query.result);
        if (current.revision !== expectedRevision || valid.revision !== expectedRevision + 1) {
          throw new CareerStorageError('This moment changed in another tab. Reload before editing.');
        }
        store.put(valid);
        queueLocalMutation(tx, 'brag-document', 'moment:' + valid.id,
          'upsert', { moment: valid }, String(current.revision));
      } catch (error) {
        failure = error instanceof Error ? error : new CareerStorageError('Unable to update moment.');
        tx.abort();
      }
    };
  }));
  notifyCareerChange();
}

/** Output records share the existing IndexedDB database, never a second isolated storage. */
export async function loadOutputs(): Promise<CareerOutput[]> {
  return withDatabase(async db => {
    const raw = await committedRequest<unknown[]>(db, 'readonly',
      store => store.getAll(), OUTPUTS);
    const outputs = raw.map(decodeOutput);
    if (new Set(outputs.map(item => item.id)).size !== outputs.length)
      throw new CareerStorageError('Duplicate saved document IDs.');
    return outputs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });
}

export async function addOutput(output: CareerOutput): Promise<void> {
  const valid = decodeOutput(output);
  assertQueueableSyncOperation('brag-document', 'output:' + valid.id,
    'upsert', { output: valid }, null);
  await withDatabase(db => new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, OUTPUTS, OUTBOX_STORE, SYNC_META_STORE], 'readwrite');
    let failure: Error | null = null;
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure ?? tx.error ?? new CareerStorageError('Unable to add document.'));
    const sources = tx.objectStore(STORE).getAll();
    sources.onsuccess = () => {
      try {
        assertOutputReferences(valid, (sources.result as unknown[]).map(decodeMoment));
        tx.objectStore(OUTPUTS).add(valid);
        queueLocalMutation(tx, 'brag-document', 'output:' + valid.id, 'upsert', { output: valid });
      } catch (error) {
        failure = error instanceof Error ? error : new CareerStorageError('Invalid output references.');
        tx.abort();
      }
    };
  }));
  notifyCareerChange();
}

/** Atomic compare-and-swap inside a single readwrite transaction prevents lost updates. */
export async function replaceOutput(next: CareerOutput, expectedRevision: number): Promise<void> {
  const valid = decodeOutput(next);
  assertQueueableSyncOperation('brag-document', 'output:' + valid.id,
    'upsert', { output: valid }, String(expectedRevision));
  await withDatabase(db => new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, OUTPUTS, OUTBOX_STORE, SYNC_META_STORE], 'readwrite');
    const store = tx.objectStore(OUTPUTS);
    let failure: Error | null = null;
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure ?? new CareerStorageError('Unable to save career document.'));
    const query = store.get(valid.id);
    query.onsuccess = () => {
      try {
        if (!query.result) throw new CareerStorageError('Document no longer exists.');
        const current = decodeOutput(query.result);
        if (current.revision !== expectedRevision ||
          valid.revision !== expectedRevision + 1) {
          throw new CareerStorageError('Document changed in another tab. Reload before editing.');
        }
        const sources = tx.objectStore(STORE).getAll();
        sources.onsuccess = () => {
          try {
            assertOutputReferences(valid, (sources.result as unknown[]).map(decodeMoment));
            store.put(valid);
            queueLocalMutation(tx, 'brag-document', 'output:' + valid.id,
              'upsert', { output: valid }, String(current.revision));
          } catch (error) {
            failure = error instanceof Error ? error : new CareerStorageError('Invalid output references.');
            tx.abort();
          }
        };
      } catch (error) {
        failure = error instanceof Error ? error : new CareerStorageError('Unable to save document.');
        tx.abort();
      }
    };
  }));
  notifyCareerChange();
}

export async function loadFinalizedSnapshots(): Promise<FinalizedSnapshot[]> {
  return withDatabase(async db => {
    const raw = await committedRequest<unknown[]>(db, 'readonly',
      store => store.getAll(), SNAPSHOTS);
    return raw.map(decodeFinalizedSnapshot).sort((a, b) =>
      a.outputId.localeCompare(b.outputId) ||
      b.finalizedAt.localeCompare(a.finalizedAt) || a.id.localeCompare(b.id));
  });
}

/** Immutable insert, with a live output revision and all source records checked
 * in the same transaction. No already-finalized snapshot can be overwritten. */
export async function finalizeSavedOutput(
  outputId: string, expectedRevision: number, snapshotId: string, now: Date
): Promise<FinalizedSnapshot> {
  const result = await withDatabase(db => new Promise<FinalizedSnapshot>((resolve, reject) => {
    const tx = db.transaction([STORE, OUTPUTS, SNAPSHOTS, OUTBOX_STORE, SYNC_META_STORE], 'readwrite');
    let failure: Error | null = null;
    let created: FinalizedSnapshot | null = null;
    tx.oncomplete = () => {
      if (created) resolve(created);
      else reject(new CareerStorageError('Snapshot was not created.'));
    };
    tx.onabort = () => reject(failure ?? new CareerStorageError(
      tx.error?.message || 'Document finalization failed.'
    ));
    const outputRequest = tx.objectStore(OUTPUTS).get(outputId);
    const momentRequest = tx.objectStore(STORE).getAll();
    const previousRequest = tx.objectStore(SNAPSHOTS).index('outputId').getAll(outputId);
    let ready = 0;
    const maybeBuild = () => {
      if (++ready !== 3) return;
      try {
        if (!outputRequest.result) throw new CareerStorageError('Saved document no longer exists.');
        const output = decodeOutput(outputRequest.result);
        if (output.revision !== expectedRevision) {
          throw new CareerStorageError('Document changed in another tab. Reload before finalizing.');
        }
        const moments = (momentRequest.result as unknown[]).map(decodeMoment);
        const versions = (previousRequest.result as unknown[]).map(decodeFinalizedSnapshot);
        const version = Math.max(0, ...versions.map(v => v.version)) + 1;
        created = buildFinalizedSnapshot(output, moments, snapshotId, version, now);
        assertQueueableSyncOperation('brag-document', 'snapshot:' + created.id,
          'upsert', { snapshot: created }, null);
        tx.objectStore(SNAPSHOTS).add(created);
        queueLocalMutation(tx, 'brag-document', 'snapshot:' + created.id,
          'upsert', { snapshot: created });
      } catch (error) {
        failure = error instanceof Error ? error : new CareerStorageError('Invalid document snapshot.');
        try { tx.abort(); } catch { reject(failure); }
      }
    };
    outputRequest.onsuccess = maybeBuild;
    momentRequest.onsuccess = maybeBuild;
    previousRequest.onsuccess = maybeBuild;
  }));
  notifyCareerChange();
  return result;
}

/** Backup all feature stores from one readonly transaction. */
export async function exportMomentsBackup(): Promise<string> {
  const snapshot = await withDatabase(db => new Promise<{
    moments: CareerMoment[]; outputs: CareerOutput[]; snapshots: FinalizedSnapshot[];
  }>((resolve, reject) => {
    const tx = db.transaction([STORE, OUTPUTS, SNAPSHOTS], 'readonly');
    let moments: unknown[] = [], outputs: unknown[] = [], snapshots: unknown[] = [];
    tx.onabort = () => reject(new CareerStorageError('Unable to read backup data.'));
    tx.oncomplete = () => {
      try {
        resolve({ moments: moments.map(decodeMoment), outputs: outputs.map(decodeOutput),
          snapshots: snapshots.map(decodeFinalizedSnapshot) });
      } catch (error) { reject(error); }
    };
    tx.objectStore(STORE).getAll().onsuccess = event => {
      moments = (event.target as IDBRequest<unknown[]>).result;
    };
    tx.objectStore(OUTPUTS).getAll().onsuccess = event => {
      outputs = (event.target as IDBRequest<unknown[]>).result;
    };
    tx.objectStore(SNAPSHOTS).getAll().onsuccess = event => {
      snapshots = (event.target as IDBRequest<unknown[]>).result;
    };
  }));
  // Backups are recovery artifacts: reject orphaned references, future revisions,
  // or duplicate version numbers before offering a downloadable success file.
  const checked = verifyCareerState(snapshot.moments, snapshot.outputs, snapshot.snapshots);
  return JSON.stringify(checked, null, 2);
}

/** Manual local export remains available alongside Modu Global Data & Sync. */
export async function downloadLocalBackup(): Promise<void> {
  if (typeof document === 'undefined') throw new CareerStorageError('Download requires a browser.');
  const content = await exportMomentsBackup();
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modu-career-evidence-backup.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Browsers may consume the object URL after the click task finishes.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export function subscribeMomentChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, listener);
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = () => listener();
    }
  } catch { /* local event and focus refresh remain available */ }
  window.addEventListener('focus', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('focus', listener);
    channel?.close();
  };
}
