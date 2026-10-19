import { describe, expect, it } from 'vitest';
import type { HabitCheckin } from '../../src/lib/modules/habit-tracker/core/types.ts';
import { applyCheckinCommand, makeConfiguredDailyHabit } from '../../src/lib/modules/habit-tracker/core/progress.ts';
import { evaluateDailyOutcome } from '../../src/lib/modules/habit-tracker/core/evaluation.ts';
import { archiveHabit } from '../../src/lib/modules/habit-tracker/core/management.ts';

const day = '2026-10-20';
function build(measurement: 'COUNT' | 'QUANTITY' | 'DURATION', target: number, unit?: string) {
  return makeConfiguredDailyHabit('a', { title: 'Test', direction: 'BUILD', measurement, target, unit }, day);
}
function progress(measurement: 'COUNT' | 'QUANTITY' | 'DURATION', target: number, unit: string | undefined, amounts: number[]) {
  const { habit, policy } = build(measurement, target, unit);
  let record: HabitCheckin | null = null;
  for (const delta of amounts) record = applyCheckinCommand(habit, policy, record ?? undefined, day, { type: 'adjust', delta });
  return { habit, policy, record };
}

describe('M2 measurement contracts', () => {
  it('creates count, quantity, duration and quit habits without exposing flexible schedules', () => {
    const count = build('COUNT', 30);
    const water = build('QUANTITY', 2.5, 'litre');
    const duration = build('DURATION', 45);
    const quit = makeConfiguredDailyHabit('q', { title: 'No soda', direction: 'QUIT', measurement: 'AVOIDANCE' }, day);
    expect(count.policy).toMatchObject({ measurement: 'COUNT', target: 30, schedule: { type: 'DAILY' } });
    expect(water.policy).toMatchObject({ measurement: 'QUANTITY', target: 2.5, unit: 'litre' });
    expect(duration.policy).toMatchObject({ measurement: 'DURATION', target: 45, unit: 'min' });
    expect(quit.policy).toMatchObject({ measurement: 'AVOIDANCE', target: 1 });
  });

  it('rejects invalid nonpositive targets, missing units, and fractional count/duration', () => {
    expect(() => build('COUNT', -2)).toThrow(RangeError);
    expect(() => build('COUNT', 2.5)).toThrow(RangeError);
    expect(() => build('DURATION', 7.5)).toThrow(RangeError);
    expect(() => build('QUANTITY', 2.5)).toThrow(RangeError);
    expect(() => build('QUANTITY', Number.NaN, 'ml')).toThrow(RangeError);
  });

  it('counts increments and manual corrections without mutating source records', () => {
    const { habit, policy } = build('COUNT', 3);
    const first = applyCheckinCommand(habit, policy, undefined, day, { type: 'adjust', delta: 1 });
    const second = applyCheckinCommand(habit, policy, first ?? undefined, day, { type: 'adjust', delta: 1 });
    const corrected = applyCheckinCommand(habit, policy, second ?? undefined, day, { type: 'set', value: 3 });
    expect(first?.value).toBe(1);
    expect(second?.value).toBe(2);
    expect(corrected?.value).toBe(3);
    expect(evaluateDailyOutcome(habit, policy, first ?? undefined, day, day)).toBe('PARTIAL');
    expect(evaluateDailyOutcome(habit, policy, corrected ?? undefined, day, day)).toBe('MET');
    expect(applyCheckinCommand(habit, policy, corrected ?? undefined, day, { type: 'clear' })).toBeNull();
  });

  it('handles quantity decimals predictably and allows decrement below goal', () => {
    const { habit, policy, record } = progress('QUANTITY', 0.5, 'litre', [0.1, 0.2, 0.2]);
    expect(record?.value).toBe(0.5);
    const corrected = applyCheckinCommand(habit, policy, record ?? undefined, day, { type: 'adjust', delta: -0.1 });
    expect(corrected?.value).toBe(0.4);
    expect(evaluateDailyOutcome(habit, policy, corrected ?? undefined, day, day)).toBe('PARTIAL');
  });

  it('manually records duration in whole minutes', () => {
    const { habit, policy, record } = progress('DURATION', 20, 'min', [5, 10, 5]);
    expect(record?.value).toBe(20);
    expect(evaluateDailyOutcome(habit, policy, record ?? undefined, day, day)).toBe('MET');
    expect(() => applyCheckinCommand(habit, policy, record ?? undefined, day, { type: 'set', value: 20.5 })).toThrow(RangeError);
  });

  it('never infers clean day without an explicit attestation', () => {
    const { habit, policy } = makeConfiguredDailyHabit('q', { title: 'No soda', direction: 'QUIT', measurement: 'AVOIDANCE' }, day);
    expect(evaluateDailyOutcome(habit, policy, undefined, day, day)).toBe('PENDING');
    const clean = applyCheckinCommand(habit, policy, undefined, day, { type: 'attest', attestation: 'CLEAN' });
    const lapse = applyCheckinCommand(habit, policy, clean ?? undefined, day, { type: 'attest', attestation: 'LAPSE' });
    expect(evaluateDailyOutcome(habit, policy, clean ?? undefined, day, day)).toBe('MET');
    expect(evaluateDailyOutcome(habit, policy, lapse ?? undefined, day, day)).toBe('MISSED');
    expect(applyCheckinCommand(habit, policy, lapse ?? undefined, day, { type: 'clear' })).toBeNull();
  });

  it('rejects wrong command kind, negative progress, and nonfinite input', () => {
    const { habit, policy } = build('COUNT', 2);
    expect(() => applyCheckinCommand(habit, policy, undefined, day, { type: 'attest', attestation: 'CLEAN' })).toThrow(RangeError);
    expect(() => applyCheckinCommand(habit, policy, undefined, day, { type: 'adjust', delta: -1 })).toThrow(RangeError);
    expect(() => applyCheckinCommand(habit, policy, undefined, day, { type: 'set', value: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    const quit = makeConfiguredDailyHabit('q', { title: 'Quit', direction: 'QUIT', measurement: 'AVOIDANCE' }, day);
    expect(() => applyCheckinCommand(quit.habit, quit.policy, undefined, day, { type: 'set', value: 1 })).toThrow(RangeError);
  });

  it('rejects future-ineligible dates, archives, and foreign check-ins', () => {
    const { habit, policy } = build('COUNT', 2);
    expect(() => applyCheckinCommand(habit, policy, undefined, '2026-10-19', { type: 'set', value: 1 })).toThrow(RangeError);
    expect(() => applyCheckinCommand(archiveHabit(habit, day), policy, undefined, '2026-10-21', { type: 'set', value: 1 })).toThrow(RangeError);
    expect(() => applyCheckinCommand(habit, policy, { habitId: 'other', localDate: day, value: 1 }, day, { type: 'adjust', delta: 1 })).toThrow(RangeError);
  });

  it('allows a past-date correction using the policy of that date', () => {
    const { habit, policy } = makeConfiguredDailyHabit('h', { title: 'Read', direction: 'BUILD', measurement: 'BOOLEAN' }, '2026-10-10');
    const past = applyCheckinCommand(habit, policy, undefined, '2026-10-13', { type: 'set', value: 1 });
    expect(evaluateDailyOutcome(habit, policy, past ?? undefined, '2026-10-13', day)).toBe('MET');
    expect(evaluateDailyOutcome(habit, policy, undefined, '2026-10-14', day)).toBe('MISSED');
  });
});
