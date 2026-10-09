<script lang="ts">
  import { Target, X } from 'lucide-svelte';
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Dialog } from "$lib/components/ui/dialog/index.js";
  import * as Card from '$lib/components/ui/card/index.js';
  import {
    aggregateDailyActivity,
    buildHeatmapDays,
    calculateWeekSummary,
    isScheduledGoalDay,
    localDateKey,
    sessionsForDate,
    type FocusActivitySession,
    type GoalSchedule,
    type HeatmapDay
  } from '#lib/modules/pomodoro/core/activity.ts';

  type Props = {
    sessions: FocusActivitySession[];
    goalHours: number;
    goalSchedule: GoalSchedule;
    clockNow: number;
    onGoalChange: (hours: number, schedule: GoalSchedule) => void;
  };

  let {
    sessions,
    goalHours,
    goalSchedule,
    clockNow,
    onGoalChange
  }: Props = $props();

  let goalOpen = $state(false);
  let goalDraftHours = $state(goalHours);
  let goalDraftSchedule = $state<GoalSchedule>(goalSchedule);
  let selectedDayKey = $state<string | null>(null);
  let dayOpen = $state(false);

  const goalMs = $derived(goalHours * 3_600_000);
  const rawDaily = $derived(aggregateDailyActivity(sessions, goalMs));
  const todayKey = $derived(localDateKey(clockNow));
  const daily = $derived(
    rawDaily.map((day) =>
      day.dateKey === todayKey ? { ...day, goalMs } : day
    )
  );
  const today = $derived(
    daily.find((day) => day.dateKey === todayKey) ?? {
      dateKey: todayKey,
      focusedMs: 0,
      overtimeMs: 0,
      sessionCount: 0,
      goalMs,
      firstStartedAt: null
    }
  );
  const todayHasGoal = $derived(isScheduledGoalDay(new Date(clockNow), goalSchedule));
  const todayProgress = $derived(todayHasGoal && goalMs > 0 ? today.focusedMs / goalMs : 0);
  const todayAverageMs = $derived(
    today.sessionCount > 0 ? today.focusedMs / today.sessionCount : 0
  );
  const heatmapDays = $derived(buildHeatmapDays(daily, goalMs, clockNow, 52));
  const week = $derived(calculateWeekSummary(daily, goalMs, goalSchedule, clockNow));
  const weekBars = $derived.by(() => {
    const monday = new Date(clockNow);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const dateKey = localDateKey(date.getTime());
      const day = daily.find((item) => item.dateKey === dateKey);
      return {
        dateKey,
        label: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][index],
        focusedMs: day?.focusedMs ?? 0,
        isToday: dateKey === todayKey
      };
    });
  });
  const recentDateKeys = $derived(
    [...new Set(sessions.slice(0, 60).map((session) => localDateKey(session.endedAt)))]
  );
  const selectedDay = $derived(
    selectedDayKey
      ? daily.find((day) => day.dateKey === selectedDayKey) ?? null
      : null
  );
  const selectedSessions = $derived(
    selectedDayKey ? sessionsForDate(sessions, selectedDayKey) : []
  );

  function formatFocusTotal(ms: number) {
    const totalMinutes = Math.round(ms / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  }

  function formatClock(timestamp: number | null) {
    if (timestamp === null) return '—';

    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDayLabel(dateKey: string) {
    if (dateKey === todayKey) return 'Today';

    const yesterday = new Date(clockNow);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateKey === localDateKey(yesterday.getTime())) return 'Yesterday';

    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString([], {
      month: 'short',
      day: 'numeric'
    });
  }

  function formatLongDay(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString([], {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function heatmapColor(day: HeatmapDay) {
    if (day.future) return '#F3F3EF';

    return ['#ECECE6', '#DCE8FF', '#ABC6FB', '#6E9DF5', '#4F82F2', '#2468F2'][day.level];
  }

  function heatmapTitle(day: HeatmapDay) {
    if (day.future) return 'Future date';

    const percentage =
      day.goalMs > 0 ? Math.round((day.focusedMs / day.goalMs) * 100) : 0;

    return `${formatLongDay(day.dateKey)} · ${formatFocusTotal(day.focusedMs)} · ${percentage}% of goal`;
  }

  function openGoal() {
    goalDraftHours = goalHours;
    goalDraftSchedule = goalSchedule;
    goalOpen = true;
  }

  function saveGoal() {
    const numeric = Number(goalDraftHours);
    const hours = Number.isFinite(numeric)
      ? Math.max(1, Math.min(16, Math.round(numeric * 2) / 2))
      : 8;

    onGoalChange(hours, goalDraftSchedule);
    goalOpen = false;
  }

  function inspectDay(day: HeatmapDay) {
    if (day.future) return;
    selectedDayKey = day.dateKey;
    dayOpen = true;
  }

  function openHistoryDay(dateKey: string) {
    selectedDayKey = dateKey;
    dayOpen = true;
  }

</script>

<div>
  <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="m-0 text-title-lg font-medium tracking-[-0.03em]">Activity</h2>
      <p class="mt-1 text-meta text-muted-foreground">A quiet record of your progress.</p>
    </div>
    <Button variant="outline" size="sm" class="rounded-full text-meta font-normal shadow-none" onclick={openGoal}>
      <Target class="size-3.5" strokeWidth={1.7} />
      Daily goal · {goalHours}h
    </Button>
  </div>

  <div class="grid grid-cols-12 gap-3">
    <Card.Root class="col-span-12 min-w-0 justify-between gap-5 rounded-[20px] bg-[linear-gradient(135deg,#ffffff_34%,#f5f8ff_100%)] p-5 shadow-none sm:col-span-7 sm:p-6">
      <span class="text-meta text-muted-foreground">Focused today</span>
      <div class="whitespace-nowrap text-[clamp(36px,6vw,48px)] font-normal leading-none tracking-[-0.05em] tabular-nums">
        {formatFocusTotal(today.focusedMs)}
        {#if todayHasGoal}
          <span class="text-ui font-normal tracking-normal text-muted-foreground">/ {goalHours}h target</span>
        {/if}
      </div>
      {#if todayHasGoal}
        <div>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Daily focus progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(100, Math.round(todayProgress * 100))}>
            <div class="h-full rounded-full bg-primary transition-[width]" style:width={Math.min(100, todayProgress * 100) + '%'}></div>
          </div>
          <div class="mt-2 flex flex-wrap justify-between gap-2 text-meta text-muted-foreground">
            <span>{Math.round(todayProgress * 100)}% of goal</span>
            <span>{today.focusedMs >= goalMs ? 'Goal reached' : formatFocusTotal(goalMs - today.focusedMs) + ' remaining'}</span>
          </div>
        </div>
      {:else}
        <div class="text-meta text-muted-foreground">No goal scheduled today</div>
      {/if}
    </Card.Root>

    <Card.Root class="col-span-12 min-w-0 gap-4 rounded-[20px] p-5 shadow-none sm:col-span-5 sm:p-6">
      <div class="flex items-center justify-between gap-2">
        <h3 class="m-0 text-meta font-medium text-muted-foreground">THIS WEEK</h3>
        <span class="text-meta text-muted-foreground">Mon–Sun</span>
      </div>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <strong class="text-page-title font-normal tracking-[-0.04em]">{formatFocusTotal(week.focusedMs)}</strong>
        <span class="text-meta text-muted-foreground">{week.goalsReached} of {week.scheduledGoalDays} goals</span>
      </div>
      <div class="flex h-24 items-end gap-2" aria-label="Daily focus time this week">
        {#each weekBars as day}
          <div class="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
            <div class="flex h-[76px] items-end justify-center">
              <span
                class={day.isToday ? 'block w-full max-w-7 rounded-t-md bg-primary' : 'block w-full max-w-7 rounded-t-md bg-secondary'}
                style:height={day.focusedMs === 0 ? 0 : Math.max(6, Math.min(100, (day.focusedMs / goalMs) * 100)) + '%'}
                title={formatFocusTotal(day.focusedMs)}
                aria-label={day.label + ': ' + formatFocusTotal(day.focusedMs)}
              ></span>
            </div>
            <span class="text-center text-meta text-muted-foreground">{day.label}</span>
          </div>
        {/each}
      </div>
    </Card.Root>

    <Card.Root class="col-span-12 min-w-0 gap-3 rounded-[20px] p-4 shadow-none sm:p-6">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="m-0 text-ui font-medium">Focus heatmap</h3>
        <span class="text-meta text-muted-foreground">Last 52 weeks · goal-relative intensity</span>
      </div>
      <div class="w-full overflow-x-auto pb-2 focus-visible:outline-2 focus-visible:outline-ring" role="region" aria-label="Focus activity by date" tabindex="0">
        <div class="grid w-max grid-flow-col grid-rows-7 gap-0">
          {#each heatmapDays as day}
            <Button
              variant="ghost"
              size="icon-xs"
              class={[
                'relative flex size-4 min-w-0 items-center justify-center rounded-[3px] border-0 p-0 shadow-none transition-colors',
                day.future ? 'cursor-default opacity-45' : 'hover:bg-muted focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring'
              ].join(' ')}
              title={heatmapTitle(day)}
              aria-label={heatmapTitle(day)}
              disabled={day.future}
              onclick={() => inspectDay(day)}
            >
              <span class="size-3 rounded-[2px]" style:background={heatmapColor(day)} aria-hidden="true"></span>
            </Button>
          {/each}
        </div>
      </div>
      <div class="flex items-center gap-1 text-meta text-muted-foreground">
        <span>Less</span>
        {#each ['#ECECE6', '#DCE8FF', '#ABC6FB', '#6E9DF5', '#4F82F2', '#2468F2'] as color}
          <span class="size-2.5 rounded-[3px]" style:background={color} aria-hidden="true"></span>
        {/each}
        <span>Goal</span>
      </div>
    </Card.Root>

    <Card.Root class="col-span-12 min-w-0 gap-2 rounded-[20px] p-4 shadow-none sm:p-6">
      <h3 class="m-0 text-ui font-medium">Recent sessions</h3>
      {#if sessions.length === 0}
        <div class="py-8 text-center text-meta text-muted-foreground">Completed focus sessions will appear here.</div>
      {:else}
        {#each recentDateKeys as dateKey}
          {@const daySessions = sessionsForDate(sessions, dateKey)}
          {@const day = daily.find((item) => item.dateKey === dateKey)}
          <div class="border-t border-border pt-3">
            <Button
              variant="ghost"
              class="mb-1 flex h-auto w-full items-center justify-between gap-4 rounded-full px-2 py-1 text-left font-normal shadow-none"
              onclick={() => openHistoryDay(dateKey)}
            >
              <strong class="text-meta font-medium">{formatDayLabel(dateKey)}</strong>
              <span class="text-meta text-muted-foreground">{formatFocusTotal(day?.focusedMs ?? 0)}</span>
            </Button>
            {#each daySessions.slice(0, 6) as session}
              <div class="grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border/50 py-3 sm:grid-cols-[68px_minmax(0,1fr)_auto]">
                <time class="text-meta text-muted-foreground">{formatClock(session.startedAt)}</time>
                <div class="min-w-0">
                  <div class="truncate text-ui font-medium">{session.label || 'Focus session'}</div>
                  <div class="mt-1 text-meta text-muted-foreground">
                    {formatFocusTotal(session.plannedDurationMs)} target
                    {#if session.overtimeMs > 0}
                      + {formatFocusTotal(session.overtimeMs)} overtime
                    {/if}
                  </div>
                </div>
                <span class="text-ui tabular-nums">{formatFocusTotal(session.actualDurationMs)}</span>
              </div>
            {/each}
          </div>
        {/each}
      {/if}
    </Card.Root>
  </div>

  <Dialog.Root bind:open={goalOpen}>
    <Dialog.Portal>
      <Dialog.Overlay class="fixed inset-0 z-[110] bg-black/25 backdrop-blur-[2px]" />
      <Dialog.Content
        class="fixed left-1/2 top-1/2 z-[111] w-[calc(100%-2rem)] max-w-[390px] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border border-border bg-background p-5 text-left shadow-[0_24px_70px_rgba(25,25,25,0.18)] outline-none"
        aria-labelledby="daily-goal-title"
      >
        <div class="mb-4 flex items-center justify-between">
          <h3 id="daily-goal-title" class="m-0 text-ui font-medium">Daily focus target</h3>
          <Button variant="ghost" size="icon-sm" class="rounded-full text-muted-foreground" aria-label="Close goal settings" onclick={() => (goalOpen = false)}>
            <X class="size-4" strokeWidth={1.7} />
          </Button>
        </div>

        <label class="grid min-h-11 grid-cols-[1fr_100px] items-center gap-3 text-meta">
          Target
          <div class="flex items-center gap-2">
            <Input type="number" min="1" max="16" step="0.5" class="h-8 text-right text-meta" bind:value={goalDraftHours} />
            <span class="text-meta text-muted-foreground">h</span>
          </div>
        </label>

        <div class="mt-3 border-t pt-4">
          <div class="mb-2 text-meta text-muted-foreground">Apply on</div>
          <div class="flex gap-2">
            <Button
              variant={goalDraftSchedule === 'weekdays' ? 'secondary' : 'outline'}
              size="sm"
              class="h-8 rounded-full text-meta font-normal shadow-none"
              onclick={() => (goalDraftSchedule = 'weekdays')}
            >
              Weekdays
            </Button>
            <Button
              variant={goalDraftSchedule === 'every-day' ? 'secondary' : 'outline'}
              size="sm"
              class="h-8 rounded-full text-meta font-normal shadow-none"
              onclick={() => (goalDraftSchedule = 'every-day')}
            >
              Every day
            </Button>
          </div>
        </div>

        <Button class="mt-5 h-9 w-full rounded-full text-meta font-medium shadow-none" onclick={saveGoal}>
          Update target
        </Button>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>

  {#if selectedDayKey}
    <Dialog.Root bind:open={dayOpen}>
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-[110] bg-black/25 backdrop-blur-[2px]" />
        <Dialog.Content
          class="fixed left-1/2 top-1/2 z-[111] max-h-[min(620px,calc(100vh-32px))] w-[calc(100%-2rem)] max-w-[410px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] border border-border bg-background p-5 text-left shadow-[0_24px_70px_rgba(25,25,25,0.18)] outline-none"
          aria-labelledby="day-inspector-title"
        >
        <div class="mb-4 flex items-center justify-between">
          <h3 id="day-inspector-title" class="m-0 text-ui font-medium">{formatLongDay(selectedDayKey)}</h3>
          <Button variant="ghost" size="icon-sm" class="rounded-full text-muted-foreground" aria-label="Close day details" onclick={() => (dayOpen = false)}>
            <X class="size-4" strokeWidth={1.7} />
          </Button>
        </div>

        <div class="border-b pb-4">
          <strong class="block text-page-title font-normal tracking-[-0.04em]">{formatFocusTotal(selectedDay?.focusedMs ?? 0)}</strong>
          <span class="text-meta text-muted-foreground">
            {selectedDay && selectedDay.goalMs > 0
              ? Math.round((selectedDay.focusedMs / selectedDay.goalMs) * 100)
              : 0}% of {formatFocusTotal(selectedDay?.goalMs ?? goalMs)} goal · {selectedDay?.sessionCount ?? 0} sessions
          </span>
        </div>

        {#if selectedSessions.length === 0}
          <div class="py-8 text-center text-meta text-muted-foreground">No focus sessions on this day.</div>
        {:else}
          <div class="divide-y">
            {#each selectedSessions as session}
              <div class="grid grid-cols-[58px_1fr_auto] items-center gap-3 py-3">
                <time class="text-meta text-muted-foreground">{formatClock(session.startedAt)}</time>
                <div class="min-w-0">
                  <div class="truncate text-meta">{session.label || 'Focus session'}</div>
                  <div class="mt-1 text-meta text-muted-foreground">
                    {formatFocusTotal(session.plannedDurationMs)} target
                    {#if session.overtimeMs > 0}
                      + {formatFocusTotal(session.overtimeMs)} overtime
                    {/if}
                  </div>
                </div>
                <span class="text-meta text-muted-foreground">{formatFocusTotal(session.actualDurationMs)}</span>
              </div>
            {/each}
          </div>
        {/if}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  {/if}

</div>
