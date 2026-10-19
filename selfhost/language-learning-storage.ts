import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  applyPracticeCommand, decodeStoredPractice, PracticeStorageRuleError,
  type PracticeCommand, type StoredPractice
} from '../src/lib/modules/language-learning/core/persistence.ts';

/** Dedicated single-instance SQLite adapter. No Cloudflare Worker or client SQLite dependency. */
export function openLanguageLearningStorage(filename: string) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
  const db = new Database(filename, { create: true, strict: true });
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA busy_timeout = 5000');
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = FULL');
  db.exec([
    "CREATE TABLE IF NOT EXISTS practice_sessions (",
    "id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, revision INTEGER NOT NULL,",
    "updated_at INTEGER NOT NULL, payload TEXT NOT NULL);",
    "CREATE TABLE IF NOT EXISTS practice_attempts (",
    "id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES practice_sessions(id),",
    "profile_id TEXT NOT NULL, sentence_id TEXT NOT NULL,",
    "sentence_revision INTEGER NOT NULL, evidence_kind TEXT NOT NULL",
    "CHECK (evidence_kind IN ('recall', 'exposure', 'skip')),",
    "evidence_json TEXT NOT NULL, recorded_at INTEGER NOT NULL);",
    "CREATE INDEX IF NOT EXISTS idx_practice_sessions_updated",
    "ON practice_sessions(updated_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_practice_attempts_profile",
    "ON practice_attempts(profile_id, recorded_at DESC);"
  ].join(' '));
  const findSession = db.query<{ payload: string }, [string]>(
    'SELECT payload FROM practice_sessions WHERE id = ?'
  );
  const latestSession = db.query<{ payload: string }, []>(
    'SELECT payload FROM practice_sessions ORDER BY updated_at DESC, rowid DESC LIMIT 1'
  );
  const attemptExists = db.query<{ session_id: string }, [string]>(
    'SELECT session_id FROM practice_attempts WHERE id = ?'
  );
  const insertSession = db.prepare(
    'INSERT INTO practice_sessions (id, profile_id, revision, updated_at, payload) VALUES (?, ?, ?, ?, ?)'
  );
  const updateSession = db.prepare(
    'UPDATE practice_sessions SET revision = ?, updated_at = ?, payload = ? WHERE id = ? AND revision = ?'
  );
  const insertAttempt = db.prepare(
    'INSERT INTO practice_attempts (id, session_id, profile_id, sentence_id, sentence_revision, evidence_kind, evidence_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  function get(sessionId: string): StoredPractice | null {
    const row = findSession.get(sessionId);
    return row ? decodeStoredPractice(JSON.parse(row.payload) as unknown) : null;
  }
  function latest(): StoredPractice | null {
    const row = latestSession.get();
    return row ? decodeStoredPractice(JSON.parse(row.payload) as unknown) : null;
  }
  // BEGIN IMMEDIATE obtains the writer reservation before checking revision and mutating state.
  const transact = db.transaction((command: PracticeCommand, expectedRevision: number | null): StoredPractice => {
    const current = get(command.sessionId);
    // Reconcile uncertain POST responses by immutable command/attempt identity.
    if (current && command.type === 'start') return applyPracticeCommand(current, command).next;
    if (current && command.type === 'attempt' &&
      current.session.attempts.some(attempt => attempt.id === command.attempt.attemptId)) {
      return applyPracticeCommand(current, command).next;
    }
    if ((current?.revision ?? null) !== expectedRevision) {
      throw new PracticeStorageRuleError('conflict', 'Session changed. Reload before continuing.');
    }
    if (command.type === 'attempt' && attemptExists.get(command.attempt.attemptId)) {
      throw new PracticeStorageRuleError('conflict', 'Attempt ID belongs to another session.');
    }
    const { next, attempt, changed } = applyPracticeCommand(current, command);
    if (!changed) return next;
    const payload = JSON.stringify(next);
    const now = Date.now();
    if (!current) {
      insertSession.run(next.session.id, next.session.profileId, next.revision, now, payload);
    } else {
      const updated = updateSession.run(next.revision, now, payload, next.session.id, current.revision);
      if (updated.changes !== 1) {
        throw new PracticeStorageRuleError('conflict', 'Session revision changed.');
      }
    }
    if (attempt) {
      insertAttempt.run(attempt.id, attempt.sessionId, attempt.profileId,
        attempt.sentenceId, attempt.sentenceRevision, attempt.evidence.kind,
        JSON.stringify(attempt.evidence), attempt.recordedAt);
    }
    return next;
  });
  return {
    get, latest,
    execute(command: PracticeCommand, expectedRevision: number | null): StoredPractice {
      return transact.immediate(command, expectedRevision);
    },
    attemptCount(): number {
      return (db.query<{count: number}, []>('SELECT count(*) AS count FROM practice_attempts').get()?.count ?? 0);
    },
    close() { db.close(); }
  };
}
