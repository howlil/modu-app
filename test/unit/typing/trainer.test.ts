import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TYPING_PREFERENCES,
  createInitialTypingState,
  dueKeys,
  generateBlockText,
  keyMetric,
  markRetention,
  recordTypingAttempt,
  syncRetention,
  weakKeys,
  weakTransitions
} from '../../../src/lib/modules/typing/core/trainer.ts';

describe('typing learner', () => {
  it('tracks key accuracy, latency and adjacent transitions', () => {
    const state = createInitialTypingState();
    recordTypingAttempt(state, 's', true, 170, 'a');
    recordTypingAttempt(state, 's', false, 600, 'a');

    expect(state.keyStats.s.attempts).toBe(2);
    expect(state.keyStats.s.correct).toBe(1);
    expect(state.keyStats.s.errors).toBe(1);
    expect(state.keyStats.s.totalLatency).toBe(170);
    expect(state.transitionStats.as.attempts).toBe(2);
    expect(state.transitionStats.as.correct).toBe(1);
    expect(keyMetric(state, 's', DEFAULT_TYPING_PREFERENCES).accuracy).toBe(50);
  });

  it('requires repeated accurate and sufficiently fast practice for mastery', () => {
    const state = createInitialTypingState();
    for (let i = 0; i < 19; i++) recordTypingAttempt(state, 'f', true, 250, null);
    expect(keyMetric(state, 'f', DEFAULT_TYPING_PREFERENCES).mastered).toBe(false);
    recordTypingAttempt(state, 'f', true, 250, null);
    expect(keyMetric(state, 'f', DEFAULT_TYPING_PREFERENCES).mastered).toBe(true);
    expect(weakKeys(state, DEFAULT_TYPING_PREFERENCES)).toHaveLength(0);
  });

  it('keeps weaker keys and transitions available for adaptation', () => {
    const state = createInitialTypingState();
    for (let i = 0; i < 8; i++) {
      recordTypingAttempt(state, 'q', i < 4, 700, 'w');
    }
    expect(weakKeys(state, DEFAULT_TYPING_PREFERENCES)[0].key).toBe('q');
    expect(weakTransitions(state)[0].pair).toBe('wq');
    expect(generateBlockText('weak', state, DEFAULT_TYPING_PREFERENCES).length).toBeGreaterThan(0);
  });

  it('schedules retention and advances or resets its review interval', () => {
    const state = createInitialTypingState();
    const now = Date.UTC(2026, 9, 9);
    for (let i = 0; i < 20; i++) recordTypingAttempt(state, 'j', true, 200, null);
    syncRetention(state, DEFAULT_TYPING_PREFERENCES, now);
    expect(dueKeys(state, now)).toEqual([]);
    expect(dueKeys(state, now + 86_400_000)).toContain('j');

    markRetention(state, ['j'], true, now + 86_400_000);
    expect(state.retention.j.level).toBe(1);
    expect(state.retention.j.nextReview).toBe(now + 4 * 86_400_000);

    markRetention(state, ['j'], false, now + 4 * 86_400_000);
    expect(state.retention.j.level).toBe(0);
    expect(state.retention.j.nextReview).toBe(now + 5 * 86_400_000);
  });

  it('offers a deterministic warmup for a new learner', () => {
    const text = generateBlockText('warmup', createInitialTypingState(), DEFAULT_TYPING_PREFERENCES);
    expect(text).toContain('asdf jkl;');
  });
});
