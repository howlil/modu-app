import type { FocusTaskContext } from './types.ts';
const KEY = 'modu:pending-focus-task';

export function writePendingFocusTask(task: FocusTaskContext): void {
  if (typeof sessionStorage === 'undefined') throw new Error('Session storage unavailable for task handoff.');
  sessionStorage.setItem(KEY, JSON.stringify(task));
}

/** A pending task may be linked only when an idle focus timer can accept it. */
export function canAcceptPendingFocusTask(
  task: FocusTaskContext | null, mode: string, status: string
): task is FocusTaskContext {
  return task !== null && mode === 'focus' && status === 'idle';
}

export function consumePendingFocusTask(expectedId: string): FocusTaskContext | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const task = value as Partial<FocusTaskContext>;
    if (task.id !== expectedId || typeof task.title !== 'string' || task.title.length > 120) return null;
    return { id: task.id, title: task.title, ...(typeof task.nextAction === 'string' ? { nextAction: task.nextAction.slice(0, 240) } : {}),
      ...(task.autoStart === true ? { autoStart: true } : {}) };
  } catch { return null; }
}
