import type {
  DailyOutcome, GoalPolicy, HabitCheckin, HabitDefinition, LocalDate, WeeklyOutcome
} from './types.ts';
import {
  addCalendarDays, calendarDayOrdinal, isDueOnDate, isHabitActiveOn, mondayOf
} from './scheduling.ts';

export function isGoalMet(policy: GoalPolicy, checkin?: HabitCheckin): boolean {
  if (!checkin || checkin.skipped) return false;
  if (policy.measurement === 'AVOIDANCE') return checkin.attestation === 'CLEAN';
  return Number.isFinite(checkin.value) && (checkin.value ?? 0) >= policy.target;
}

/** A calendar date's derived status. All time is an explicit argument for deterministic tests. */
export function evaluateDailyOutcome(
  habit: HabitDefinition,
  policy: GoalPolicy,
  checkin: HabitCheckin | undefined,
  date: LocalDate,
  nowDate: LocalDate
): DailyOutcome {
  calendarDayOrdinal(nowDate);
  if (!isHabitActiveOn(habit, date) || date < policy.effectiveFromDate || !isDueOnDate(policy.schedule, date)) {
    return 'NOT_SCHEDULED';
  }
  if (date > nowDate) return 'PENDING';
  if (checkin && (checkin.habitId !== habit.id || checkin.localDate !== date)) {
    throw new Error('Check-in belongs to a different habit/date.');
  }
  if (checkin?.skipped) return 'SKIPPED';
  if (isGoalMet(policy, checkin)) return 'MET';
  if (policy.measurement === 'AVOIDANCE') {
    if (checkin?.attestation === 'LAPSE') return 'MISSED';
    return date < nowDate && policy.schedule.type !== 'WEEKLY_QUOTA' ? 'MISSED' : 'PENDING';
  }
  if (policy.schedule.type === 'WEEKLY_QUOTA') {
    return (checkin?.value ?? 0) > 0 ? 'PARTIAL' : 'PENDING';
  }
  if (date < nowDate) return 'MISSED';
  return (checkin?.value ?? 0) > 0 ? 'PARTIAL' : 'PENDING';
}

export function evaluateWeeklyQuota(
  habit: HabitDefinition,
  policy: GoalPolicy,
  checkins: readonly HabitCheckin[],
  dateInWeek: LocalDate,
  nowDate: LocalDate
): { outcome: WeeklyOutcome; completedDays: number; requiredDays: number } {
  if (policy.schedule.type !== 'WEEKLY_QUOTA') throw new RangeError('Expected WEEKLY_QUOTA.');
  calendarDayOrdinal(nowDate);
  const monday = mondayOf(dateInWeek);
  const sunday = addCalendarDays(monday, 6);
  const successfulDates = new Set(checkins.filter(c =>
    c.habitId === habit.id && c.localDate >= monday && c.localDate <= sunday &&
    c.localDate <= nowDate && c.localDate >= policy.effectiveFromDate &&
    isHabitActiveOn(habit, c.localDate) && isGoalMet(policy, c)
  ).map(c => c.localDate));
  const completedDays = successfulDates.size;
  const requiredDays = policy.schedule.daysPerWeek;
  const outcome: WeeklyOutcome = completedDays >= requiredDays
    ? 'MET' : sunday < nowDate ? 'MISSED' : 'PENDING';
  return { outcome, completedDays, requiredDays };
}

/** Inputs are chronological eligible periods; SKIPPED/NOT_SCHEDULED are neutral. */
export function calculateStreak(
  outcomes: readonly (DailyOutcome | WeeklyOutcome)[]
): { current: number; longest: number } {
  let run = 0;
  let longest = 0;
  for (const result of outcomes) {
    if (result === 'MET') run++;
    else if (result === 'MISSED') run = 0;
    longest = Math.max(longest, run);
  }
  return { current: run, longest };
}

/** Only finalized MET/MISSED periods enter the denominator. */
export function calculateCompletionRate(
  outcomes: readonly (DailyOutcome | WeeklyOutcome)[]
): { met: number; eligible: number; rate: number | null } {
  const met = outcomes.filter(o => o === 'MET').length;
  const eligible = outcomes.filter(o => o === 'MET' || o === 'MISSED').length;
  return { met, eligible, rate: eligible === 0 ? null : met / eligible };
}
