<script lang="ts">
  import { Download, Target, X } from 'lucide-svelte';
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import {
    aggregateDailyActivity,
    buildHeatmapDays,
    calculateWeekSummary,
    isScheduledGoalDay,
    localDateKey,
    sessionsForDate,
    sessionsToCsv,
    type FocusActivitySession,
    type GoalSchedule,
    type HeatmapDay
  } from '#lib/modules/pomodoro/activity.ts';

  type Props = {
    sessions: FocusActivitySession[];
    goalHours: number;
    goalSchedule: GoalSchedule;
    clockNow: number;
    onGoalChange: (hours: number, schedule: GoalSchedule) => void;
    onClear: () => void | Promise<void>;
  };

  let {
    sessions,
    goalHours,
    goalSchedule,
    clockNow,
    onGoalChange,
    onClear
  }: Props = $props();

  let goalOpen = $state(false);
  let goalDraftHours = $state(goalHours);
  let goalDraftSchedule = $state<GoalSchedule>(goalSchedule);
  let selectedDayKey = $state<string | null>(null);
  let dayOpen = $state(false);
  let exportOpen = $state(false);

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

  function downloadFile(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    downloadFile(
      'module-pomodoro-activity.json',
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          goal: { hours: goalHours, schedule: goalSchedule },
          sessions
        },
        null,
        2
      ),
      'application/json'
    );
    exportOpen = false;
  }

  function exportCsv() {
    downloadFile(
      'module-pomodoro-activity.csv',
      sessionsToCsv(sessions),
      'text/csv;charset=utf-8'
    );
    exportOpen = false;
  }

  async function clearActivity() {
    await onClear();
    exportOpen = false;
    dayOpen = false;
  }
</script>

