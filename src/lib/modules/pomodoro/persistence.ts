import type { GoalSchedule, LegacyFocusSession } from './activity.ts';
import type { PomodoroMode, TimerState } from './timer.ts';
import { DEFAULT_RINGTONE, isPomodoroRingtone, type PomodoroRingtone } from './sounds.ts';
import { normalizeBlocklist } from './focus-protection.ts';
import { createTimer, syncTimer } from './timer.ts';


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

export type PomodoroPreferences = {
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  overtime: boolean;
  keepAwake: boolean;
};

export function clampMinutes(value: unknown, fallback: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(max, Math.round(numeric)));
}

export function clampGoalHours(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 8;
  return Math.max(1, Math.min(16, Math.round(numeric * 2) / 2));
}

function isMode(value: unknown): value is PomodoroMode {
  return value === 'focus' || value === 'short' || value === 'long';
}

export type RestoredPomodoroState = {
  durations: Record<PomodoroMode, number>;
  preferences: PomodoroPreferences;
  dailyGoalHours: number;
  goalSchedule: GoalSchedule;
  timer: TimerState;
  sessionStartedAt: number | null;
  focusText: string;
  soundEnabled: boolean;
  ringtone: PomodoroRingtone;
  notificationsEnabled: boolean;
  focusProtectionEnabled: boolean;
  blockedDomains: string[];
  legacyHistory: LegacyFocusSession[];
};

export function normalizePomodoroSnapshot(
  saved: PersistedPomodoroState,
  now: number
): RestoredPomodoroState {
  const durations = {
    focus: clampMinutes(saved.durations?.focus, 25, 180),
    short: clampMinutes(saved.durations?.short, 5, 60),
    long: clampMinutes(saved.durations?.long, 15, 120)
  };
  const preferences: PomodoroPreferences = {
    autoStartBreaks: saved.preferences?.autoStartBreaks === true,
    autoStartFocus: saved.preferences?.autoStartFocus === true,
    overtime: saved.preferences?.overtime !== false,
    keepAwake: saved.preferences?.keepAwake === true
  };
  const dailyGoalHours = clampGoalHours(saved.dailyGoalHours);
  const goalSchedule = saved.goalSchedule === 'every-day' ? 'every-day' : 'weekdays';
  let timer = createTimer('focus', 25 * 60_000);

  if (saved.timer && isMode(saved.timer.mode)) {
    const fallback = createTimer(saved.timer.mode, durations[saved.timer.mode] * 60_000);
    timer = {
      ...fallback,
      ...saved.timer,
      mode: saved.timer.mode,
      durationMs:
        typeof saved.timer.durationMs === 'number'
          ? saved.timer.durationMs
          : fallback.durationMs,
      remainingMs:
        typeof saved.timer.remainingMs === 'number'
          ? saved.timer.remainingMs
          : fallback.remainingMs,
      endsAt: typeof saved.timer.endsAt === 'number' ? saved.timer.endsAt : null,
      overtimeStartedAt:
        typeof saved.timer.overtimeStartedAt === 'number'
          ? saved.timer.overtimeStartedAt
          : null,
      completedFocus:
        typeof saved.timer.completedFocus === 'number'
          ? Math.max(0, Math.min(4, saved.timer.completedFocus))
          : 0
    } as TimerState;

    if (timer.status === 'running') {
      timer = syncTimer(timer, now, preferences.overtime);
    }
  }

  let sessionStartedAt =
    typeof saved.sessionStartedAt === 'number' ? saved.sessionStartedAt : null;

  if (
    sessionStartedAt === null &&
    timer.mode === 'focus' &&
    (timer.status === 'running' || timer.status === 'paused' || timer.status === 'overtime')
  ) {
    if (timer.status === 'overtime' && timer.overtimeStartedAt !== null) {
      sessionStartedAt = timer.overtimeStartedAt - timer.durationMs;
    } else if (timer.endsAt !== null) {
      sessionStartedAt = timer.endsAt - timer.durationMs;
    } else {
      sessionStartedAt = now - Math.max(0, timer.durationMs - timer.remainingMs);
    }
  }

  return {
    durations,
    preferences,
    dailyGoalHours,
    goalSchedule,
    timer,
    sessionStartedAt,
    focusText: typeof saved.focusText === 'string' ? saved.focusText.slice(0, 80) : '',
    soundEnabled: saved.soundEnabled !== false,
    ringtone: isPomodoroRingtone(saved.ringtone) ? saved.ringtone : DEFAULT_RINGTONE,
    notificationsEnabled: saved.notificationsEnabled === true,
    focusProtectionEnabled: saved.focusProtection?.enabled === true,
    blockedDomains: normalizeBlocklist(saved.focusProtection?.blockedDomains ?? []),
    legacyHistory: Array.isArray(saved.history) ? saved.history : []
  };
}
