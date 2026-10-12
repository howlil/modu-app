import { onMount } from 'svelte';
import { buildIntelligenceSnapshot, localWindow, type MetricWindow } from '../core/analytics.ts';
import { combineEvidence, evidenceIdentity, isEvidenceKind, type EvidenceKind, type EvidenceRecord } from '../core/evidence.ts';
import { habitWeekSummary } from '../core/consistency.ts';
import { adjustRemainingAllocation, weeklyRecommendation, type WeeklyRecommendation } from '../core/recommendations.ts';
import { loadEvidenceRecords, saveEvidenceRecords, subscribeEvidence } from '../adapters/evidence-storage.ts';
import { parseLocalEvidenceFile } from '../adapters/evidence-import.ts';
import { assignFocusSession, loadFocusSessions, subscribeFocusSessions } from '#lib/shared/focus-sessions/repository.ts';
import { writePendingFocusTask } from '#lib/shared/focus-sessions/context.ts';
import type { FocusActivitySession } from '#lib/shared/focus-sessions/types.ts';
import { proposeReplan, overlapsExistingWork } from '../core/adaptive.ts';
import { readExecutionState, saveExecutionState } from '../adapters/persistence.ts';
import {
  CAPACITY_PRESETS, emptyExecutionState, localDayKey, makePlan, minutesLabel, nextTask, plannedMinutes, weekKey,
  type CapacityMode, type DailyPlan, type ExecutionState, type ExecutionTask, type Impact, type TaskStatus, type Workstream,
  type WeeklyReflection
} from '../core/planning.ts';

