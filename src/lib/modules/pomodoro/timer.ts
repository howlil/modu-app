export type TimerStatus = 'idle' | 'running' | 'paused' | 'complete';

export interface TimerState {
  startedAt: number | null;
  durationMs: number;
  endsAt: number | null;
  status: TimerStatus;
}

export function getRemainingMs(timer: TimerState, now = Date.now()) {
  if (timer.status === 'complete') return 0;
  if (timer.status !== 'running' || timer.endsAt === null) return timer.durationMs;

  return Math.max(0, timer.endsAt - now);
}
