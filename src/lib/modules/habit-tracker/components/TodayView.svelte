<script lang="ts">
  import { Plus } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import HabitRow from './HabitRow.svelte';
  import ProgressRow from './ProgressRow.svelte';
  import HabitEmptyState from './HabitEmptyState.svelte';
  import type { HabitTrackerController } from '../controller/habit-tracker.svelte.ts';

  let { controller }: { controller: HabitTrackerController } = $props();
  const total = $derived(controller.todayHabits.length);
  const completed = $derived(controller.completedCount);
  const percentage = $derived(total ? Math.round(completed / total * 100) : 0);
  const displayDate = $derived(controller.today
    ? new Date(controller.today + 'T12:00:00').toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' })
    : '');
</script>

<div class="flex flex-wrap items-start justify-between gap-3">
  <div>
    <p class="text-meta text-muted-foreground">{displayDate}</p>
    <h2 class="mt-1 text-title-lg font-medium">Today</h2>
  </div>
  <Button size="sm" class="rounded-full" disabled={controller.busy} onclick={controller.openCreate}>
    <Plus class="mr-1 size-4"/> New habit
  </Button>
</div>

{#if total === 0 && controller.archivedHabits.length === 0}
  <div class="mt-5"><HabitEmptyState onCreate={controller.openCreate}/></div>
{:else}
  <section class="mt-5 rounded-[20px] border border-border bg-card p-5" aria-label="Today summary">
    <p class="text-meta text-muted-foreground">Goals met · daily or weekly as scheduled</p>
    <div class="mt-3 text-display font-normal tabular-nums">{completed} <span class="text-ui text-muted-foreground">/ {total}</span></div>
    <div class="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar"
      aria-label="Today completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
      <div class="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style:width={percentage + '%'}></div>
    </div>
    <p class="mt-2 text-meta text-muted-foreground">{percentage}% of goals due today · flexible quotas count the week</p>
  </section>

  <div class="mt-6">
    <h3 class="text-title font-medium">Your habits</h3>
    {#if total}
      <div class="mt-3 rounded-[20px] border border-border bg-card px-4">
        {#each controller.todayHabits as item (item.habit.id)}
          <ProgressRow {item} busy={controller.busy}
            onCommand={(command) => { void controller.recordProgress(item.habit.id, controller.today, command); }}
            onCorrect={() => controller.openCorrection(item.habit.id, controller.today)}
            onEdit={() => controller.openEdit(item.habit.id)}
            onArchive={() => { void controller.setArchived(item.habit.id, true); }}
            onDelete={() => controller.requestDelete(item.habit.id)}
            confirming={controller.confirmDeleteId === item.habit.id}
            onConfirmDelete={() => { void controller.confirmDelete(); }}
            onCancelDelete={controller.cancelDelete}/>
        {/each}
      </div>
    {:else}
      <p class="mt-3 text-ui text-muted-foreground">No active habits. Create one or restore an archived habit.</p>
    {/if}
  </div>

  {#if controller.archivedHabits.length > 0}
    <details class="mt-6 rounded-[20px] border border-border bg-card px-4">
      <summary class="cursor-pointer py-4 text-ui font-medium">Archived ({controller.archivedHabits.length})</summary>
      {#each controller.archivedHabits as habit (habit.id)}
        <HabitRow
          {habit} busy={controller.busy}
          confirming={controller.confirmDeleteId === habit.id}
          onToggle={() => {}}
          onEdit={() => controller.openEdit(habit.id)}
          onArchive={() => controller.setArchived(habit.id, false)}
          onDelete={() => controller.requestDelete(habit.id)}
          onConfirmDelete={controller.confirmDelete}
          onCancelDelete={controller.cancelDelete}
        />
      {/each}
    </details>
  {/if}
{/if}
