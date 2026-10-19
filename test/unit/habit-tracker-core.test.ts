import { describe, expect, it } from 'vitest';
import type { GoalPolicy, HabitCheckin, HabitDefinition } from '../../src/lib/modules/habit-tracker/core/types.ts';
import {
  addCalendarDays, isDueOnDate, isHabitActiveOn, isLocalDate,
  mondayOf, resolveEffectivePolicy, PolicyConflictError, PolicyNotFoundError
} from '../../src/lib/modules/habit-tracker/core/scheduling.ts';
import {
  calculateCompletionRate, calculateStreak, evaluateDailyOutcome,
  evaluateWeeklyQuota
} from '../../src/lib/modules/habit-tracker/core/evaluation.ts';
import {
  validateHabit, validateGoalPolicy, validatePolicyRevisions, validateCheckin
} from '../../src/lib/modules/habit-tracker/core/validation.ts';

const habit: HabitDefinition = {
  id: 'h1', title: 'Read', direction: 'BUILD', status: 'ACTIVE', createdDate: '2026-10-01'
};
const policy: GoalPolicy = {
  id: 'p1', habitId: 'h1', effectiveFromDate: '2026-10-01',
  measurement: 'BOOLEAN', target: 1, schedule: { type: 'DAILY' }
};
const checkin = (date: string, value: number): HabitCheckin =>
  ({ habitId: 'h1', localDate: date, value });

describe('M0 calendar and policy contracts', () => {
  it('validates actual calendar dates including leap days', () => {
    expect(isLocalDate('2024-02-29')).toBe(true);
    expect(isLocalDate('2025-02-29')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('10/20/2026')).toBe(false);
  });
  it('adds calendar days across months and DST windows without local-midnight arithmetic', () => {
    expect(addCalendarDays('2026-03-07', 2)).toBe('2026-03-09');
    expect(addCalendarDays('2026-10-31', 2)).toBe('2026-11-02');
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(mondayOf('2026-10-20')).toBe('2026-10-19');
  });
  it('supports fixed weekdays without marking other days due', () => {
    const fixed = { type: 'WEEKDAYS', weekdays: [1, 3, 5] } as const;
    expect(isDueOnDate(fixed, '2026-10-19')).toBe(true);
    expect(isDueOnDate(fixed, '2026-10-20')).toBe(false);
    expect(isDueOnDate(fixed, '2026-10-21')).toBe(true);
    expect(evaluateDailyOutcome(habit, { ...policy, schedule: fixed }, undefined, '2026-10-20', '2026-10-20'))
      .toBe('NOT_SCHEDULED');
  });
  it('supports anchored intervals by calendar day, not elapsed hours', () => {
    const everyTwo = { type: 'INTERVAL', anchorDate: '2026-10-01', everyDays: 2 } as const;
    expect(isDueOnDate(everyTwo, '2026-10-01')).toBe(true);
    expect(isDueOnDate(everyTwo, '2026-10-02')).toBe(false);
    expect(isDueOnDate(everyTwo, '2026-10-03')).toBe(true);
    expect(isDueOnDate(everyTwo, '2026-09-30')).toBe(false);
  });
  it('resolves revised targets without retroactively changing historic policies', () => {
    const newer: GoalPolicy = { ...policy, id: 'p2', target: 20, measurement: 'COUNT',
      effectiveFromDate: '2026-10-16' };
    expect(resolveEffectivePolicy('h1', '2026-10-15', [newer, policy])).toBe(policy);
    expect(resolveEffectivePolicy('h1', '2026-10-16', [newer, policy])).toBe(newer);
    expect(() => resolveEffectivePolicy('h1', '2026-09-20', [newer, policy]))
      .toThrow(PolicyNotFoundError);
    expect(() => resolveEffectivePolicy('h1', '2026-10-16', [newer, { ...newer, id: 'p3' }]))
      .toThrow(PolicyConflictError);
  });
  it('honors archive/restore inactive ranges without retroactive obligations', () => {
    const restored: HabitDefinition = { ...habit, inactiveRanges: [
      { fromDate: '2026-10-10', throughDate: '2026-10-15' }
    ] };
    expect(isHabitActiveOn(restored, '2026-10-09')).toBe(true);
    expect(isHabitActiveOn(restored, '2026-10-12')).toBe(false);
    expect(isHabitActiveOn(restored, '2026-10-16')).toBe(true);
  });
});

