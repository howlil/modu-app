export type PomodoroMode = 'focus' | 'short' | 'long';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'complete';

export interface TimerState {
  mode: PomodoroMode;
  status: TimerStatus;
  durationMs: number;
  remainingMs: number;
  endsAt: number | null;
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
    completedFocus
  };
}

export function getRemainingMs(timer: TimerState, now = Date.now()) {
  if (timer.status === 'complete') return 0;
  if (timer.status !== 'running' || timer.endsAt === null) return timer.remainingMs;

  return Math.max(0, timer.endsAt - now);
}

export function startTimer(timer: TimerState, now = Date.now()): TimerState {
  const remainingMs = Math.max(0, timer.remainingMs);

  return {
    ...timer,
    status: remainingMs === 0 ? 'complete' : 'running',
    remainingMs,
    endsAt: remainingMs === 0 ? null : now + remainingMs
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

export function syncTimer(timer: TimerState, now = Date.now()): TimerState {
  if (timer.status !== 'running') return timer;

  const remainingMs = getRemainingMs(timer, now);

  if (remainingMs > 0) {
    return { ...timer, remainingMs };
  }

  return completeTimer({ ...timer, remainingMs: 0, endsAt: null });
}

export function resetTimer(timer: TimerState): TimerState {
  return {
    ...timer,
    status: 'idle',
    remainingMs: timer.durationMs,
    endsAt: null
  };
}

export function completeTimer(timer: TimerState): TimerState {
  const completedFocus =
    timer.mode === 'focus'
      ? Math.min(4, timer.completedFocus + 1)
      : timer.mode === 'long'
        ? 0
        : timer.completedFocus;

  return {
    ...timer,
    status: 'complete',
    remainingMs: 0,
    endsAt: null,
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
    completedFocus: timer.completedFocus
  };
}

export function getNextMode(timer: TimerState): PomodoroMode {
  if (timer.mode === 'focus') {
    return timer.completedFocus >= 4 ? 'long' : 'short';
  }

  return 'focus';
}
