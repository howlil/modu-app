import type { HabitDefinition } from './consistency.ts';
import type { RecommendationDecision } from './recommendations.ts';
import type { SourceReference, SourceConnection, SourceCandidate } from './connected-activities.ts';

export type CapacityMode = 'low' | 'medium' | 'high';
export type Workstream = 'build' | 'interview' | 'apply' | 'english' | 'review' | 'general';
export type Impact = 'high' | 'medium' | 'low';
export type TaskStatus = 'ready' | 'blocked' | 'done' | 'archived';

export const WORKSTREAM_NAMES: Record<Workstream, string> = {
  build: 'Project work',
  interview: 'Technical practice',
  apply: 'Job acquisition',
  english: 'Communication',
  review: 'Review',
  general: 'Uncategorized'
};

export const CAPACITY_PRESETS: Record<CapacityMode, Record<Workstream, number>> = {
  low: { build: 150, interview: 90, apply: 60, english: 30, review: 30, general: 0 },
  medium: { build: 210, interview: 120, apply: 60, english: 60, review: 30, general: 0 },
  high: { build: 360, interview: 180, apply: 90, english: 60, review: 30, general: 0 }
};

export interface TaskCheckpoint {
  lastCompleted: string;
  blocker: string;
  nextAction: string;
  updatedAt: number;
}
export interface ManualWorkEntry {
  id: string;
  taskId: string | null;
  startedAt: number;
  endedAt: number;
}

export interface ExecutionTask {
  id: string;
  title: string;
  nextAction: string;
  workstream: Workstream;
  impact: Impact;
  estimateMinutes: number;
  dueDate?: string;
  status: TaskStatus;
  outcome?: string;
  evidenceUrl?: string;
  completedAt?: number;
  checkpoint?: TaskCheckpoint;
  createdAt: number;
  context?: string;
  source?: SourceReference;
}

export interface PlanRevision {
  reason: string;
  remainingAllocations: Record<Workstream, number>;
  recordedAtAcceptanceMs: number;
  acceptedAt: number;
}
export interface DailyPlan {
  dateKey: string;
  mode: CapacityMode;
  allocations: Record<Workstream, number>;
  revision?: PlanRevision;
}

export interface WeeklyReflection {
  outcome: string;
  bottleneck: string;
  nextPriority: string;
}

export interface DaySelection {taskIds: string[]; selectedTaskId?: string}
export interface ExecutionState {
  sourceConnections: SourceConnection[];
  sourceItems: SourceCandidate[];
  days: Record<string,DaySelection>;
  dayNotes: Record<string,string>;
  goal: string;
  successCriteria: string;
  tasks: ExecutionTask[];
  plans: Record<string, DailyPlan>;
  reflections: Record<string, WeeklyReflection>;
  manualEntries: ManualWorkEntry[];
  habit: HabitDefinition;
  recommendationDecisions: RecommendationDecision[];
}

export function emptyExecutionState(): ExecutionState {
  return { goal: '', successCriteria: '', tasks: [], sourceConnections: [], sourceItems: [], days: {}, dayNotes: {}, plans: {}, reflections: {}, manualEntries: [], habit: { id: 'optional-routine', name: 'Optional routine', qualifyingWorkstreams: [], targetDaysPerWeek: 3, minimumSessionMinutes: 15 }, recommendationDecisions: [] };
}