describe('M0 progress and outcome contracts', () => {
  it('counts boolean completion, pending today, and missed yesterday', () => {
    expect(evaluateDailyOutcome(habit, policy, checkin('2026-10-20', 1), '2026-10-20', '2026-10-20')).toBe('MET');
    expect(evaluateDailyOutcome(habit, policy, undefined, '2026-10-20', '2026-10-20')).toBe('PENDING');
    expect(evaluateDailyOutcome(habit, policy, undefined, '2026-10-19', '2026-10-20')).toBe('MISSED');
  });
  it('does not declare future dates missed or before-creation dates due', () => {
    expect(evaluateDailyOutcome(habit, policy, undefined, '2026-10-21', '2026-10-20')).toBe('PENDING');
    expect(evaluateDailyOutcome(habit, policy, undefined, '2026-09-30', '2026-10-20')).toBe('NOT_SCHEDULED');
  });
  it('reports partial quantity today and met at its target', () => {
    const q: GoalPolicy = { ...policy, measurement: 'QUANTITY', target: 500, unit: 'ml' };
    expect(evaluateDailyOutcome(habit, q, checkin('2026-10-20', 400), '2026-10-20', '2026-10-20')).toBe('PARTIAL');
    expect(evaluateDailyOutcome(habit, q, checkin('2026-10-20', 500), '2026-10-20', '2026-10-20')).toBe('MET');
    expect(evaluateDailyOutcome(habit, q, checkin('2026-10-19', 400), '2026-10-19', '2026-10-20')).toBe('MISSED');
  });
  it('does not infer quit success without explicit clean-day attestation', () => {
    const q: GoalPolicy = { ...policy, measurement: 'AVOIDANCE' };
    const h: HabitDefinition = { ...habit, direction: 'QUIT' };
    expect(evaluateDailyOutcome(h, q, undefined, '2026-10-20', '2026-10-20')).toBe('PENDING');
    expect(evaluateDailyOutcome(h, q, undefined, '2026-10-19', '2026-10-20')).toBe('MISSED');
    expect(evaluateDailyOutcome(h, q, { habitId: h.id, localDate: '2026-10-20', attestation: 'CLEAN' }, '2026-10-20', '2026-10-20')).toBe('MET');
    expect(evaluateDailyOutcome(h, q, { habitId: h.id, localDate: '2026-10-20', attestation: 'LAPSE' }, '2026-10-20', '2026-10-20')).toBe('MISSED');
  });
  it('never treats an individual uncompleted weekly quota opportunity as a missed day', () => {
    const q: GoalPolicy = { ...policy, schedule: { type: 'WEEKLY_QUOTA', daysPerWeek: 3 } };
    expect(evaluateDailyOutcome(habit, q, undefined, '2026-10-19', '2026-10-20')).toBe('PENDING');
  });
  it('deduplicates repeated successful checkins by date for weekly quota', () => {
    const q: GoalPolicy = { ...policy, schedule: { type: 'WEEKLY_QUOTA', daysPerWeek: 3 } };
    const rows = [checkin('2026-10-19', 1), checkin('2026-10-19', 1), checkin('2026-10-20', 1)];
    expect(evaluateWeeklyQuota(habit, q, rows, '2026-10-20', '2026-10-20'))
      .toEqual({ outcome: 'PENDING', completedDays: 2, requiredDays: 3 });
    expect(evaluateWeeklyQuota(habit, q, [...rows, checkin('2026-10-21', 1)], '2026-10-20', '2026-10-21'))
      .toEqual({ outcome: 'MET', completedDays: 3, requiredDays: 3 });
    expect(evaluateWeeklyQuota(habit, q, rows, '2026-10-20', '2026-10-26'))
      .toEqual({ outcome: 'MISSED', completedDays: 2, requiredDays: 3 });
  });
  it('treats skipped as neutral for streak and removes it from completion rate', () => {
    expect(calculateStreak(['MET', 'SKIPPED', 'MET', 'NOT_SCHEDULED', 'MISSED', 'MET']))
      .toEqual({ current: 1, longest: 2 });
    expect(calculateCompletionRate(['MET', 'SKIPPED', 'MET', 'PENDING', 'MISSED']))
      .toEqual({ met: 2, eligible: 3, rate: 2 / 3 });
    expect(calculateCompletionRate(['SKIPPED', 'PENDING'])).toEqual({ met: 0, eligible: 0, rate: null });
  });
  it('keeps historically archived dates not scheduled', () => {
    const archived: HabitDefinition = { ...habit, status: 'ARCHIVED', inactiveRanges: [{ fromDate: '2026-10-18' }] };
    expect(evaluateDailyOutcome(archived, policy, undefined, '2026-10-19', '2026-10-20')).toBe('NOT_SCHEDULED');
  });
});

describe('M0 boundary validation', () => {
  it('rejects invalid targets, measurement direction and recurrence', () => {
    expect(validateGoalPolicy({ ...policy, target: -1 }, 'BUILD').ok).toBe(false);
    expect(validateGoalPolicy({ ...policy, target: Number.NaN }, 'BUILD').ok).toBe(false);
    expect(validateGoalPolicy({ ...policy, measurement: 'AVOIDANCE' }, 'BUILD').ok).toBe(false);
    expect(validateGoalPolicy({ ...policy, schedule: { type: 'WEEKLY_QUOTA', daysPerWeek: 8 } }, 'BUILD').ok).toBe(false);
    expect(validateGoalPolicy({ ...policy, schedule: { type: 'WEEKDAYS', weekdays: [] } }, 'BUILD').ok).toBe(false);
    expect(validateGoalPolicy({ ...policy, schedule: { type: 'INTERVAL', anchorDate: '2026-10-20', everyDays: 0 } }, 'BUILD').ok).toBe(false);
    expect(validateGoalPolicy(policy, 'BUILD').ok).toBe(true);
  });
  it('rejects malformed habit lifecycle or overlapping inactive ranges', () => {
    expect(validateHabit(habit).ok).toBe(true);
    expect(validateHabit({ ...habit, status: 'ARCHIVED' }).ok).toBe(false);
    expect(validateHabit({ ...habit, inactiveRanges: [
      { fromDate: '2026-10-01', throughDate: '2026-10-15' },
      { fromDate: '2026-10-12', throughDate: '2026-10-16' }
    ] }).ok).toBe(false);
  });
  it('rejects invalid checkins and policy revisions', () => {
    expect(validateCheckin(checkin('2026-10-20', 1), policy).ok).toBe(true);
    expect(validateCheckin(checkin('2026-10-20', -1), policy).ok).toBe(false);
    expect(validateCheckin(checkin('2026-10-20', 3), policy).ok).toBe(false);
    expect(validateCheckin({ ...checkin('2026-10-20', 1), skipped: true }, policy).ok).toBe(false);
    expect(validatePolicyRevisions([policy, { ...policy, id: 'p2' }]).ok).toBe(false);
  });
});
