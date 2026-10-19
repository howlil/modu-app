import type {
  DailyOutcome, GoalPolicy, HabitCheckin, HabitDefinition, LocalDate, WeeklyOutcome
} from './types.ts';
import {
  addCalendarDays, calendarDayOrdinal, isDueOnDate, isHabitActiveOn,
  isLocalDate, mondayOf, resolveEffectivePolicy
} from './scheduling.ts';
import {
  calculateCompletionRate, calculateStreak, evaluateDailyOutcome,
  evaluateWeeklyQuotaByRevisions, isGoalMet
} from './evaluation.ts';

export type InsightPeriod = {
  habitId: string;
  kind: 'DAILY' | 'WEEKLY';
  date: LocalDate; // Scheduled day or Sunday ending a weekly period.
  outcome: DailyOutcome | WeeklyOutcome;
};

export type CalendarStatus = 'NOT_SCHEDULED' | 'MET' | 'MISSED' | 'PARTIAL' | 'PENDING' | 'SKIPPED';
export interface CalendarDay {
  date: LocalDate;
  status: CalendarStatus;
  scheduled: number;
  met: number;
  missed: number;
  pending: number;
  /** Weekly quota dates are visual evidence, not extra daily obligations. */
  weeklyQualified: number;
  weeklyOpportunity: number;
}

export interface InsightSnapshot {
  fromDate: LocalDate;
  throughDate: LocalDate;
  truncated: boolean;
  periods: InsightPeriod[];
  met: number;
  missed: number;
  eligible: number;
  rate: number | null;
  currentStreak: number;
  longestStreak: number;
}

const MAX_INSIGHT_DAYS = 3653;

function selectedHabits(habits: readonly HabitDefinition[], habitId?: string): HabitDefinition[] {
  return habitId ? habits.filter(h => h.id === habitId) : [...habits];
}

/** Pure day projection; weekly successes never inflate daily completion counts. */
export function summarizeCalendarDay(
  habits: readonly HabitDefinition[],
  policies: readonly GoalPolicy[],
  checkins: readonly HabitCheckin[],
  date: LocalDate,
  today: LocalDate,
  habitId?: string
): CalendarDay {
  calendarDayOrdinal(date);
  calendarDayOrdinal(today);
  const summary: CalendarDay = {
    date, status: 'NOT_SCHEDULED', scheduled: 0, met: 0, missed: 0,
    pending: 0, weeklyQualified: 0, weeklyOpportunity: 0
  };
  if (date > today) return summary;
  let partial = 0;
  let skipped = 0;
  for (const habit of selectedHabits(habits, habitId)) {
    if (date < habit.createdDate) continue;
    const entry = checkins.find(c => c.habitId === habit.id && c.localDate === date);
    const active = isHabitActiveOn(habit, date);
    if (!active && !(habit.inactiveRanges ?? []).some(r => r.fromDate === date && entry)) continue;
    const policy = resolveEffectivePolicy(habit.id, date, policies);
    if (policy.schedule.type === 'WEEKLY_QUOTA') {
      if (active) {
        summary.weeklyOpportunity++;
        if (isGoalMet(policy, entry)) summary.weeklyQualified++;
      }
      continue;
    }
    if (!isDueOnDate(policy.schedule, date)) continue;
    const outcome = evaluateDailyOutcome(habit, policy, entry, date, today);
    if (outcome === 'NOT_SCHEDULED') continue;
    summary.scheduled++;
    if (outcome === 'MET') summary.met++;
    else if (outcome === 'MISSED') summary.missed++;
    else if (outcome === 'SKIPPED') skipped++;
    else if (outcome === 'PARTIAL') partial++;
    else summary.pending++;
  }
  summary.status = summary.missed ? 'MISSED'
    : partial || (summary.met > 0 && summary.met < summary.scheduled) ? 'PARTIAL'
    : summary.scheduled > 0 && summary.met === summary.scheduled ? 'MET'
    : summary.pending ? 'PENDING'
    : skipped ? 'SKIPPED' : 'NOT_SCHEDULED';
  return summary;
}

/**
 * One daily period per due date, or one weekly period per habit/Monday week.
 * Each day resolves its historical effective policy. Weekly quotas count once.
 */
