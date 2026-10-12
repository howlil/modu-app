/** Active focus intervals, excluding pauses and breaks. All timestamps are epoch ms. */
export interface FocusAccounting {
  accumulatedMs: number;
  runningSince: number | null;
}
export function emptyFocusAccounting(): FocusAccounting {
  return { accumulatedMs: 0, runningSince: null };
}
export function resumeFocus(a: FocusAccounting, now: number): FocusAccounting {
  return a.runningSince === null ? { ...a, runningSince: now } : a;
}
export function elapsedFocus(a: FocusAccounting, now: number, cutoff: number | null = null): number {
  const until = cutoff === null ? now : Math.min(now, cutoff);
  return Math.max(0, a.accumulatedMs + (a.runningSince === null ? 0 : Math.max(0, until - a.runningSince)));
}
export function pauseFocus(a: FocusAccounting, now: number, cutoff: number | null = null): FocusAccounting {
  return { accumulatedMs: elapsedFocus(a, now, cutoff), runningSince: null };
}
export function restoreFocusAccounting(value: unknown): FocusAccounting | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<FocusAccounting>;
  return typeof v.accumulatedMs === 'number' && Number.isFinite(v.accumulatedMs) && v.accumulatedMs >= 0 &&
    (v.runningSince === null || (typeof v.runningSince === 'number' && Number.isFinite(v.runningSince)))
    ? { accumulatedMs: v.accumulatedMs, runningSince: v.runningSince } : null;
}
