import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RINGTONE,
  RINGTONE_OPTIONS,
  isPomodoroRingtone
} from '../../../src/lib/modules/pomodoro/adapters/sounds.ts';

describe('pomodoro ringtone options', () => {
  it('keeps the default ringtone valid', () => {
    expect(isPomodoroRingtone(DEFAULT_RINGTONE)).toBe(true);
  });

  it('exposes unique valid ringtone ids', () => {
    const ids = RINGTONE_OPTIONS.map((option) => option.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isPomodoroRingtone)).toBe(true);
  });

  it('rejects unknown stored values', () => {
    expect(isPomodoroRingtone('alarm-clock')).toBe(false);
    expect(isPomodoroRingtone(null)).toBe(false);
  });
});
