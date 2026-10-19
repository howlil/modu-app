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
