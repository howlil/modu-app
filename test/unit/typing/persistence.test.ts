import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadTypingSnapshot,
  saveTypingSnapshot
} from '../../../src/lib/modules/typing/adapters/persistence.ts';
import { DEFAULT_TYPING_PREFERENCES, createInitialTypingState } from '../../../src/lib/modules/typing/core/trainer.ts';

afterEach(() => vi.unstubAllGlobals());

describe('typing persistence boundary', () => {
  it('reads the existing v1 local storage keys unchanged', () => {
    const values: Record<string, string> = {
      'module-typing-state-v1': JSON.stringify({ sessions: [{ kind: 'test', wpm: 42 }] }),
      'module-typing-preferences-v1': JSON.stringify({ strictCorrection: false }),
      'module-typing-block-v1': '3'
    };
    vi.stubGlobal('localStorage', { getItem: (key: string) => values[key] ?? null });
    expect(loadTypingSnapshot()).toEqual({
      savedState: { sessions: [{ kind: 'test', wpm: 42 }] },
      savedPreferences: { strictCorrection: false },
      savedBlock: 3
    });
  });

  it('writes to the same three v1 keys', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    saveTypingSnapshot(createInitialTypingState(), DEFAULT_TYPING_PREFERENCES, 2);
    expect(setItem).toHaveBeenCalledWith('module-typing-block-v1', '2');
    expect(setItem).toHaveBeenCalledWith('module-typing-state-v1', expect.any(String));
    expect(setItem).toHaveBeenCalledWith('module-typing-preferences-v1', expect.any(String));
  });

  it('propagates malformed saved JSON for the caller to recover', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{corrupted' });
    expect(() => loadTypingSnapshot()).toThrow();
  });
});
