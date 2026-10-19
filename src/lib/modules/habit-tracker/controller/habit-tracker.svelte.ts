import { onMount } from 'svelte';
import type { HabitCheckin, HabitDefinition, GoalPolicy, LocalDate } from '../core/types.ts';
import { evaluateDailyOutcome } from '../core/evaluation.ts';
import { isHabitActiveOn, resolveEffectivePolicy } from '../core/scheduling.ts';
import {
  changeHabitTitle, createDailyHabit, deleteHabit, loadHabitSnapshot,
  setDailyCompleted, setHabitArchived, subscribeHabitChanges
} from '../adapters/persistence.ts';
import { browserLocalDate } from '../adapters/browser-date.ts';

type HabitEditorState = { mode: 'create' | 'edit'; id?: string; title: string };
export type TodayHabit = { habit: HabitDefinition; completed: boolean };

export function createHabitTrackerController() {
  let today = $state<LocalDate>('');
  let habits = $state<HabitDefinition[]>([]);
  let policies = $state<GoalPolicy[]>([]);
  let checkins = $state<HabitCheckin[]>([]);
  let loading = $state(true);
  let storageReady = $state(false);
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');
  let editor = $state<HabitEditorState | null>(null);
  let confirmDeleteId = $state<string | null>(null);
  let readVersion = 0;

  const todayHabits = $derived.by<TodayHabit[]>(() => {
    if (!today) return [];
    return habits.filter(h => h.status === 'ACTIVE' && isHabitActiveOn(h, today))
      .map(h => {
        const policy = resolveEffectivePolicy(h.id, today, policies);
        const entry = checkins.find(c => c.habitId === h.id && c.localDate === today);
        return {
          habit: h,
          completed: evaluateDailyOutcome(h, policy, entry, today, today) === 'MET'
        };
      });
  });
  const archivedHabits = $derived(habits.filter(h => h.status === 'ARCHIVED'));
  const completedCount = $derived(todayHabits.filter(entry => entry.completed).length);

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
      await operation();
      const loaded = await reload();
      if (!loaded) return false;
      notice = message;
      return true;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not save your changes.';
      return false;
    } finally { busy = false; }
  }

  function openCreate(): void { confirmDeleteId = null; editor = { mode: 'create', title: '' }; }
  function openEdit(id: string): void {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;
    confirmDeleteId = null;
    editor = { mode: 'edit', id, title: habit.title };
  }
  function closeEditor(): void { if (!busy) editor = null; }

  async function submitEditor(title: string): Promise<void> {
    const current = editor;
    if (!current || !today) return;
    const success = current.mode === 'create'
      ? await perform(() => createDailyHabit(title, today), 'Habit created.')
      : await perform(() => changeHabitTitle(current.id!, title), 'Habit updated.');
    if (success) editor = null;
  }

  async function setCompleted(id: string, complete: boolean): Promise<void> {
    if (!today) return;
    await perform(() => setDailyCompleted(id, today, complete),
      complete ? 'Habit completed.' : 'Check-in cleared.');
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
    void reload(true);
    const unsubscribe = subscribeHabitChanges(() => {
      if (!busy) void reload();
    });
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const currentDate = browserLocalDate();
      if (currentDate !== today) today = currentDate;
      if (!busy) void reload();
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
    get todayHabits() { return todayHabits; },
    get archivedHabits() { return archivedHabits; },
    get completedCount() { return completedCount; },
    get loading() { return loading; },
    get storageReady() { return storageReady; },
    get busy() { return busy; },
    get error() { return error; },
    get notice() { return notice; },
    get editor() { return editor; },
    get confirmDeleteId() { return confirmDeleteId; },
    openCreate, openEdit, closeEditor, submitEditor, setCompleted, setArchived, confirmDelete,
    requestDelete(id: string) { confirmDeleteId = id; editor = null; },
    cancelDelete() { confirmDeleteId = null; },
    retry() { void reload(true); }
  };
}

export type HabitTrackerController = ReturnType<typeof createHabitTrackerController>;
