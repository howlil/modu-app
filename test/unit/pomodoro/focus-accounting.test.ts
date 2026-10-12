import { describe, expect, it } from 'vitest';
import { emptyFocusAccounting, elapsedFocus, pauseFocus, resumeFocus, restoreFocusAccounting } from '../../../src/lib/modules/pomodoro/core/focus-accounting.ts';
describe('focus accounting', () => {
  it('counts only active intervals', () => {
    const a = resumeFocus(emptyFocusAccounting(), 1000);
    const b = pauseFocus(a, 11000);
    expect(elapsedFocus(b, 21000)).toBe(10000);
    const c = resumeFocus(b, 21000);
    expect(elapsedFocus(c, 26000)).toBe(15000);
  });
  it('caps countdown focus at its scheduled boundary', () => {
    const a = resumeFocus(emptyFocusAccounting(), 1000);
    expect(elapsedFocus(a, 20000, 11000)).toBe(10000);
  });
  it('handles persisted progress and invalid data', () => {
    expect(restoreFocusAccounting({ accumulatedMs: 8000, runningSince: null })).toEqual({ accumulatedMs: 8000, runningSince: null });
    expect(restoreFocusAccounting({ accumulatedMs: -10, runningSince: null })).toBeNull();
  });
});
