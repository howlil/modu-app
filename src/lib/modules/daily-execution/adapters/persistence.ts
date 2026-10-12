import { emptyExecutionState, type ExecutionState, type ExecutionTask, type ManualWorkEntry } from '../core/planning.ts';
const KEY = 'modu-daily-execution-v1';

export function readExecutionState(): ExecutionState {
  if (typeof localStorage === 'undefined') return emptyExecutionState();
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return emptyExecutionState();
    const raw = parsed as Partial<ExecutionState>;
    const validTasks = Array.isArray(raw.tasks) ? raw.tasks.filter((task): task is ExecutionTask =>
      !!task && typeof task.id === 'string' && typeof task.title === 'string' &&
      typeof task.nextAction === 'string' && typeof task.workstream === 'string' &&
      ['ready', 'blocked', 'done', 'archived'].includes(task.status)
    ) : [];
    return {
      goal: typeof raw.goal === 'string' ? raw.goal : '',
      successCriteria: typeof raw.successCriteria === 'string' ? raw.successCriteria : '',
      tasks: validTasks,
      plans: raw.plans && typeof raw.plans === 'object' ? raw.plans : {},
      reflections: raw.reflections && typeof raw.reflections === 'object' ? raw.reflections : {},
      manualEntries: Array.isArray(raw.manualEntries) ? raw.manualEntries.filter((entry): entry is ManualWorkEntry => !!entry && typeof entry.id === 'string' && (entry.taskId === null || typeof entry.taskId === 'string') && Number.isFinite(entry.startedAt) && Number.isFinite(entry.endedAt) && entry.endedAt > entry.startedAt) : []
    };
  } catch { return emptyExecutionState(); }
}

export function saveExecutionState(value: ExecutionState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(value));
}
