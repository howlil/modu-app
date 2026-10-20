<script lang="ts">
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import type { CalendarDay } from '../core/insights.ts';
  import { monthGrid, shiftMonth } from '../core/insights.ts';

  let {
    selectedDate, today, getDay, onSelect
  }: {
    selectedDate: string;
    today: string;
    getDay: (date: string) => CalendarDay;
    onSelect: (date: string) => void;
  } = $props();

  let displayedMonth = $state('');
  let lastSelectedMonth = $state('');
  // Date-picker changes can jump to another month; manual month browsing
  // must not be reset simply because the selected date stayed unchanged.
  $effect(() => {
    const incoming = selectedDate.slice(0, 7);
    if (incoming && incoming !== lastSelectedMonth) {
      lastSelectedMonth = incoming;
      displayedMonth = incoming;
    }
  });
  const cells = $derived(displayedMonth ? monthGrid(displayedMonth) : []);
  const days = $derived(cells.map(date => date ? { date, info: getDay(date) } : null));
  const monthTitle = $derived(displayedMonth
    ? new Date(displayedMonth + '-15T12:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : 'Calendar');
  const canForward = $derived(Boolean(displayedMonth) && displayedMonth < today.slice(0, 7));

  function dayClass(info: CalendarDay, selected: boolean): string {
    const base = 'relative flex aspect-square min-h-10 w-full flex-col items-center justify-center rounded-xl text-ui tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
    const selectedClass = selected ? ' outline outline-2 outline-primary outline-offset-1' : '';
    if (info.status === 'MET') return base + ' bg-primary/12 text-primary' + selectedClass;
    if (info.status === 'MISSED') return base + ' bg-destructive/10 text-destructive' + selectedClass;
    if (info.status === 'PARTIAL') return base + ' bg-secondary text-primary' + selectedClass;
    if (info.status === 'PENDING') return base + ' bg-muted text-foreground' + selectedClass;
    if (info.weeklyOpportunity) return base + ' bg-muted/60 text-foreground' + selectedClass;
    return base + ' text-muted-foreground hover:bg-muted/60' + selectedClass;
  }

  function accessibleDay(info: CalendarDay): string {
    const label = new Date(info.date + 'T12:00:00Z').toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
    });
    const daily = info.scheduled
      ? info.met + ' of ' + info.scheduled + ' daily goals met, ' + info.status.toLowerCase().replace('_', ' ')
      : 'no daily goals scheduled';
    const weekly = info.weeklyOpportunity
      ? ', ' + info.weeklyQualified + ' of ' + info.weeklyOpportunity + ' weekly opportunities qualified'
      : '';
    return label + ', ' + daily + weekly;
  }
</script>

<section aria-label="Habit calendar" class="rounded-[20px] border border-border bg-card p-4 sm:p-5">
  <div class="flex items-center justify-between gap-3">
    <button type="button" class="flex size-9 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
      aria-label="Previous month" disabled={!displayedMonth}
      onclick={() => displayedMonth = shiftMonth(displayedMonth, -1)}>
      <ChevronLeft class="size-4"/>
    </button>
    <h3 class="text-ui font-medium">{monthTitle}</h3>
    <button type="button" class="flex size-9 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30"
      aria-label="Next month" disabled={!canForward}
      onclick={() => displayedMonth = shiftMonth(displayedMonth, 1)}>
      <ChevronRight class="size-4"/>
    </button>
  </div>
  <div class="mt-4 grid grid-cols-7 gap-1">
    {#each [{short:'M',long:'Monday'},{short:'T',long:'Tuesday'},{short:'W',long:'Wednesday'},{short:'T',long:'Thursday'},{short:'F',long:'Friday'},{short:'S',long:'Saturday'},{short:'S',long:'Sunday'}] as weekday (weekday.long)}
      <div class="pb-2 text-center text-meta text-muted-foreground">
        <span aria-hidden="true">{weekday.short}</span>
        <span class="sr-only">{weekday.long}</span>
      </div>
    {/each}
    {#each days as day, index (index)}
      {#if day}
        <button type="button" disabled={day.date > today} aria-label={accessibleDay(day.info)}
          aria-pressed={selectedDate === day.date}
          class={dayClass(day.info, selectedDate === day.date) + (day.date > today ? ' opacity-30' : '')}
          onclick={() => onSelect(day.date)}>
          <span>{Number(day.date.slice(-2))}</span>
          {#if day.info.weeklyQualified}
            <span aria-hidden="true" class="absolute bottom-1 size-1 rounded-full bg-primary"></span>
          {:else if day.info.weeklyOpportunity}
            <span aria-hidden="true" class="absolute bottom-1 size-1 rounded-full border border-primary/60"></span>
          {/if}
        </button>
      {:else}
        <span aria-hidden="true"></span>
      {/if}
    {/each}
  </div>
  <div class="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-meta text-muted-foreground">
    <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full bg-primary"></span> Met</span>
    <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full bg-destructive/70"></span> Missed</span>
    <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full bg-muted border border-primary/60"></span> Weekly opportunity</span>
  </div>
</section>
