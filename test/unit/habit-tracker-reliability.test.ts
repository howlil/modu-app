import { describe, expect, it, vi } from 'vitest';
import { commitThenRefresh } from '../../src/lib/modules/habit-tracker/controller/habit-tracker.svelte.ts';
import {
  HabitStorageError, validateHabitSnapshot, type HabitSnapshot
} from '../../src/lib/modules/habit-tracker/adapters/persistence.ts';
import { makeDailyBooleanHabit } from '../../src/lib/modules/habit-tracker/core/management.ts';

const validSnapshot = (): HabitSnapshot => {
  const { habit, policy } = makeDailyBooleanHabit('h1', 'Read', '2026-10-20');
  return { habits: [habit], policies: [policy], checkins: [] };
};

describe('M1 regression: commit is distinct from refresh', () => {
  it('treats a committed write with a successful refresh as fully refreshed', async () => {
    const calls: string[] = [];
    const result = await commitThenRefresh(
      async () => { calls.push('write'); },
      async () => { calls.push('refresh'); return true; }
    );
    expect(result).toBe('refreshed');
    expect(calls).toEqual(['write', 'refresh']);
  });

  it('does not claim a failed write was committed or attempt a refresh', async () => {
    const read = vi.fn(async () => true);
    await expect(commitThenRefresh(
      async () => { throw new HabitStorageError('Quota exceeded'); }, read
    )).rejects.toThrow('Quota exceeded');
    expect(read).not.toHaveBeenCalled();
  });

  it('retains the committed result if snapshot refresh returns false', async () => {
    const write = vi.fn(async () => {});
    const result = await commitThenRefresh(write, async () => false);
    expect(result).toBe('committed-refresh-failed');
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('retains the committed result if snapshot refresh itself throws', async () => {
    const write = vi.fn(async () => {});
    const result = await commitThenRefresh(write, async () => {
      throw new HabitStorageError('Read failed');
    });
    expect(result).toBe('committed-refresh-failed');
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe('M1 regression: verify snapshot integrity before exposing Today', () => {
  it('accepts a complete newly created habit and initial policy', () => {
    expect(validateHabitSnapshot(validSnapshot()).habits).toHaveLength(1);
  });

  it('rejects a habit missing an initial policy', () => {
    const snapshot = validSnapshot();
    snapshot.policies = [];
    expect(() => validateHabitSnapshot(snapshot)).toThrow(HabitStorageError);
    expect(() => validateHabitSnapshot(snapshot)).toThrow('missing its initial policy');
  });

  it('rejects a habit whose earliest policy starts after its creation date', () => {
    const snapshot = validSnapshot();
    snapshot.policies[0].effectiveFromDate = '2026-10-21';
    expect(() => validateHabitSnapshot(snapshot)).toThrow('missing its initial policy');
  });

  it('rejects duplicate revision effective dates before the UI is made ready', () => {
    const snapshot = validSnapshot();
    snapshot.policies.push({ ...snapshot.policies[0], id: 'p2' });
    expect(() => validateHabitSnapshot(snapshot)).toThrow('Conflicting habit policy versions');
  });

  it('rejects orphaned check-ins', () => {
    const snapshot = validSnapshot();
    snapshot.checkins.push({ habitId: 'no-such-habit', localDate: '2026-10-20', value: 1 });
    expect(() => validateHabitSnapshot(snapshot)).toThrow('Invalid saved check-in');
  });
});
