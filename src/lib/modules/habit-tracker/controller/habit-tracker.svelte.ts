import { onMount } from 'svelte';
import type {
  DailyOutcome, HabitCheckin, HabitDefinition, GoalPolicy, LocalDate, WeeklyOutcome
} from '../core/types.ts';
import type { HabitSetup, CheckinCommand } from '../core/progress.ts';
import { evaluateDailyOutcome, evaluateWeeklyQuotaByRevisions } from '../core/evaluation.ts';
import { addCalendarDays, isHabitActiveOn, isLocalDate, resolveEffectivePolicy } from '../core/scheduling.ts';
import {
  createConfiguredHabit, deleteHabit, loadHabitSnapshot, updateHabitConfiguration,
  mutateHabitCheckin, setHabitArchived, subscribeHabitChanges
} from '../adapters/persistence.ts';
import { browserLocalDate } from '../adapters/browser-date.ts';
import { createInsightSnapshot, summarizeCalendarDay } from '../core/insights.ts';

type HabitEditorState = { mode: 'create' | 'edit'; id?: string; title: string; policy?: GoalPolicy; direction?: HabitDefinition['direction'] };
export type PeriodHabit = {
  habit: HabitDefinition;
  policy: GoalPolicy;
  checkin?: HabitCheckin;
  outcome: DailyOutcome;
  completed: boolean;
  weekly?: { outcome: WeeklyOutcome; completedDays: number; requiredDays: number };
};
export type CommitRefreshResult = 'refreshed' | 'committed-refresh-failed';

export async function commitThenRefresh(
  write: () => Promise<void>,
  refresh: () => Promise<boolean>
): Promise<CommitRefreshResult> {
  await write();
  try {
    return await refresh() ? 'refreshed' : 'committed-refresh-failed';
  } catch {
    return 'committed-refresh-failed';
  }
}

