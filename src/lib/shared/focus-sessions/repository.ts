import type { FocusActivitySession } from './types.ts';
import { OUTBOX_STORE, SYNC_META_STORE, ensureOutboxStores, queueLocalMutation, resetCaptureAfterRestore, readOutbox, acknowledgeOutbox, initializeCaptureWithBaseline } from '#lib/platform/data/outbox.ts';

const DB_NAME = 'module-pomodoro-activity';
const STORE_NAME = 'sessions';
const DB_VERSION = 2;
const FALLBACK_KEY = 'module-pomodoro-activity-fallback';

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('endedAt', 'endedAt');
      }
      ensureOutboxStores(database);
    };

    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('Unable to open activity database'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('A different Pomodoro tab is blocking the activity database upgrade.'));
    };
  });
}

function readFallback() {
  if (typeof localStorage === 'undefined') return [] as FocusActivitySession[];

  try {
    const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isFocusActivitySession) : [];
  } catch {
    return [];
  }
}

function writeFallback(sessions: FocusActivitySession[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(sessions.slice(-1000)));
}

export function isFocusActivitySession(value: unknown): value is FocusActivitySession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<FocusActivitySession>;

  return (
    typeof session.id === 'string' &&
    typeof session.startedAt === 'number' &&
    typeof session.endedAt === 'number' &&
    typeof session.plannedDurationMs === 'number' &&
    typeof session.actualDurationMs === 'number' &&
    typeof session.overtimeMs === 'number' &&
    typeof session.label === 'string' &&
    typeof session.goalMs === 'number' &&
    session.status === 'completed'
  );
}

/**
 * Fallback remains available if IndexedDB cannot be opened (legacy local-only).
 * Never fallback after an opened transaction aborts: that could silently omit
 * a sync operation, violating durable data + outbox atomicity.
 */
export async function saveFocusSession(session: FocusActivitySession) {
  let database: IDBDatabase;
  try { database = await openDatabase(); }
  catch {
    const sessions = readFallback().filter(item => item.id !== session.id);
    sessions.push(session);
    writeFallback(sessions);
    announceChange();
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction([STORE_NAME, OUTBOX_STORE, SYNC_META_STORE], 'readwrite');
      tx.objectStore(STORE_NAME).put(session);
      queueLocalMutation(tx, 'pomodoro', session.id, 'upsert', { session });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Atomic focus session save aborted.'));
      tx.onerror = () => reject(tx.error ?? new Error('Atomic focus session save failed.'));
    });
    announceChange();
  } finally { database.close(); }
}

export async function saveFocusSessions(sessions: FocusActivitySession[]) {
  if (sessions.length === 0) return;
  let database: IDBDatabase;
  try { database = await openDatabase(); }
  catch {
    const current = new Map(readFallback().map(session => [session.id, session]));
    for (const session of sessions) current.set(session.id, session);
    writeFallback([...current.values()]);
    announceChange();
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction([STORE_NAME, OUTBOX_STORE, SYNC_META_STORE], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const session of sessions) {
        store.put(session);
        queueLocalMutation(tx, 'pomodoro', session.id, 'upsert', { session });
      }
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Atomic focus sessions save aborted.'));
      tx.onerror = () => reject(tx.error ?? new Error('Atomic focus sessions save failed.'));
    });
    announceChange();
  } finally { database.close(); }
}

export async function loadFocusSessions() {
  try {
    const database = await openDatabase();

    const sessions = await new Promise<FocusActivitySession[]>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();

      request.onsuccess = () =>
        resolve(request.result.filter(isFocusActivitySession).sort((a, b) => b.endedAt - a.endedAt));
      request.onerror = () => reject(request.error ?? new Error('Unable to load sessions'));
    });

    database.close();
    return sessions;
  } catch {
    return readFallback().sort((a, b) => b.endedAt - a.endedAt);
  }
}

export async function clearFocusSessions() {
  let database: IDBDatabase;
  try { database = await openDatabase(); }
  catch {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(FALLBACK_KEY);
    announceChange();
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction([STORE_NAME, OUTBOX_STORE, SYNC_META_STORE], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const before = store.getAllKeys();
      before.onsuccess = () => {
        for (const id of before.result) {
          queueLocalMutation(tx, 'pomodoro', String(id), 'delete', { sessionId: String(id) });
        }
        store.clear();
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Atomic focus history clear aborted.'));
      tx.onerror = () => reject(tx.error ?? new Error('Atomic focus history clear failed.'));
    });
    if (typeof localStorage !== 'undefined') localStorage.removeItem(FALLBACK_KEY);
    announceChange();
  } finally { database.close(); }
}

const CHANGE_EVENT = 'modu:focus-sessions-changed';
const CHANNEL_NAME = 'modu-focus-sessions';

function announceChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage('changed');
    channel.close();
  }
}

export function subscribeFocusSessions(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
  const notify = () => onChange();
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener('storage', notify);
  if (channel) channel.onmessage = notify;
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener('storage', notify);
    channel?.close();
  };
}

export async function assignFocusSession(sessionId: string, taskId: string | null): Promise<void> {
  let database: IDBDatabase;
  try { database = await openDatabase(); }
  catch {
    const fallback = readFallback();
    const found = fallback.find(item => item.id === sessionId);
    if (!found) throw new Error('Focus session not found');
    found.taskId = taskId;
    writeFallback(fallback);
    announceChange();
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction([STORE_NAME, OUTBOX_STORE, SYNC_META_STORE], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(sessionId);
      request.onsuccess = () => {
        if (!request.result) { tx.abort(); return; }
        const updated = { ...request.result, taskId } as FocusActivitySession;
        store.put(updated);
        queueLocalMutation(tx, 'pomodoro', sessionId, 'command', { action: 'assign-task', taskId });
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Focus session not found or assignment failed.'));
      tx.onerror = () => reject(tx.error ?? new Error('Atomic focus session assignment failed.'));
    });
    announceChange();
  } finally { database.close(); }
}

