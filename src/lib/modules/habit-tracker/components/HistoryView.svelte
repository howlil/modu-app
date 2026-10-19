<script lang="ts">
  import ProgressRow from './ProgressRow.svelte';
  import CalendarMonth from './CalendarMonth.svelte';
  import { isHabitActiveOn } from '../core/scheduling.ts';
  import type { HabitTrackerController } from '../controller/habit-tracker.svelte.ts';

  let { controller }: { controller: HabitTrackerController } = $props();
  const records = $derived(controller.historyHabits);
  const completed = $derived(records.filter(item => item.completed).length);
</script>

<section>
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="text-title-lg font-medium">History</h2>
      <p class="mt-1 text-meta text-muted-foreground">Select a date to inspect and correct recorded progress.</p>
    </div>
    <div>
      <label for="habit-history-date" class="mb-1 block text-meta text-muted-foreground">Selected date</label>
      <input id="habit-history-date" type="date" value={controller.selectedDate} max={controller.today}
        onchange={(event) => controller.selectHistoryDate(event.currentTarget.value)}
        class="h-10 rounded-lg border border-input bg-card px-3 text-ui"/>
    </div>
  </div>
  <div class="mt-5">
    <CalendarMonth selectedDate={controller.selectedDate} today={controller.today}
      getDay={(date) => controller.calendarDay(date)}
      onSelect={controller.selectHistoryDate}/>
  </div>
  <section class="mt-5 rounded-[20px] border border-border bg-card p-5">
    <p class="text-meta text-muted-foreground">Recorded goals completed</p>
    <p class="mt-2 text-title-lg font-medium tabular-nums">{completed} / {records.length}</p>
    <p class="mt-1 text-meta text-muted-foreground">Daily obligations without a record may be missed. Flexible weekly quotas are evaluated across distinct dates in each week.</p>
  </section>
  <section class="mt-5 rounded-[20px] border border-border bg-card px-4">
    {#if records.length}
      {#each records as item (item.habit.id)}
        <ProgressRow {item} busy={controller.busy}
          readOnly={!isHabitActiveOn(item.habit, controller.selectedDate)}
          onCommand={(command) => { void controller.recordProgress(item.habit.id, controller.selectedDate, command); }}
          onCorrect={() => controller.openCorrection(item.habit.id, controller.selectedDate)}/>
      {/each}
    {:else}
      <p class="py-7 text-ui text-muted-foreground">No habits were scheduled on this date.</p>
    {/if}
  </section>
</section>
