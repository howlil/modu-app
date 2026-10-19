import { describe, expect, it } from 'vitest';
import type { GoalPolicy, HabitCheckin } from '../../src/lib/modules/habit-tracker/core/types.ts';
import { makeConfiguredDailyHabit } from '../../src/lib/modules/habit-tracker/core/progress.ts';
import { createPolicyRevision } from '../../src/lib/modules/habit-tracker/core/policy.ts';
import { isDueOnDate, resolveEffectivePolicy, addCalendarDays, mondayOf } from '../../src/lib/modules/habit-tracker/core/scheduling.ts';
import { evaluateDailyOutcome, evaluateWeeklyQuotaByRevisions } from '../../src/lib/modules/habit-tracker/core/evaluation.ts';

const day = '2026-10-20';
const count = makeConfiguredDailyHabit('habit-1', {
  title: 'Read', direction: 'BUILD', measurement: 'COUNT', target: 10
}, day);
const record = (date: string, value: number): HabitCheckin =>
  ({ habitId: count.habit.id, localDate: date, value });

describe('M3 scheduling and immutable policy revisions', () => {
  it('creates only the selected weekday obligations', () => {
    const { policy } = makeConfiguredDailyHabit('w', {
      title: 'Study', direction: 'BUILD', measurement: 'BOOLEAN',
      schedule: { type: 'WEEKDAYS', weekdays: [1, 3, 5] }
    }, day);
    expect(isDueOnDate(policy.schedule, '2026-10-21')).toBe(true);
    expect(isDueOnDate(policy.schedule, '2026-10-22')).toBe(false);
    expect(isDueOnDate(policy.schedule, '2026-10-23')).toBe(true);
    expect(evaluateDailyOutcome({ ...count.habit, id: 'w' }, policy, undefined,
      '2026-10-22', '2026-10-22')).toBe('NOT_SCHEDULED');
  });

  it('evaluates anchored intervals by calendar dates through DST and month transitions', () => {
    const p = makeConfiguredDailyHabit('i', {
      title: 'Jog', direction: 'BUILD', measurement: 'BOOLEAN',
      schedule: { type: 'INTERVAL', anchorDate: day, everyDays: 3 }
    }, day).policy;
    expect(isDueOnDate(p.schedule, day)).toBe(true);
    expect(isDueOnDate(p.schedule, '2026-10-21')).toBe(false);
    expect(isDueOnDate(p.schedule, '2026-10-23')).toBe(true);
    expect(addCalendarDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
  });

  it('rejects empty weekdays, zero interval, invalid anchor and invalid quota', () => {
    expect(() => makeConfiguredDailyHabit('w', { title: 'A', direction: 'BUILD', measurement: 'BOOLEAN',
      schedule: { type: 'WEEKDAYS', weekdays: [] } }, day)).toThrow(RangeError);
    expect(() => makeConfiguredDailyHabit('i', { title: 'A', direction: 'BUILD', measurement: 'BOOLEAN',
      schedule: { type: 'INTERVAL', anchorDate: day, everyDays: 0 } }, day)).toThrow(RangeError);
    expect(() => makeConfiguredDailyHabit('i', { title: 'A', direction: 'BUILD', measurement: 'BOOLEAN',
      schedule: { type: 'INTERVAL', anchorDate: '2026-10-21', everyDays: 2 } }, day)).toThrow(RangeError);
    expect(() => makeConfiguredDailyHabit('q', { title: 'A', direction: 'BUILD', measurement: 'BOOLEAN',
      schedule: { type: 'WEEKLY_QUOTA', daysPerWeek: 8 } }, day)).toThrow(RangeError);
  });

  it('keeps the old target and schedule on historic dates after a future revision', () => {
    const revised = createPolicyRevision(count.habit, [count.policy],
      { target: 25, schedule: { type: 'WEEKDAYS', weekdays: [1, 3, 5] },
        effectiveFromDate: '2026-10-21' }, day, 'revision-1');
    expect(revised).not.toBeNull();
    const revisions = [count.policy, revised!];
    const earlier = resolveEffectivePolicy(count.habit.id, day, revisions);
    const later = resolveEffectivePolicy(count.habit.id, '2026-10-21', revisions);
    expect(earlier.target).toBe(10);
    expect(earlier.schedule.type).toBe('DAILY');
    expect(later.target).toBe(25);
    expect(later.schedule.type).toBe('WEEKDAYS');
    expect(evaluateDailyOutcome(count.habit, earlier, record(day, 12), day, '2026-10-22')).toBe('MET');
    expect(evaluateDailyOutcome(count.habit, later, record('2026-10-21', 12), '2026-10-21', '2026-10-22')).toBe('MISSED');
    expect(evaluateDailyOutcome(count.habit, later, undefined, '2026-10-22', '2026-10-22')).toBe('NOT_SCHEDULED');
    expect(count.policy.target).toBe(10); // Immutable.
  });

  it('rejects retroactive revisions, same-date conflicts, and invalid revised targets', () => {
    expect(() => createPolicyRevision(count.habit, [count.policy],
      { target: 20, schedule: { type: 'DAILY' }, effectiveFromDate: day }, day, 'bad')).toThrow(RangeError);
    expect(() => createPolicyRevision(count.habit, [count.policy],
      { target: -1, schedule: { type: 'DAILY' }, effectiveFromDate: '2026-10-21' }, day, 'bad')).toThrow(RangeError);
    const future = createPolicyRevision(count.habit, [count.policy],
      { target: 15, schedule: { type: 'DAILY' }, effectiveFromDate: '2026-10-21' }, day, 'r1')!;
    expect(() => createPolicyRevision(count.habit, [count.policy, future],
      { target: 20, schedule: { type: 'DAILY' }, effectiveFromDate: '2026-10-21' }, day, 'r2')).toThrow(RangeError);
  });

  it('does not create a new revision for rename-only edits or identical schedule', () => {
    const unchanged = createPolicyRevision(count.habit, [count.policy],
      { target: count.policy.target, schedule: { type: 'DAILY' },
        effectiveFromDate: '2026-10-21' }, day, 'unused');
    expect(unchanged).toBeNull();
  });

  it('counts distinct successful dates for a flexible weekly quota and never daily misses', () => {
    const { habit, policy } = makeConfiguredDailyHabit('q', {
      title: 'Gym', direction: 'BUILD', measurement: 'COUNT', target: 10,
      schedule: { type: 'WEEKLY_QUOTA', daysPerWeek: 3 }
    }, '2026-10-19');
    const records: HabitCheckin[] = [
      { habitId: habit.id, localDate: '2026-10-19', value: 11 },
      { habitId: habit.id, localDate: '2026-10-19', value: 11 },
      { habitId: habit.id, localDate: '2026-10-20', value: 10 },
      { habitId: habit.id, localDate: '2026-10-21', value: 3 }
    ];
    expect(evaluateWeeklyQuotaByRevisions(habit, policy, [policy], records, day, '2026-10-20'))
      .toEqual({ outcome: 'PENDING', completedDays: 2, requiredDays: 3 });
    expect(evaluateDailyOutcome(habit, policy, undefined, '2026-10-19', '2026-10-20')).toBe('PENDING');
    const completed = [...records, { habitId: habit.id, localDate: '2026-10-22', value: 10 }];
    expect(evaluateWeeklyQuotaByRevisions(habit, policy, [policy], completed, day, '2026-10-22'))
      .toEqual({ outcome: 'MET', completedDays: 3, requiredDays: 3 });
    expect(evaluateWeeklyQuotaByRevisions(habit, policy, [policy], records, day, '2026-10-26'))
      .toEqual({ outcome: 'MISSED', completedDays: 2, requiredDays: 3 });
  });

  it('uses the policy effective on each check-in date across a midweek quota revision', () => {
    const { habit, policy } = makeConfiguredDailyHabit('q', {
      title: 'Practice', direction: 'BUILD', measurement: 'COUNT', target: 5,
      schedule: { type: 'WEEKLY_QUOTA', daysPerWeek: 3 }
    }, '2026-10-19');
    const revision: GoalPolicy = createPolicyRevision(habit, [policy],
      { target: 10, schedule: { type: 'WEEKLY_QUOTA', daysPerWeek: 2 },
        effectiveFromDate: '2026-10-21' }, '2026-10-20', 'r2')!;
    const history: HabitCheckin[] = [
      { habitId: habit.id, localDate: '2026-10-19', value: 5 },
      { habitId: habit.id, localDate: '2026-10-21', value: 8 },
      { habitId: habit.id, localDate: '2026-10-22', value: 10 }
    ];
    expect(evaluateWeeklyQuotaByRevisions(habit, revision, [policy, revision],
      history, '2026-10-22', '2026-10-22'))
      .toEqual({ outcome: 'MET', completedDays: 2, requiredDays: 2 });
  });

  it('does not count earlier daily check-ins towards a newly introduced weekly quota', () => {
    const revision: GoalPolicy = createPolicyRevision(count.habit, [count.policy],
      { target: 10, schedule: { type: 'WEEKLY_QUOTA', daysPerWeek: 2 },
        effectiveFromDate: '2026-10-21' }, day, 'weekly')!;
    const previousDaily = record(day, 10);
    const todayWeekly = record('2026-10-21', 10);
    expect(evaluateWeeklyQuotaByRevisions(count.habit, revision,
      [count.policy, revision], [previousDaily, todayWeekly], '2026-10-21', '2026-10-21'))
      .toEqual({ outcome: 'PENDING', completedDays: 1, requiredDays: 2 });
  });
});
