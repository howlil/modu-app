import {
  abandonSession, commitPracticeAttempt, createPracticeSession, pauseSession,
  resumeSession, revealAnswer, type CommitAttemptCommand, type LanguageIsland,
  type PracticeMode, type PracticeSession, type PracticeAttempt, type RecallRating
} from './learning.ts';

/** Per-session durable record. No tenant/account key: one self-hosted instance = one learner. */
export interface StoredPractice {
  schemaVersion: 1;
  revision: number;
  session: PracticeSession;
}
export type PracticeCommand =
  | { type: 'start'; sessionId: string; profileId: string; island: LanguageIsland; mode: PracticeMode }
  | { type: 'reveal' | 'pause' | 'resume' | 'abandon'; sessionId: string }
  | { type: 'attempt'; sessionId: string; attempt: CommitAttemptCommand };

export class PracticeStorageRuleError extends Error {
  constructor(readonly code: 'corrupt' | 'not_found' | 'conflict' | 'invalid_command', message: string) {
    super(message);
    this.name = 'PracticeStorageRuleError';
  }
}
const invalid = (message: string): never => { throw new PracticeStorageRuleError('corrupt', message); };
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const revision = (value: unknown): value is number => integer(value) && value > 0;
const rating = (value: unknown): value is RecallRating =>
  value === 'again' || value === 'hard' || value === 'good' || value === 'easy';
const mode = (value: unknown): value is PracticeMode =>
  value === 'recall' || value === 'listening' || value === 'shadowing';

/** Decode data obtained from disk: corrupt history must never silently become an empty history. */
export function decodeStoredPractice(value: unknown): StoredPractice {
  if (!object(value) || value.schemaVersion !== 1 || !integer(value.revision) || !object(value.session)) {
    return invalid('Unsupported or unreadable language learning record.');
  }
  const s = value.session;
  if (!text(s.id) || !text(s.profileId) || !text(s.islandId) || !mode(s.mode) ||
    !['active', 'paused', 'completed', 'abandoned'].includes(String(s.status)) ||
    !['prompt', 'revealed'].includes(String(s.phase)) ||
    !integer(s.cursor) || !Array.isArray(s.items) || !Array.isArray(s.attempts) ||
    s.items.length === 0 || s.items.length > 500 || s.cursor > s.items.length ||
    s.attempts.length !== s.cursor || (s.status === 'completed') !== (s.cursor === s.items.length) ||
    (s.status !== 'completed' && s.cursor === s.items.length) ||
    (s.phase === 'revealed' && (s.mode !== 'recall' || s.status === 'completed'))) {
    return invalid('Invalid session state or cursor.');
  }
  const itemIds = new Set<string>();
  for (const raw of s.items) {
    if (!object(raw) || !text(raw.id) || !revision(raw.revision) ||
      !text(raw.prompt) || !text(raw.answer) || !text(raw.islandId) ||
      !text(raw.sourceLanguage) || !text(raw.targetLanguage) ||
      raw.islandId !== s.islandId || itemIds.has(raw.id)) return invalid('Invalid sentence snapshot.');
    itemIds.add(raw.id);
  }
  const ids = new Set<string>();
  for (let i = 0; i < s.attempts.length; i++) {
    const a = s.attempts[i];
    const item = s.items[i];
    if (!object(a) || !text(a.id) || ids.has(a.id) || a.sessionId !== s.id ||
      a.profileId !== s.profileId || a.sentenceId !== item.id ||
      a.sentenceRevision !== item.revision || !integer(a.recordedAt) || !object(a.evidence)) {
      return invalid('Invalid or duplicated practice attempt.');
    }
    ids.add(a.id);
    const e = a.evidence;
    if (e.kind === 'recall' ? (s.mode !== 'recall' || !rating(e.rating)) :
      e.kind === 'exposure' ? (e.medium !== s.mode || s.mode === 'recall') :
      e.kind !== 'skip') return invalid('Invalid practice evidence.');
  }
  return value as unknown as StoredPractice;
}

