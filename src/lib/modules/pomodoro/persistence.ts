import type { GoalSchedule, LegacyFocusSession } from './activity.ts';
import type { PomodoroMode, TimerState } from './timer.ts';

export const POMODORO_STORAGE_KEY = 'module-pomodoro-v2';

export type PersistedPomodoroState = {
  timer?: Partial<TimerState>;
  durations?: Partial<Record<PomodoroMode, number>>;
  preferences?: Partial<{
    autoStartBreaks: boolean;
    autoStartFocus: boolean;
    overtime: boolean;
    keepAwake: boolean;
  }>;
  focusText?: string;
  soundEnabled?: boolean;
  ringtone?: unknown;
  notificationsEnabled?: boolean;
  focusProtection?: {
    enabled?: boolean;
    blockedDomains?: string[];
  };
  sessionStartedAt?: number | null;
  dailyGoalHours?: number;
  goalSchedule?: GoalSchedule;
  history?: LegacyFocusSession[];
};

export function readPomodoroSnapshot(): PersistedPomodoroState | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(POMODORO_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as PersistedPomodoroState) : null;
}

export function savePomodoroSnapshot(snapshot: PersistedPomodoroState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearPomodoroSnapshot(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(POMODORO_STORAGE_KEY);
}
