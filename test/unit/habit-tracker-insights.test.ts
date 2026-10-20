import { describe, expect, it } from 'vitest';
import type { HabitCheckin, GoalPolicy, HabitDefinition } from '../../src/lib/modules/habit-tracker/core/types.ts';
import { makeConfiguredDailyHabit } from '../../src/lib/modules/habit-tracker/core/progress.ts';
import { archiveHabit } from '../../src/lib/modules/habit-tracker/core/management.ts';
import { createPolicyRevision } from '../../src/lib/modules/habit-tracker/core/policy.ts';
import {
  createInsightSnapshot, deriveInsightPeriods, monthGrid, shiftMonth, summarizeCalendarDay
} from '../../src/lib/modules/habit-tracker/core/insights.ts';

function make(id: string, date = '2026-10-19') {
  return makeConfiguredDailyHabit(id, {
    title: 'Habit ' + id, direction: 'BUILD', measurement: 'BOOLEAN'
  }, date);
}
const done = (habitId: string, localDate: string): HabitCheckin => ({ habitId, localDate, value: 1 });

describe('M4 month calendar', () => {
  it('lays out a Monday-first grid and handles December/January navigation', () => {
    const october = monthGrid('2026-10');
    expect(october.slice(0, 3)).toEqual([null, null, null]);
    expect(october[3]).toBe('2026-10-01');
    expect(october.at(-1)).toBe('2026-10-31');
    expect(monthGrid('2024-02').filter(Boolean)).toHaveLength(29);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(() => monthGrid('2026-13')).toThrow(RangeError);
  });

  it('marks future dates neutral and does not manufacture historical obligations', () => {
    const { habit, policy } = make('a');
    expect(summarizeCalendarDay([habit], [policy], [], '2026-10-25', '2026-10-20'))
      .toMatchObject({ status: 'NOT_SCHEDULED', scheduled: 0 });
    expect(summarizeCalendarDay([habit], [policy], [], '2026-10-18', '2026-10-20'))
      .toMatchObject({ status: 'NOT_SCHEDULED', scheduled: 0 });
  });

  it('distinguishes MET, MISSED, and PENDING on daily due dates', () => {
    const { habit, policy } = make('a');
    const checkins = [done('a', '2026-10-19')];
    expect(summarizeCalendarDay([habit], [policy], checkins, '2026-10-19', '2026-10-21').status).toBe('MET');
    expect(summarizeCalendarDay([habit], [policy], checkins, '2026-10-20', '2026-10-21').status).toBe('MISSED');
    expect(summarizeCalendarDay([habit], [policy], checkins, '2026-10-21', '2026-10-21').status).toBe('PENDING');
  });

  it('does not treat weekday off-days or quota dates as daily failures', () => {
    const weekday = makeConfiguredDailyHabit('weekday', {
      title: 'Weekday', direction: 'BUILD', measurement: 'BOOLEAN',
      schedule: { type: 'WEEKDAYS', weekdays: [1, 3, 5] }
    }, '2026-10-19');
    const quota = makeConfiguredDailyHabit('quota', {
      title: 'Quota', direction: 'BUILD', measurement: 'BOOLEAN',
      schedule: { type: 'WEEKLY_QUOTA', daysPerWeek: 2 }
    }, '2026-10-19');
    const thursday = summarizeCalendarDay([weekday.habit, quota.habit],
      [weekday.policy, quota.policy], [done('quota', '2026-10-22')],
      '2026-10-22', '2026-10-23');
    expect(thursday).toMatchObject({
      scheduled: 0, missed: 0, met: 0, status: 'NOT_SCHEDULED',
      weeklyOpportunity: 1, weeklyQualified: 1
    });
  });

  it('keeps explicit legacy-archive MET evidence in calendar', () => {
    const { habit, policy } = make('a');
    const archived: HabitDefinition = {
      ...habit, status: 'ARCHIVED',
      inactiveRanges: [{ fromDate: '2026-10-20' }]
    };
    expect(summarizeCalendarDay([archived], [policy], [done('a', '2026-10-20')],
      '2026-10-20', '2026-10-23').status).toBe('MET');
  });
});

