import type { GoalPolicy, HabitDefinition, LocalDate, ScheduleRule } from './types.ts';
import { addCalendarDays, isLocalDate, resolveEffectivePolicy } from './scheduling.ts';
import { validateGoalPolicy, validateHabit } from './validation.ts';

export interface PolicyRevisionInput {
  target: number;
  schedule: ScheduleRule;
  effectiveFromDate: LocalDate;
}

/**
 * Pure immutable policy revision. Measurement, direction, and unit cannot be
 * changed in M3; only target and schedule. Historical facts remain untouched.
 */
export function createPolicyRevision(
  habit: HabitDefinition,
  revisions: readonly GoalPolicy[],
  input: PolicyRevisionInput,
  today: LocalDate,
  revisionId: string
): GoalPolicy | null {
  if (!isLocalDate(today) || !isLocalDate(input.effectiveFromDate) ||
    input.effectiveFromDate < addCalendarDays(today, 1)) {
    throw new RangeError('Policy changes must take effect no earlier than tomorrow.');
  }
  if (!revisionId.trim()) throw new RangeError('Revision ID is required.');
  const status = validateHabit(habit);
  if (!status.ok) throw new RangeError(status.issues.join(' '));
  if (revisions.some(p => p.habitId === habit.id && p.effectiveFromDate === input.effectiveFromDate)) {
    throw new RangeError('A policy revision already exists for this effective date.');
  }
  const baseline = resolveEffectivePolicy(habit.id, input.effectiveFromDate, revisions);
  const next: GoalPolicy = {
    ...baseline,
    id: revisionId,
    effectiveFromDate: input.effectiveFromDate,
    target: input.target,
    schedule: input.schedule
  };
  const validated = validateGoalPolicy(next, habit.direction);
  if (!validated.ok) throw new RangeError(validated.issues.join(' '));
  if (baseline.target === next.target && JSON.stringify(baseline.schedule) === JSON.stringify(next.schedule)) {
    return null; // Rename-only edit: do not manufacture a policy revision.
  }
  return next;
}


/** Compare semantic policy changes, not the effective policy of a different future date. */
export function hasPolicyConfigurationChanged(
  baseline: GoalPolicy,
  input: { target: number; schedule: ScheduleRule }
): boolean {
  const a = baseline.schedule;
  const b = input.schedule;
  if (baseline.target !== input.target || a.type !== b.type) return true;
  switch (a.type) {
    case 'DAILY': return false;
    case 'WEEKDAYS':
      return b.type !== 'WEEKDAYS' ||
        a.weekdays.slice().sort().join(',') !== b.weekdays.slice().sort().join(',');
    case 'INTERVAL':
      return b.type !== 'INTERVAL' ||
        a.everyDays !== b.everyDays || a.anchorDate !== b.anchorDate;
    case 'WEEKLY_QUOTA':
      return b.type !== 'WEEKLY_QUOTA' || a.daysPerWeek !== b.daysPerWeek;
  }
}
