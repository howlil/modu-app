import type { FocusActivitySession } from './types.ts';

const DB_NAME = 'module-pomodoro-activity';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;
const FALLBACK_KEY = 'module-pomodoro-activity-fallback';

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('endedAt', 'endedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open activity database'));
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

export async function saveFocusSession(session: FocusActivitySession) {
  try {
    const database = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(session);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save session'));
    });

    database.close();
    announceChange();
  } catch {
    const sessions = readFallback().filter((item) => item.id !== session.id);
    sessions.push(session);
    writeFallback(sessions);
    announceChange();
  }
}

export async function saveFocusSessions(sessions: FocusActivitySession[]) {
  if (sessions.length === 0) return;

  try {
    const database = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      for (const session of sessions) store.put(session);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save sessions'));
    });

    database.close();
    announceChange();
  } catch {
    const current = new Map(readFallback().map((session) => [session.id, session]));
    for (const session of sessions) current.set(session.id, session);
    writeFallback([...current.values()]);
    announceChange();
  }
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
  try {
    const database = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to clear sessions'));
    });

    database.close();
  } catch {
    // Fallback is cleared below.
  }

  if (typeof localStorage !== 'undefined') localStorage.removeItem(FALLBACK_KEY);
  announceChange();
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
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(sessionId);
      request.onsuccess = () => {
        if (!request.result) { transaction.abort(); return; }
        store.put({ ...request.result, taskId });
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(new Error('Focus session not found'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to assign session'));
    });
    database.close();
  } catch (error) {
    if (typeof indexedDB !== 'undefined') {
      // Only use the local fallback if this record actually exists there.
      const fallback = readFallback();
      const found = fallback.find((item) => item.id === sessionId);
      if (!found) throw error;
      found.taskId = taskId;
      writeFallback(fallback);
    } else {
      const fallback = readFallback();
      const found = fallback.find((item) => item.id === sessionId);
      if (!found) throw error;
      found.taskId = taskId;
      writeFallback(fallback);
    }
  }
  announceChange();
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
  const merged = new Map(fallback.map(item => [item.id, item]));
  for (const item of persisted) merged.set(item.id, item);
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
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const session of sessions) store.add(session);
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
