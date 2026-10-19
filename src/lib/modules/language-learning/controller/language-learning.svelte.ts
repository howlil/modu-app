import {
  currentSentence, summarizePractice,
  type PracticeMode, type RecallRating, type PracticeSession
} from '../core/learning.ts';
import type { PracticeCommand, StoredPractice } from '../core/persistence.ts';
import { learningPersistence, LearningPersistenceError } from '../adapters/persistence.ts';
import { checkRecallAnswer, practiceAnswerScope, recallFeedback, type AnswerCheck } from '../core/evaluation.ts';
import { STARTER_ISLAND } from '../adapters/starter-content.ts';
import {
  recommendedIsland, type LearningPlan, type LearningProfile
} from '../core/orchestration.ts';

/** No optimistic success: all state transitions are visible only after durable acknowledgement. */
export function createLanguageLearningController() {
  let record = $state<(StoredPractice & {storageEpoch?: string | null}) | null>(null);
  let loading = $state(true);
  let pending = $state(false);
  let ready = $state(false);
  let error = $state('');
  let plan = $state<LearningPlan | null>(null);
  let planError = $state('');
  const profile: LearningProfile = { id: 'starter-id-en', targetLanguage: 'en' };
  let answerDraft = $state('');
  let persistenceStatus = $state<'granted' | 'not-granted' | 'unavailable'>('unavailable');
  let answerDraftScope = $state<string | null>(null);
  let retryCommand: {command: PracticeCommand; expectedRevision: number | null; expectedEpoch: string | null} | null = null;
  const session = $derived<PracticeSession | null>(record?.session ?? null);
  const answerCheck = $derived.by((): AnswerCheck | null => {
    const s = session;
    const item = s ? currentSentence(s) : null;
    const scopedDraft = answerDraftScope === practiceAnswerScope(s) ? answerDraft : '';
    return s?.mode === 'recall' && s.phase === 'revealed' && item
      ? checkRecallAnswer({response: scopedDraft, reference: item.answer})
      : null;
  });
  const lastRecallFeedback = $derived.by(() => {
    const s = session;
    const previous = s?.attempts[s.attempts.length - 1];
    return previous?.evidence.kind === 'recall'
      ? recallFeedback(previous.evidence.rating) : '';
  });
  function setAnswerDraft(value: string) {
    const scope = practiceAnswerScope(session);
    if (scope && session?.mode === 'recall' && session.phase === 'prompt' && !pending) {
      answerDraftScope = scope;
      answerDraft = value.slice(0, 2000);
    }
  }

  async function refreshPlan(): Promise<LearningPlan | null> {
    try {
      const next = await learningPersistence.plan(profile, [STARTER_ISLAND],
        {now: Date.now(), maxItems: 10, maxNew: 3});
      plan = next;
      planError = '';
      return next;
    } catch (cause) {
      plan = null;
      planError = cause instanceof Error ? cause.message : 'Unable to plan learning.';
      return null;
    }
  }

  async function load() {
    if (pending) return;
    loading = true;
    pending = true;
    try {
      record = await learningPersistence.latest();
      await refreshPlan();
      persistenceStatus = await learningPersistence.persistenceStatus();
      answerDraft = '';
      answerDraftScope = practiceAnswerScope(record?.session ?? null);
      ready = true;
      retryCommand = null;
      error = '';
    } catch (cause) {
      ready = false;
      error = cause instanceof Error ? cause.message : 'Learning storage could not be loaded.';
    } finally { pending = false; loading = false; }
  }
  async function execute(command: PracticeCommand, expectedRevision: number | null, expectedEpoch: string | null) {
    if (!ready || pending) return;
    pending = true;
    error = '';
    try {
      const saved = await learningPersistence.execute(command, expectedRevision, expectedEpoch);
      const nextScope = practiceAnswerScope(saved.session);
      if (answerDraftScope !== nextScope) {
        answerDraft = '';
        answerDraftScope = nextScope;
      }
      record = saved;
      retryCommand = null;
      await refreshPlan();
    } catch (cause) {
      if (cause instanceof LearningPersistenceError && cause.code === 'conflict') {
        retryCommand = null;
        error = 'Another tab updated this session. Reload and review the latest state.';
      } else {
        retryCommand = {command, expectedRevision, expectedEpoch};
        error = cause instanceof Error ? cause.message : 'Unable to persist learning progress.';
      }
    } finally { pending = false; }
  }
  function send(command: PracticeCommand) {
    void execute(command, command.type === 'start' ? null : (record?.revision ?? null), record?.storageEpoch ?? null);
  }
  function start(mode: PracticeMode = 'recall') {
    if (pending || !ready || retryCommand) return;
    send({type: 'start', sessionId: crypto.randomUUID(), profileId: 'starter-id-en',
      island: STARTER_ISLAND, mode});
  }
  async function startRecommended() {
    if (!ready || pending || retryCommand ||
      session?.status === 'active' || session?.status === 'paused') return;
    pending = true;
    let selected: ReturnType<typeof recommendedIsland> = null;
    try {
      const latest = await refreshPlan();
      if (!latest || !latest.tasks.length) return;
      selected = recommendedIsland(latest, [STARTER_ISLAND]);
    } catch (cause) {
      planError = cause instanceof Error ? cause.message : 'Learning recommendation became outdated.';
      return;
    } finally {
      pending = false;
    }
    if (!selected) return;
    await execute({type:'start',sessionId:crypto.randomUUID(),profileId:profile.id,
      island:selected,mode:'recall'}, null, record?.storageEpoch ?? null);
  }

  function act(type: 'reveal' | 'pause' | 'resume' | 'abandon') {
    if (!session || pending || retryCommand) return;
    send({type, sessionId: session.id});
  }
  function attempt(evidence: {kind:'recall';rating:RecallRating} |
    {kind:'skip'} | {kind:'exposure'; medium:'listening'|'shadowing'}) {
    if (!session || pending || retryCommand) return;
    const item = currentSentence(session);
    if (!item) return;
    send({type:'attempt', sessionId: session.id, attempt: {
      attemptId:crypto.randomUUID(), sentenceId:item.id,
      sentenceRevision:item.revision, recordedAt:Date.now(), evidence
    }});
  }
  function rate(rating: RecallRating) { attempt({kind:'recall',rating}); }
  function skip() { attempt({kind:'skip'}); }
  function nextExposure() {
    if (session && session.mode !== 'recall') attempt({kind:'exposure',medium:session.mode});
  }
  async function exportBackup(): Promise<string | null> {
    if (pending || !ready) return null;
    pending = true;
    try {
      const backup = await learningPersistence.exportBackup();
      error = '';
      return backup;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Unable to export learning history.';
      return null;
    } finally { pending = false; }
  }
  async function importBackup(text: string): Promise<void> {
    if (pending || !ready) return;
    pending = true;
    try {
      await learningPersistence.importBackup(text);
      record = await learningPersistence.latest();
      await refreshPlan();
      answerDraft = '';
      answerDraftScope = practiceAnswerScope(record?.session ?? null);
      retryCommand = null;
      error = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Unable to restore learning history.';
    } finally { pending = false; }
  }
  async function requestStoragePersistence(): Promise<void> {
    if (pending || !ready) return;
    persistenceStatus = await learningPersistence.requestPersistence();
  }
  function retry() {
    if (pending || !ready || !retryCommand) return;
    const { command, expectedRevision, expectedEpoch } = retryCommand;
    void execute(command, expectedRevision, expectedEpoch);
  }
  return {
    get session() { return session; },
    get loading() { return loading; },
    get pending() { return pending; },
    get ready() { return ready; },
    get error() { return error; },
    get plan() { return plan; },
    get planError() { return planError; },
    get canRetry() { return !!retryCommand; },
    get persistenceStatus() { return persistenceStatus; },
    exportBackup, importBackup, requestStoragePersistence,
    get answerDraft() { return answerDraftScope === practiceAnswerScope(session) ? answerDraft : ''; },
    get answerCheck() { return answerCheck; },
    get lastRecallFeedback() { return lastRecallFeedback; },
    setAnswerDraft,
    get summary() { return summarizePractice(session?.attempts ?? []); },
    load, retry, start, startRecommended, refreshPlan, reveal: () => act('reveal'), pause: () => act('pause'),
    resume: () => act('resume'), abandon: () => act('abandon'),
    rate, skip, nextExposure
  };
}