/** Validate external JSON commands before invoking business rules. */
export function decodePracticeCommand(raw: unknown): PracticeCommand {
  if (!object(raw) || !text(raw.sessionId)) {
    throw new PracticeStorageRuleError('invalid_command', 'Session ID is required.');
  }
  if (raw.type === 'start') {
    if (!text(raw.profileId) || !mode(raw.mode) || !object(raw.island) ||
      !Array.isArray(raw.island.sentences) || raw.island.sentences.length > 500) {
      throw new PracticeStorageRuleError('invalid_command', 'Invalid practice start request.');
    }
    return { type: 'start', sessionId: raw.sessionId, profileId: raw.profileId,
      mode: raw.mode, island: raw.island as unknown as LanguageIsland };
  }
  if (raw.type === 'attempt') {
    if (!object(raw.attempt) || !text(raw.attempt.attemptId) ||
      !text(raw.attempt.sentenceId) || !revision(raw.attempt.sentenceRevision) ||
      !integer(raw.attempt.recordedAt) || !object(raw.attempt.evidence)) {
      throw new PracticeStorageRuleError('invalid_command', 'Invalid practice attempt.');
    }
    const e = raw.attempt.evidence;
    const evidence = e.kind === 'recall' && rating(e.rating)
      ? { kind: 'recall' as const, rating: e.rating }
      : e.kind === 'exposure' && (e.medium === 'listening' || e.medium === 'shadowing')
        ? { kind: 'exposure' as const, medium: e.medium }
        : e.kind === 'skip' ? { kind: 'skip' as const } : null;
    if (!evidence) throw new PracticeStorageRuleError('invalid_command', 'Unsupported evidence.');
    return {
      type: 'attempt', sessionId: raw.sessionId,
      attempt: {
        attemptId: raw.attempt.attemptId,
        sentenceId: raw.attempt.sentenceId,
        sentenceRevision: raw.attempt.sentenceRevision,
        recordedAt: raw.attempt.recordedAt,
        evidence: evidence as CommitAttemptCommand['evidence']
      }
    };
  }
  if (raw.type === 'reveal' || raw.type === 'pause' ||
    raw.type === 'resume' || raw.type === 'abandon') {
    return { type: raw.type, sessionId: raw.sessionId };
  }
  throw new PracticeStorageRuleError('invalid_command', 'Unknown practice command.');
}

/** Pure command application; persistence must put this and attempt insertion in one transaction. */
export function applyPracticeCommand(
  current: StoredPractice | null, command: PracticeCommand
): { next: StoredPractice; attempt: PracticeAttempt | null; changed: boolean } {
  if (command.type === 'start') {
    if (current) {
      if (command.island.sentences.length > 500) throw new PracticeStorageRuleError('invalid_command', 'An Island supports up to 500 practice sentences per session.');
      const expected = createPracticeSession({
        sessionId: command.sessionId, profileId: command.profileId,
        mode: command.mode, island: command.island
      });
      if (current.session.profileId === expected.profileId &&
        current.session.mode === expected.mode &&
        current.session.islandId === expected.islandId &&
        JSON.stringify(current.session.items) === JSON.stringify(expected.items)) {
        return { next: current, attempt: null, changed: false };
      }
      throw new PracticeStorageRuleError('conflict', 'Session ID already exists with different content.');
    }
    if (command.island.sentences.length > 500) throw new PracticeStorageRuleError('invalid_command', 'An Island supports up to 500 practice sentences per session.');
    return { next: {schemaVersion: 1, revision: 1,
      session: createPracticeSession({
        sessionId: command.sessionId, profileId: command.profileId,
        mode: command.mode, island: command.island
      })}, attempt: null, changed: true };
  }
  if (!current) throw new PracticeStorageRuleError('not_found', 'Practice session not found.');
  if (current.session.id !== command.sessionId) {
    throw new PracticeStorageRuleError('conflict', 'Incorrect session identity.');
  }
  const s = current.session;
  let session: PracticeSession;
  let attempt: PracticeAttempt | null = null;
  if (command.type === 'attempt') {
    const result = commitPracticeAttempt(s, command.attempt);
    session = result.session;
    attempt = result.inserted ? result.attempt : null;
  } else if (command.type === 'reveal') session = revealAnswer(s);
  else if (command.type === 'pause') session = pauseSession(s);
  else if (command.type === 'resume') session = resumeSession(s);
  else session = abandonSession(s);
  const changed = session !== s;
  return {
    next: changed ? { schemaVersion: 1, revision: current.revision + 1, session } : current,
    attempt, changed
  };
}
