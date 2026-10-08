import { describe, expect, it } from 'vitest';
import { normalizePomodoroSnapshot } from '../../../src/lib/modules/pomodoro/persistence.ts';

describe('pomodoro snapshot restoration', () => {
  it('restores saved preferences and clamps out-of-range values', () => {
    const state = normalizePomodoroSnapshot({
      durations: { focus: 999, short: -3 },
      preferences: { overtime: false, autoStartBreaks: true },
      dailyGoalHours: 20,
      focusText: 'a'.repeat(100),
      focusProtection: { enabled: true, blockedDomains: ['youtube.com'] }
    }, 10_000);
    expect(state.durations).toEqual({ focus: 180, short: 1, long: 15 });
    expect(state.dailyGoalHours).toBe(16);
    expect(state.preferences.autoStartBreaks).toBe(true);
    expect(state.preferences.overtime).toBe(false);
    expect(state.focusText).toHaveLength(80);
    expect(state.blockedDomains).toEqual(['youtube.com']);
  });

  it('recovers an active focus start from its absolute deadline', () => {
    const state = normalizePomodoroSnapshot({
      timer: { mode: 'focus', status: 'running', durationMs: 100_000, remainingMs: 100_000, endsAt: 110_000 }
    }, 30_000);
    expect(state.timer.status).toBe('running');
    expect(state.sessionStartedAt).toBe(10_000);
    expect(state.timer.remainingMs).toBe(80_000);
  });

  it('keeps explicitly saved start timestamps unchanged', () => {
    const state = normalizePomodoroSnapshot({
      sessionStartedAt: 123,
      timer: { mode: 'focus', status: 'paused', remainingMs: 60_000 }
    }, 300_000);
    expect(state.sessionStartedAt).toBe(123);
    expect(state.timer.status).toBe('paused');
  });
});
