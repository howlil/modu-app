<script lang="ts">
  import { Activity, ArrowRight, Lightbulb } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import type { DailyExecutionController } from '../controller/daily-execution.svelte.ts';
  import { WORKSTREAM_NAMES, type Workstream } from '../core/planning.ts';
  import type { MetricWindow } from '../core/analytics.ts';

  let {controller}: {controller: DailyExecutionController} = $props();
  let horizon = $state<MetricWindow>(7);
  let adjustment = $state(45);
  const snapshot = $derived(controller.intelligenceSnapshot(horizon));
  const insight = $derived(controller.weeklyInsight);
  const habit = $derived(controller.habitProgress);
  const areas = Object.keys(WORKSTREAM_NAMES) as Workstream[];
  const fmt = (ms: number) => controller.minutesLabel(ms / 60_000);
  const chart = $derived.by(() => {
    const chunk = Math.ceil(snapshot.daily.length / 7);
    return Array.from({length: Math.ceil(snapshot.daily.length / chunk)}, (_,index) => {
      const group = snapshot.daily.slice(index * chunk, (index + 1) * chunk);
      return {label: group.length === 1 ? group[0].dateKey.slice(5) : group[0].dateKey.slice(5) + '–' + group[group.length-1].dateKey.slice(5),
        total: group.reduce((sum,entry) => sum + entry.focusMs + entry.manualMs,0)};
    });
  });
  const chartMax = $derived(Math.max(1,...chart.map((entry)=>entry.total)));
</script>

