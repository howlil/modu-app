import type { FocusActivitySession } from '../core/activity.ts';

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

function isFocusActivitySession(value: unknown): value is FocusActivitySession {
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
  } catch {
    const sessions = readFallback().filter((item) => item.id !== session.id);
    sessions.push(session);
    writeFallback(sessions);
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
  } catch {
    const current = new Map(readFallback().map((session) => [session.id, session]));
    for (const session of sessions) current.set(session.id, session);
    writeFallback([...current.values()]);
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
}

