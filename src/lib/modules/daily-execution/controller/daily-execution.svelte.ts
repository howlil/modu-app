import { onMount } from 'svelte';
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

  function saveCheckpoint(taskId: string, lastCompleted: string, blocker: string, nextAction: string) {
    if (!nextAction.trim() || !state.tasks.some((task) => task.id === taskId)) return;
    commit({ ...state, tasks: state.tasks.map((task) => task.id === taskId ? {
      ...task, checkpoint: {
        lastCompleted: lastCompleted.trim().slice(0, 350),
        blocker: blocker.trim().slice(0, 350),
        nextAction: nextAction.trim().slice(0, 350),
        updatedAt: Date.now()
      }
    } : task) });
    checkpointPromptId = null;
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

  function logManualWork(taskId: string | null, time: string, durationMinutes: number): boolean {
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
    const existing = [
      ...sessions.map((session) => ({ startedAt: session.startedAt, endedAt: session.endedAt })),
      ...state.manualEntries
    ];
    if (overlapsExistingWork(startedAt, endedAt, existing)) {
      manualError = 'Overlapping work interval. Existing time cannot be counted twice.'; return false;
    }
    const entry = { id: crypto.randomUUID(), taskId, startedAt, endedAt };
    return commit({ ...state, manualEntries: [...state.manualEntries, entry] });
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
    const unsubscribe = subscribeFocusSessions(() => void refreshSessions());
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshSessions(); };
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(() => {
      const next = localDayKey(Date.now());
      if (next !== dayKey) { dayKey = next; weekStart = weekKey(Date.now()); void refreshSessions(); }
    }, 60_000);
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', onVisible); window.clearInterval(interval); };
  });

  return {
    get state() { return state; },
    get sessions() { return sessions; },
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
    minutesLabel
  };
}

export type DailyExecutionController = ReturnType<typeof createDailyExecutionController>;
