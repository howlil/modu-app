import { decodeMoment } from '../core/moments.ts';
import type { CareerMoment } from '../core/types.ts';

const DATABASE = 'modu-career-evidence';
const VERSION = 1;
const STORE = 'moments';
const EVENT = 'modu:career-evidence-changed';
const CHANNEL = 'modu-career-evidence-changes';

export class CareerStorageError extends Error {
  constructor(message: string) { super(message); this.name = 'CareerStorageError'; }
}

function openDatabase(): Promise<IDBDatabase> {
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
  const db = await openDatabase();
  try { return await run(db); }
  finally { db.close(); }
}

function committedRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(new CareerStorageError(
      tx.error?.message || 'Career Evidence storage transaction failed.'
    ));
    try {
      const op = request(tx.objectStore(STORE));
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

function notifyCommittedChange(): void {
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
  await withDatabase(db => committedRequest(db, 'readwrite', store => store.add(valid)));
  notifyCommittedChange();
}

/** Prepare for M3; optimistic revision enforcement stays inside one IDB transaction. */
export async function replaceMoment(next: CareerMoment, expectedRevision: number): Promise<void> {
  const valid = decodeMoment(next);
  await withDatabase(db => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
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
      } catch (error) {
        failure = error instanceof Error ? error : new CareerStorageError('Unable to update moment.');
        tx.abort();
      }
    };
  }));
  notifyCommittedChange();
}

export async function exportMomentsBackup(): Promise<string> {
  const moments = await loadMoments();
  return JSON.stringify({
    format: 'modu-career-evidence-local',
    version: 1, exportedAt: new Date().toISOString(), moments
  }, null, 2);
}

/** Explicit local export until the feature joins Modu global backup/sync (M6). */
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