<div class="grid gap-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div><h3 class="text-title-lg font-semibold">Performance</h3><p class="mt-1 text-meta text-muted-foreground">Measured work and recorded outcomes, not a productivity score.</p></div>
    <div class="flex rounded-full bg-muted p-1" role="group" aria-label="Analytics period">
      {#each [7,28,90] as window}
        <Button size="sm" variant="ghost" aria-pressed={horizon === window}
          class={horizon === window ? 'h-8 rounded-full bg-card px-3 text-meta text-primary shadow-sm' : 'h-8 rounded-full px-3 text-meta text-muted-foreground shadow-none'}
          onclick={() => horizon = window as MetricWindow}>{window}D</Button>
      {/each}
    </div>
  </div>
  <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
    {#each [
      {label:'Work recorded', value:fmt(snapshot.totalMs)},
      {label:'Active days', value:String(snapshot.activeDays)},
      {label:'Tasks completed', value:String(snapshot.completedTasks)},
      {label:'Evidence', value:String(snapshot.evidenceCount)}
    ] as metric}
      <div class="rounded-xl border border-border bg-card p-4">
        <div class="text-meta text-muted-foreground">{metric.label}</div>
        <div class="mt-2 text-title-lg font-medium tabular-nums">{metric.value}</div>
      </div>
    {/each}
  </div>
  <section class="rounded-[20px] border border-border bg-card p-5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-title font-medium">Recorded activity</h3>
      <span class="text-meta text-muted-foreground">{fmt(snapshot.focusMs)} focus · {fmt(snapshot.manualMs)} manual</span>
    </div>
    {#if snapshot.totalMs === 0}
      <p class="py-8 text-center text-meta text-muted-foreground">No recorded work during this period.</p>
    {:else}
      <div class="mt-6 flex h-36 items-end justify-between gap-2" aria-label="Activity trend by period">
        {#each chart as bucket}
          <div class="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span class="text-meta text-muted-foreground tabular-nums">{fmt(bucket.total)}</span>
            <div class="w-full max-w-14 rounded-t-md bg-primary/65" style:height={Math.max(bucket.total > 0 ? 4 : 0, Math.round(bucket.total / chartMax * 90)) + 'px'}></div>
            <span class="w-full truncate text-center text-meta text-muted-foreground">{bucket.label}</span>
          </div>
        {/each}
      </div>
    {/if}
    {#if snapshot.limitations.length}
      {#each snapshot.limitations as limitation}
        <p class="mt-3 text-meta text-muted-foreground">{limitation}</p>
      {/each}
    {/if}
  </section>
  <section class="rounded-[20px] border border-border bg-card p-5">
    <h3 class="text-title font-medium">Workstream distribution</h3>
    <div class="mt-4 grid gap-3">
      {#each areas as workstream}
        {@const duration = snapshot.workstreamMs[workstream]}
        <div>
          <div class="mb-1 flex justify-between gap-2 text-meta"><span>{WORKSTREAM_NAMES[workstream]}</span><span class="tabular-nums text-muted-foreground">{fmt(duration)}</span></div>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary" style:width={snapshot.totalMs ? Math.min(100,100 * duration / snapshot.totalMs) + '%' : '0%'}></div></div>
        </div>
      {/each}
    </div>
    {#if snapshot.unassignedSessions}<p class="mt-3 text-meta text-muted-foreground">{snapshot.unassignedSessions} focus sessions are unassigned; their time remains in the overall total.</p>{/if}
    <p class="mt-3 text-meta text-muted-foreground">Attribution follows each task's current workstream; past workstream edits are not versioned.</p>
  </section>
  {#if controller.state.habit.qualifyingWorkstreams.length > 0}
  <section class="rounded-[20px] border border-border bg-card p-5">
    <div class="flex items-center justify-between"><h3 class="text-title font-medium">Consistency</h3><Activity class="size-4 text-muted-foreground" /></div>
    <p class="mt-1 text-meta text-muted-foreground">Practice frequency derived from linked focus sessions.</p>
    <div class="mt-4 flex items-center justify-between">
      <div><div class="text-ui font-medium">{controller.state.habit.name}</div><div class="text-meta text-muted-foreground">Current week · minimum {controller.state.habit.minimumSessionMinutes}m per qualifying session</div></div>
      <strong class="text-title-lg font-medium tabular-nums">{habit.completedDays} / {habit.targetDays}</strong>
    </div>
    <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary" style:width={Math.min(100,100*habit.completedDays/habit.targetDays)+'%'}></div></div>
    <label class="mt-4 flex items-center justify-between gap-2 text-meta">Target days per week
      <select class="h-9 rounded-lg border border-input bg-card px-2 text-ui" value={controller.state.habit.targetDaysPerWeek} onchange={(event)=>controller.updateHabitTarget(Number(event.currentTarget.value))}>
        {#each [1,2,3,4,5,6,7] as days}<option value={days}>{days} days</option>{/each}
      </select>
    </label>
    <p class="mt-3 text-meta text-muted-foreground">Multiple sessions on one day count as one practice day. No extra habit checkbox.</p>
  </section>
  {/if}
  <section class="rounded-[20px] border border-border bg-card p-5">
    <div class="flex items-center gap-2"><Lightbulb class="size-4 text-primary" /><h3 class="text-title font-medium">Weekly recommendation</h3></div>
    {#if insight}
      <h4 class="mt-4 text-ui font-semibold">{insight.title}</h4>
      <p class="mt-2 text-ui text-muted-foreground">{insight.reason}</p>
      <p class="mt-3 text-meta text-muted-foreground">{insight.dataLimitations}</p>
      {#if insight.evidenceIds.length}
        <Button variant="ghost" size="sm" class="mt-3 rounded-full text-meta text-primary" onclick={()=>controller.reviewSubview='evidence'}>
          View {insight.evidenceIds.length} supporting evidence <ArrowRight class="ml-1 size-3.5"/>
        </Button>
      {/if}
      {#if insight.workstream && insight.suggestedMinutes > 0}
        <label class="mt-4 flex items-center justify-between gap-2 text-meta">Shift up to
          <select class="h-9 rounded-lg border border-input bg-card px-2 text-ui" bind:value={adjustment}>
            <option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option>
            <option value={60}>60 min</option><option value={90}>90 min</option>
          </select>
        </label>
        <p class="mt-1 text-meta text-muted-foreground">From other remaining allocations to {WORKSTREAM_NAMES[insight.workstream]}.</p>
      {/if}
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" class="rounded-full" onclick={()=>controller.decideRecommendation(insight,'rejected')}>Keep current plan</Button>
        <Button size="sm" class="rounded-full" onclick={()=>controller.decideRecommendation(insight,'accepted',insight.workstream ? Number(adjustment) : 0)}>Accept recommendation</Button>
      </div>
    {:else}
      <p class="mt-3 text-meta text-muted-foreground">No new recommendation has enough supported context this week. Current priorities remain unchanged.</p>
    {/if}
    {#if controller.intelligenceNotice}<p class="mt-3 text-meta text-muted-foreground" role="status">{controller.intelligenceNotice}</p>{/if}
  </section>
</div>