export function deriveInsightPeriods(
  habits: readonly HabitDefinition[],
  policies: readonly GoalPolicy[],
  checkins: readonly HabitCheckin[],
  fromDate: LocalDate,
  throughDate: LocalDate,
  habitId?: string
): InsightPeriod[] {
  const first = calendarDayOrdinal(fromDate);
  const last = calendarDayOrdinal(throughDate);
  if (last < first) return [];
  if (last - first > MAX_INSIGHT_DAYS) {
    throw new RangeError('Insight range exceeds the supported history window.');
  }
  const periods: InsightPeriod[] = [];
  const entryLookup = new Map(checkins.map(c => [c.habitId + '\0' + c.localDate, c]));
  const weekly = new Map<string, { habit: HabitDefinition; date: LocalDate; policy: GoalPolicy }>();
  for (const habit of selectedHabits(habits, habitId)) {
    const start = Math.max(first, calendarDayOrdinal(habit.createdDate));
    for (let ordinal = start; ordinal <= last; ordinal++) {
      const date = new Date(ordinal * 86400000).toISOString().slice(0, 10);
      const active = isHabitActiveOn(habit, date);
      const entry = entryLookup.get(habit.id + '\0' + date);
      if (!active && !(habit.inactiveRanges ?? []).some(r => r.fromDate === date && entry)) continue;
      const policy = resolveEffectivePolicy(habit.id, date, policies);
      if (policy.schedule.type === 'WEEKLY_QUOTA') {
        if (!active) continue;
        weekly.set(habit.id + '\0' + mondayOf(date), { habit, date, policy });
      } else if (isDueOnDate(policy.schedule, date)) {
        const outcome = evaluateDailyOutcome(habit, policy, entry, date, throughDate);
        if (outcome !== 'NOT_SCHEDULED') {
          periods.push({ habitId: habit.id, kind: 'DAILY', date, outcome });
        }
      }
    }
  }
  for (const { habit, date, policy } of weekly.values()) {
    const { outcome } = evaluateWeeklyQuotaByRevisions(
      habit, policy, policies, checkins, date, throughDate
    );
    periods.push({ habitId: habit.id, kind: 'WEEKLY', date: addCalendarDays(mondayOf(date), 6), outcome });
  }
  return periods.sort((a, b) => a.date.localeCompare(b.date) ||
    a.habitId.localeCompare(b.habitId) || a.kind.localeCompare(b.kind));
}

export function createInsightSnapshot(
  habits: readonly HabitDefinition[],
  policies: readonly GoalPolicy[],
  checkins: readonly HabitCheckin[],
  today: LocalDate,
  habitId?: string
): InsightSnapshot {
  const endOrdinal = calendarDayOrdinal(today);
  const relevant = selectedHabits(habits, habitId);
  const earliest = relevant.length
    ? Math.min(...relevant.map(h => calendarDayOrdinal(h.createdDate))) : endOrdinal;
  const lowerBound = endOrdinal - MAX_INSIGHT_DAYS;
  const start = Math.max(earliest, lowerBound);
  const fromDate = new Date(start * 86400000).toISOString().slice(0, 10);
  const periods = deriveInsightPeriods(relevant, policies, checkins, fromDate, today);
  const completion = calculateCompletionRate(periods.map(p => p.outcome));
  // Never concatenate unrelated habits into a single fictitious streak.
  // All-habits view shows the best individual current/longest streak.
  const byHabit = new Map<string, InsightPeriod[]>();
  for (const period of periods) {
    const entries = byHabit.get(period.habitId) ?? [];
    entries.push(period);
    byHabit.set(period.habitId, entries);
  }
  let currentStreak = 0;
  let longestStreak = 0;
  for (const entries of byHabit.values()) {
    const streak = calculateStreak(entries.map(p => p.outcome));
    currentStreak = Math.max(currentStreak, streak.current);
    longestStreak = Math.max(longestStreak, streak.longest);
  }
  return {
    fromDate, throughDate: today, truncated: earliest < lowerBound, periods,
    met: completion.met, missed: completion.eligible - completion.met,
    eligible: completion.eligible, rate: completion.rate,
    currentStreak, longestStreak
  };
}

/** Monday-first month grid; nulls pad leading adjacent-month weekdays. */
export function monthGrid(month: string): (LocalDate | null)[] {
  if (!/^\d{4}-\d{2}$/.test(month) || !isLocalDate(month + '-01')) {
    throw new RangeError('Month must be YYYY-MM.');
  }
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const first = month + '-01';
  const pad = (new Date(calendarDayOrdinal(first) * 86400000).getUTCDay() + 6) % 7;
  const following = m === 12 ? String(year + 1).padStart(4, '0') + '-01-01'
    : String(year) + '-' + String(m + 1).padStart(2, '0') + '-01';
  const total = calendarDayOrdinal(following) - calendarDayOrdinal(first);
  return [
    ...Array.from({ length: pad }, () => null),
    ...Array.from({ length: total }, (_, i) => addCalendarDays(first, i))
  ];
}

export function shiftMonth(month: string, delta: number): string {
  if (!/^\d{4}-\d{2}$/.test(month) || !isLocalDate(month + '-01') || !Number.isInteger(delta)) {
    throw new RangeError('Invalid month navigation.');
  }
  const result = new Date(calendarDayOrdinal(month + '-01') * 86400000);
  result.setUTCMonth(result.getUTCMonth() + delta);
  return result.toISOString().slice(0, 7);
}
