import { browserLocalDate } from '../adapters/browser-date.ts';

/** Per-mounted workspace controller. M0 exposes the date boundary, not CRUD/state persistence. */
export function createHabitTrackerController() {
  let today = $state(browserLocalDate());
  return {
    get today() { return today; },
    refreshDate() { today = browserLocalDate(); }
  };
}