/**
 * Strict backup read: merge historical localStorage fallback with authoritative IDB.
 * Unlike loadFocusSessions(), backup MUST fail on inaccessible or corrupt storage.
 */
export async function exportFocusSessionsForBackup(): Promise<FocusActivitySession[]> {
  let fallback: FocusActivitySession[] = [];
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.every(isFocusActivitySession)) {
        throw new Error('Pomodoro fallback history is corrupt. Backup was cancelled.');
      }
      fallback = parsed;
    }
  }

  const database = await openDatabase();
  let persisted: FocusActivitySession[];
  try {
    persisted = await new Promise<FocusActivitySession[]>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      let records: FocusActivitySession[] = [];
      req.onsuccess = () => {
        if (!Array.isArray(req.result) || !req.result.every(isFocusActivitySession)) {
          try { tx.abort(); } catch { /* transaction may already be aborted */ }
          reject(new Error('Pomodoro activity history is corrupt. Backup was cancelled.'));
        } else {
          records = req.result;
        }
      };
      tx.oncomplete = () => resolve(records);
      tx.onabort = () => reject(tx.error ?? new Error('Could not read Pomodoro activity history.'));
      tx.onerror = () => reject(tx.error ?? new Error('Could not read Pomodoro activity history.'));
    });
  } finally {
    database.close();
  }
  const merged = new Map(persisted.map(item => [item.id, item]));
  for (const item of fallback) {
    const previous = merged.get(item.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(item)) {
      throw new Error('Conflicting Pomodoro records in IndexedDB and fallback. Backup was cancelled.');
    }
    merged.set(item.id, item);
  }
  return [...merged.values()].sort((a, b) => b.endedAt - a.endedAt);
}

/** Replace only completed sessions in a single IndexedDB transaction. */
export async function replaceFocusSessionsForRestore(sessions: readonly FocusActivitySession[]): Promise<void> {
  if (!sessions.every(isFocusActivitySession) ||
    new Set(sessions.map(item => item.id)).size !== sessions.length) {
    throw new Error('Invalid or duplicate Pomodoro session in restore.');
  }
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, OUTBOX_STORE, SYNC_META_STORE], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const session of sessions) store.add(session);
      resetCaptureAfterRestore(tx);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Pomodoro history restore aborted.'));
      tx.onerror = () => reject(tx.error ?? new Error('Pomodoro history restore failed.'));
    });
  } finally {
    db.close();
  }
  if (typeof localStorage !== 'undefined') localStorage.removeItem(FALLBACK_KEY);
  announceChange();
}

/** Feature-owned outbox: only completed sessions/assignments, never running timers. */
export async function readFocusPendingSyncOperations(limit = 100) {
  const db = await openDatabase();
  try { return await readOutbox(db, 'pomodoro', limit); }
  finally { db.close(); }
}
export async function acknowledgeFocusSyncOperations(operationIds: readonly string[]) {
  const db = await openDatabase();
  try { await acknowledgeOutbox(db, operationIds); }
  finally { db.close(); }
}

/**
 * Atomic initial Pomodoro capture. Historical localStorage fallback is copied
 * into the authoritative IDB within the same transaction as the baseline.
 * Running timers / notifications / extension state never enter the outbox.
 */
export async function beginFocusSyncCapture(deviceId: string): Promise<void> {
  let fallback: FocusActivitySession[] = [];
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (raw !== null) {
      const decoded: unknown = JSON.parse(raw);
      if (!Array.isArray(decoded) || !decoded.every(isFocusActivitySession)) {
        throw new Error('Cannot pair while Pomodoro fallback history is corrupt.');
      }
      fallback = decoded;
    }
  }
  if (new Set(fallback.map(x => x.id)).size !== fallback.length) {
    throw new Error('Cannot pair while fallback contains duplicate session IDs.');
  }
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, OUTBOX_STORE, SYNC_META_STORE], 'readwrite');
      const sessions = tx.objectStore(STORE_NAME);
      const get = sessions.getAll();
      get.onsuccess = () => {
        try {
          if (!Array.isArray(get.result) || !get.result.every(isFocusActivitySession)) {
            throw new Error('Cannot pair while Pomodoro activity storage is corrupt.');
          }
          const merged = new Map((get.result as FocusActivitySession[]).map(x => [x.id, x]));
          for (const item of fallback) {
            const previous = merged.get(item.id);
            if (previous && JSON.stringify(previous) !== JSON.stringify(item)) {
              throw new Error('Resolve conflicting fallback and IndexedDB records before pairing.');
            }
            if (!previous) sessions.add(item);
            merged.set(item.id, item);
          }
          initializeCaptureWithBaseline(tx, 'pomodoro', deviceId,
            { sessions: [...merged.values()].sort((a, b) => a.endedAt - b.endedAt) });
        } catch { tx.abort(); }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Pomodoro sync baseline was rejected.'));
      tx.onerror = () => reject(tx.error ?? new Error('Pomodoro baseline storage failed.'));
    });
    if (typeof localStorage !== 'undefined') localStorage.removeItem(FALLBACK_KEY);
    announceChange();
  } finally { db.close(); }
}
