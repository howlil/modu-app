import { describe, expect, it } from 'vitest';

import {
  aggregateDailyActivity,
  buildHeatmapDays,
  calculateWeekSummary,
  heatmapLevel,
  isScheduledGoalDay,
  localDateKey,
  migrateLegacySessions,
  sessionsForDate,
  sessionsToCsv,
  type FocusActivitySession
} from '../../../src/lib/modules/pomodoro/core/activity.ts';

function session(
  id: string,
  startedAt: number,
  endedAt: number,
  actualDurationMs: number,
  goalMs = 8 * 60 * 60 * 1000,
  overtimeMs = 0
): FocusActivitySession {
  return {
    id,
    startedAt,
    endedAt,
    plannedDurationMs: actualDurationMs - overtimeMs,
    actualDurationMs,
    overtimeMs,
    label: id,
    goalMs,
    status: 'completed'
  };
}

describe('pomodoro activity', () => {
  it('aggregates focus time and overtime per local day', () => {
    const first = new Date(2026, 9, 7, 9, 0).getTime();
    const second = new Date(2026, 9, 7, 11, 0).getTime();

    const daily = aggregateDailyActivity(
      [
        session('a', first, first + 50 * 60_000, 50 * 60_000),
        session('b', second, second + 55 * 60_000, 55 * 60_000, 8 * 3_600_000, 5 * 60_000)
      ],
      8 * 3_600_000
    );

    expect(daily).toHaveLength(1);
    expect(daily[0].focusedMs).toBe(105 * 60_000);
    expect(daily[0].overtimeMs).toBe(5 * 60_000);
    expect(daily[0].sessionCount).toBe(2);
    expect(daily[0].firstStartedAt).toBe(first);
  });

  it('uses focus minutes relative to the goal for heatmap intensity', () => {
    const goal = 8 * 3_600_000;

    expect(heatmapLevel(0, goal)).toBe(0);
    expect(heatmapLevel(goal * 0.1, goal)).toBe(1);
    expect(heatmapLevel(goal * 0.3, goal)).toBe(2);
    expect(heatmapLevel(goal * 0.6, goal)).toBe(3);
    expect(heatmapLevel(goal * 0.9, goal)).toBe(4);
    expect(heatmapLevel(goal, goal)).toBe(5);
  });

  it('builds a week-aligned heatmap and marks future days', () => {
    const now = new Date(2026, 9, 7, 12, 0).getTime();
    const days = buildHeatmapDays([], 8 * 3_600_000, now, 2);

    expect(days).toHaveLength(14);
    expect(new Date(days[0].timestamp).getDay()).toBe(1);
    expect(days.some((day) => day.future)).toBe(true);
  });

  it('treats weekends as rest days when the goal schedule is weekdays', () => {
    const saturday = new Date(2026, 9, 10, 12, 0);
    const monday = new Date(2026, 9, 12, 12, 0);

    expect(isScheduledGoalDay(saturday, 'weekdays')).toBe(false);
    expect(isScheduledGoalDay(monday, 'weekdays')).toBe(true);
    expect(isScheduledGoalDay(saturday, 'every-day')).toBe(true);
  });

  it('calculates current-week goal progress for weekdays only', () => {
    const monday = new Date(2026, 9, 5, 9, 0).getTime();
    const tuesday = new Date(2026, 9, 6, 9, 0).getTime();
    const wednesdayNoon = new Date(2026, 9, 7, 12, 0).getTime();
    const goal = 8 * 3_600_000;

    const daily = aggregateDailyActivity(
      [
        session('monday', monday, monday + goal, goal, goal),
        session('tuesday', tuesday, tuesday + 4 * 3_600_000, 4 * 3_600_000, goal)
      ],
      goal
    );

    const summary = calculateWeekSummary(daily, goal, 'weekdays', wednesdayNoon);

    expect(summary.focusedMs).toBe(12 * 3_600_000);
    expect(summary.activeDays).toBe(2);
    expect(summary.goalsReached).toBe(1);
    expect(summary.scheduledGoalDays).toBe(3);
  });

  it('migrates legacy localStorage history without losing labels', () => {
    const endedAt = new Date(2026, 9, 7, 10, 0).getTime();
    const migrated = migrateLegacySessions(
      [{ id: 'old', endedAt, durationMs: 25 * 60_000, label: 'API work' }],
      8 * 3_600_000
    );

    expect(migrated[0].id).toBe('legacy-old');
    expect(migrated[0].label).toBe('API work');
    expect(migrated[0].actualDurationMs).toBe(25 * 60_000);
  });

  it('filters a day inspector to one local date', () => {
    const first = new Date(2026, 9, 7, 9, 0).getTime();
    const second = new Date(2026, 9, 8, 9, 0).getTime();
    const sessions = [
      session('a', first, first + 25 * 60_000, 25 * 60_000),
      session('b', second, second + 25 * 60_000, 25 * 60_000)
    ];

    expect(sessionsForDate(sessions, localDateKey(first)).map((item) => item.id)).toEqual(['a']);
  });

  it('exports activity rows as CSV', () => {
    const startedAt = new Date(2026, 9, 7, 9, 0).getTime();
    const csv = sessionsToCsv([
      {
        ...session('a', startedAt, startedAt + 25 * 60_000, 25 * 60_000),
        label: 'API, callbacks'
      }
    ]);

    expect(csv).toContain('started_at,ended_at');
    expect(csv).toContain('"API, callbacks"');
  });
});
