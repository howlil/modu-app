import {
  applyPracticeCommand, decodeStoredPractice, PracticeStorageRuleError,
  type PracticeCommand, type StoredPractice
} from '../core/persistence.ts';
import { LearningRuleError, type PracticeAttempt } from '../core/learning.ts';

/** Browser-local, single-learner storage. All authoritative writes use one IDB transaction. */
export class LearningPersistenceError extends Error {
  constructor(readonly code:
    'unavailable' | 'conflict' | 'invalid' | 'corrupt' | 'quota' | 'blocked',
    message: string) {
    super(message);
    this.name = 'LearningPersistenceError';
  }
}
const DB_NAME = 'modu-language-learning';
const DB_VERSION = 1;
const SESSIONS = 'sessions';
const ATTEMPTS = 'attempts';
const BACKUP_FORMAT = 'modu-language-learning';
const MAX_BACKUP_LENGTH = 20 * 1024 * 1024;

interface SessionRow {
  id: string;
  updatedAt: number;
  record: StoredPractice;
}
export interface LearningBackup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  sessions: StoredPractice[];
}
function translateError(cause: unknown): LearningPersistenceError {
  if (cause instanceof LearningPersistenceError) return cause;
  if (cause instanceof PracticeStorageRuleError) {
    return new LearningPersistenceError(
      cause.code === 'conflict' ? 'conflict' : cause.code === 'corrupt' ? 'corrupt' : 'invalid',
      cause.message
    );
  }
  if (cause instanceof LearningRuleError) return new LearningPersistenceError('invalid', cause.message);
  if (cause instanceof DOMException && cause.name === 'QuotaExceededError') {
    return new LearningPersistenceError('quota', 'Browser storage quota is full. Export data and free space.');
  }
  if (cause instanceof DOMException && cause.name === 'ConstraintError') {
    return new LearningPersistenceError('conflict', 'Attempt identity already exists. Reload saved progress.');
  }
  return new LearningPersistenceError('unavailable', 'Unable to access browser learning storage.');
}
function decodeSessionRow(value: unknown): StoredPractice | null {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LearningPersistenceError('corrupt', 'Invalid stored practice row.');
  }
  const row = value as Partial<SessionRow>;
  const record = decodeStoredPractice(row.record);
  if (row.id !== record.session.id || !Number.isSafeInteger(row.updatedAt) ||
    (row.updatedAt as number) < 0) {
    throw new LearningPersistenceError('corrupt', 'Stored practice identity or date is invalid.');
  }
  return record;
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new LearningPersistenceError('unavailable', 'IndexedDB is unavailable in this browser.'));
      return;
    }
    let cancelled = false;
    let settled = false;
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (cause) { reject(translateError(cause)); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSIONS)) {
        const store = db.createObjectStore(SESSIONS, {keyPath: 'id'});
        store.createIndex('updatedAt', 'updatedAt', {unique: false});
      }
      if (!db.objectStoreNames.contains(ATTEMPTS)) {
        db.createObjectStore(ATTEMPTS, {keyPath: 'id'});
      }
    };
    request.onblocked = () => {
      cancelled = true;
      if (!settled) {
        settled = true;
        reject(new LearningPersistenceError('blocked',
          'A different tab is blocking the learning database upgrade. Close it and retry.'));
      }
    };
    request.onerror = () => {
      if (!settled) { settled = true; reject(translateError(request.error)); }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (cancelled) { db.close(); return; }
      db.onversionchange = () => db.close();
      if (!settled) { settled = true; resolve(db); }
      else db.close();
    };
  });
}
/** Owns connection and transaction lifetime. Never await inside IDB request callbacks. */
async function transaction<T>(
  stores: string[], mode: IDBTransactionMode,
  start: (tx: IDBTransaction, complete: (value: T) => void, fail: (error: unknown) => void) => void
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = mode === 'readwrite'
        ? db.transaction(stores, mode, {durability: 'strict'})
        : db.transaction(stores, mode);
    } catch (cause) { db.close(); reject(translateError(cause)); return; }
    let result: T;
    let failure: unknown;
    let hasResult = false;
    const complete = (value: T) => { result = value; hasResult = true; };
    const fail = (cause: unknown) => {
      failure = cause;
      try { tx.abort(); } catch { /* already aborted */ }
    };
    tx.oncomplete = () => {
      db.close();
      if (failure) reject(translateError(failure));
      else if (hasResult) resolve(result);
      else reject(new LearningPersistenceError('corrupt', 'Learning transaction completed without a result.'));
    };
    tx.onabort = () => {
      db.close();
      reject(translateError(failure ?? tx.error));
    };
    try { start(tx, complete, fail); }
    catch (cause) { fail(cause); }
  });
}
function asBackup(text: string): {records: StoredPractice[]; attempts: PracticeAttempt[]} {
  if (!text || text.length > MAX_BACKUP_LENGTH) {
    throw new LearningPersistenceError('invalid', 'Backup is empty or exceeds the 20 MiB import limit.');
  }
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch { throw new LearningPersistenceError('invalid', 'Backup is not valid JSON.'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LearningPersistenceError('invalid', 'Invalid backup document.');
  }
  const doc = raw as Partial<LearningBackup>;
  if (doc.format !== BACKUP_FORMAT || doc.version !== 1 || !Array.isArray(doc.sessions)) {
    throw new LearningPersistenceError('invalid', 'Unsupported backup format or version.');
  }
  const sessionIds = new Set<string>(), attemptIds = new Set<string>();
  const records: StoredPractice[] = [];
  const attempts: PracticeAttempt[] = [];
  for (const rawSession of doc.sessions as unknown[]) {
    let record: StoredPractice;
    try { record = decodeStoredPractice(rawSession); }
    catch { throw new LearningPersistenceError('corrupt', 'Backup contains invalid practice history.'); }
    if (sessionIds.has(record.session.id)) {
      throw new LearningPersistenceError('invalid', 'Backup contains repeated session IDs.');
    }
    sessionIds.add(record.session.id);
    records.push(record);
    for (const attempt of record.session.attempts) {
      if (attemptIds.has(attempt.id)) {
        throw new LearningPersistenceError('invalid', 'Backup reuses an attempt ID across sessions.');
      }
      attemptIds.add(attempt.id);
      attempts.push(attempt);
    }
  }
  return {records, attempts};
}
/** No server endpoint. This browser origin owns the canonical practice history. */
export const learningPersistence = {
  latest(): Promise<StoredPractice | null> {
    return transaction([SESSIONS], 'readonly', (tx, complete, fail) => {
      const cursor = tx.objectStore(SESSIONS).index('updatedAt').openCursor(null, 'prev');
      cursor.onsuccess = () => {
        try { complete(decodeSessionRow(cursor.result?.value)); }
        catch (cause) { fail(cause); }
      };
    });
  },
  get(sessionId: string): Promise<StoredPractice | null> {
    return transaction([SESSIONS], 'readonly', (tx, complete, fail) => {
      const request = tx.objectStore(SESSIONS).get(sessionId);
      request.onsuccess = () => {
        try { complete(decodeSessionRow(request.result)); }
        catch (cause) { fail(cause); }
      };
    });
  },
  execute(command: PracticeCommand, expectedRevision: number | null): Promise<StoredPractice> {
    return transaction([SESSIONS, ATTEMPTS], 'readwrite', (tx, complete, fail) => {
      const sessions = tx.objectStore(SESSIONS);
      const attempts = tx.objectStore(ATTEMPTS);
      const request = sessions.get(command.sessionId);
      request.onsuccess = () => {
        try {
          const current = decodeSessionRow(request.result);
          // Lost response: a completed attempt or identical start is safe to replay,
          // even with a now-stale expectedRevision.
          if (current && (command.type === 'start' ||
            (command.type === 'attempt' && current.session.attempts.some(
              a => a.id === command.attempt.attemptId)))) {
            complete(applyPracticeCommand(current, command).next);
            return;
          }
          if ((current?.revision ?? null) !== expectedRevision) {
            throw new LearningPersistenceError('conflict',
              'Session changed in another tab. Reload saved progress.');
          }
          const commit = () => {
            try {
              const {next, attempt, changed} = applyPracticeCommand(current, command);
              if (!changed) { complete(next); return; }
              const row: SessionRow = {id: next.session.id, updatedAt: Date.now(), record: next};
              sessions.put(row);
              if (attempt) attempts.add(attempt);
              complete(next);
            } catch (cause) { fail(cause); }
          };
          if (command.type === 'attempt') {
            const existing = attempts.get(command.attempt.attemptId);
            existing.onsuccess = () => {
              if (existing.result !== undefined) {
                fail(new LearningPersistenceError('conflict',
                  'Attempt ID belongs to an existing record. Reload saved progress.'));
              } else commit();
            };
          } else commit();
        } catch (cause) { fail(cause); }
      };
    });
  },
  async exportBackup(): Promise<string> {
    const records = await transaction<StoredPractice[]>([SESSIONS], 'readonly', (tx, complete, fail) => {
      const request = tx.objectStore(SESSIONS).getAll();
      request.onsuccess = () => {
        try {
          complete((request.result as unknown[]).map(raw => {
            const record = decodeSessionRow(raw);
            if (!record) throw new LearningPersistenceError('corrupt', 'Missing backup record.');
            return record;
          }));
        } catch (cause) { fail(cause); }
      };
    });
    return JSON.stringify({
      format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(),
      sessions: records
    } satisfies LearningBackup, null, 2);
  },
  async importBackup(text: string): Promise<void> {
    // Validate the entire source before opening the destructive transaction.
    const {records, attempts} = asBackup(text);
    await transaction<void>([SESSIONS, ATTEMPTS], 'readwrite', (tx, complete) => {
      const sessions = tx.objectStore(SESSIONS);
      const journal = tx.objectStore(ATTEMPTS);
      sessions.clear();
      journal.clear();
      const now = Date.now();
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        sessions.add({id: record.session.id, record, updatedAt: now + i} satisfies SessionRow);
      }
      for (const attempt of attempts) journal.add(attempt);
      complete(undefined);
    });
  },
  async persistenceStatus(): Promise<'granted' | 'not-granted' | 'unavailable'> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return 'unavailable';
    try { return await navigator.storage.persisted() ? 'granted' : 'not-granted'; }
    catch { return 'unavailable'; }
  },
  async requestPersistence(): Promise<'granted' | 'not-granted' | 'unavailable'> {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unavailable';
    try { return await navigator.storage.persist() ? 'granted' : 'not-granted'; }
    catch { return 'unavailable'; }
  }
};
