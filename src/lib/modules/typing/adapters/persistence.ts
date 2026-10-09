import type { TypingLearningState, TypingPreferences } from '../core/trainer.ts';

const STATE_KEY = 'module-typing-state-v1';
const PREFERENCES_KEY = 'module-typing-preferences-v1';
const BLOCK_KEY = 'module-typing-block-v1';

export function loadTypingSnapshot(): {
  savedState: Partial<TypingLearningState> | null;
  savedPreferences: Partial<TypingPreferences> | null;
  savedBlock: number;
} {
  // JSON parsing intentionally propagates errors so the page can reset corrupt state.
  return {
    savedState: JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') as Partial<TypingLearningState> | null,
    savedPreferences: JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null') as Partial<TypingPreferences> | null,
    savedBlock: Number(localStorage.getItem(BLOCK_KEY))
  };
}

export function saveTypingSnapshot(
  learningState: TypingLearningState,
  preferences: TypingPreferences,
  blockIndex: number
): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(learningState));
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  localStorage.setItem(BLOCK_KEY, String(blockIndex));
}
