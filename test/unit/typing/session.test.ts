import { describe, expect, it } from 'vitest';
import { calculateTypingMetrics, evaluateTypingInput } from '../../../src/lib/modules/typing/core/session.ts';

describe('typing session boundary', () => {
  it('does not advance on a wrong character in strict mode', () => {
    expect(evaluateTypingInput('f', 'j', true)).toEqual({ correct: false, advance: false });
    expect(evaluateTypingInput('f', 'f', true)).toEqual({ correct: true, advance: true });
  });

  it('advances while still recording the error in non-strict mode', () => {
    expect(evaluateTypingInput('f', 'j', false)).toEqual({ correct: false, advance: true });
  });

  it('calculates accuracy and WPM using elapsed duration', () => {
    expect(calculateTypingMetrics(50, 52, 2, 30_000)).toEqual({ accuracy: 96, wpm: 20 });
    expect(calculateTypingMetrics(0, 0, 0, 0)).toEqual({ accuracy: 100, wpm: 0 });
  });
});
