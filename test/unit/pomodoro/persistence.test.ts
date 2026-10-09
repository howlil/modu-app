import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPomodoroSnapshot,
  readPomodoroSnapshot,
  savePomodoroSnapshot
} from '../../../src/lib/modules/pomodoro/adapters/persistence.ts';

afterEach(() => vi.unstubAllGlobals());

describe('pomodoro persistent snapshot', () => {
  it('preserves the existing v2 key and serialized fields', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    });

    savePomodoroSnapshot({
      focusText: 'writing',
      dailyGoalHours: 4,
      goalSchedule: 'weekdays',
      timer: { mode: 'focus', status: 'paused', remainingMs: 10_000 }
    });
    expect(values.has('module-pomodoro-v2')).toBe(true);
    expect(readPomodoroSnapshot()).toMatchObject({
      focusText: 'writing',
      dailyGoalHours: 4,
      timer: { mode: 'focus', status: 'paused', remainingMs: 10_000 }
    });

    clearPomodoroSnapshot();
    expect(readPomodoroSnapshot()).toBeNull();
  });

  it('keeps invalid JSON visible to the caller for recovery', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{bad' });
    expect(() => readPomodoroSnapshot()).toThrow();
  });
});
