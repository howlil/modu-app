import type { GoalPolicy, HabitCheckin, HabitDefinition, ValidationResult } from './types.ts';
import { isLocalDate } from './scheduling.ts';

function toResult(issues: string[]): ValidationResult {
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

/** Runtime ingress checks, separate from TypeScript's compile-time shapes. */
export function validateHabit(habit: HabitDefinition): ValidationResult {
  const issues: string[] = [];
  if (!habit.id.trim()) issues.push('Habit ID is required.');
  if (!habit.title.trim() || habit.title.trim().length > 80) issues.push('Habit title must be 1–80 characters.');
  if (!isLocalDate(habit.createdDate)) issues.push('Habit creation date is invalid.');
  if (!['BUILD', 'QUIT'].includes(habit.direction)) issues.push('Habit direction is invalid.');
  if (!['ACTIVE', 'ARCHIVED'].includes(habit.status)) issues.push('Habit lifecycle is invalid.');
  const ranges = [...(habit.inactiveRanges ?? [])].sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (!isLocalDate(range.fromDate) || (range.throughDate && !isLocalDate(range.throughDate))) {
      issues.push('Invalid inactive range date.'); continue;
    }
    if (range.fromDate < habit.createdDate || (range.throughDate && range.throughDate < range.fromDate)) {
      issues.push('Invalid inactive range boundaries.');
    }
    const previous = ranges[i - 1];
    if (previous && (!previous.throughDate || previous.throughDate >= range.fromDate)) {
      issues.push('Inactive ranges overlap.');
    }
  }
  if (habit.status === 'ARCHIVED' && ranges.at(-1)?.throughDate !== undefined) {
    issues.push('An archived habit needs an open inactive range.');
  }
  if (habit.status === 'ACTIVE' && ranges.length > 0 && ranges.at(-1)?.throughDate === undefined) {
    issues.push('An active habit cannot have an open inactive range.');
  }
  if (habit.status === 'ARCHIVED' && !ranges.length) issues.push('An archived habit needs an inactive range.');
  return toResult(issues);
}

export function validateGoalPolicy(policy: GoalPolicy, direction: HabitDefinition['direction']): ValidationResult {
  const issues: string[] = [];
  if (!policy.id?.trim() || !policy.habitId?.trim()) issues.push('Policy ID and habit ID are required.');
  if (!isLocalDate(policy.effectiveFromDate)) issues.push('Effective date is invalid.');
  if (direction === 'QUIT' && policy.measurement !== 'AVOIDANCE') issues.push('QUIT habits require AVOIDANCE.');
  if (direction === 'BUILD' && policy.measurement === 'AVOIDANCE') issues.push('BUILD habits cannot use AVOIDANCE.');
  if (!['BOOLEAN', 'COUNT', 'QUANTITY', 'DURATION', 'AVOIDANCE'].includes(policy.measurement)) {
    issues.push('Unsupported measurement.');
  }
  if (!Number.isFinite(policy.target) || policy.target <= 0) issues.push('Target must be positive and finite.');
  if (['BOOLEAN', 'AVOIDANCE'].includes(policy.measurement) && policy.target !== 1) {
    issues.push('Boolean/avoidance target must be 1.');
  }
  if (['COUNT', 'DURATION'].includes(policy.measurement) && !Number.isInteger(policy.target)) {
    issues.push('Count/duration target must be a whole number.');
  }
  if (policy.measurement === 'QUANTITY' && !policy.unit?.trim()) issues.push('Quantity requires a unit.');
  const schedule = policy.schedule;
  if (!schedule || typeof schedule !== 'object') return toResult([...issues, 'Schedule is required.']);
  switch (schedule.type) {
    case 'DAILY': break;
    case 'WEEKDAYS':
      if (!Array.isArray(schedule.weekdays) || schedule.weekdays.length === 0 ||
        new Set(schedule.weekdays).size !== schedule.weekdays.length ||
        schedule.weekdays.some(x => !Number.isInteger(x) || x < 0 || x > 6)) {
        issues.push('Weekdays must be unique values from 0 through 6.');
      }
      break;
    case 'INTERVAL':
      if (!isLocalDate(schedule.anchorDate) || !Number.isInteger(schedule.everyDays) ||
        schedule.everyDays < 1 || schedule.anchorDate > policy.effectiveFromDate) {
        issues.push('Interval needs a valid anchor no later than effective date and a positive whole-day step.');
      }
      break;
    case 'WEEKLY_QUOTA':
      if (!Number.isInteger(schedule.daysPerWeek) || schedule.daysPerWeek < 1 || schedule.daysPerWeek > 7) {
        issues.push('Weekly quota needs 1–7 distinct days.');
      }
      break;
    default: issues.push('Unsupported recurrence.');
  }
  return toResult(issues);
}

export function validatePolicyRevisions(revisions: readonly GoalPolicy[]): ValidationResult {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const policy of revisions) {
    const key = policy.habitId + ':' + policy.effectiveFromDate;
    if (seen.has(key)) issues.push('Duplicate effective date for ' + policy.habitId + '.');
    seen.add(key);
  }
  return toResult(issues);
}

export function validateCheckin(checkin: HabitCheckin, policy: GoalPolicy): ValidationResult {
  const issues: string[] = [];
  if (checkin.habitId !== policy.habitId) issues.push('Check-in habit does not match policy.');
  if (!isLocalDate(checkin.localDate)) issues.push('Invalid check-in date.');
  if (checkin.value !== undefined && (!Number.isFinite(checkin.value) || checkin.value < 0)) {
    issues.push('Progress must be finite and nonnegative.');
  }
  if (['COUNT', 'DURATION'].includes(policy.measurement) && checkin.value !== undefined &&
    !Number.isInteger(checkin.value)) issues.push('Count/duration progress must be a whole number.');
  if (policy.measurement === 'BOOLEAN' && checkin.value !== undefined && ![0, 1].includes(checkin.value)) {
    issues.push('Boolean progress must be 0 or 1.');
  }
  if (policy.measurement === 'AVOIDANCE' && checkin.value !== undefined) issues.push('Avoidance cannot use a numeric progress value.');
  if (policy.measurement !== 'AVOIDANCE' && checkin.attestation !== undefined) issues.push('Only avoidance can use attestations.');
  if (checkin.attestation !== undefined && !['CLEAN', 'LAPSE'].includes(checkin.attestation)) {
    issues.push('Invalid avoidance attestation.');
  }
  if (checkin.skipped && (checkin.attestation !== undefined || (checkin.value ?? 0) > 0)) {
    issues.push('A skipped date cannot also contain progress.');
  }
  return toResult(issues);
}
