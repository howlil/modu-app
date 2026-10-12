import type { FocusActivitySession } from '#lib/shared/focus-sessions/types.ts';
import type { ExecutionTask, Workstream } from './planning.ts';
import { localDayKey } from './planning.ts';

export interface HabitDefinition {
  id: string;
  name: string;
  qualifyingWorkstreams: Workstream[];
  targetDaysPerWeek: number;
  minimumSessionMinutes: number;
}
export const DEFAULT_HABIT: HabitDefinition = {
  id: 'technical-practice', name: 'Technical practice',
  qualifyingWorkstreams: ['build', 'interview'], targetDaysPerWeek: 3, minimumSessionMinutes: 15
};

export function habitWeekSummary(
  habit: HabitDefinition,
  sessions: FocusActivitySession[],
  tasks: ExecutionTask[],
  weekStart: string
): { completedDays: number; dateKeys: string[]; targetDays: number } {
  const dayStart = new Date(weekStart + 'T00:00:00');
  const nextWeek = new Date(dayStart);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const targetIds = new Set(tasks.filter((task) => habit.qualifyingWorkstreams.includes(task.workstream)).map((task) => task.id));
  const qualifying = sessions.filter((session) => !!session.taskId && targetIds.has(session.taskId) &&
    session.actualDurationMs >= habit.minimumSessionMinutes * 60_000 &&
    session.endedAt >= dayStart.getTime() && session.endedAt < nextWeek.getTime());
  const dateKeys = [...new Set(qualifying.map((session) => localDayKey(session.endedAt)))].sort();
  return { completedDays: dateKeys.length, dateKeys, targetDays: Math.max(1, Math.min(7, habit.targetDaysPerWeek)) };
}
