import { describe, expect, it } from 'vitest';

import { getRemainingMs, type TimerState } from '../../../src/lib/modules/pomodoro/timer.ts';

describe('getRemainingMs', () => {
  it('derives running time from endsAt rather than decrementing state', () => {
    const timer: TimerState = {
      startedAt: 1_000,
      durationMs: 25_000,
      endsAt: 26_000,
      status: 'running'
    };

    expect(getRemainingMs(timer, 6_000)).toBe(20_000);
  });

  it('never returns a negative remaining duration', () => {
    const timer: TimerState = {
      startedAt: 1_000,
      durationMs: 25_000,
      endsAt: 26_000,
      status: 'running'
    };

    expect(getRemainingMs(timer, 30_000)).toBe(0);
  });
});
