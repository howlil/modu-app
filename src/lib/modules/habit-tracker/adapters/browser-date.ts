import type { LocalDate } from '../core/types.ts';

/** Timezone is captured once in IndexedDB, not read implicitly for every check-in. */
export function browserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}

export function isSupportedTimezone(timezone: string): boolean {
  try {
    if (!timezone || timezone.length > 100) return false;
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch { return false; }
}

/** Local calendar day in the explicit, persisted tracking timezone. */
export function browserLocalDate(date: Date = new Date(), timezone?: string): LocalDate {
  if (timezone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const value = (kind: 'year' | 'month' | 'day') =>
      parts.find(part => part.type === kind)?.value ?? '';
    return value('year') + '-' + value('month') + '-' + value('day');
  }
  // Compatibility for consumers that expect the device-local date.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

/** Pure state transition used by focus, visibility, and minute-tick reconciliation. */
export function reconcileTrackingDay(
  currentDay: LocalDate, selectedDay: LocalDate, nextDay: LocalDate
): { today: LocalDate; selectedDate: LocalDate; changed: boolean } {
  if (currentDay === nextDay) return { today: currentDay, selectedDate: selectedDay, changed: false };
  const followedToday = selectedDay === currentDay;
  return {
    today: nextDay,
    selectedDate: followedToday || selectedDay > nextDay ? nextDay : selectedDay,
    changed: true
  };
}
