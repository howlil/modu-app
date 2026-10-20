<script lang="ts">
  import CalendarMonth from './CalendarMonth.svelte';
  import { shiftMonth } from '../core/insights.ts';
  import type { HabitTrackerController } from '../controller/habit-tracker.svelte.ts';

  let { controller }: { controller: HabitTrackerController } = $props();
  const snapshot = $derived(controller.insights);
  const months = $derived.by(() => controller.today
    ? Array.from({ length: 6 }, (_, i) => shiftMonth(controller.today.slice(0, 7), i - 5))
    : []);
  const monthly = $derived(months.map(month => {
    const periods = snapshot?.periods.filter(p => p.date.slice(0, 7) === month) ?? [];
    const met = periods.filter(p => p.outcome === 'MET').length;
    const missed = periods.filter(p => p.outcome === 'MISSED').length;
    return { month, met, missed, eligible: met + missed,
      rate: met + missed ? Math.round(100 * met / (met + missed)) : null };
  }));
  const percentage = $derived(snapshot && snapshot.rate !== null ? Math.round(snapshot.rate * 100) : null);
</script>

<section aria-label="Habit insights">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="text-title-lg font-medium">Insights</h2>
      <p class="mt-1 text-meta text-muted-foreground">Results calculated from your local records and historical goal policies.</p>
    </div>
    <div>
      <label for="habit-insights-filter" class="mb-1 block text-meta text-muted-foreground">Habit</label>
      <select id="habit-insights-filter" class="h-10 max-w-[240px] rounded-lg border border-input bg-card px-3 text-ui"
        value={controller.insightHabitId}
        onchange={(event) => controller.selectInsightHabit(event.currentTarget.value)}>
        <option value="">All habits</option>
        {#each controller.insightHabits as habit (habit.id)}
          <option value={habit.id}>{habit.title}{habit.status === 'ARCHIVED' ? ' (archived)' : ''}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if snapshot}
    <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-[20px] border border-border bg-card p-4">
        <p class="text-meta text-muted-foreground">Completion rate</p>
        <p class="mt-2 text-title-lg font-medium tabular-nums">{percentage === null ? '—' : percentage + '%'}</p>
      </div>
      <div class="rounded-[20px] border border-border bg-card p-4">
        <p class="text-meta text-muted-foreground">Finalized periods</p>
        <p class="mt-2 text-title-lg font-medium tabular-nums">{snapshot.met} <span class="text-meta font-normal text-muted-foreground">/ {snapshot.eligible}</span></p>
      </div>
      <div class="rounded-[20px] border border-border bg-card p-4">
        <p class="text-meta text-muted-foreground">Current streak</p>
        <p class="mt-2 text-title-lg font-medium tabular-nums">{snapshot.currentStreak}</p>
      </div>
      <div class="rounded-[20px] border border-border bg-card p-4">
        <p class="text-meta text-muted-foreground">Longest streak</p>
        <p class="mt-2 text-title-lg font-medium tabular-nums">{snapshot.longestStreak}</p>
      </div>
    </div>
    <p class="mt-2 text-meta text-muted-foreground">Streaks count consecutive met goal periods, not calendar days. In All habits, the highest individual streak is shown. Only MET and MISSED enter the completion rate.</p>

    <div class="mt-6 grid gap-5 lg:grid-cols-2">
      <div>
        <h3 class="mb-3 text-title font-medium">Activity calendar</h3>
        <CalendarMonth selectedDate={controller.selectedDate} today={controller.today}
          getDay={(date) => controller.calendarDay(date, controller.insightHabitId || undefined)}
          onSelect={controller.openHistoryAt}/>
        <p class="mt-2 text-meta text-muted-foreground">A weekly quota is represented by its qualified dates, but scored once per week. Select a date to open History.</p>
      </div>
      <div>
        <h3 class="mb-3 text-title font-medium">Past six months</h3>
        <section class="rounded-[20px] border border-border bg-card p-5" aria-label="Monthly completion">
          {#each monthly as item (item.month)}
            <div class="mb-4 last:mb-0">
              <div class="mb-1.5 flex items-center justify-between gap-2">
                <span class="text-ui">{item.month}</span>
                <span class="text-meta text-muted-foreground tabular-nums">{item.eligible ? item.met + ' / ' + item.eligible : 'No finalized periods'}</span>
              </div>
              <div class="h-2 w-full overflow-hidden rounded-full bg-muted" role="img"
                aria-label={item.month + ': ' + (item.rate === null ? 'no finalized results' : item.rate + '% complete')}>
                {#if item.rate !== null}
                  <div class="h-full rounded-full bg-primary" style:width={item.rate + '%'}></div>
                {/if}
              </div>
            </div>
          {/each}
          <p class="mt-4 border-t border-border pt-3 text-meta text-muted-foreground">Weekly quota results belong to the week-ending date. Open periods are excluded from missed totals.</p>
        </section>
      </div>
    </div>
    <p class="mt-4 text-meta text-muted-foreground">Reporting period: {snapshot.fromDate} through {snapshot.throughDate}. Tracking timezone: {controller.trackingTimezone}.{snapshot.truncated ? ' Older activity is outside the displayed ten-year history window.' : ''}</p>
  {/if}
</section>
