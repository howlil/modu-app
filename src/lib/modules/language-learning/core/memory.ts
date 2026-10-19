import type { PracticeAttempt, RecallRating } from './learning.ts';

/** M3 deterministic SRS v1 — intentionally NOT FSRS. All timestamps are epoch milliseconds. */
export const SRS_ALGORITHM_VERSION = 1 as const;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const MAX_INTERVAL = 365 * DAY;
const MAX_TIME = 8_640_000_000_000_000; // ECMAScript Date limit

export type MemoryStage = 'learning' | 'review' | 'relearning';
export interface MemoryState {
  key: string;
  profileId: string;
  islandId: string;
  sentenceId: string;
  sentenceRevision: number;
  algorithmVersion: 1;
  stage: MemoryStage;
  dueAt: number;
  lastReviewedAt: number;
  intervalMs: number;
  repetitions: number;
  lapses: number;
  lastAttemptId: string;
}

export class MemoryRuleError extends Error {
  constructor(readonly code: 'invalid_attempt' | 'invalid_state', message: string) {
    super(message);
    this.name = 'MemoryRuleError';
  }
}
/** Profile + island + sentence revision are all part of identity; content edits reset review state. */
export function memoryKey(input: {
  profileId: string;
  islandId: string;
  sentenceId: string;
  sentenceRevision: number;
}): string {
  return JSON.stringify([
    input.profileId, input.islandId, input.sentenceId, input.sentenceRevision
  ]);
}
function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= 0 && value <= MAX_TIME;
}
export function decodeMemoryState(raw: unknown): MemoryState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new MemoryRuleError('invalid_state', 'Invalid memory record.');
  }
  const v = raw as Record<string, unknown>;
  if (typeof v.profileId !== 'string' || !v.profileId.trim() ||
    typeof v.islandId !== 'string' || !v.islandId.trim() ||
    typeof v.sentenceId !== 'string' || !v.sentenceId.trim() ||
    !Number.isSafeInteger(v.sentenceRevision) || (v.sentenceRevision as number) < 1 ||
    v.algorithmVersion !== SRS_ALGORITHM_VERSION ||
    !['learning','review','relearning'].includes(String(v.stage)) ||
    !validTime(v.dueAt) || !validTime(v.lastReviewedAt) ||
    !validTime(v.intervalMs) || v.intervalMs > MAX_INTERVAL ||
    v.dueAt < v.lastReviewedAt || v.dueAt !== v.lastReviewedAt + v.intervalMs ||
    !Number.isSafeInteger(v.repetitions) || (v.repetitions as number) < 0 ||
    !Number.isSafeInteger(v.lapses) || (v.lapses as number) < 0 ||
    typeof v.lastAttemptId !== 'string' || !v.lastAttemptId.trim() ||
    v.key !== memoryKey(v as unknown as MemoryState)) {
    throw new MemoryRuleError('invalid_state', 'Corrupt or unsupported memory state.');
  }
  return v as unknown as MemoryState;
}
function nextInterval(previous: MemoryState | null, rating: RecallRating): number {
  if (rating === 'again') return 10 * MINUTE;
  const prior = previous?.intervalMs ?? 0;
  if (rating === 'hard') {
    return Math.min(MAX_INTERVAL, Math.max(DAY, Math.round(prior * 1.2)));
  }
  if (rating === 'good') {
    return Math.min(MAX_INTERVAL, Math.max(3 * DAY, Math.round(prior * 2.5)));
  }
  return Math.min(MAX_INTERVAL, Math.max(7 * DAY, Math.round(prior * 3.5)));
}

/** Only a persisted rated recall can change a memory state. No work for listen/skip. */
export function scheduleRatedAttempt(
  previous: MemoryState | null, attempt: PracticeAttempt, islandId: string
): MemoryState | null {
  if (attempt.evidence.kind !== 'recall') return previous;
  const key = memoryKey({
    profileId: attempt.profileId, islandId, sentenceId: attempt.sentenceId,
    sentenceRevision: attempt.sentenceRevision
  });
  if (!islandId.trim() || !attempt.profileId.trim() || !attempt.sentenceId.trim() ||
    !attempt.id.trim() || !Number.isSafeInteger(attempt.sentenceRevision) ||
    attempt.sentenceRevision < 1 || !validTime(attempt.recordedAt) ||
    !['again','hard','good','easy'].includes(attempt.evidence.rating)) {
    throw new MemoryRuleError('invalid_attempt', 'Invalid rated recall for scheduling.');
  }
  if (previous) {
    decodeMemoryState(previous);
    if (previous.key !== key) {
      throw new MemoryRuleError('invalid_state', 'Memory state belongs to another sentence.');
    }
    if (previous.lastAttemptId === attempt.id) return previous; // replay-safe
  }
  const when = Math.max(attempt.recordedAt, previous?.lastReviewedAt ?? 0);
  const intervalMs = Math.min(nextInterval(previous, attempt.evidence.rating), MAX_TIME - when);
  const forgot = attempt.evidence.rating === 'again';
  return {
    key, profileId: attempt.profileId, islandId,
    sentenceId: attempt.sentenceId, sentenceRevision: attempt.sentenceRevision,
    algorithmVersion: SRS_ALGORITHM_VERSION,
    stage: forgot ? (previous ? 'relearning' : 'learning') : 'review',
    dueAt: when + intervalMs, lastReviewedAt: when, intervalMs,
    repetitions: forgot ? 0 : (previous?.repetitions ?? 0) + 1,
    lapses: (previous?.lapses ?? 0) + (forgot ? 1 : 0),
    lastAttemptId: attempt.id
  };
}
export function isDue(state: MemoryState, now: number): boolean {
  if (!validTime(now)) throw new MemoryRuleError('invalid_attempt', 'Invalid review clock.');
  return state.dueAt <= now;
}

/** Deterministic replay for M1/M2 attempts and backup restoration. */
export function rebuildMemoryStates(
  events: readonly { attempt: PracticeAttempt; islandId: string }[]
): MemoryState[] {
  const ordered = [...events].filter(e => e.attempt.evidence.kind === 'recall')
    .sort((a,b) => a.attempt.recordedAt - b.attempt.recordedAt ||
      (a.attempt.id < b.attempt.id ? -1 : a.attempt.id > b.attempt.id ? 1 : 0));
  const states = new Map<string, MemoryState>();
  const ids = new Set<string>();
  for (const event of ordered) {
    if (ids.has(event.attempt.id)) {
      throw new MemoryRuleError('invalid_attempt', 'Duplicate historical attempt ID.');
    }
    ids.add(event.attempt.id);
    const key = memoryKey({
      profileId: event.attempt.profileId, islandId: event.islandId,
      sentenceId: event.attempt.sentenceId,
      sentenceRevision: event.attempt.sentenceRevision
    });
    const updated = scheduleRatedAttempt(states.get(key) ?? null, event.attempt, event.islandId);
    if (updated) states.set(key, updated);
  }
  return [...states.values()].sort((a,b) => a.dueAt - b.dueAt ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
