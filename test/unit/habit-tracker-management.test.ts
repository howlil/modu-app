import { describe, expect, it } from 'vitest';
import {
  archiveHabit, booleanCheckin, makeDailyBooleanHabit, renameHabit, restoreHabit
} from '../../src/lib/modules/habit-tracker/core/management.ts';
import { evaluateDailyOutcome } from '../../src/lib/modules/habit-tracker/core/evaluation.ts';
import { isHabitActiveOn } from '../../src/lib/modules/habit-tracker/core/scheduling.ts';

const make = () => makeDailyBooleanHabit('habit-id', 'Read for ten minutes', '2026-10-20');

describe('M1: daily boolean habit lifecycle', () => {
  it('creates one validated BUILD, DAILY, BOOLEAN goal', () => {
    const { habit, policy } = make();
    expect(habit).toMatchObject({ id: 'habit-id', title: 'Read for ten minutes', status: 'ACTIVE', direction: 'BUILD' });
    expect(policy).toMatchObject({ habitId: habit.id, measurement: 'BOOLEAN', target: 1, schedule: { type: 'DAILY' } });
  });
  it('trims names and rejects empty or overlong names', () => {
    const { habit } = make();
    expect(renameHabit(habit, '  Deep reading  ').title).toBe('Deep reading');
    expect(() => makeDailyBooleanHabit('id', '   ', '2026-10-20')).toThrow(RangeError);
    expect(() => renameHabit(habit, 'x'.repeat(81))).toThrow(RangeError);
  });
  it('makes a check-in from an explicit completed action and clears it on undo', () => {
    const { habit, policy } = make();
    const recorded = booleanCheckin(habit, policy, '2026-10-20', true);
    expect(recorded).toEqual({ habitId: habit.id, localDate: '2026-10-20', value: 1 });
    expect(evaluateDailyOutcome(habit, policy, recorded!, '2026-10-20', '2026-10-20')).toBe('MET');
    expect(booleanCheckin(habit, policy, '2026-10-20', false)).toBeNull();
    expect(evaluateDailyOutcome(habit, policy, undefined, '2026-10-20', '2026-10-20')).toBe('PENDING');
  });
  it('refuses check-ins before creation and while archived', () => {
    const { habit, policy } = make();
    expect(() => booleanCheckin(habit, policy, '2026-10-19', true)).toThrow(RangeError);
    expect(() => booleanCheckin(archiveHabit(habit, '2026-10-20'), policy, '2026-10-20', true)).toThrow(RangeError);
  });
  it('archives without erasing historical obligations and restores without retroactive missed dates', () => {
    const { habit } = make();
    const archived = archiveHabit(habit, '2026-10-22');
    expect(archived.status).toBe('ARCHIVED');
    expect(isHabitActiveOn(archived, '2026-10-21')).toBe(true);
    expect(isHabitActiveOn(archived, '2026-10-22')).toBe(true);
    expect(isHabitActiveOn(archived, '2026-10-23')).toBe(false);
    const restored = restoreHabit(archived, '2026-10-26');
    expect(restored.status).toBe('ACTIVE');
    expect(isHabitActiveOn(restored, '2026-10-25')).toBe(false);
    expect(isHabitActiveOn(restored, '2026-10-26')).toBe(true);
  });
  it('restoring on the same day cancels the just-created inactive range', () => {
    const { habit } = make();
    const restored = restoreHabit(archiveHabit(habit, '2026-10-20'), '2026-10-20');
    expect(restored.inactiveRanges).toEqual([]);
    expect(isHabitActiveOn(restored, '2026-10-20')).toBe(true);
  });
  it('preserves older inactive ranges over multiple archive and restore cycles', () => {
    const { habit } = make();
    const a = restoreHabit(archiveHabit(habit, '2026-10-21'), '2026-10-23');
    const b = restoreHabit(archiveHabit(a, '2026-10-25'), '2026-10-27');
    expect(b.inactiveRanges).toEqual([
      { fromDate: '2026-10-22', throughDate: '2026-10-22' },
      { fromDate: '2026-10-26', throughDate: '2026-10-26' }
    ]);
  });
  it('keeps a completed day MET after archiving on that date', () => {
    const { habit, policy } = make();
    const recorded = booleanCheckin(habit, policy, '2026-10-20', true);
    const archived = archiveHabit(habit, '2026-10-20');
    expect(evaluateDailyOutcome(archived, policy, recorded!, '2026-10-20', '2026-10-20')).toBe('MET');
    expect(evaluateDailyOutcome(archived, policy, undefined, '2026-10-21', '2026-10-21')).toBe('NOT_SCHEDULED');
    expect(() => booleanCheckin(archived, policy, '2026-10-20', true)).toThrow(RangeError);
  });
  it('rejects invalid archive and restore dates', () => {
    const { habit } = make();
    expect(() => archiveHabit(habit, '2026-02-30')).toThrow(RangeError);
    expect(() => restoreHabit(archiveHabit(habit, '2026-10-20'), '2026-02-30')).toThrow(RangeError);
  });
  it('rejects invalid creation dates and archive before creation', () => {
    expect(() => makeDailyBooleanHabit('id', 'Read', '2026-02-30')).toThrow(RangeError);
    expect(() => archiveHabit(make().habit, '2026-10-18')).toThrow(RangeError);
  });
});
