import type { HabitDefinition } from './consistency.ts';
import type { RecommendationDecision } from './recommendations.ts';

export type CapacityMode = 'low' | 'medium' | 'high';
export type Workstream = 'build' | 'interview' | 'apply' | 'english' | 'review';
export type Impact = 'high' | 'medium' | 'low';
export type TaskStatus = 'ready' | 'blocked' | 'done' | 'archived';

export const WORKSTREAM_NAMES: Record<Workstream, string> = {
  build: 'Project work',
  interview: 'Technical practice',
  apply: 'Job acquisition',
  english: 'Communication',
  review: 'Review'
};

export const CAPACITY_PRESETS: Record<CapacityMode, Record<Workstream, number>> = {
  low: { build: 150, interview: 90, apply: 60, english: 30, review: 30 },
  medium: { build: 210, interview: 120, apply: 60, english: 60, review: 30 },
  high: { build: 360, interview: 180, apply: 90, english: 60, review: 30 }
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

export interface ExecutionState {
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
  return { goal: '', successCriteria: '', tasks: [], plans: {}, reflections: {}, manualEntries: [], habit: { id: 'technical-practice', name: 'Technical practice', qualifyingWorkstreams: ['build','interview'], targetDaysPerWeek: 3, minimumSessionMinutes: 15 }, recommendationDecisions: [] };
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

export function minutesLabel(value: number): string {
  const total = Math.max(0, Math.round(value));
  return total < 60 ? total + 'm' : Math.floor(total / 60) + 'h' + (total % 60 ? ' ' + total % 60 + 'm' : '');
}