<div>
  <div class="mb-7 flex items-end justify-between gap-4">
    <div class="text-left">
      <h2 class="m-0 text-[20px] font-[500] tracking-[-0.035em]">Activity</h2>
      <p class="mt-1.5 text-[11px] text-muted-foreground">Focus time, goals, and session history.</p>
    </div>

    <Button
      variant="ghost"
      size="sm"
      class="h-8 rounded-lg px-2.5 text-[11px] font-normal text-muted-foreground"
      onclick={openGoal}
    >
      <Target class="size-3.5" strokeWidth={1.7} />
      Daily goal · {goalHours}h
    </Button>
  </div>

  <div class="grid grid-cols-[1.2fr_0.8fr] gap-6 max-[700px]:grid-cols-1">
    <div class="border-t pt-4">
      <div class="mb-2 text-[11px] text-muted-foreground">Today</div>
      <div class="text-[40px] font-[450] leading-none tracking-[-0.05em]">
        {formatFocusTotal(today.focusedMs)}
        {#if todayHasGoal}
          <span class="text-[14px] font-normal tracking-normal text-muted-foreground">/ {goalHours}h</span>
        {/if}
      </div>

      {#if todayHasGoal}
        <div class="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            class="h-full rounded-full bg-primary transition-[width]"
            style={`width: ${Math.min(100, todayProgress * 100)}%`}
          ></div>
        </div>

        <div class="mt-2 flex justify-between gap-4 text-[11px] text-muted-foreground">
          <span>{Math.round(todayProgress * 100)}% of goal</span>
          <span>
            {today.focusedMs >= goalMs
              ? 'Goal reached'
              : `${formatFocusTotal(goalMs - today.focusedMs)} remaining`}
          </span>
        </div>
      {:else}
        <div class="mt-3 text-[11px] text-muted-foreground">No goal scheduled today</div>
      {/if}
    </div>

    <div class="border-t pt-4">
      <div class="mb-2 text-[11px] text-muted-foreground">Today at a glance</div>
      <div class="grid grid-cols-2 gap-x-5 gap-y-4">
        <div>
          <strong class="block text-[22px] font-[500] tracking-[-0.03em]">{today.sessionCount}</strong>
          <span class="text-[11px] text-muted-foreground">focus sessions</span>
        </div>
        <div>
          <strong class="block text-[22px] font-[500] tracking-[-0.03em]">{formatFocusTotal(today.overtimeMs)}</strong>
          <span class="text-[11px] text-muted-foreground">overtime</span>
        </div>
        <div>
          <strong class="block text-[22px] font-[500] tracking-[-0.03em]">{formatFocusTotal(todayAverageMs)}</strong>
          <span class="text-[11px] text-muted-foreground">avg. session</span>
        </div>
        <div>
          <strong class="block text-[22px] font-[500] tracking-[-0.03em]">{formatClock(today.firstStartedAt)}</strong>
          <span class="text-[11px] text-muted-foreground">first session</span>
        </div>
      </div>
    </div>
  </div>

  <div class="mt-9">
    <div class="mb-3 flex items-center justify-between gap-4">
      <div>
        <h3 class="m-0 text-[14px] font-medium">Focus heatmap</h3>
        <p class="mt-1 text-[10px] text-muted-foreground">Last 52 weeks · intensity follows each day's goal</p>
      </div>

      <div class="flex items-center gap-1 text-[10px] text-muted-foreground max-[560px]:hidden">
        <span>Less</span>
        {#each ['#ECECE6', '#DCE8FF', '#ABC6FB', '#6E9DF5', '#4F82F2', '#2468F2'] as color}
          <span class="size-2.5 rounded-[3px]" style={`background: ${color}`}></span>
        {/each}
        <span>Goal</span>
      </div>
    </div>

    <div class="overflow-x-auto pb-2">
      <div class="grid w-max grid-flow-col grid-rows-7 gap-1">
        {#each heatmapDays as day}
          <button
            type="button"
            class={[
              'size-3 rounded-[3px] transition',
              day.future
                ? 'cursor-default opacity-45'
                : 'hover:outline hover:outline-2 hover:outline-foreground/15 hover:outline-offset-1'
            ]}
            style={`background: ${heatmapColor(day)}`}
            title={heatmapTitle(day)}
            aria-label={heatmapTitle(day)}
            disabled={day.future}
            onclick={() => inspectDay(day)}
          ></button>
        {/each}
      </div>
    </div>
  </div>

  <div class="mt-8">
    <div class="mb-3 flex items-center justify-between">
      <h3 class="m-0 text-[14px] font-medium">This week</h3>
      <span class="text-[10px] text-muted-foreground">Mon–Sun</span>
    </div>

    <div class="grid grid-cols-3 gap-6 max-[620px]:grid-cols-1 max-[620px]:gap-3">
      <div class="border-t pt-3">
        <strong class="block text-[24px] font-[500] tracking-[-0.035em]">{formatFocusTotal(week.focusedMs)}</strong>
        <span class="text-[11px] text-muted-foreground">focused</span>
      </div>
      <div class="border-t pt-3">
        <strong class="block text-[24px] font-[500] tracking-[-0.035em]">{formatFocusTotal(week.averageActiveDayMs)}</strong>
        <span class="text-[11px] text-muted-foreground">avg. / active day</span>
      </div>
      <div class="border-t pt-3">
        <strong class="block text-[24px] font-[500] tracking-[-0.035em]">
          {week.goalsReached} / {week.scheduledGoalDays}
        </strong>
        <span class="text-[11px] text-muted-foreground">targets reached</span>
      </div>
    </div>
  </div>

  <div class="mt-9">
    <div class="mb-2 flex items-center justify-between gap-4">
      <h3 class="m-0 text-[14px] font-medium">Recent activity</h3>

      <Button
        variant="ghost"
        size="sm"
        class="h-8 rounded-lg px-2.5 text-[11px] font-normal text-muted-foreground"
        onclick={() => (exportOpen = true)}
      >
        <Download class="size-3.5" strokeWidth={1.7} />
        Export data
      </Button>
    </div>

    {#if sessions.length === 0}
      <div class="border-t py-10 text-center text-[12px] text-muted-foreground">
        Completed focus sessions will appear here.
      </div>
    {:else}
      {#each recentDateKeys as dateKey}
        {@const daySessions = sessionsForDate(sessions, dateKey)}
        {@const day = daily.find((item) => item.dateKey === dateKey)}

        <div class="border-t py-3">
          <button
            type="button"
            class="mb-1 flex w-full items-center justify-between gap-4 rounded-lg py-1 text-left"
            onclick={() => openHistoryDay(dateKey)}
          >
            <strong class="text-[12px] font-medium">{formatDayLabel(dateKey)}</strong>
            <span class="text-[11px] text-muted-foreground">{formatFocusTotal(day?.focusedMs ?? 0)}</span>
          </button>

          {#each daySessions.slice(0, 6) as session}
            <div class="grid grid-cols-[68px_1fr_auto] items-center gap-3 py-2 max-[520px]:grid-cols-[54px_1fr_auto]">
              <time class="text-[11px] text-muted-foreground">{formatClock(session.startedAt)}</time>
              <div class="min-w-0">
                <div class="truncate text-[12px]">{session.label || 'Focus session'}</div>
                <div class="mt-0.5 text-[10px] text-muted-foreground">
                  {formatFocusTotal(session.plannedDurationMs)} target
                  {#if session.overtimeMs > 0}
                    + {formatFocusTotal(session.overtimeMs)} overtime
                  {/if}
                </div>
              </div>
              <div class="text-[11px] text-muted-foreground">{formatFocusTotal(session.actualDurationMs)}</div>
            </div>
          {/each}
        </div>
      {/each}
    {/if}
  </div>

  {#if goalOpen}
    <div
      class="fixed inset-0 z-[110] grid place-items-center bg-foreground/[0.12] p-4 backdrop-blur-[3px]"
      role="presentation"
      onclick={(event) => {
        if (event.target === event.currentTarget) goalOpen = false;
      }}
    >
      <div
        class="w-full max-w-[390px] rounded-[18px] border border-white/[0.65] bg-background/[0.96] p-4 text-left shadow-[0_24px_70px_rgba(28,28,24,0.16)] backdrop-blur-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-goal-title"
      >
        <div class="mb-4 flex items-center justify-between">
          <h3 id="daily-goal-title" class="m-0 text-[14px] font-medium">Daily focus target</h3>
          <Button variant="ghost" size="icon-sm" class="rounded-lg text-muted-foreground" aria-label="Close goal settings" onclick={() => (goalOpen = false)}>
            <X class="size-4" strokeWidth={1.7} />
          </Button>
        </div>

        <label class="grid min-h-11 grid-cols-[1fr_100px] items-center gap-3 text-[12px]">
          Target
          <div class="flex items-center gap-2">
            <Input type="number" min="1" max="16" step="0.5" class="h-8 text-right text-[12px]" bind:value={goalDraftHours} />
            <span class="text-[11px] text-muted-foreground">h</span>
          </div>
        </label>

        <div class="mt-3 border-t pt-4">
          <div class="mb-2 text-[11px] text-muted-foreground">Apply on</div>
          <div class="flex gap-2">
            <Button
              variant={goalDraftSchedule === 'weekdays' ? 'secondary' : 'outline'}
              size="sm"
              class="h-8 rounded-lg text-[11px] font-normal shadow-none"
              onclick={() => (goalDraftSchedule = 'weekdays')}
            >
              Weekdays
            </Button>
            <Button
              variant={goalDraftSchedule === 'every-day' ? 'secondary' : 'outline'}
              size="sm"
              class="h-8 rounded-lg text-[11px] font-normal shadow-none"
              onclick={() => (goalDraftSchedule = 'every-day')}
            >
              Every day
            </Button>
          </div>
        </div>

        <Button class="mt-5 h-9 w-full rounded-lg text-[12px] font-medium shadow-none" onclick={saveGoal}>
          Update target
        </Button>
      </div>
    </div>
  {/if}

  {#if dayOpen && selectedDayKey}
    <div
      class="fixed inset-0 z-[110] grid place-items-center bg-foreground/[0.12] p-4 backdrop-blur-[3px]"
      role="presentation"
      onclick={(event) => {
        if (event.target === event.currentTarget) dayOpen = false;
      }}
    >
      <div
        class="max-h-[min(620px,calc(100vh-32px))] w-full max-w-[410px] overflow-y-auto rounded-[18px] border border-white/[0.65] bg-background/[0.96] p-4 text-left shadow-[0_24px_70px_rgba(28,28,24,0.16)] backdrop-blur-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-inspector-title"
      >
        <div class="mb-4 flex items-center justify-between">
          <h3 id="day-inspector-title" class="m-0 text-[14px] font-medium">{formatLongDay(selectedDayKey)}</h3>
          <Button variant="ghost" size="icon-sm" class="rounded-lg text-muted-foreground" aria-label="Close day details" onclick={() => (dayOpen = false)}>
            <X class="size-4" strokeWidth={1.7} />
          </Button>
        </div>

        <div class="border-b pb-4">
          <strong class="block text-[30px] font-[450] tracking-[-0.04em]">{formatFocusTotal(selectedDay?.focusedMs ?? 0)}</strong>
          <span class="text-[11px] text-muted-foreground">
            {selectedDay && selectedDay.goalMs > 0
              ? Math.round((selectedDay.focusedMs / selectedDay.goalMs) * 100)
              : 0}% of {formatFocusTotal(selectedDay?.goalMs ?? goalMs)} goal · {selectedDay?.sessionCount ?? 0} sessions
          </span>
        </div>

        {#if selectedSessions.length === 0}
          <div class="py-8 text-center text-[12px] text-muted-foreground">No focus sessions on this day.</div>
        {:else}
          <div class="divide-y">
            {#each selectedSessions as session}
              <div class="grid grid-cols-[58px_1fr_auto] items-center gap-3 py-3">
                <time class="text-[10px] text-muted-foreground">{formatClock(session.startedAt)}</time>
                <div class="min-w-0">
                  <div class="truncate text-[12px]">{session.label || 'Focus session'}</div>
                  <div class="mt-0.5 text-[10px] text-muted-foreground">
                    {formatFocusTotal(session.plannedDurationMs)} target
                    {#if session.overtimeMs > 0}
                      + {formatFocusTotal(session.overtimeMs)} overtime
                    {/if}
                  </div>
                </div>
                <span class="text-[11px] text-muted-foreground">{formatFocusTotal(session.actualDurationMs)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if exportOpen}
    <div
      class="fixed inset-0 z-[110] grid place-items-center bg-foreground/[0.12] p-4 backdrop-blur-[3px]"
      role="presentation"
      onclick={(event) => {
        if (event.target === event.currentTarget) exportOpen = false;
      }}
    >
      <div
        class="w-full max-w-[360px] rounded-[18px] border border-white/[0.65] bg-background/[0.96] p-4 text-left shadow-[0_24px_70px_rgba(28,28,24,0.16)] backdrop-blur-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
      >
        <div class="mb-4 flex items-center justify-between">
          <h3 id="export-title" class="m-0 text-[14px] font-medium">Activity data</h3>
          <Button variant="ghost" size="icon-sm" class="rounded-lg text-muted-foreground" aria-label="Close export" onclick={() => (exportOpen = false)}>
            <X class="size-4" strokeWidth={1.7} />
          </Button>
        </div>

        <div class="grid gap-2">
          <Button variant="outline" class="h-9 justify-start rounded-lg text-[12px] font-normal shadow-none" onclick={exportJson}>
            Export JSON backup
          </Button>
          <Button variant="outline" class="h-9 justify-start rounded-lg text-[12px] font-normal shadow-none" onclick={exportCsv}>
            Export CSV
          </Button>
        </div>

        {#if sessions.length > 0}
          <Button
            variant="ghost"
            class="mt-4 h-9 w-full rounded-lg text-[11px] font-normal text-destructive"
            onclick={clearActivity}
          >
            Clear activity history
          </Button>
        {/if}
      </div>
    </div>
  {/if}
</div>