describe('M4 period insights and streak boundaries', () => {
  it('counts weekly quota once per week instead of once per successful date', () => {
    const { habit, policy } = makeConfiguredDailyHabit('q', {
      title: 'Gym', direction: 'BUILD', measurement: 'BOOLEAN',
      schedule: { type: 'WEEKLY_QUOTA', daysPerWeek: 2 }
    }, '2026-10-19');
    const checkins = [done('q', '2026-10-19'), done('q', '2026-10-21')];
    const snapshot = createInsightSnapshot([habit], [policy], checkins, '2026-10-25');
    expect(snapshot.periods).toHaveLength(1);
    expect(snapshot.periods[0]).toMatchObject({ kind: 'WEEKLY', outcome: 'MET' });
    expect(snapshot.met).toBe(1);
    expect(snapshot.eligible).toBe(1);
    expect(snapshot.rate).toBe(1);
    expect(snapshot.longestStreak).toBe(1);
  });

  it('attributes an open week crossing month-end to the current reporting month', () => {
    const quota = makeConfiguredDailyHabit('cross', {
      title: 'Weekly review', direction: 'BUILD', measurement: 'BOOLEAN',
      schedule: { type: 'WEEKLY_QUOTA', daysPerWeek: 1 }
    }, '2026-10-26');
    const progress = createInsightSnapshot([quota.habit], [quota.policy],
      [done('cross', '2026-10-30')], '2026-10-31');
    expect(progress.periods).toHaveLength(1);
    expect(progress.periods[0]).toMatchObject({
      date: '2026-10-31', kind: 'WEEKLY', outcome: 'MET'
    });
    const finalized = createInsightSnapshot([quota.habit], [quota.policy],
      [done('cross', '2026-10-30')], '2026-11-02');
    expect(finalized.periods[0].date).toBe('2026-11-01');
  });

  it('does not mark an unfinished weekly quota as missed before Sunday closes', () => {
    const { habit, policy } = makeConfiguredDailyHabit('q', {
      title: 'Exercise', direction: 'BUILD', measurement: 'COUNT', target: 10,
      schedule: { type: 'WEEKLY_QUOTA', daysPerWeek: 3 }
    }, '2026-10-19');
    const active = createInsightSnapshot([habit], [policy],
      [{ habitId: 'q', localDate: '2026-10-20', value: 10 }], '2026-10-20');
    expect(active.periods).toHaveLength(1);
    expect(active.periods[0].outcome).toBe('PENDING');
    expect(active.rate).toBeNull();
    const closed = createInsightSnapshot([habit], [policy],
      [{ habitId: 'q', localDate: '2026-10-20', value: 10 }], '2026-10-26');
    expect(closed.periods.map(p => p.outcome)).toEqual(['MISSED', 'PENDING']);
    expect(closed.eligible).toBe(1);
    expect(closed.missed).toBe(1);
  });

  it('does not combine two habits on the same date into a fictitious two-day streak', () => {
    const a = make('a');
    const b = make('b');
    const snapshot = createInsightSnapshot([a.habit, b.habit], [a.policy, b.policy],
      [done('a', '2026-10-19'), done('b', '2026-10-19')], '2026-10-19');
    expect(snapshot.met).toBe(2);
    expect(snapshot.eligible).toBe(2);
    expect(snapshot.currentStreak).toBe(1);
    expect(snapshot.longestStreak).toBe(1);
  });

  it('preserves old daily targets when a revision introduces a weekly quota', () => {
    const a = makeConfiguredDailyHabit('a', {
      title: 'Read', direction: 'BUILD', measurement: 'COUNT', target: 10
    }, '2026-10-19');
    const revised = createPolicyRevision(a.habit, [a.policy], {
      target: 20, schedule: { type: 'WEEKLY_QUOTA', daysPerWeek: 2 },
      effectiveFromDate: '2026-10-21'
    }, '2026-10-20', 'revision') as GoalPolicy;
    const records: HabitCheckin[] = [
      { habitId: 'a', localDate: '2026-10-19', value: 10 },
      { habitId: 'a', localDate: '2026-10-21', value: 20 },
      { habitId: 'a', localDate: '2026-10-22', value: 20 }
    ];
    const periods = deriveInsightPeriods([a.habit], [a.policy, revised],
      records, '2026-10-19', '2026-10-25');
    expect(periods.filter(p => p.kind === 'DAILY')).toHaveLength(2);
    expect(periods.filter(p => p.kind === 'WEEKLY')).toHaveLength(1);
    expect(periods.filter(p => p.outcome === 'MET')).toHaveLength(2);
    expect(periods.filter(p => p.outcome === 'MISSED')).toHaveLength(1);
  });

  it('retains archived history without inventing obligations after the archive', () => {
    const a = make('a');
    const archived = archiveHabit(a.habit, '2026-10-20');
    const snapshot = createInsightSnapshot([archived], [a.policy],
      [done('a', '2026-10-19'), done('a', '2026-10-20')], '2026-10-27');
    expect(snapshot.periods).toHaveLength(2);
    expect(snapshot.eligible).toBe(2);
    expect(snapshot.met).toBe(2);
  });

  it('keeps archived historical streaks but does not call them current', () => {
    const a = make('a');
    const archived = archiveHabit(a.habit, '2026-10-20');
    const view = createInsightSnapshot([archived], [a.policy],
      [done('a', '2026-10-19'), done('a', '2026-10-20')], '2026-10-21');
    expect(view.longestStreak).toBe(2);
    expect(view.currentStreak).toBe(0);
  });

  it('keeps an explicit skipped day outside the completion rate denominator', () => {
    const a = make('a');
    const records: HabitCheckin[] = [
      { habitId: 'a', localDate: '2026-10-19', skipped: true },
      done('a', '2026-10-20')
    ];
    const snap = createInsightSnapshot([a.habit], [a.policy], records, '2026-10-20');
    expect(snap.periods.map(p => p.outcome)).toEqual(['SKIPPED', 'MET']);
    expect(snap.eligible).toBe(1);
    expect(snap.rate).toBe(1);
  });

  it('filters insights to one habit without mutating the underlying records', () => {
    const a = make('a');
    const b = make('b');
    const records = [done('a', '2026-10-19')];
    const filtered = createInsightSnapshot([a.habit, b.habit], [a.policy, b.policy],
      records, '2026-10-20', 'a');
    expect(filtered.periods).toHaveLength(2);
    expect(filtered.met).toBe(1);
    expect(filtered.missed).toBe(0);
    expect(filtered.periods[1].outcome).toBe('PENDING');
    expect(records).toHaveLength(1);
  });

  it('reports a truncated history window instead of silently claiming lifetime coverage', () => {
    const a = make('a', '2010-01-01');
    const snapshot = createInsightSnapshot([a.habit], [a.policy], [], '2026-10-20');
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.fromDate > '2010-01-01').toBe(true);
    expect(snapshot.periods.length).toBeLessThanOrEqual(3654);
  });
});
