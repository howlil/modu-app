import type {
  GoalPolicy, HabitCheckin, HabitDefinition, LocalDate, ScheduleRule
} from './types.ts';
import { isDueOnDate, isHabitActiveOn, isLocalDate } from './scheduling.ts';
import { validateCheckin, validateGoalPolicy, validateHabit } from './validation.ts';

export type HabitSetup = (
  | { title: string; direction: 'QUIT'; measurement: 'AVOIDANCE' }
  | { title: string; direction: 'BUILD'; measurement: 'BOOLEAN' }
  | { title: string; direction: 'BUILD'; measurement: 'COUNT' | 'QUANTITY' | 'DURATION'; target: number; unit?: string }
) & { schedule?: ScheduleRule };

export type CheckinCommand =
  | { type: 'adjust'; delta: number }
  | { type: 'set'; value: number }
  | { type: 'attest'; attestation: 'CLEAN' | 'LAPSE' }
  | { type: 'clear' };

function assertValid(result: ReturnType<typeof validateCheckin>): void {
  if (!result.ok) throw new RangeError(result.issues.join(' '));
}

/** M3 exposes all supported schedules while preserving M2's default DAILY. */
export function makeConfiguredDailyHabit(
  id: string, input: HabitSetup, date: LocalDate
): { habit: HabitDefinition; policy: GoalPolicy } {
  const habit: HabitDefinition = {
    id, title: input.title.trim(), direction: input.direction, status: 'ACTIVE', createdDate: date
  };
  const policy: GoalPolicy = {
    id: id + ':initial', habitId: id, effectiveFromDate: date,
    measurement: input.measurement,
    target: input.measurement === 'AVOIDANCE' || input.measurement === 'BOOLEAN' ? 1 : input.target,
    ...(input.measurement === 'QUANTITY' || input.measurement === 'COUNT' || input.measurement === 'DURATION'
      ? { unit: input.measurement === 'DURATION' ? 'min' : input.measurement === 'COUNT' ? input.unit?.trim() || 'times' : input.unit?.trim() }
      : {}),
    schedule: input.schedule ?? { type: 'DAILY' }
  };
  assertValid(validateHabit(habit));
  assertValid(validateGoalPolicy(policy, habit.direction));
  return { habit, policy };
}

/**
 * Pure transition applied to the newest persisted aggregate, not to a stale UI value.
 * There is one check-in per habit/local date. All transitions are atomic in the adapter.
 */
export function applyCheckinCommand(
  habit: HabitDefinition, policy: GoalPolicy,
  current: HabitCheckin | undefined, date: LocalDate, command: CheckinCommand
): HabitCheckin | null {
  if (!isLocalDate(date) || !isHabitActiveOn(habit, date) ||
    date < policy.effectiveFromDate || policy.habitId !== habit.id ||
    !isDueOnDate(policy.schedule, date)) throw new RangeError('This habit is not scheduled on the selected date.');
  if (current && (current.habitId !== habit.id || current.localDate !== date)) {
    throw new RangeError('Check-in identity mismatch.');
  }
  if (command.type === 'clear') return null;

  if (policy.measurement === 'AVOIDANCE') {
    if (command.type !== 'attest') throw new RangeError('Quit habits require CLEAN or LAPSE.');
    const next: HabitCheckin = { habitId: habit.id, localDate: date, attestation: command.attestation };
    assertValid(validateCheckin(next, policy));
    return next;
  }

  if (command.type === 'attest') throw new RangeError('Attestation is only valid for quit habits.');

  const previous = current?.value ?? 0;
  const nextValue = command.type === 'set' ? command.value : previous + command.delta;
  if (!Number.isFinite(nextValue) || nextValue < 0 || nextValue > 1_000_000_000) {
    throw new RangeError('Progress must be finite, nonnegative, and within supported limits.');
  }
  if (policy.measurement === 'BOOLEAN' && ![0, 1].includes(nextValue)) {
    throw new RangeError('Boolean check-in must be zero or one.');
  }
  // Resolve binary floating point drift while retaining up to 6 decimal places.
  const normalized = Math.round(nextValue * 1_000_000) / 1_000_000;
  if (Math.abs(nextValue - normalized) > 1e-9) {
    throw new RangeError('Progress supports at most six decimal places.');
  }
  const next: HabitCheckin = { habitId: habit.id, localDate: date, value: normalized };
  assertValid(validateCheckin(next, policy));
  return next;
}
