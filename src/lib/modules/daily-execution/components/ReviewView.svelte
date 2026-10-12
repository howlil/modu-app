<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import { WORKSTREAM_NAMES, localDayKey, type Workstream } from '../core/planning.ts';
  import type { DailyExecutionController } from '../controller/daily-execution.svelte.ts';

  let { controller }: { controller: DailyExecutionController } = $props();
  let outcome = $state('');
  let bottleneck = $state('');
  let nextPriority = $state('');
  let selectedTask = $state<Record<string, string>>({});
  let saved = $state(false);
  let lastLoadedWeek = $state('');
  const workstreams = Object.keys(WORKSTREAM_NAMES) as Workstream[];
  const daily = $derived(controller.sessions.filter((session) => {
    const date = new Date(session.endedAt);
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-') === controller.dayKey;
  }));
  const todayDone = $derived(controller.state.tasks.filter((t) => t.status === 'done' && t.completedAt && localDayKey(t.completedAt) === controller.dayKey));
  const unassigned = $derived(controller.sessions.filter((s) => !s.taskId || !controller.state.tasks.some((t) => t.id === s.taskId)));
  $effect(() => {
    if (!controller.loading && controller.weekStart !== lastLoadedWeek) {
      lastLoadedWeek = controller.weekStart;
      const reflection = controller.state.reflections[controller.weekStart];
      outcome = reflection?.outcome ?? '';
      bottleneck = reflection?.bottleneck ?? '';
      nextPriority = reflection?.nextPriority ?? '';
    }
  });
</script>

<h2 class="text-title-lg font-semibold">Daily review</h2>
<p class="mt-1 text-meta text-muted-foreground">Focus time and completed outcomes stay separate.</p>
<div class="my-5 grid grid-cols-3 gap-2">
  <Card.Root class="gap-1 rounded-xl p-4 shadow-none"><span class="text-meta text-muted-foreground">Focus recorded</span><strong class="text-title-lg font-medium tabular-nums">{controller.minutesLabel(controller.recordedMs / 60_000)}</strong></Card.Root>
  <Card.Root class="gap-1 rounded-xl p-4 shadow-none"><span class="text-meta text-muted-foreground">Sessions</span><strong class="text-title-lg font-medium tabular-nums">{daily.length}</strong></Card.Root>
  <Card.Root class="gap-1 rounded-xl p-4 shadow-none"><span class="text-meta text-muted-foreground">Tasks done</span><strong class="text-title-lg font-medium tabular-nums">{todayDone.length}</strong></Card.Root>
</div>
<Card.Root class="mb-3 gap-4 rounded-[20px] p-5 shadow-none">
  <h3 class="text-title font-medium">Workstream allocation</h3>
  {#each workstreams as workstream}
    {@const actual = controller.focusMsForWorkstream(workstream) / 60_000}
    {@const planned = controller.plan.allocations[workstream]}
    <div>
      <div class="mb-2 flex justify-between gap-2 text-meta"><span>{WORKSTREAM_NAMES[workstream]}</span><span class="tabular-nums text-muted-foreground">{controller.minutesLabel(actual)} / {controller.minutesLabel(planned)}</span></div>
      <div class="h-1.5 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary" style:width={Math.min(100, 100 * actual / Math.max(1, planned)) + '%'}></div></div>
    </div>
  {/each}
  <p class="text-meta text-muted-foreground">Only recorded Pomodoro sessions count. Other work hours are not inferred.</p>
</Card.Root>
<Card.Root class="mb-3 gap-3 rounded-[20px] p-5 shadow-none">
  <h3 class="text-title font-medium">Outcomes</h3>
  {#each todayDone as task}
    <div class="border-t border-border pt-3"><div class="text-ui font-medium">{task.title}</div><p class="mt-1 text-meta text-muted-foreground">{task.outcome}</p>{#if task.evidenceUrl}<a class="mt-1 block text-meta text-primary underline" href={task.evidenceUrl} target="_blank" rel="noopener noreferrer">Open evidence ↗</a>{/if}</div>
  {:else}
    <p class="text-meta text-muted-foreground">No completed tasks recorded today.</p>
  {/each}
</Card.Root>
{#if unassigned.length}
  <Card.Root class="mb-3 gap-3 rounded-[20px] p-5 shadow-none">
    <h3 class="text-title font-medium">Unassigned sessions</h3>
    <p class="text-meta text-muted-foreground">Standalone Pomodoro sessions can be attached to a task without duplicating time.</p>
    {#each unassigned.slice(0, 12) as session}
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <div><div class="text-ui">{session.label || 'Standalone focus'}</div><div class="text-meta text-muted-foreground">{controller.minutesLabel(session.actualDurationMs / 60_000)} · {new Date(session.endedAt).toLocaleDateString()}</div></div>
        <div class="flex flex-wrap items-center gap-2">
          <select aria-label="Assign session to task" class="h-9 max-w-[165px] rounded-lg border border-input bg-card px-2 text-meta" value={selectedTask[session.id] ?? ''} onchange={(e) => selectedTask[session.id] = e.currentTarget.value}>
            <option value="">Select task</option>
            {#each controller.state.tasks as task}<option value={task.id}>{task.title}</option>{/each}
          </select>
          <Button variant="outline" size="sm" class="rounded-full" disabled={!selectedTask[session.id]} onclick={() => controller.assignSession(session.id, selectedTask[session.id])}>Assign</Button>
        </div>
      </div>
    {/each}
  </Card.Root>
{/if}
<Card.Root class="gap-3 rounded-[20px] p-5 shadow-none">
  <h3 class="text-title font-medium">Weekly reflection</h3>
  <p class="text-meta text-muted-foreground">Week of {controller.weekStart}. One short feedback loop.</p>
  <form class="grid gap-3" onsubmit={(e) => { e.preventDefault(); controller.saveReflection({ outcome, bottleneck, nextPriority }); saved = true; }}>
    <label class="grid gap-1 text-meta font-medium">Most valuable outcome<textarea class="min-h-16 rounded-lg border border-input p-3 text-ui font-normal" bind:value={outcome} placeholder="What moved the goal forward?"></textarea></label>
    <label class="grid gap-1 text-meta font-medium">Biggest bottleneck<textarea class="min-h-16 rounded-lg border border-input p-3 text-ui font-normal" bind:value={bottleneck} placeholder="What blocked progress?"></textarea></label>
    <label class="grid gap-1 text-meta font-medium">Next week's priority<input class="h-10 rounded-lg border border-input px-3 text-ui font-normal" bind:value={nextPriority} placeholder="One thing that deserves more time" /></label>
    <div class="flex items-center justify-between"><span class="text-meta text-muted-foreground">{saved ? 'Reflection saved locally' : ''}</span><Button type="submit" class="rounded-full">Save reflection</Button></div>
  </form>
</Card.Root>
