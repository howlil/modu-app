import {
  abandonSession, commitPracticeAttempt, createPracticeSession, currentSentence,
  pauseSession, resumeSession, revealAnswer, summarizePractice,
  type PracticeMode, type PracticeSession, type RecallRating
} from '../core/learning.ts';
import { STARTER_ISLAND } from '../adapters/starter-content.ts';

/** Pre-launch in-memory controller. Does not claim durable progress; storage is a later milestone. */
export function createLanguageLearningController() {
  let session = $state<PracticeSession | null>(null);
  let error = $state('');
  function perform(run: () => void) {
    try { run(); error = ''; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Practice could not continue.'; }
  }
  function start(mode: PracticeMode = 'recall') {
    perform(() => {
      session = createPracticeSession({
        sessionId: crypto.randomUUID(), profileId: 'starter-id-en',
        island: STARTER_ISLAND, mode
      });
    });
  }
  function reveal() {
    perform(() => { if (session) session = revealAnswer(session); });
  }
  function rate(rating: RecallRating) {
    perform(() => {
      if (!session) return;
      const item = currentSentence(session);
      if (!item) return;
      session = commitPracticeAttempt(session, {
        attemptId: crypto.randomUUID(), sentenceId: item.id, sentenceRevision: item.revision,
        evidence: { kind: 'recall', rating }, recordedAt: Date.now()
      }).session;
    });
  }
  function skip() {
    perform(() => {
      if (!session) return;
      const item = currentSentence(session);
      if (!item) return;
      session = commitPracticeAttempt(session, {
        attemptId: crypto.randomUUID(), sentenceId: item.id, sentenceRevision: item.revision,
        evidence: { kind: 'skip' }, recordedAt: Date.now()
      }).session;
    });
  }
  function nextExposure() {
    perform(() => {
      if (!session) return;
      const item = currentSentence(session);
      if (!item || session.mode === 'recall') return;
      session = commitPracticeAttempt(session, {
        attemptId: crypto.randomUUID(), sentenceId: item.id, sentenceRevision: item.revision,
        evidence: { kind: 'exposure', medium: session.mode }, recordedAt: Date.now()
      }).session;
    });
  }
  function pause() { perform(() => { if (session) session = pauseSession(session); }); }
  function resume() { perform(() => { if (session) session = resumeSession(session); }); }
  function abandon() { perform(() => { if (session) session = abandonSession(session); }); }
  return {
    get session() { return session; }, get error() { return error; },
    get summary() { return summarizePractice(session?.attempts ?? []); },
    start, reveal, rate, skip, nextExposure, pause, resume, abandon
  };
}