export function createHabitTrackerController() {
  let today = $state<LocalDate>('');
  let selectedDate = $state<LocalDate>('');
  let view = $state<'today' | 'history' | 'insights'>('today');
  let insightHabitId = $state('');
  let habits = $state<HabitDefinition[]>([]);
  let policies = $state<GoalPolicy[]>([]);
  let checkins = $state<HabitCheckin[]>([]);
  let loading = $state(true);
  let storageReady = $state(false);
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');
  let editor = $state<HabitEditorState | null>(null);
  let correction = $state<{ id: string; date: LocalDate } | null>(null);
  let confirmDeleteId = $state<string | null>(null);
  let readVersion = 0;
  let refreshQueued = false;

  function project(date: LocalDate, activeOnly: boolean): PeriodHabit[] {
    if (!date || !today || date > today) return [];
    return habits
      .filter(h => {
        const active = isHabitActiveOn(h, date);
        // Legacy M1 archives marked their first inactive day as the archive
        // day itself. Explicit completed records on that day remain visible.
        const legacyArchiveCheckin = !activeOnly && (h.inactiveRanges ?? [])
          .some(range => range.fromDate === date) &&
          checkins.some(c => c.habitId === h.id && c.localDate === date);
        return (active || legacyArchiveCheckin) && (!activeOnly || h.status === 'ACTIVE');
      })
      .map(h => {
        const policy = resolveEffectivePolicy(h.id, date, policies);
        const checkin = checkins.find(c => c.habitId === h.id && c.localDate === date);
        const outcome = evaluateDailyOutcome(h, policy, checkin, date, today);
        const weekly = policy.schedule.type === 'WEEKLY_QUOTA'
          ? evaluateWeeklyQuotaByRevisions(h, policy, policies, checkins, date, today)
          : undefined;
        return {
          habit: h, policy, checkin, outcome, weekly,
          completed: weekly ? weekly.outcome === 'MET' : outcome === 'MET'
        };
      })
      .filter(item => item.outcome !== 'NOT_SCHEDULED');
  }

  const todayHabits = $derived.by(() => project(today, true));
  const historyHabits = $derived.by(() => project(selectedDate, false));
  const archivedHabits = $derived(habits.filter(h => h.status === 'ARCHIVED'));
  const completedCount = $derived(todayHabits.filter(item => item.completed).length);
  const insights = $derived.by(() => today && storageReady
    ? createInsightSnapshot(habits, policies, checkins, today, insightHabitId || undefined)
    : null);
  const insightHabits = $derived([...habits].sort((a, b) => a.title.localeCompare(b.title)));

  function calendarDay(date: LocalDate, habitId?: string) {
    return summarizeCalendarDay(habits, policies, checkins, date, today, habitId);
  }
  function selectInsightHabit(id: string): void {
    insightHabitId = id;
  }

  async function reload(showLoading = false): Promise<boolean> {
    const version = ++readVersion;
    if (showLoading) loading = true;
    try {
      const snapshot = await loadHabitSnapshot();
      if (version !== readVersion) return false;
      habits = snapshot.habits;
      policies = snapshot.policies;
      checkins = snapshot.checkins;
      storageReady = true;
      error = '';
      return true;
    } catch {
      if (version !== readVersion) return false;
      storageReady = false;
      error = 'Habit data could not be safely loaded. Your stored records have not been overwritten.';
      return false;
    } finally {
      if (version === readVersion) loading = false;
    }
  }

  async function perform(operation: () => Promise<void>, message: string): Promise<boolean> {
    if (busy || !storageReady) return false;
    busy = true;
    error = '';
    notice = '';
    try {
      const result = await commitThenRefresh(operation, () => {
        refreshQueued = false;
        return reload();
      });
      if (result === 'committed-refresh-failed') {
        storageReady = false;
        error = 'Your change was saved, but fresh data could not be loaded. Retry loading; do not repeat the action.';
        return true;
      }
      notice = message;
      return true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not save your changes.';
      return false;
    } finally {
      busy = false;
      if (refreshQueued) {
        refreshQueued = false;
        if (storageReady) void reload();
      }
    }
  }

  function selectView(next: 'today' | 'history' | 'insights'): void {
    view = next;
    editor = null;
    correction = null;
    if (next === 'history' && !selectedDate && today) selectedDate = today;
  }
  function openHistoryAt(date: LocalDate): void {
    selectHistoryDate(date);
    if (selectedDate === date) {
      view = 'history';
      correction = null;
      editor = null;
    }
  }
  function selectHistoryDate(date: LocalDate): void {
    if (!isLocalDate(date) || !today || date > today) {
      error = 'Select a valid date no later than today.';
      return;
    }
    selectedDate = date;
    error = '';
  }
  function openCreate(): void {
    if (busy) return;
    error = '';
    confirmDeleteId = null;
    editor = { mode: 'create', title: '' };
  }
  function openEdit(id: string): void {
    const habit = habits.find(h => h.id === id);
    if (!habit || busy) return;
    error = '';
    confirmDeleteId = null;
    editor = { mode: 'edit', id, title: habit.title, direction: habit.direction,
      policy: resolveEffectivePolicy(id, today, policies) };
  }
  function closeEditor(): void { if (!busy) editor = null; }

  async function submitEditor(input: HabitSetup & { effectiveFromDate?: LocalDate; policyChanged?: boolean }): Promise<void> {
    const current = editor;
    if (!current || !today) return;
    const success = current.mode === 'create'
      ? await perform(() => createConfiguredHabit(input, today), 'Habit created.')
      : await perform(() => updateHabitConfiguration(current.id!, input.title, {
          target: input.measurement === 'AVOIDANCE' || input.measurement === 'BOOLEAN' ? 1 : input.target,
          schedule: input.schedule ?? { type: 'DAILY' },
          effectiveFromDate: input.effectiveFromDate ?? addCalendarDays(today, 1)
        }, today, input.policyChanged === true), input.policyChanged ? 'Habit updated. New policy begins on its effective date.' : 'Habit renamed.');
    if (success) editor = null;
  }
  function openCorrection(id: string, date: LocalDate): void {
    if (busy || date > today) return;
    const item = project(date, false).find(x => x.habit.id === id);
    if (!item || !isHabitActiveOn(item.habit, date)) return;
    error = '';
    correction = { id, date };
  }
  function closeCorrection(): void { if (!busy) correction = null; }

  async function recordProgress(id: string, date: LocalDate, command: CheckinCommand): Promise<boolean> {
    return perform(() => mutateHabitCheckin(id, date, command), 'Progress saved.');
  }
  async function submitCorrection(command: CheckinCommand): Promise<void> {
    const current = correction;
    if (!current) return;
    const success = await recordProgress(current.id, current.date, command);
    if (success) correction = null;
  }

  async function setCompleted(id: string, complete: boolean): Promise<void> {
    if (!today) return;
    await recordProgress(id, today, complete ? { type: 'set', value: 1 } : { type: 'clear' });
  }
  async function setArchived(id: string, archived: boolean): Promise<void> {
    if (!today) return;
    await perform(() => setHabitArchived(id, archived, today),
      archived ? 'Habit archived. Previous records are retained.' : 'Habit restored.');
  }
  async function confirmDelete(): Promise<void> {
    const id = confirmDeleteId;
    if (!id) return;
    const success = await perform(() => deleteHabit(id), 'Habit deleted.');
    if (success) confirmDeleteId = null;
  }

  onMount(() => {
    today = browserLocalDate();
    selectedDate = today;
    void reload(true);
    const unsubscribe = subscribeHabitChanges(() => {
      if (busy) refreshQueued = true;
      else void reload();
    });
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const currentDate = browserLocalDate();
      if (currentDate !== today) {
        const followingToday = selectedDate === today;
        today = currentDate;
        if (followingToday) selectedDate = currentDate;
      }
      if (busy) refreshQueued = true;
      else void reload();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      ++readVersion;
      unsubscribe();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  });

  return {
    get today() { return today; },
    get insights() { return insights; },
    get insightHabits() { return insightHabits; },
    get insightHabitId() { return insightHabitId; },
    get selectedDate() { return selectedDate; },
    get view() { return view; },
    get todayHabits() { return todayHabits; },
    get historyHabits() { return historyHabits; },
    get archivedHabits() { return archivedHabits; },
    get completedCount() { return completedCount; },
    get loading() { return loading; },
    get storageReady() { return storageReady; },
    get busy() { return busy; },
    get error() { return error; },
    get notice() { return notice; },
    get editor() { return editor; },
    get correction() { return correction; },
    get correctionItem() {
      if (!correction) return null;
      return project(correction.date, false).find(item => item.habit.id === correction!.id) ?? null;
    },
    get confirmDeleteId() { return confirmDeleteId; },
    openCreate, openEdit, closeEditor, submitEditor, setCompleted, setArchived, confirmDelete,
    selectView, selectHistoryDate, openHistoryAt, calendarDay, selectInsightHabit,
    recordProgress, openCorrection, closeCorrection, submitCorrection,
    requestDelete(id: string) { if (!busy) { confirmDeleteId = id; editor = null; correction = null; } },
    cancelDelete() { confirmDeleteId = null; },
    retry() { void reload(true); }
  };
}

export type HabitTrackerController = ReturnType<typeof createHabitTrackerController>;
