export type PomodoroMode = 'focus' | 'short' | 'long';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'complete' | 'overtime';

export interface TimerState {
  mode: PomodoroMode;
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  endsAt: number | null;
  overtimeStartedAt: number | null;
  completedFocus: number;
}

export function createTimer(
  mode: PomodoroMode,
  durationMs: number,
  completedFocus = 0
): TimerState {
  return {
    mode,
    status: 'idle',
    durationMs,
    remainingMs: durationMs,
    endsAt: null,
    overtimeStartedAt: null,
    completedFocus
  };
}

export function getRemainingMs(timer: TimerState, now = Date.now()) {
  if (timer.status === 'complete' || timer.status === 'overtime') return 0;
  if (timer.status !== 'running' || timer.endsAt === null) return timer.remainingMs;

  return Math.max(0, timer.endsAt - now);
}

export function getOvertimeMs(timer: TimerState, now = Date.now()) {
  if (timer.status !== 'overtime' || timer.overtimeStartedAt === null) return 0;

  return Math.max(0, now - timer.overtimeStartedAt);
}

export function startTimer(timer: TimerState, now = Date.now()): TimerState {
  const remainingMs = Math.max(0, timer.remainingMs);

  return {
    ...timer,
    status: remainingMs === 0 ? 'complete' : 'running',
    remainingMs,
    endsAt: remainingMs === 0 ? null : now + remainingMs,
    overtimeStartedAt: null
  };
}

export function pauseTimer(timer: TimerState, now = Date.now()): TimerState {
  if (timer.status !== 'running') return timer;

  return {
    ...timer,
    status: 'paused',
    remainingMs: getRemainingMs(timer, now),
    endsAt: null
  };
}

export function syncTimer(
  timer: TimerState,
  now = Date.now(),
  allowOvertime = false
): TimerState {
  if (timer.status !== 'running') return timer;

  const remainingMs = getRemainingMs(timer, now);

  if (remainingMs > 0) {
    return { ...timer, remainingMs };
  }

  if (allowOvertime && timer.mode === 'focus') {
    return beginOvertime(timer, timer.endsAt ?? now);
  }

  return completeTimer({ ...timer, remainingMs: 0, endsAt: null });
}

export function beginOvertime(timer: TimerState, startedAt = Date.now()): TimerState {
  if (timer.mode !== 'focus') return completeTimer(timer);

  return {
    ...timer,
    status: 'overtime',
    remainingMs: 0,
    endsAt: null,
    overtimeStartedAt: startedAt,
    completedFocus: Math.min(4, timer.completedFocus + 1)
  };
}

export function resetTimer(timer: TimerState): TimerState {
  return {
    ...timer,
    status: 'idle',
    remainingMs: timer.durationMs,
    endsAt: null,
    overtimeStartedAt: null
  };
}

export function completeTimer(timer: TimerState): TimerState {
  const completedFocus =
    timer.mode === 'focus' && timer.status !== 'overtime'
      ? Math.min(4, timer.completedFocus + 1)
      : timer.mode === 'long'
        ? 0
        : timer.completedFocus;

  return {
    ...timer,
    status: 'complete',
    remainingMs: 0,
    endsAt: null,
    overtimeStartedAt: null,
    completedFocus
  };
}

export function switchMode(
  timer: TimerState,
  mode: PomodoroMode,
  durationMs: number
): TimerState {
  return {
    mode,
    status: 'idle',
    durationMs,
    remainingMs: durationMs,
    endsAt: null,
    overtimeStartedAt: null,
    completedFocus: timer.completedFocus
  };
}

export function getNextMode(timer: TimerState): PomodoroMode {
  if (timer.mode === 'focus') {
    return timer.completedFocus >= 4 ? 'long' : 'short';
  }

  return 'focus';
}
