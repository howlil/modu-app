import { assessRecallRating, type RecallAssessment } from './evaluation.ts';

/** Pure, single-learner language learning kernel. No storage, provider, or UI dependencies. */
export type PracticeMode = 'recall' | 'listening' | 'shadowing';
export type RecallRating = 'again' | 'hard' | 'good' | 'easy';
export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type PromptPhase = 'prompt' | 'revealed';

export interface Sentence {
  id: string;
  revision: number;
  prompt: string;
  answer: string;
}
export interface LanguageIsland {
  id: string;
  revision: number;
  title: string;
  sourceLanguage: string;
  targetLanguage: string;
  sentences: readonly Sentence[];
}
export interface SentenceSnapshot extends Sentence {
  readonly islandId: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
}
export type PracticeEvidence =
  | { readonly kind: 'recall'; readonly rating: RecallRating; readonly assessment?: RecallAssessment }
  | { readonly kind: 'exposure'; readonly medium: 'listening' | 'shadowing' }
  | { readonly kind: 'skip' };
export interface PracticeAttempt {
  readonly id: string;
  readonly sessionId: string;
  readonly profileId: string;
  readonly sentenceId: string;
  readonly sentenceRevision: number;
  readonly evidence: PracticeEvidence;
  readonly recordedAt: number;
}
export interface PracticeSession {
  readonly id: string;
  readonly profileId: string;
  readonly islandId: string;
  readonly mode: PracticeMode;
  readonly status: SessionStatus;
  readonly phase: PromptPhase;
  readonly cursor: number;
  readonly items: readonly SentenceSnapshot[];
  readonly attempts: readonly PracticeAttempt[];
}
export type LearningErrorCode =
  | 'invalid_content' | 'invalid_session' | 'invalid_transition'
  | 'stale_item' | 'attempt_conflict';
