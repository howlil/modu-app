import { WORKSTREAM_NAMES, type DailyPlan, type ExecutionTask, type Workstream, plannedMinutes } from './planning.ts';

export type WorkAllocation = Record<Workstream, number>;
export interface ReplanProposal {
  remainingMinutes: number;
  allocations: WorkAllocation;
  reason: string;
  urgentTaskIds: string[];
}

export function proposeReplan(plan: DailyPlan, tasks: ExecutionTask[], recordedMinutes: number, todayKey: string): ReplanProposal {
  const remainingMinutes = Math.max(0, Math.round(plannedMinutes(plan) - recordedMinutes));
  const available = tasks.filter((task) => task.status === 'ready');
  const tomorrow = new Date(todayKey + 'T00:00:00');
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = [tomorrow.getFullYear(), String(tomorrow.getMonth() + 1).padStart(2, '0'), String(tomorrow.getDate()).padStart(2, '0')].join('-');
  const urgent = available.filter((task) => !!task.dueDate && task.dueDate <= tomorrowKey);
  const weights: WorkAllocation = { build: 0, interview: 0, apply: 0, english: 0, review: 0 };
  for (const task of available) {
    const urgency = task.dueDate && task.dueDate <= tomorrowKey ? 4 : 1;
    const impact = task.impact === 'high' ? 2 : task.impact === 'medium' ? 1.3 : 1;
    weights[task.workstream] += urgency * impact * Math.max(1, plan.allocations[task.workstream]);
  }
  const allocations: WorkAllocation = { build: 0, interview: 0, apply: 0, english: 0, review: 0 };
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (totalWeight > 0 && remainingMinutes > 0) {
    let allocated = 0;
    const activeKeys = (Object.keys(WORKSTREAM_NAMES) as Workstream[]).filter((key) => weights[key] > 0);
    activeKeys.forEach((key, index) => {
      const value = index === activeKeys.length - 1 ? remainingMinutes - allocated
        : Math.max(0, Math.floor(remainingMinutes * weights[key] / totalWeight / 5) * 5);
      allocations[key] = value;
      allocated += value;
    });
  }
  const reason = urgent.length
    ? 'A task deadline is today or tomorrow: ' + urgent.map((task) => task.title).slice(0, 2).join(', ')
    : available.length ? 'Remaining time is weighted by available tasks, impact and existing allocations.'
      : 'No ready tasks are available. Keep remaining time unallocated.';
  return { allocations, remainingMinutes, reason, urgentTaskIds: urgent.map((task) => task.id) };
}


export function overlapsExistingWork(start: number, end: number, records: { startedAt: number; endedAt: number }[]): boolean {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return true;
  return records.some((r) => Number.isFinite(r.startedAt) && Number.isFinite(r.endedAt) && start < r.endedAt && end > r.startedAt);
}

