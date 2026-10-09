import { describe, expect, it } from 'vitest';

import {
  completeTimer,
  createTimer,
  getNextMode,
  getOvertimeMs,
  getRemainingMs,
  pauseTimer,
  startTimer,
  switchMode,
  syncTimer
} from '../../../src/lib/modules/pomodoro/core/timer.ts';

describe('pomodoro timer', () => {
  it('derives running time from endsAt rather than decrementing state', () => {
    const timer = startTimer(createTimer('focus', 25_000), 1_000);

    expect(getRemainingMs(timer, 6_000)).toBe(20_000);
  });

  it('never returns a negative remaining duration', () => {
    const timer = startTimer(createTimer('focus', 25_000), 1_000);

    expect(getRemainingMs(timer, 30_000)).toBe(0);
  });

  it('preserves the exact remaining time when paused', () => {
    const running = startTimer(createTimer('focus', 25_000), 1_000);
    const paused = pauseTimer(running, 6_000);

    expect(paused.status).toBe('paused');
    expect(paused.remainingMs).toBe(20_000);
    expect(paused.endsAt).toBeNull();
    expect(getRemainingMs(paused, 12_000)).toBe(20_000);
  });

  it('resumes from paused remaining time', () => {
    const running = startTimer(createTimer('focus', 25_000), 1_000);
    const paused = pauseTimer(running, 6_000);
    const resumed = startTimer(paused, 10_000);

    expect(resumed.status).toBe('running');
    expect(resumed.endsAt).toBe(30_000);
    expect(getRemainingMs(resumed, 15_000)).toBe(15_000);
  });

  it('completes a running timer when the absolute end time passes', () => {
    const running = startTimer(createTimer('focus', 5_000), 1_000);
    const complete = syncTimer(running, 6_000);

    expect(complete.status).toBe('complete');
    expect(complete.remainingMs).toBe(0);
    expect(complete.completedFocus).toBe(1);
  });

  it('can enter overtime at the scheduled focus end without double-counting focus', () => {
    const running = startTimer(createTimer('focus', 5_000), 1_000);
    const overtime = syncTimer(running, 8_000, true);

    expect(overtime.status).toBe('overtime');
    expect(overtime.completedFocus).toBe(1);
    expect(overtime.overtimeStartedAt).toBe(6_000);
    expect(getOvertimeMs(overtime, 9_500)).toBe(3_500);

    const complete = completeTimer(overtime);
    expect(complete.completedFocus).toBe(1);
  });

  it('does not use overtime for break modes', () => {
    const running = startTimer(createTimer('short', 5_000), 1_000);
    const complete = syncTimer(running, 8_000, true);

    expect(complete.status).toBe('complete');
  });

  it('uses a short break until the fourth completed focus session', () => {
    const timer = completeTimer(createTimer('focus', 25_000, 2));

    expect(timer.completedFocus).toBe(3);
    expect(getNextMode(timer)).toBe('short');
  });

  it('uses a long break after the fourth completed focus session', () => {
    const timer = completeTimer(createTimer('focus', 25_000, 3));

    expect(timer.completedFocus).toBe(4);
    expect(getNextMode(timer)).toBe('long');
  });

  it('resets the cycle when a long break completes', () => {
    const longBreak = switchMode(createTimer('focus', 25_000, 4), 'long', 15_000);
    const complete = completeTimer(longBreak);

    expect(complete.completedFocus).toBe(0);
    expect(getNextMode(complete)).toBe('focus');
  });
});
