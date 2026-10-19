import type { GoalPolicy, HabitCheckin, HabitDefinition, LocalDate } from './types.ts';
import { addCalendarDays, isDueOnDate, isHabitActiveOn } from './scheduling.ts';
import { validateCheckin, validateGoalPolicy, validateHabit } from './validation.ts';

function requireValid(result: ReturnType<typeof validateHabit>): void {
  if (!result.ok) throw new RangeError(result.issues.join(' '));
}

/** M1 deliberately creates only BUILD + BOOLEAN + DAILY. More goals are later milestones. */
export function makeDailyBooleanHabit(id: string, title: string, date: LocalDate): {
  habit: HabitDefinition; policy: GoalPolicy
} {
  const habit: HabitDefinition = {
    id, title: title.trim(), direction: 'BUILD', status: 'ACTIVE', createdDate: date
  };
  const policy: GoalPolicy = {
    id: id + ':initial', habitId: id, effectiveFromDate: date,
    measurement: 'BOOLEAN', target: 1, schedule: { type: 'DAILY' }
  };
  requireValid(validateHabit(habit));
  requireValid(validateGoalPolicy(policy, habit.direction));
  return { habit, policy };
}

export function renameHabit(habit: HabitDefinition, title: string): HabitDefinition {
  const updated = { ...habit, title: title.trim() };
  requireValid(validateHabit(updated));
  return updated;
}

export function archiveHabit(habit: HabitDefinition, date: LocalDate): HabitDefinition {
  requireValid(validateHabit(habit));
  if (habit.status === 'ARCHIVED') return habit;
  if (date < habit.createdDate) throw new RangeError('Cannot archive before creation.');
  const updated: HabitDefinition = {
    ...habit, status: 'ARCHIVED', inactiveRanges: [
      ...(habit.inactiveRanges ?? []), { fromDate: date }
    ]
  };
  requireValid(validateHabit(updated));
  return updated;
}

export function restoreHabit(habit: HabitDefinition, date: LocalDate): HabitDefinition {
  requireValid(validateHabit(habit));
  if (habit.status === 'ACTIVE') return habit;
  const ranges = [...(habit.inactiveRanges ?? [])];
  const last = ranges.pop();
  if (!last || date < last.fromDate) throw new RangeError('Restore must follow archive.');
  if (last.fromDate !== date) {
    ranges.push({ fromDate: last.fromDate, throughDate: addCalendarDays(date, -1) });
  }
  const updated: HabitDefinition = { ...habit, status: 'ACTIVE', inactiveRanges: ranges };
  requireValid(validateHabit(updated));
  return updated;
}

export function booleanCheckin(
  habit: HabitDefinition, policy: GoalPolicy, date: LocalDate, complete: boolean
): HabitCheckin | null {
  if (habit.status !== 'ACTIVE' || !isHabitActiveOn(habit, date) ||
    policy.habitId !== habit.id || policy.effectiveFromDate > date ||
    policy.measurement !== 'BOOLEAN' || policy.schedule.type !== 'DAILY' ||
    !isDueOnDate(policy.schedule, date)) {
    throw new RangeError('Daily boolean check-in is not available for this habit.');
  }
  if (!complete) return null;
  const checkin: HabitCheckin = { habitId: habit.id, localDate: date, value: 1 };
  requireValid(validateCheckin(checkin, policy));
  return checkin;
}
