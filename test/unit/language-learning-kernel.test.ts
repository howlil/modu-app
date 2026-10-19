import { describe, expect, it } from 'vitest';
import {
  abandonSession, commitPracticeAttempt, createPracticeSession, currentSentence,
  isMemoryEligible, isSuccessfulRecall, pauseSession, resumeSession, revealAnswer,
  summarizePractice, LearningRuleError
} from '../../src/lib/modules/language-learning/core/learning.ts';
import type { LanguageIsland, PracticeSession } from '../../src/lib/modules/language-learning/core/learning.ts';

const island: LanguageIsland = {
  id: 'cafe', revision: 1, title: 'Café', sourceLanguage: 'id', targetLanguage: 'en',
  sentences: [
    { id: 'coffee', revision: 1, prompt: 'Saya ingin kopi.', answer: 'I want coffee.' },
    { id: 'water', revision: 1, prompt: 'Air, tolong.', answer: 'Water, please.' }
  ]
};
function makeSession(mode: 'recall' | 'listening' | 'shadowing' = 'recall'): PracticeSession {
  return createPracticeSession({ sessionId: 'session-1', profileId: 'profile-en', island, mode });
}
function rated(session: PracticeSession, attemptId: string, rating: 'again'|'hard'|'good'|'easy' = 'good') {
  const sentence = currentSentence(session)!;
  return commitPracticeAttempt(session, {
    attemptId, sentenceId: sentence.id, sentenceRevision: sentence.revision,
    evidence: { kind: 'recall', rating }, recordedAt: 1234
  });
}
describe('Language learning kernel — domain invariants', () => {
  it('snapshots Island revisions and rejects missing/duplicate content', () => {
    const s = makeSession();
    island.sentences[0].answer = 'Edited elsewhere';
    expect(s.items[0].answer).toBe('I want coffee.');
    island.sentences[0].answer = 'I want coffee.';
    const invalid = { ...island, sentences: [island.sentences[0], island.sentences[0]] };
    expect(() => createPracticeSession({ sessionId: 'x', profileId: 'p', island: invalid, mode: 'recall' }))
      .toThrowError(LearningRuleError);
  });
  it('does not allow recall rating without first revealing the answer', () => {
    const s = makeSession();
    expect(() => rated(s, 'a1')).toThrowError(LearningRuleError);
    const revealed = revealAnswer(s);
    const result = rated(revealed, 'a1');
    expect(result.inserted).toBe(true);
    expect(result.session.cursor).toBe(1);
    expect(result.session.phase).toBe('prompt');
    expect(result.attempt.evidence).toEqual({ kind: 'recall', rating: 'good', assessment: {
      version: 1, source: 'self_rating', outcome: 'recalled', effort: 'normal'
    } });
  });
  it('retries an identical attempt idempotently, even after completion', () => {
    const first = rated(revealAnswer(makeSession()), 'a1');
    const second = rated(revealAnswer(first.session), 'a2');
    expect(second.session.status).toBe('completed');
    const duplicate = commitPracticeAttempt(second.session, {
      attemptId: 'a1', sentenceId: 'coffee', sentenceRevision: 1,
      evidence: { kind: 'recall', rating: 'good' }, recordedAt: 2000
    });
    expect(duplicate.inserted).toBe(false);
    expect(duplicate.session.attempts).toHaveLength(2);
    expect(() => commitPracticeAttempt(second.session, {
      attemptId: 'a1', sentenceId: 'coffee', sentenceRevision: 1,
      evidence: { kind: 'recall', rating: 'easy' }, recordedAt: 2000
    })).toThrowError(LearningRuleError);
  });
  it('never treats listening or shadowing as recall evidence', () => {
    for (const mode of ['listening', 'shadowing'] as const) {
      const s = makeSession(mode), item = currentSentence(s)!;
      const result = commitPracticeAttempt(s, {
        attemptId: mode, sentenceId: item.id, sentenceRevision: item.revision,
        evidence: { kind: 'exposure', medium: mode }, recordedAt: 200
      });
      expect(isMemoryEligible(result.attempt)).toBe(false);
      expect(summarizePractice(result.session.attempts).exposures).toBe(1);
      expect(() => commitPracticeAttempt(s, {
        attemptId: 'bad', sentenceId: item.id, sentenceRevision: item.revision,
        evidence: { kind: 'recall', rating: 'easy' }, recordedAt: 200
      })).toThrowError(LearningRuleError);
    }
  });
  it('does not convert skip into failure or successful recall', () => {
    const s = makeSession(), item = currentSentence(s)!;
    const result = commitPracticeAttempt(s, {
      attemptId: 'skip', sentenceId: item.id, sentenceRevision: item.revision,
      evidence: { kind: 'skip' }, recordedAt: 100
    });
    expect(summarizePractice(result.session.attempts)).toEqual({
      ratedRecalls: 0, successfulRecalls: 0, exposures: 0, skips: 1
    });
    expect(isMemoryEligible(result.attempt)).toBe(false);
  });
  it('keeps historical attempts when paused, resumed, then abandoned', () => {
    const first = rated(revealAnswer(makeSession()), 'a1', 'again');
    expect(isSuccessfulRecall(first.attempt)).toBe(false);
    const paused = pauseSession(first.session);
    expect(() => revealAnswer(paused)).toThrowError(LearningRuleError);
    const resumed = resumeSession(paused);
    const abandoned = abandonSession(resumed);
    expect(abandoned.attempts).toHaveLength(1);
    expect(abandoned.status).toBe('abandoned');
    expect(() => resumeSession(abandoned)).toThrowError(LearningRuleError);
  });
  it('rejects stale sentence and revision submissions', () => {
    const s = revealAnswer(makeSession());
    expect(() => commitPracticeAttempt(s, {
      attemptId: 'stale', sentenceId: 'coffee', sentenceRevision: 99,
      evidence: { kind: 'recall', rating: 'good' }, recordedAt: 1
    })).toThrowError(LearningRuleError);
  });
  it('keeps the profile ID on every attempt for later per-language review', () => {
    const a = rated(revealAnswer(makeSession()), 'a1').attempt;
    expect(a.profileId).toBe('profile-en');
    expect(a.sentenceRevision).toBe(1);
  });
});
