import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  completeSimply, currentForDay, emptyExecutionState, moveForDay, reopenSimply,
  selectForDay, setNextForDay, tasksForDay, unfinishedFromYesterday,
  type ExecutionTask
} from '../../src/lib/modules/daily-execution/core/planning.ts';
import { readExecutionSnapshot, saveExecutionStateIfCurrent } from '../../src/lib/modules/daily-execution/adapters/persistence.ts';
import { canAcceptPendingFocusTask, consumePendingFocusTask, writePendingFocusTask } from '../../src/lib/shared/focus-sessions/context.ts';

const firstDay = '2026-10-13';
function activity(id: string, title: string): ExecutionTask {
  return {
    id, title, nextAction: '', workstream: 'general', impact: 'medium',
    estimateMinutes: 0, createdAt: 1, status: 'ready'
  };
}
function storage() {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  const adapter = (values: Map<string, string>) => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  });
  vi.stubGlobal('localStorage', adapter(local));
  vi.stubGlobal('sessionStorage', adapter(session));
  return { local, session };
}
afterEach(() => vi.unstubAllGlobals());

describe('Daily M2.3 core user journey acceptance', () => {
  it('first-time capture -> Today -> complete -> reload -> next-day reset', () => {
    storage();
    const fresh = readExecutionSnapshot();
    expect(fresh.state.tasks).toHaveLength(0);
    expect(fresh.state.goal).toBe('');

    const newTask = activity('electricity', 'Pay electricity bill');
    const planned = selectForDay({
      ...fresh.state, tasks: [newTask]
    }, newTask.id, firstDay);
    saveExecutionStateIfCurrent(planned, fresh.raw);

    const restored = readExecutionSnapshot();
    expect(restored.state.tasks).toHaveLength(1);
    expect(restored.state.tasks[0]).toMatchObject({
      id: 'electricity', title: 'Pay electricity bill', nextAction: '', estimateMinutes: 0
    });
    expect(currentForDay(restored.state, firstDay)?.id).toBe('electricity');

    const finished = completeSimply(restored.state, newTask.id, 1760342400000);
    saveExecutionStateIfCurrent(finished, restored.raw);
    const afterReload = readExecutionSnapshot().state;
    expect(tasksForDay(afterReload, firstDay).filter(task => task.status === 'done')).toHaveLength(1);
    expect(currentForDay(afterReload, firstDay)).toBeNull();
    expect(tasksForDay(afterReload, '2026-10-14')).toEqual([]);
    expect(afterReload.tasks).toHaveLength(1);
  });

  it('pull existing activities -> choose next -> arrange -> focus handoff without auto-completion', () => {
    storage();
    const initial = { ...emptyExecutionState(), tasks: [
      activity('books', 'Read a book'), activity('run', 'Go for a run'), activity('food', 'Buy groceries')
    ] };
    const selected = setNextForDay(
      selectForDay(selectForDay(initial, 'books', firstDay), 'run', firstDay),
      'run', firstDay
    );
    const ordered = moveForDay(selected, 'run', firstDay, -1);
    expect(tasksForDay(ordered, firstDay).map(task => task.id)).toEqual(['run', 'books']);
    expect(currentForDay(ordered, firstDay)?.id).toBe('run');
    expect(ordered.tasks).toHaveLength(3);

    writePendingFocusTask({ id: 'run', title: 'Go for a run', autoStart: true });
    const handoff = consumePendingFocusTask('run');
    expect(handoff).toMatchObject({ id: 'run', autoStart: true });
    expect(canAcceptPendingFocusTask(handoff, 'focus', 'idle')).toBe(true);
    expect(canAcceptPendingFocusTask(handoff, 'focus', 'running')).toBe(false);
    expect(consumePendingFocusTask('run')).toBeNull();
    expect(ordered.tasks.find(task => task.id === 'run')?.status).toBe('ready');
  });

  it('does not carry yesterday automatically and never duplicates an already selected activity', () => {
    let state = { ...emptyExecutionState(), tasks: [
      activity('a', 'Visit family'), activity('b', 'Read')
    ] };
    state = selectForDay(selectForDay(state, 'a', '2026-10-12'), 'b', '2026-10-12');
    expect(unfinishedFromYesterday(state, firstDay).map(task => task.id)).toEqual(['a', 'b']);
    expect(tasksForDay(state, firstDay)).toEqual([]);

    state = selectForDay(state, 'a', firstDay);
    expect(unfinishedFromYesterday(state, firstDay).map(task => task.id)).toEqual(['b']);
    state = selectForDay(state, 'a', firstDay);
    expect(tasksForDay(state, firstDay).map(task => task.id)).toEqual(['a']);
    expect(tasksForDay(state, '2026-10-12')).toHaveLength(2);
    expect(reopenSimply(completeSimply(state, 'a', 123), 'a').tasks.find(t => t.id === 'a')?.status).toBe('ready');
  });
});
