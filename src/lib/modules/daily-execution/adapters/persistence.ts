import { emptyExecutionState, type ExecutionState, type ExecutionTask, type ManualWorkEntry } from '../core/planning.ts';
import { isSourceReference, isSourceCandidate, isSourceConnection, sourceIdentity } from '../core/connected-activities.ts';
const KEY = 'modu-daily-execution-v1';
export const DAILY_STORAGE_KEY = KEY;

export class DailyStorageConflictError extends Error {
  constructor() { super('Daily was modified in another tab.'); this.name = 'DailyStorageConflictError'; }
}

/** Strict read for the interactive controller: never turn unreadable user data into an empty writable state. */
export function readExecutionSnapshot(): { state: ExecutionState; raw: string | null } {
  if (typeof localStorage === 'undefined') throw new Error('Local storage unavailable.');
  const raw = localStorage.getItem(KEY);
  if (raw !== null) {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid Daily record.');
    }
    const candidate = parsed as Partial<ExecutionState>;
    if (candidate.tasks !== undefined && (
      !Array.isArray(candidate.tasks) || candidate.tasks.some(task =>
        !task || typeof task.id !== 'string' || typeof task.title !== 'string' ||
        typeof task.nextAction !== 'string' || typeof task.workstream !== 'string' ||
        !['ready', 'blocked', 'done', 'archived'].includes(task.status)
      )
    )) throw new Error('Invalid Daily tasks. Original data has been preserved.');
    if (candidate.tasks?.some(task => task.source !== undefined && !isSourceReference(task.source))) {
      throw new Error('Invalid linked activity. Original data has been preserved.');
    }
    if (candidate.sourceConnections !== undefined &&
      (!Array.isArray(candidate.sourceConnections) || candidate.sourceConnections.some(v=>!isSourceConnection(v)))) {
      throw new Error('Invalid source connection. Original data has been preserved.');
    }
    if (candidate.sourceItems !== undefined &&
      (!Array.isArray(candidate.sourceItems) || candidate.sourceItems.some(v=>!isSourceCandidate(v)))) {
      throw new Error('Invalid source candidates. Original data has been preserved.');
    }
    if (candidate.days !== undefined && (
      !candidate.days || typeof candidate.days !== 'object' || Array.isArray(candidate.days)
    )) throw new Error('Invalid dated selections.');
  }
  return { state: parseExecutionState(raw), raw };
}

/** Best-effort optimistic cross-tab guard. localStorage has no atomic compare-and-swap. */
export function saveExecutionStateIfCurrent(value: ExecutionState, expectedRaw: string | null): string {
  if (typeof localStorage === 'undefined') throw new Error('Local storage unavailable.');
  if (localStorage.getItem(KEY) !== expectedRaw) throw new DailyStorageConflictError();
  const raw = JSON.stringify(value);
  localStorage.setItem(KEY, raw);
  return raw;
}


function parseExecutionState(rawSnapshot: string | null): ExecutionState {
    const parsed: unknown = JSON.parse(rawSnapshot ?? 'null');
    if (!parsed || typeof parsed !== 'object') return emptyExecutionState();
    const raw = parsed as Partial<ExecutionState>;
    const validTasks = Array.isArray(raw.tasks) ? raw.tasks.filter((task): task is ExecutionTask =>
      !!task && typeof task.id === 'string' && typeof task.title === 'string' &&
      typeof task.nextAction === 'string' && typeof task.workstream === 'string' &&
      ['ready', 'blocked', 'done', 'archived'].includes(task.status)
    ) : [];
    const seenRefs=new Set<string>();
    for(const task of validTasks){
      if(!task.source)continue;
      const key=sourceIdentity(task.source);
      if(seenRefs.has(key))throw new Error('Duplicate source identity.');
      seenRefs.add(key);
    }
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
    const sourceConnections = Array.isArray(raw.sourceConnections)
      ? raw.sourceConnections.filter(isSourceConnection).slice(0,30) : [];
    const knownConnections = new Set(sourceConnections.map(c=>c.id));
    const sourceItems = Array.isArray(raw.sourceItems)
      ? [...new Map(raw.sourceItems.filter(isSourceCandidate)
        .filter(item=>knownConnections.has(item.source.connectionId))
        .slice(0,1500).map(item=>[sourceIdentity(item.source),item])).values()]
      : [];
    return {
      days, dayNotes, sourceConnections, sourceItems,
      goal: typeof raw.goal === 'string' ? raw.goal : '',
      successCriteria: typeof raw.successCriteria === 'string' ? raw.successCriteria : '',
      tasks: validTasks,
      plans: raw.plans && typeof raw.plans === 'object'
        ? Object.fromEntries(Object.entries(raw.plans).filter(([, plan]) => !!plan && typeof plan === 'object' && !!plan.allocations)
          .map(([date, plan]) => [date, {
            ...plan,
            allocations: { ...plan.allocations, general: plan.allocations.general ?? 0 },
            ...(plan.revision ? { revision: {
              ...plan.revision,
              remainingAllocations: { ...plan.revision.remainingAllocations, general: plan.revision.remainingAllocations.general ?? 0 }
            } } : {})
          }]))
        : {},
      reflections: raw.reflections && typeof raw.reflections === 'object' ? raw.reflections : {},
      manualEntries: Array.isArray(raw.manualEntries) ? raw.manualEntries.filter((entry): entry is ManualWorkEntry => !!entry && typeof entry.id === 'string' && (entry.taskId === null || typeof entry.taskId === 'string') && Number.isFinite(entry.startedAt) && Number.isFinite(entry.endedAt) && entry.endedAt > entry.startedAt) : [],
      habit: raw.habit && typeof raw.habit === 'object' &&
        typeof raw.habit.name === 'string' && Array.isArray(raw.habit.qualifyingWorkstreams) &&
        Number.isFinite(raw.habit.targetDaysPerWeek) && Number.isFinite(raw.habit.minimumSessionMinutes)
        ? {
            id: typeof raw.habit.id === 'string' ? raw.habit.id.slice(0,80) : 'optional-routine', name: raw.habit.name.slice(0, 80),
            qualifyingWorkstreams: raw.habit.qualifyingWorkstreams.filter((x): x is 'build' | 'interview' | 'apply' | 'english' | 'review' =>
              ['build','interview','apply','english','review'].includes(x)).slice(0,5),
            targetDaysPerWeek: Math.max(1,Math.min(7,Math.round(raw.habit.targetDaysPerWeek))),
            minimumSessionMinutes: Math.max(1,Math.min(120,Math.round(raw.habit.minimumSessionMinutes)))
          } : emptyExecutionState().habit,
      recommendationDecisions: Array.isArray(raw.recommendationDecisions) ?
        raw.recommendationDecisions.filter((x): x is {id:string;status:'accepted'|'rejected';decidedAt:number} =>
          !!x && typeof x.id === 'string' && ['accepted','rejected'].includes(x.status) && Number.isFinite(x.decidedAt)).slice(-200) : []
    };
}

export function readExecutionState(rawSnapshot?: string | null): ExecutionState {
  if (typeof localStorage === 'undefined') return emptyExecutionState();
  try {
    return parseExecutionState(rawSnapshot === undefined ? localStorage.getItem(KEY) : rawSnapshot);
  } catch { return emptyExecutionState(); }
}

export function saveExecutionState(value: ExecutionState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(value));
}
