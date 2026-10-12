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
    const validIds = new Set(validTasks.map(task => task.id));
    const days = Object.fromEntries(Object.entries(raw.days && typeof raw.days === 'object' ? raw.days : {})
      .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .map(([date, value]) => {
        const source = value && typeof value === 'object' ? value as {taskIds?:unknown;selectedTaskId?:unknown} : {};
        const taskIds = [...new Set(Array.isArray(source.taskIds)
          ? source.taskIds.filter((id): id is string => typeof id==='string' && validIds.has(id)) : [])];
        return [date, {taskIds, selectedTaskId: typeof source.selectedTaskId==='string' && taskIds.includes(source.selectedTaskId) ? source.selectedTaskId : undefined}];
      }));
    const dayNotes = Object.fromEntries(Object.entries(raw.dayNotes && typeof raw.dayNotes === 'object' ? raw.dayNotes : {})
      .filter(([date, value]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && typeof value === 'string')
      .map(([date, value]) => [date, String(value).slice(0,1000)]));
    return {
      days, dayNotes,
      goal: typeof raw.goal === 'string' ? raw.goal : '',
      successCriteria: typeof raw.successCriteria === 'string' ? raw.successCriteria : '',
      tasks: validTasks,
      plans: raw.plans && typeof raw.plans === 'object' ? raw.plans : {},
      reflections: raw.reflections && typeof raw.reflections === 'object' ? raw.reflections : {},
      manualEntries: Array.isArray(raw.manualEntries) ? raw.manualEntries.filter((entry): entry is ManualWorkEntry => !!entry && typeof entry.id === 'string' && (entry.taskId === null || typeof entry.taskId === 'string') && Number.isFinite(entry.startedAt) && Number.isFinite(entry.endedAt) && entry.endedAt > entry.startedAt) : [],
      habit: raw.habit && typeof raw.habit === 'object' &&
        typeof raw.habit.name === 'string' && Array.isArray(raw.habit.qualifyingWorkstreams) &&
        Number.isFinite(raw.habit.targetDaysPerWeek) && Number.isFinite(raw.habit.minimumSessionMinutes)
        ? {
            id: 'technical-practice', name: raw.habit.name.slice(0, 80),
            qualifyingWorkstreams: raw.habit.qualifyingWorkstreams.filter((x): x is 'build' | 'interview' | 'apply' | 'english' | 'review' =>
              ['build','interview','apply','english','review'].includes(x)).slice(0,5),
            targetDaysPerWeek: Math.max(1,Math.min(7,Math.round(raw.habit.targetDaysPerWeek))),
            minimumSessionMinutes: Math.max(1,Math.min(120,Math.round(raw.habit.minimumSessionMinutes)))
          } : emptyExecutionState().habit,
      recommendationDecisions: Array.isArray(raw.recommendationDecisions) ?
        raw.recommendationDecisions.filter((x): x is {id:string;status:'accepted'|'rejected';decidedAt:number} =>
          !!x && typeof x.id === 'string' && ['accepted','rejected'].includes(x.status) && Number.isFinite(x.decidedAt)).slice(-200) : []
    };
  } catch { return emptyExecutionState(); }
}

export function saveExecutionState(value: ExecutionState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(value));
}