export class LearningRuleError extends Error {
  constructor(readonly code: LearningErrorCode, message: string) {
    super(message);
    this.name = 'LearningRuleError';
  }
}
function requireRule(condition: unknown, code: LearningErrorCode, message: string): asserts condition {
  if (!condition) throw new LearningRuleError(code, message);
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}
function validTime(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
function validMode(mode: PracticeMode): boolean {
  return ['recall', 'listening', 'shadowing'].includes(mode);
}

/** Snapshot content so a later Island edit cannot silently alter an in-flight session. */
export function createPracticeSession(input: {
  sessionId: string;
  profileId: string;
  island: LanguageIsland;
  mode: PracticeMode;
}): PracticeSession {
  const { island } = input;
  requireRule(nonempty(input.sessionId) && nonempty(input.profileId) && validMode(input.mode),
    'invalid_session', 'Session ID, language profile, and practice mode are required.');
  requireRule(!!island && nonempty(island.id) && nonempty(island.title) &&
    nonempty(island.sourceLanguage) && nonempty(island.targetLanguage) &&
    validRevision(island.revision) && Array.isArray(island.sentences) && island.sentences.length > 0,
    'invalid_content', 'A valid Island with sentences is required.');
  const seen = new Set<string>();
  const items = island.sentences.map((sentence): SentenceSnapshot => {
    requireRule(!!sentence && nonempty(sentence.id) && validRevision(sentence.revision) &&
      nonempty(sentence.prompt) && nonempty(sentence.answer) && !seen.has(sentence.id),
      'invalid_content', 'Each sentence must have a unique ID, revision, prompt, and answer.');
    seen.add(sentence.id);
    return {
      id: sentence.id,
      revision: sentence.revision,
      prompt: sentence.prompt,
      answer: sentence.answer,
      islandId: island.id,
      sourceLanguage: island.sourceLanguage,
      targetLanguage: island.targetLanguage
    };
  });
  return {
    id: input.sessionId,
    profileId: input.profileId,
    islandId: island.id,
    mode: input.mode,
    status: 'active',
    phase: 'prompt',
    cursor: 0,
    items,
    attempts: []
  };
}
export function currentSentence(session: PracticeSession): SentenceSnapshot | null {
  return session.status === 'completed' || session.status === 'abandoned'
    ? null : session.items[session.cursor] ?? null;
}
export function revealAnswer(session: PracticeSession): PracticeSession {
  requireRule(session.status === 'active' && session.mode === 'recall',
    'invalid_transition', 'Only an active recall session can reveal its answer.');
  return session.phase === 'revealed' ? session : { ...session, phase: 'revealed' };
}
export function pauseSession(session: PracticeSession): PracticeSession {
  requireRule(session.status === 'active', 'invalid_transition', 'Only an active session can pause.');
  return { ...session, status: 'paused' };
}
export function resumeSession(session: PracticeSession): PracticeSession {
  requireRule(session.status === 'paused', 'invalid_transition', 'Only a paused session can resume.');
  return { ...session, status: 'active' };
}
export function abandonSession(session: PracticeSession): PracticeSession {
  requireRule(session.status === 'active' || session.status === 'paused',
    'invalid_transition', 'Completed or abandoned sessions cannot be discarded.');
  return { ...session, status: 'abandoned' };
}
function sameEvidence(a: PracticeEvidence, b: PracticeEvidence): boolean {
  return a.kind === b.kind && (
    a.kind === 'skip' ? true :
    a.kind === 'recall' ? b.kind === 'recall' && a.rating === b.rating :
    b.kind === 'exposure' && a.medium === b.medium
  );
}
/** A rated recall is the only evidence eligible to update a future SRS engine. */
export function isMemoryEligible(attempt: PracticeAttempt): boolean {
  return attempt.evidence.kind === 'recall';
}
export function isSuccessfulRecall(attempt: PracticeAttempt): boolean {
  return attempt.evidence.kind === 'recall' && assessRecallRating(attempt.evidence.rating).outcome === 'recalled';
}
export interface CommitAttemptCommand {
  attemptId: string;
  sentenceId: string;
  sentenceRevision: number;
  evidence: PracticeEvidence;
  recordedAt: number;
}
/** Pure idempotent transition; the persistence adapter must later commit it durably and atomically. */
export function commitPracticeAttempt(
  session: PracticeSession, command: CommitAttemptCommand
): { session: PracticeSession; attempt: PracticeAttempt; inserted: boolean } {
  requireRule(nonempty(command.attemptId) && nonempty(command.sentenceId) &&
    validRevision(command.sentenceRevision) && validTime(command.recordedAt),
    'invalid_session', 'Invalid attempt identity or timestamp.');
  const existing = session.attempts.find((attempt) => attempt.id === command.attemptId);
  if (existing) {
    requireRule(existing.sentenceId === command.sentenceId &&
      existing.sentenceRevision === command.sentenceRevision &&
      sameEvidence(existing.evidence, command.evidence),
      'attempt_conflict', 'Attempt ID was already used for different evidence.');
    return { session, attempt: existing, inserted: false };
  }
  requireRule(session.status === 'active', 'invalid_transition', 'Session is not active.');
  const item = session.items[session.cursor];
  requireRule(!!item && item.id === command.sentenceId && item.revision === command.sentenceRevision,
    'stale_item', 'Attempt does not match the currently presented sentence.');
  const evidence = command.evidence;
  requireRule(!!evidence && ['recall', 'exposure', 'skip'].includes(evidence.kind),
    'invalid_session', 'Unknown evidence type.');
  if (evidence.kind === 'recall') {
    requireRule(session.mode === 'recall' && session.phase === 'revealed' &&
      ['again', 'hard', 'good', 'easy'].includes(evidence.rating),
      'invalid_transition', 'Recall rating requires a revealed answer and valid rating.');
  } else if (evidence.kind === 'exposure') {
    requireRule(session.mode === evidence.medium && session.phase === 'prompt',
      'invalid_transition', 'Exposure must match the active listening/shadowing mode.');
  }
  const attempt: PracticeAttempt = {
    id: command.attemptId,
    sessionId: session.id,
    profileId: session.profileId,
    sentenceId: item.id,
    sentenceRevision: item.revision,
    evidence: evidence.kind === 'recall' ? {
      kind: 'recall', rating: evidence.rating,
      assessment: assessRecallRating(evidence.rating)
    }
      : evidence.kind === 'exposure' ? { kind: 'exposure', medium: evidence.medium }
      : { kind: 'skip' },
    recordedAt: command.recordedAt
  };
  const cursor = session.cursor + 1;
  return {
    session: {
      ...session,
      cursor,
      phase: 'prompt',
      status: cursor === session.items.length ? 'completed' : 'active',
      attempts: [...session.attempts, attempt]
    },
    attempt,
    inserted: true
  };
}
export function summarizePractice(attempts: readonly PracticeAttempt[]) {
  return {
    ratedRecalls: attempts.filter(isMemoryEligible).length,
    successfulRecalls: attempts.filter(isSuccessfulRecall).length,
    exposures: attempts.filter((a) => a.evidence.kind === 'exposure').length,
    skips: attempts.filter((a) => a.evidence.kind === 'skip').length
  };
}
