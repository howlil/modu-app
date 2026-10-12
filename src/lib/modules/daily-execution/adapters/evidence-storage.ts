import type { EvidenceRecord } from '../core/evidence.ts';

const DB_NAME = 'module-daily-execution-evidence';
const STORE = 'records';
const FALLBACK = 'module-daily-execution-evidence-fallback-v1';
const CHANGE_EVENT = 'modu:execution-evidence-changed';
const CHANNEL = 'modu-execution-evidence';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, {keyPath:'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Evidence database unavailable'));
  });
}
function fallbackRead(): EvidenceRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const records: unknown = JSON.parse(localStorage.getItem(FALLBACK) ?? '[]');
    return Array.isArray(records) ? records.filter((x): x is EvidenceRecord =>
      !!x && typeof x.id === 'string' && typeof x.title === 'string' && Number.isFinite(x.occurredAt)) : [];
  } catch { return []; }
}
function fallbackWrite(records: EvidenceRecord[]) {
  if (typeof localStorage === 'undefined') throw new Error('No persistent evidence storage available');
  localStorage.setItem(FALLBACK, JSON.stringify(records));
}
function broadcastChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage('changed');
    channel.close();
  }
}
export function subscribeEvidence(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
  window.addEventListener(CHANGE_EVENT, onChange);
  if (channel) channel.onmessage = () => onChange();
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    channel?.close();
  };
}
export async function loadEvidenceRecords(): Promise<EvidenceRecord[]> {
  try {
    const db = await openDatabase();
    try {
      const records = await new Promise<EvidenceRecord[]>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).getAll();
        request.onsuccess = () => resolve(request.result as EvidenceRecord[]);
        request.onerror = () => reject(request.error ?? new Error('Unable to load evidence'));
      });
      return records;
    } finally { db.close(); }
  } catch {
    return fallbackRead();
  }
}
export async function saveEvidenceRecords(records: EvidenceRecord[]): Promise<void> {
  if (records.length === 0) return;
  try {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        for (const record of records) store.put(record);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('Evidence save aborted'));
        tx.onerror = () => reject(tx.error ?? new Error('Unable to save evidence'));
      });
    } finally { db.close(); }
  } catch {
    const existing = new Map(fallbackRead().map((record) => [record.id, record]));
    for (const record of records) existing.set(record.id, record);
    fallbackWrite([...existing.values()]);
  }
  broadcastChange();
}