export function createDailyExecutionController() {
  let state = $state<ExecutionState>(emptyExecutionState());
  let sessions = $state<FocusActivitySession[]>([]);
  let evidenceRecords = $state<EvidenceRecord[]>([]);
  let reviewSubview = $state<'summary'|'intelligence'|'evidence'|'sources'>('summary');
  let intelligenceNotice = $state('');
  let evidenceRefreshVersion = 0;
  let view = $state<'today' | 'priorities' | 'review'>('today');
  let dayKey = $state(localDayKey(Date.now()));
  let weekStart = $state(weekKey(Date.now()));
  let error = $state('');
  let manualError = $state('');
  let checkpointPromptId = $state<string | null>(null);
  let loading = $state(true);
  let refreshVersion = 0;

  const plan = $derived(state.plans[dayKey] ?? makePlan(dayKey, 'medium'));
  const focusRecordedMs = $derived(sessions.filter((s) => localDayKey(s.endedAt) === dayKey).reduce((sum, s) => sum + s.actualDurationMs, 0));
  const manualRecordedMs = $derived(state.manualEntries.filter((entry) => localDayKey(entry.endedAt) === dayKey).reduce((sum, entry) => sum + entry.endedAt - entry.startedAt, 0));
  const recordedMs = $derived(focusRecordedMs + manualRecordedMs);
  const replanProposal = $derived(proposeReplan(plan, state.tasks, recordedMs / 60_000, dayKey));
  const queue = $derived([...state.tasks].filter((t) => t.status === 'ready').sort((a, b) => {
    const first = nextTask([a, b], dayKey);
    return first?.id === a.id ? -1 : 1;
  }));
  const recommendation = $derived(nextTask(state.tasks, dayKey));
  const combinedEvidence = $derived(combineEvidence(evidenceRecords, state.tasks));
  const habitProgress = $derived(habitWeekSummary(state.habit, sessions, state.tasks, weekStart));
  const weeklyInsight = $derived(weeklyRecommendation(state.tasks, combinedEvidence, sessions, weekStart, Date.now(), state.recommendationDecisions));

  function commit(value: ExecutionState): boolean {
    try {
      saveExecutionState(value);
      state = value;
      error = '';
      return true;
    } catch {
      error = 'Unable to save data in this browser. Changes were not applied.';
      return false;
    }
  }

  async function refreshSessions() {
    const version = ++refreshVersion;
    try {
      const loaded = await loadFocusSessions();
      if (version === refreshVersion) sessions = loaded;
    } catch {
      error = 'Unable to load focus activity.';
    }
  }

  async function refreshEvidence() {
    const version = ++evidenceRefreshVersion;
    try {
      const loaded = await loadEvidenceRecords();
      if (version === evidenceRefreshVersion) evidenceRecords = loaded;
    } catch {
      error = 'Unable to read evidence records.';
    }
  }

  function intelligenceSnapshot(window: MetricWindow) {
    const {from,to} = localWindow(window, Date.now());
    return buildIntelligenceSnapshot(sessions, state.manualEntries, state.tasks, combinedEvidence, from, to);
  }

  async function addEvidence(input: {
    title: string; observation: string; kind: EvidenceKind; taskId?: string;
    topic?: string; assessmentResult?: EvidenceRecord['assessmentResult']; url?: string;
  }): Promise<boolean> {
    if (!input.title.trim() || !input.observation.trim() || !isEvidenceKind(input.kind)) return false;
    if (input.taskId && !state.tasks.some((task) => task.id === input.taskId)) return false;
    const record: EvidenceRecord = {
      id: crypto.randomUUID(), title: input.title.trim().slice(0,160),
      observation: input.observation.trim().slice(0,800), kind: input.kind,
      source: 'manual', occurredAt: Date.now(), verification: 'user-reported',
      taskId: input.taskId || undefined,
      topic: input.topic?.trim().slice(0,80) || undefined,
      assessmentResult: input.kind === 'assessment' ? input.assessmentResult : undefined,
      url: input.url?.trim().startsWith('https://') ? input.url.trim().slice(0,500) : undefined
    };
    try {
      await saveEvidenceRecords([record]);
      await refreshEvidence();
      intelligenceNotice = 'Evidence saved locally.';
      return true;
    } catch {
      error = 'Unable to save evidence.';
      return false;
    }
  }

  async function importEvidence(file: File): Promise<number> {
    try {
      const imported = await parseLocalEvidenceFile(file, Date.now());
      const existing = await loadEvidenceRecords();
      const identities = new Set([...existing, ...projectExistingOutcomes()].map((record) => evidenceIdentity(record)));
      const unique = imported.filter((record) => {
        const key = evidenceIdentity(record);
        if (identities.has(key)) return false;
        identities.add(key);
        return true;
      });
      await saveEvidenceRecords(unique);
      await refreshEvidence();
      intelligenceNotice = unique.length + ' new evidence records imported. ' +
        (imported.length - unique.length) + ' duplicates skipped. Imported claims remain unverified.';
      return unique.length;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Evidence import failed.';
      return -1;
    }
  }

  function projectExistingOutcomes() {
    return combinedEvidence.filter((record) => record.source === 'task-outcome');
  }

  async function archiveEvidence(id: string) {
    const existing = evidenceRecords.find((record) => record.id === id && record.source !== 'task-outcome');
    if (!existing) return;
    try {
      await saveEvidenceRecords([{...existing,archivedAt:Date.now()}]);
      await refreshEvidence();
      intelligenceNotice = 'Evidence archived.';
    } catch { error = 'Unable to archive evidence.'; }
  }

  async function restoreEvidence(id: string) {
    const existing = evidenceRecords.find((record) => record.id === id && !!record.archivedAt);
    if (!existing) return;
    try {
      const restored = { ...existing };
      delete restored.archivedAt;
      await saveEvidenceRecords([restored]);
      await refreshEvidence();
      intelligenceNotice = 'Evidence restored.';
    } catch { error = 'Unable to restore evidence.'; }
  }

  function updateHabitTarget(days: number) {
    if (!Number.isInteger(days) || days < 1 || days > 7) return;
    commit({...state,habit:{...state.habit,targetDaysPerWeek:days}});
  }

  function decideRecommendation(recommendation: WeeklyRecommendation, decision: 'accepted'|'rejected', additionalMinutes = 0) {
    if (weeklyInsight?.id !== recommendation.id) return false;
    const nextState: ExecutionState = {
      ...state,
      recommendationDecisions: [
        ...state.recommendationDecisions.filter((entry) => entry.id !== recommendation.id),
        {id:recommendation.id,status:decision,decidedAt:Date.now()}
      ].slice(-200)
    };
    if (decision === 'accepted' && recommendation.workstream && additionalMinutes > 0) {
      nextState.plans = {
        ...state.plans,
        [dayKey]: {
          ...plan,
          revision: {
            reason: recommendation.reason,
            remainingAllocations: adjustRemainingAllocation(
              replanProposal.allocations, recommendation.workstream, additionalMinutes
            ),
            recordedAtAcceptanceMs: recordedMs,
            acceptedAt: Date.now()
          }
        }
      };
    }
    if (!commit(nextState)) return false;
    intelligenceNotice = decision === 'accepted'
      ? 'Recommendation accepted. Remaining plan updated if an allocation change was proposed.'
      : 'Recommendation rejected. Current plan preserved.';
    return true;
  }

  function saveCheckpoint(taskId: string, lastCompleted: string, blocker: string, nextAction: string) {
    if (!nextAction.trim() || !state.tasks.some((task) => task.id === taskId)) return;
    const saved = commit({ ...state, tasks: state.tasks.map((task) => task.id === taskId ? {
      ...task, checkpoint: {
        lastCompleted: lastCompleted.trim().slice(0, 350),
        blocker: blocker.trim().slice(0, 350),
        nextAction: nextAction.trim().slice(0, 350),
        updatedAt: Date.now()
      }
    } : task) });
    if (saved) checkpointPromptId = null;
  }

  function acceptReplan() {
    const suggestion = replanProposal;
    commit({ ...state, plans: { ...state.plans, [dayKey]: {
      ...plan, revision: {
        reason: suggestion.reason,
        remainingAllocations: { ...suggestion.allocations },
        recordedAtAcceptanceMs: recordedMs,
        acceptedAt: Date.now()
      }
    } } });
  }

  async function logManualWork(taskId: string | null, time: string, durationMinutes: number): Promise<boolean> {
    manualError = '';
    if (taskId !== null && !state.tasks.some((task) => task.id === taskId)) {
      manualError = 'Select a valid task.'; return false;
    }
    if (!/^\\d{2}:\\d{2}$/.test(time) || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 720) {
      manualError = 'Enter a valid start time and duration (1–720 minutes).'; return false;
    }
    const startedAt = new Date(dayKey + 'T' + time + ':00').getTime();
    const endedAt = startedAt + durationMinutes * 60_000;
    if (!Number.isFinite(startedAt) || localDayKey(startedAt) !== dayKey || localDayKey(endedAt) !== dayKey) {
      manualError = 'Manual entries must fit within the selected day.'; return false;
    }
    // Refresh persisted work immediately before overlap validation. A separate Pomodoro tab
    // may have completed a session since this view last rendered.
    const latestSessions = await loadFocusSessions();
    const latestState = readExecutionState();
    const existing = [
      ...latestSessions.map((session) => ({ startedAt: session.startedAt, endedAt: session.endedAt })),
      ...latestState.manualEntries
    ];
    if (overlapsExistingWork(startedAt, endedAt, existing)) {
      manualError = 'Overlapping work interval. Existing time cannot be counted twice.'; return false;
    }
    const entry = { id: crypto.randomUUID(), taskId, startedAt, endedAt };
    return commit({ ...latestState, manualEntries: [...latestState.manualEntries, entry] });
  }

  function setGoal(goal: string, successCriteria: string) {
    if (!goal.trim()) return;
    commit({ ...state, goal: goal.trim().slice(0, 120), successCriteria: successCriteria.trim().slice(0, 240) });
  }

  function setMode(mode: CapacityMode) {
    if (!(mode in CAPACITY_PRESETS)) return;
    commit({ ...state, plans: { ...state.plans, [dayKey]: makePlan(dayKey, mode) } });
  }

  function setAllocation(workstream: Workstream, minutes: number) {
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 720 || !(workstream in CAPACITY_PRESETS.medium)) return;
    commit({ ...state, plans: { ...state.plans, [dayKey]: { ...plan, revision: undefined, allocations: { ...plan.allocations, [workstream]: Math.round(minutes) } } } });
  }

  function addTask(title: string, nextAction: string, workstream: Workstream, impact: Impact, estimateMinutes: number, dueDate = '') {
    if (!title.trim() || !nextAction.trim() || !Number.isFinite(estimateMinutes) || estimateMinutes <= 0) return;
    if (!(workstream in CAPACITY_PRESETS.medium) || !['high', 'medium', 'low'].includes(impact)) return;
    const task: ExecutionTask = {
      id: crypto.randomUUID(), title: title.trim().slice(0, 120), nextAction: nextAction.trim().slice(0, 240),
      workstream, impact, estimateMinutes: Math.min(720, Math.round(estimateMinutes)),
      dueDate: dueDate || undefined, status: 'ready', createdAt: Date.now()
    };
    commit({ ...state, tasks: [...state.tasks, task] });
  }

  function updateTask(id: string, title: string, nextAction: string, workstream: Workstream, impact: Impact, estimateMinutes: number, dueDate = '') {
    if (!title.trim() || !nextAction.trim() || !Number.isFinite(estimateMinutes) || estimateMinutes < 1 || estimateMinutes > 720) return;
    if (!(workstream in CAPACITY_PRESETS.medium) || !['high', 'medium', 'low'].includes(impact)) return;
    commit({ ...state, tasks: state.tasks.map((t) => t.id === id && t.status !== 'done' ? {
      ...t, title: title.trim().slice(0, 120), nextAction: nextAction.trim().slice(0, 240),
      workstream, impact, estimateMinutes: Math.round(estimateMinutes), dueDate: dueDate || undefined
    } : t) });
  }

  function setTaskStatus(id: string, status: TaskStatus) {
    if (status === 'done') return;
    commit({ ...state, tasks: state.tasks.map((t) => t.id === id ? { ...t, status } : t) });
  }

  function completeTask(id: string, outcome: string, evidenceUrl = '') {
    if (!outcome.trim()) return;
    commit({ ...state, tasks: state.tasks.map((t) => t.id === id ? {
      ...t, status: 'done', outcome: outcome.trim().slice(0, 1000), evidenceUrl: evidenceUrl.trim().slice(0, 400) || undefined, completedAt: Date.now()
    } : t) });
  }

  function openFocus(task: ExecutionTask) {
    if (task.status !== 'ready') return;
    try {
      writePendingFocusTask({ id: task.id, title: task.title });
      window.location.assign('/pomodoro?taskId=' + encodeURIComponent(task.id));
    } catch {
      error = 'Unable to open Pomodoro. Check browser storage permissions.';
    }
  }

  async function assignSession(sessionId: string, taskId: string | null) {
    if (taskId !== null && !state.tasks.some((t) => t.id === taskId)) return;
    try {
      await assignFocusSession(sessionId, taskId);
      await refreshSessions();
      error = '';
    } catch { error = 'Unable to assign this session.'; }
  }

  function saveReflection(value: WeeklyReflection) {
    commit({ ...state, reflections: { ...state.reflections, [weekStart]: value } });
  }

  function focusMsForTask(id: string) {
    return sessions.filter((s) => s.taskId === id).reduce((sum, s) => sum + s.actualDurationMs, 0);
  }

  function workMsForWorkstream(workstream: Workstream) {
    const focus = focusMsForWorkstream(workstream);
    const ids = new Set(state.tasks.filter((task) => task.workstream === workstream).map((task) => task.id));
    const manual = state.manualEntries.filter((entry) => localDayKey(entry.endedAt) === dayKey && !!entry.taskId && ids.has(entry.taskId))
      .reduce((sum, entry) => sum + entry.endedAt - entry.startedAt, 0);
    return focus + manual;
  }

  function focusMsForWorkstream(workstream: Workstream) {
    const ids = new Set(state.tasks.filter((t) => t.workstream === workstream).map((t) => t.id));
    return sessions.filter((s) => localDayKey(s.endedAt) === dayKey && s.taskId && ids.has(s.taskId))
      .reduce((sum, s) => sum + s.actualDurationMs, 0);
  }

  onMount(() => {
    state = readExecutionState();
    const requested = new URLSearchParams(window.location.search).get('checkpointTaskId');
    if (requested && state.tasks.some((task) => task.id === requested)) checkpointPromptId = requested;
    dayKey = localDayKey(Date.now());
    weekStart = weekKey(Date.now());
    loading = false;
    void refreshSessions();
    void refreshEvidence();
    const unsubscribeEvidence = subscribeEvidence(() => void refreshEvidence());
    const unsubscribe = subscribeFocusSessions(() => void refreshSessions());
    const syncPlans = (event: StorageEvent) => {
      if (event.key === 'modu-daily-execution-v1') state = readExecutionState();
    };
    window.addEventListener('storage', syncPlans);
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshSessions(); };
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(() => {
      const next = localDayKey(Date.now());
      if (next !== dayKey) { dayKey = next; weekStart = weekKey(Date.now()); void refreshSessions(); }
    }, 60_000);
    return () => { unsubscribeEvidence(); unsubscribe(); window.removeEventListener('storage', syncPlans); document.removeEventListener('visibilitychange', onVisible); window.clearInterval(interval); };
  });

  return {
    get state() { return state; },
    get sessions() { return sessions; },
    get evidenceRecords() { return evidenceRecords; },
    get combinedEvidence() { return combinedEvidence; },
    get weeklyInsight() { return weeklyInsight; },
    get habitProgress() { return habitProgress; },
    get intelligenceNotice() { return intelligenceNotice; },
    get reviewSubview() { return reviewSubview; },
    set reviewSubview(value: 'summary'|'intelligence'|'evidence'|'sources') { reviewSubview = value; },
    get view() { return view; },
    set view(value: 'today' | 'priorities' | 'review') { view = value; },
    get dayKey() { return dayKey; },
    get weekStart() { return weekStart; },
    get plan(): DailyPlan { return plan; },
    get plannedMinutes() { return plannedMinutes(plan); },
    get recordedMs() { return recordedMs; },
    get focusRecordedMs() { return focusRecordedMs; },
    get manualRecordedMs() { return manualRecordedMs; },
    get replanProposal() { return replanProposal; },
    get manualError() { return manualError; },
    get checkpointPromptId() { return checkpointPromptId; },
    set checkpointPromptId(value: string | null) { checkpointPromptId = value; },
    get queue() { return queue; },
    get recommendation() { return recommendation; },
    get loading() { return loading; },
    get error() { return error; },
    setGoal, setMode, setAllocation, addTask, updateTask, setTaskStatus, completeTask,
    openFocus, assignSession, saveReflection, refreshSessions, focusMsForTask, focusMsForWorkstream, workMsForWorkstream,
    saveCheckpoint, acceptReplan, logManualWork,
    intelligenceSnapshot, refreshEvidence, addEvidence, archiveEvidence, restoreEvidence, importEvidence, updateHabitTarget, decideRecommendation,
    minutesLabel
  };
}

export type DailyExecutionController = ReturnType<typeof createDailyExecutionController>;