export function localDayKey(now: number): string {
  const d = new Date(now);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

export function weekKey(now: number): string {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localDayKey(date.getTime());
}

export function makePlan(dateKey: string, mode: CapacityMode): DailyPlan {
  return { dateKey, mode, allocations: { ...CAPACITY_PRESETS[mode] } };
}

export function plannedMinutes(plan: DailyPlan): number {
  return Object.values(plan.allocations).reduce((sum, n) => sum + Math.max(0, n), 0);
}

export function nextTask(tasks: ExecutionTask[], nowKey: string): ExecutionTask | null {
  const rank = { high: 0, medium: 1, low: 2 };
  const nextDate = new Date(nowKey + 'T00:00:00');
  nextDate.setDate(nextDate.getDate() + 1);
  const upcoming = localDayKey(nextDate.getTime());
  return [...tasks].filter((t) => t.status === 'ready')
    .sort((a, b) => {
      const urgentA = a.dueDate && a.dueDate <= upcoming ? -1 : 0;
      const urgentB = b.dueDate && b.dueDate <= upcoming ? -1 : 0;
      return urgentA - urgentB || rank[a.impact] - rank[b.impact] ||
        (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.createdAt - b.createdAt;
    })[0] ?? null;
}


export function tasksForDay(state:ExecutionState,key:string):ExecutionTask[]{
  const map=new Map(state.tasks.map(t=>[t.id,t]));
  return (state.days[key]?.taskIds??[]).map(id=>map.get(id))
    .filter((t):t is ExecutionTask=>!!t&&t.status!=='archived');
}
export function currentForDay(state:ExecutionState,key:string):ExecutionTask|null{
  const ready=tasksForDay(state,key).filter(t=>t.status==='ready');
  return ready.find(t=>t.id===state.days[key]?.selectedTaskId)??ready[0]??null;
}
export function selectForDay(state:ExecutionState,id:string,key:string):ExecutionState{
  if(!state.tasks.some(t=>t.id===id&&t.status!=='archived'))return state;
  const day=state.days[key]??{taskIds:[]};
  if(day.taskIds.includes(id))return state;
  return {...state,days:{...state.days,[key]:{...day,taskIds:[...day.taskIds,id]}}};
}
export function removeFromDay(state:ExecutionState,id:string,key:string):ExecutionState{
  const day=state.days[key];
  if(!day?.taskIds.includes(id))return state;
  return {...state,days:{...state.days,[key]:{taskIds:day.taskIds.filter(x=>x!==id),selectedTaskId:day.selectedTaskId===id?undefined:day.selectedTaskId}}};
}
export function setNextForDay(state:ExecutionState,id:string,key:string):ExecutionState{
  const day=state.days[key];
  if(!day?.taskIds.includes(id)||!state.tasks.some(t=>t.id===id&&t.status==='ready'))return state;
  return {...state,days:{...state.days,[key]:{...day,selectedTaskId:id}}};
}
/** Move only amongst actionable items; completed and blocked positions are untouched. */
export function moveForDay(state: ExecutionState, id: string, key: string, direction: -1 | 1): ExecutionState {
  const selection = state.days[key];
  if (!selection) return state;
  const byId = new Map(state.tasks.map(task => [task.id, task]));
  const readyIds = selection.taskIds.filter(taskId => byId.get(taskId)?.status === 'ready');
  const current = readyIds.indexOf(id);
  const adjacent = current + direction;
  if (current < 0 || adjacent < 0 || adjacent >= readyIds.length) return state;
  const nextIds = [...selection.taskIds];
  const from = nextIds.indexOf(id);
  const to = nextIds.indexOf(readyIds[adjacent]);
  [nextIds[from], nextIds[to]] = [nextIds[to], nextIds[from]];
  return { ...state, days: { ...state.days, [key]: { ...selection, taskIds: nextIds } } };
}

/** The previous calendar day is computed at local noon to avoid DST midnight edge cases. */
export function previousLocalDayKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() - 1);
  return localDayKey(date.getTime());
}

export function unfinishedFromYesterday(state: ExecutionState, key: string): ExecutionTask[] {
  const todayIds = new Set(state.days[key]?.taskIds ?? []);
  return tasksForDay(state, previousLocalDayKey(key))
    .filter(task => task.status === 'ready' && !todayIds.has(task.id));
}

/** Explicit only: never auto-carry activities across days. */
export function bringForwardFromYesterday(state: ExecutionState, key: string): ExecutionState {
  const previous = unfinishedFromYesterday(state, key);
  if (!previous.length) return state;
  const current = state.days[key] ?? { taskIds: [] };
  return { ...state, days: {
    ...state.days,
    [key]: { ...current, taskIds: [...current.taskIds, ...previous.map(task => task.id)] }
  } };
}

export function completeSimply(state:ExecutionState,id:string,at:number):ExecutionState{
  return {...state,tasks:state.tasks.map(t=>t.id===id&&t.status==='ready'?{...t,status:'done' as const,completedAt:at}:t)};
}
export function reopenSimply(state:ExecutionState,id:string):ExecutionState{
  return {...state,tasks:state.tasks.map(t=>{
    if(t.id!==id||t.status!=='done')return t;
    const {completedAt: _completedAt,...rest}=t;
    return {...rest,status:'ready' as const};
  })};
}
/** Detect edits to the same activity while its detail panel is open. */
export function sameEditableTask(a: ExecutionTask, b: ExecutionTask): boolean {
  return a.id === b.id && a.title === b.title && a.nextAction === b.nextAction &&
    a.context === b.context && a.estimateMinutes === b.estimateMinutes &&
    a.dueDate === b.dueDate && a.status === b.status;
}

export function minutesLabel(value: number): string {
  const total = Math.max(0, Math.round(value));
  return total < 60 ? total + 'm' : Math.floor(total / 60) + 'h' + (total % 60 ? ' ' + total % 60 + 'm' : '');
}
