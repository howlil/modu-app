import { describe, expect, it } from 'vitest';
import { resolveFingerCue } from '../../../src/lib/modules/typing/core/finger-guide.ts';

describe('typing finger guide', () => {
  it('maps the home row and number row to physical fingers', () => {
    expect(resolveFingerCue('a').finger).toBe('left-pinky');
    expect(resolveFingerCue('f').finger).toBe('left-index');
    expect(resolveFingerCue('j').finger).toBe('right-index');
    expect(resolveFingerCue('4').finger).toBe('left-index');
    expect(resolveFingerCue('7').finger).toBe('right-index');
    expect(resolveFingerCue(' ').finger).toBe('right-thumb');
  });

  it('assigns opposite-hand Shift for uppercase and shifted symbols', () => {
    expect(resolveFingerCue('A').shiftFinger).toBe('right-pinky');
    expect(resolveFingerCue('{')).toMatchObject({ physicalKey: '[', finger: 'right-pinky', shiftFinger: 'left-pinky' });
    expect(resolveFingerCue('!')).toMatchObject({ physicalKey: '1', finger: 'left-pinky', shiftFinger: 'right-pinky' });
    expect(resolveFingerCue('A', false).shiftFinger).toBeNull();
    expect(resolveFingerCue('a').shiftFinger).toBeNull();
  });

  it('has deterministic reach directions for upper, home and lower rows', () => {
    expect(resolveFingerCue('q').reach.y).toBeLessThan(0);
    expect(resolveFingerCue('f').reach.y).toBe(0);
    expect(resolveFingerCue('z').reach.y).toBeGreaterThan(0);
  });
});
