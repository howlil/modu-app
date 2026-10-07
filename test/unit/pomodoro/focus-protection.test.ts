import { describe, expect, it } from 'vitest';

import {
  isProtectedDomain,
  normalizeBlockedDomain,
  normalizeBlocklist
} from '../../../src/lib/modules/pomodoro/focus-protection.ts';

describe('focus protection domains', () => {
  it('normalizes URLs to hostnames', () => {
    expect(normalizeBlockedDomain('https://www.youtube.com/watch?v=abc')).toBe('youtube.com');
    expect(normalizeBlockedDomain('reddit.com/r/programming')).toBe('reddit.com');
  });

  it('deduplicates and sorts a blocklist', () => {
    expect(
      normalizeBlocklist([
        'https://www.youtube.com/watch?v=abc',
        'youtube.com',
        'reddit.com'
      ])
    ).toEqual(['reddit.com', 'youtube.com']);
  });

  it('rejects Module control-surface domains', () => {
    expect(isProtectedDomain('modu.howlil.site')).toBe(true);
    expect(isProtectedDomain('www.modu.howlil.site')).toBe(true);
    expect(() => normalizeBlockedDomain('https://modu.howlil.site/pomodoro')).toThrow(
      'Module cannot block its own control surface.'
    );
  });

  it('rejects invalid host input', () => {
    expect(() => normalizeBlockedDomain('not a domain')).toThrow(
      'Enter a valid website or domain.'
    );
  });
});
