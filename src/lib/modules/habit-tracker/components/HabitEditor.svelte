<script lang="ts">
  import { onMount } from 'svelte';
  import { X } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import type { GoalPolicy, HabitDirection, LocalDate, Measurement, ScheduleRule } from '../core/types.ts';
  import type { HabitSetup } from '../core/progress.ts';
  import { addCalendarDays } from '../core/scheduling.ts';

  let {
    mode, title, today, policy, initialDirection = 'BUILD',
    busy, error = '', onSave, onCancel
  }: {
    mode: 'create' | 'edit';
    title: string;
    today: LocalDate;
    policy?: GoalPolicy;
    initialDirection?: HabitDirection;
    busy: boolean;
    error?: string;
    onSave: (input: HabitSetup & { effectiveFromDate?: LocalDate }) => Promise<void>;
    onCancel: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let draftTitle = $state('');
  let direction = $state<HabitDirection>('BUILD');
  let measurement = $state<Measurement>('BOOLEAN');
  let target = $state(1);
  let unit = $state('');
  let scheduleType = $state<ScheduleRule['type']>('DAILY');
  let weekdays = $state<number[]>([1, 2, 3, 4, 5]);
  let everyDays = $state(2);
  let quotaDays = $state(3);
  let intervalAnchor = $state<LocalDate>('');
  let effectiveDate = $state<LocalDate>('');
  let touched = $state(false);
  const tomorrow = $derived(today ? addCalendarDays(today, 1) : '');
  const numeric = $derived(direction === 'BUILD' && measurement !== 'BOOLEAN');
  const invalid = $derived(!draftTitle.trim() || draftTitle.trim().length > 80 ||
    (numeric && (!Number.isFinite(target) || target <= 0 || target > 1_000_000_000 ||
      (measurement !== 'QUANTITY' && !Number.isInteger(target)) ||
      (measurement === 'QUANTITY' && (!unit.trim() || Math.round(target * 1_000_000) / 1_000_000 !== target)))) ||
    (scheduleType === 'WEEKDAYS' && weekdays.length === 0) ||
    (scheduleType === 'INTERVAL' && (!Number.isInteger(everyDays) || everyDays < 1 ||
      !intervalAnchor || intervalAnchor > (mode === 'edit' ? effectiveDate : today))) ||
    (scheduleType === 'WEEKLY_QUOTA' && (!Number.isInteger(quotaDays) || quotaDays < 1 || quotaDays > 7)) ||
    (mode === 'edit' && (!effectiveDate || effectiveDate < tomorrow)));

  const days = [
    { value: 1, label: 'M', name: 'Monday' }, { value: 2, label: 'T', name: 'Tuesday' },
    { value: 3, label: 'W', name: 'Wednesday' }, { value: 4, label: 'T', name: 'Thursday' },
    { value: 5, label: 'F', name: 'Friday' }, { value: 6, label: 'S', name: 'Saturday' },
    { value: 0, label: 'S', name: 'Sunday' }
  ];
  function toggleWeekday(day: number, checked: boolean) {
    weekdays = checked ? [...weekdays, day].sort() : weekdays.filter(d => d !== day);
  }
  function buildSchedule(): ScheduleRule {
    switch (scheduleType) {
      case 'DAILY': return { type: 'DAILY' };
      case 'WEEKDAYS': return { type: 'WEEKDAYS', weekdays: [...weekdays] };
      case 'INTERVAL': return { type: 'INTERVAL', anchorDate: intervalAnchor, everyDays };
      case 'WEEKLY_QUOTA': return { type: 'WEEKLY_QUOTA', daysPerWeek: quotaDays };
    }
  }
  onMount(() => {
    draftTitle = title;
    direction = initialDirection;
    effectiveDate = tomorrow;
    intervalAnchor = mode === 'edit' ? tomorrow : today;
    if (policy) {
      measurement = policy.measurement;
      target = policy.target;
      unit = policy.unit ?? '';
      scheduleType = policy.schedule.type;
      if (policy.schedule.type === 'WEEKDAYS') weekdays = [...policy.schedule.weekdays];
      if (policy.schedule.type === 'INTERVAL') {
        everyDays = policy.schedule.everyDays;
        intervalAnchor = policy.schedule.anchorDate;
      }
      if (policy.schedule.type === 'WEEKLY_QUOTA') quotaDays = policy.schedule.daysPerWeek;
    }
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  });
  function submit(event: SubmitEvent) {
    event.preventDefault();
    touched = true;
    if (invalid || busy) return;
    const base = { title: draftTitle.trim(), schedule: buildSchedule(),
      ...(mode === 'edit' ? { effectiveFromDate: effectiveDate } : {}) };
    let input: HabitSetup & { effectiveFromDate?: LocalDate };
    if (direction === 'QUIT') {
      input = { ...base, direction: 'QUIT', measurement: 'AVOIDANCE' };
    } else if (measurement === 'BOOLEAN') {
      input = { ...base, direction: 'BUILD', measurement: 'BOOLEAN' };
    } else if (measurement === 'COUNT' || measurement === 'QUANTITY' || measurement === 'DURATION') {
      input = { ...base, direction: 'BUILD', measurement, target,
        unit: measurement === 'DURATION' ? 'min' : measurement === 'COUNT' ? 'times' : unit.trim() };
    } else return;
    void onSave(input);
  }
</script>

<dialog bind:this={dialog} aria-labelledby="habit-editor-title" onclose={onCancel}
  oncancel={(event) => { if (busy) event.preventDefault(); }}
  class="fixed inset-y-0 right-0 m-0 ml-auto h-full max-h-full w-full max-w-[440px] overflow-hidden border-0 bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/35">
  <form onsubmit={submit} class="flex h-full flex-col">
    <header class="flex items-start justify-between gap-3 border-b border-border p-5">
      <div>
        <h2 id="habit-editor-title" class="text-title font-medium">{mode === 'create' ? 'New habit' : 'Edit habit'}</h2>
        <p class="mt-1 text-meta text-muted-foreground">Goal & schedule · local-first</p>
      </div>
      <Button type="button" variant="ghost" size="icon" class="rounded-full" disabled={busy} aria-label="Close editor" onclick={onCancel}><X class="size-4"/></Button>
    </header>
    <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
      <div>
        <label for="habit-title" class="mb-2 block text-ui font-medium">Habit name</label>
        <Input id="habit-title" bind:value={draftTitle} maxlength={80} required placeholder="e.g. Drink 2 litres of water"/>
      </div>
      {#if mode === 'create'}
        <div>
          <label for="habit-direction" class="mb-2 block text-ui font-medium">Habit direction</label>
          <select id="habit-direction" bind:value={direction} class="h-10 w-full rounded-lg border border-input bg-card px-3 text-ui">
            <option value="BUILD">Build a habit</option><option value="QUIT">Quit a habit</option>
          </select>
        </div>
        {#if direction === 'BUILD'}
          <div>
            <label for="habit-measurement" class="mb-2 block text-ui font-medium">Measurement</label>
            <select id="habit-measurement" bind:value={measurement} class="h-10 w-full rounded-lg border border-input bg-card px-3 text-ui">
              <option value="BOOLEAN">Daily check-off</option><option value="COUNT">Count</option>
              <option value="QUANTITY">Quantity</option><option value="DURATION">Minutes (manual)</option>
            </select>
          </div>
        {/if}
      {:else}
        <p class="text-meta text-muted-foreground">Measurement stays {policy?.measurement ?? 'unchanged'}. Changes to target or schedule apply prospectively.</p>
      {/if}
      {#if numeric}
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="habit-target" class="mb-2 block text-ui font-medium">Goal per scheduled day</label>
            <Input id="habit-target" type="number" min={measurement === 'QUANTITY' ? '0.000001' : '1'}
              step={measurement === 'QUANTITY' ? 'any' : '1'} max="1000000000" bind:value={target} required/>
          </div>
          <div>
            <label for="habit-unit" class="mb-2 block text-ui font-medium">Unit</label>
            {#if measurement === 'QUANTITY' && mode === 'create'}
              <Input id="habit-unit" bind:value={unit} maxlength={32} placeholder="ml, km" required/>
            {:else}
              <p class="flex h-10 items-center rounded-lg border border-border bg-muted/40 px-3 text-ui">{measurement === 'DURATION' ? 'min' : measurement === 'COUNT' ? 'times' : unit}</p>
            {/if}
          </div>
        </div>
      {:else if direction === 'QUIT'}
        <p class="text-meta text-muted-foreground">Record CLEAN or LAPSE explicitly on scheduled days.</p>
      {/if}
      <div>
        <label for="habit-schedule" class="mb-2 block text-ui font-medium">Repeat schedule</label>
        <select id="habit-schedule" bind:value={scheduleType} class="h-10 w-full rounded-lg border border-input bg-card px-3 text-ui">
          <option value="DAILY">Every day</option>
          <option value="WEEKDAYS">Selected weekdays</option>
          <option value="INTERVAL">Every N days</option>
          <option value="WEEKLY_QUOTA">Flexible weekly quota</option>
        </select>
      </div>
      {#if scheduleType === 'WEEKDAYS'}
        <fieldset>
          <legend class="mb-2 text-ui font-medium">Scheduled weekdays</legend>
          <div class="flex flex-wrap gap-2">
            {#each days as day}
              <label class="flex size-10 cursor-pointer items-center justify-center rounded-full border border-border text-ui has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:checked]:text-primary" title={day.name}>
                <input class="sr-only" type="checkbox" aria-label={day.name} checked={weekdays.includes(day.value)}
                  onchange={(event) => toggleWeekday(day.value, event.currentTarget.checked)}/>
                {day.label}
              </label>
            {/each}
          </div>
          <p class="mt-2 text-meta text-muted-foreground">Only selected days become scheduled obligations.</p>
        </fieldset>
      {:else if scheduleType === 'INTERVAL'}
        <div class="grid grid-cols-2 gap-3">
          <div><label for="habit-interval" class="mb-2 block text-ui font-medium">Every N days</label>
            <Input id="habit-interval" type="number" min="1" step="1" bind:value={everyDays} required/>
          </div>
          <div><label for="habit-anchor" class="mb-2 block text-ui font-medium">Anchor date</label>
            <input id="habit-anchor" type="date" bind:value={intervalAnchor}
              max={mode === 'edit' ? effectiveDate : today}
              class="h-10 w-full rounded-lg border border-input bg-card px-3 text-ui" required/>
          </div>
        </div>
      {:else if scheduleType === 'WEEKLY_QUOTA'}
        <div>
          <label for="habit-quota" class="mb-2 block text-ui font-medium">Distinct days per week</label>
          <Input id="habit-quota" type="number" min="1" max="7" step="1" bind:value={quotaDays} required/>
          <p class="mt-2 text-meta text-muted-foreground">Any {quotaDays} different dates, Monday–Sunday. An unused day is not a daily miss; the week is evaluated as a whole.</p>
        </div>
      {/if}
      {#if mode === 'edit'}
        <div>
          <label for="habit-effective" class="mb-2 block text-ui font-medium">New policy effective date</label>
          <input id="habit-effective" type="date" min={tomorrow} bind:value={effectiveDate} required
            class="h-10 w-full rounded-lg border border-input bg-card px-3 text-ui"/>
          <p class="mt-2 text-meta text-muted-foreground">At earliest tomorrow. Previous dates keep their original goal and schedule. Changing name only does not create a revision.</p>
        </div>
      {/if}
      {#if touched && invalid}
        <p role="alert" class="text-meta text-destructive">Check your name, target, schedule, and effective date.</p>
      {/if}
      {#if error}
        <p role="alert" class="rounded-lg border border-destructive/30 bg-card p-3 text-ui text-destructive">{error}</p>
      {/if}
    </div>
    <footer class="flex justify-end gap-2 border-t border-border p-4">
      <Button type="button" variant="outline" class="rounded-full" disabled={busy} onclick={onCancel}>Cancel</Button>
      <Button type="submit" class="rounded-full" disabled={busy || invalid}>{busy ? 'Saving…' : mode === 'create' ? 'Create habit' : 'Save changes'}</Button>
    </footer>
  </form>
</dialog>
