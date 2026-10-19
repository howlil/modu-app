import type { GoalPolicy, HabitDefinition, LocalDate, ScheduleRule } from './types.ts';

const DAY_MS = 86_400_000;

/** Use UTC day ordinals for calendar arithmetic, not elapsed local-midnight durations. */
export function isLocalDate(value: string): value is LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

export function calendarDayOrdinal(date: LocalDate): number {
  if (!isLocalDate(date)) throw new RangeError('Invalid calendar date: ' + date);
  return Date.parse(date + 'T00:00:00Z') / DAY_MS;
}

export function addCalendarDays(date: LocalDate, amount: number): LocalDate {
  if (!Number.isInteger(amount)) throw new RangeError('Calendar offset must be a whole number.');
  return new Date((calendarDayOrdinal(date) + amount) * DAY_MS).toISOString().slice(0, 10);
}

export function mondayOf(date: LocalDate): LocalDate {
  const weekday = new Date(calendarDayOrdinal(date) * DAY_MS).getUTCDay();
  return addCalendarDays(date, -((weekday + 6) % 7));
}

export function isDueOnDate(schedule: ScheduleRule, date: LocalDate): boolean {
  const day = calendarDayOrdinal(date);
  switch (schedule.type) {
    case 'DAILY': return true;
    case 'WEEKDAYS': return schedule.weekdays.includes(new Date(day * DAY_MS).getUTCDay());
    case 'INTERVAL':
      return Number.isInteger(schedule.everyDays) && schedule.everyDays > 0
        && day >= calendarDayOrdinal(schedule.anchorDate)
        && (day - calendarDayOrdinal(schedule.anchorDate)) % schedule.everyDays === 0;
    case 'WEEKLY_QUOTA':
      return true; // Every date is an opportunity; success/failure belongs to the week.
  }
}

export function isHabitActiveOn(habit: HabitDefinition, date: LocalDate): boolean {
  calendarDayOrdinal(date);
  if (date < habit.createdDate) return false;
  return !(habit.inactiveRanges ?? []).some(range =>
    range.fromDate <= date && (range.throughDate === undefined || date <= range.throughDate)
  );
}

export class PolicyNotFoundError extends Error {
  constructor(habitId: string, date: LocalDate) {
    super('No applicable habit policy for ' + habitId + ' on ' + date);
    this.name = 'PolicyNotFoundError';
  }
}

export class PolicyConflictError extends Error {
  constructor(habitId: string, date: LocalDate) {
    super('Conflicting habit policy revisions for ' + habitId + ' on ' + date);
    this.name = 'PolicyConflictError';
  }
}

/** Lookup is by effective date, not insertion order; callers validate revision shape at ingress. */
export function resolveEffectivePolicy(
  habitId: string, date: LocalDate, revisions: readonly GoalPolicy[]
): GoalPolicy {
  calendarDayOrdinal(date);
  const matching = revisions
    .filter(p => p.habitId === habitId && isLocalDate(p.effectiveFromDate) && p.effectiveFromDate <= date)
    .sort((a, b) => b.effectiveFromDate.localeCompare(a.effectiveFromDate));
  if (!matching.length) throw new PolicyNotFoundError(habitId, date);
  if (matching.length > 1 && matching[0].effectiveFromDate === matching[1].effectiveFromDate) {
    throw new PolicyConflictError(habitId, date);
  }
  return matching[0];
}
