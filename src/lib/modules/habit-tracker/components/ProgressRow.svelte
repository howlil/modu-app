<script lang="ts">
  import { Check, Minus, Plus, Pencil, Archive, Trash2 } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import type { PeriodHabit } from '../controller/habit-tracker.svelte.ts';
  import type { CheckinCommand } from '../core/progress.ts';

  let {
    item, busy, readOnly = false, confirming = false, onCommand, onCorrect,
    onEdit, onArchive, onDelete, onConfirmDelete, onCancelDelete
  }: {
    item: PeriodHabit;
    busy: boolean;
    readOnly?: boolean;
    confirming?: boolean;
    onEdit?: () => void;
    onArchive?: () => void;
    onDelete?: () => void;
    onConfirmDelete?: () => void;
    onCancelDelete?: () => void;
    onCommand: (command: CheckinCommand) => void;
    onCorrect: () => void;
  } = $props();

  const measurement = $derived(item.policy.measurement);
  const current = $derived(item.checkin?.value ?? 0);
  const done = $derived(item.completed);
  const step = $derived(measurement === 'DURATION' ? 5 : measurement === 'QUANTITY' && item.policy.unit?.toLowerCase() === 'ml' ? 250 : 1);
  const progressLabel = $derived(item.weekly
    ? item.weekly.completedDays + ' / ' + item.weekly.requiredDays + ' days this week'
    : measurement === 'AVOIDANCE'
    ? item.checkin?.attestation === 'CLEAN' ? 'Clean day' : item.checkin?.attestation === 'LAPSE' ? 'Lapse recorded' : 'No attestation'
    : measurement === 'BOOLEAN' ? 'Daily check-off'
    : String(current) + ' / ' + String(item.policy.target) + ' ' + (item.policy.unit ?? ''));
</script>

<div class="flex min-h-18 flex-wrap items-center gap-2 border-b border-border py-3 last:border-b-0">
  <div class="min-w-[110px] flex-1">
    <div class="truncate text-ui font-medium">{item.habit.title}</div>
    <p class="text-meta text-muted-foreground">{progressLabel}</p>
    <p class={done ? 'text-meta text-primary' : 'text-meta text-muted-foreground'}>{item.weekly ? item.weekly.outcome === 'MET' ? 'Weekly goal met' : item.weekly.outcome === 'MISSED' ? 'Weekly goal missed' : 'Weekly goal pending' : item.outcome === 'MET' ? 'Completed' : item.outcome === 'PARTIAL' ? 'In progress' : item.outcome === 'MISSED' ? 'Missed' : item.outcome === 'SKIPPED' ? 'Skipped' : 'Pending'}</p>
  </div>
  <div class="flex items-center gap-1">
    {#if measurement === 'BOOLEAN'}
      <Button size="sm" variant={done ? 'secondary' : 'outline'} class="rounded-full" disabled={busy || readOnly}
        aria-pressed={item.outcome === 'MET'} onclick={() => onCommand(item.outcome === 'MET' ? { type: 'clear' } : { type: 'set', value: 1 })}>
        {#if item.outcome === 'MET'}<Check class="mr-1 size-4"/>{/if}{item.outcome === 'MET' ? 'Done' : 'Complete'}
      </Button>
    {:else if measurement === 'AVOIDANCE'}
      <Button size="sm" variant={item.checkin?.attestation === 'CLEAN' ? 'secondary' : 'outline'} class="rounded-full"
        aria-pressed={item.checkin?.attestation === 'CLEAN'} disabled={busy || readOnly}
        onclick={() => onCommand({ type: 'attest', attestation: 'CLEAN' })}>Clean</Button>
      <Button size="sm" variant={item.checkin?.attestation === 'LAPSE' ? 'secondary' : 'outline'} class="rounded-full"
        aria-pressed={item.checkin?.attestation === 'LAPSE'} disabled={busy || readOnly}
        onclick={() => onCommand({ type: 'attest', attestation: 'LAPSE' })}>Lapse</Button>
    {:else}
      <Button size="icon-sm" variant="outline" class="rounded-lg" aria-label={'Decrease ' + item.habit.title}
        disabled={busy || readOnly || current <= 0} onclick={() => onCommand({ type: 'adjust', delta: -Math.min(step, current) })}>
        <Minus class="size-4"/>
      </Button>
      <span class="min-w-9 text-center text-ui tabular-nums">{current}</span>
      <Button size="icon-sm" variant="outline" class="rounded-lg" aria-label={'Increase ' + item.habit.title}
        disabled={busy || readOnly} onclick={() => onCommand({ type: 'adjust', delta: step })}>
        <Plus class="size-4"/>
      </Button>
    {/if}
    <Button size="icon-sm" variant="ghost" class="ml-1 rounded-lg" title="Correct check-in"
      aria-label={'Correct ' + item.habit.title} disabled={busy || readOnly} onclick={onCorrect}>
      <Pencil class="size-4"/>
    </Button>
    {#if onEdit}
      <Button size="icon-sm" variant="ghost" class="rounded-lg" aria-label={'Edit ' + item.habit.title}
        disabled={busy} onclick={onEdit}><Pencil class="size-4"/></Button>
    {/if}
    {#if onArchive}
      <Button size="icon-sm" variant="ghost" class="rounded-lg" aria-label={'Archive ' + item.habit.title}
        disabled={busy} onclick={onArchive}><Archive class="size-4"/></Button>
    {/if}
    {#if onDelete}
      <Button size="icon-sm" variant="ghost" class="rounded-lg text-destructive" aria-label={'Delete ' + item.habit.title}
        disabled={busy} onclick={onDelete}><Trash2 class="size-4"/></Button>
    {/if}
  </div>
  {#if confirming}
    <div class="basis-full rounded-lg border border-destructive/20 bg-muted/50 p-3">
      <p class="text-ui">Delete <strong>{item.habit.title}</strong> and all records permanently?</p>
      <div class="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="outline" class="rounded-full" disabled={busy} onclick={onCancelDelete}>Cancel</Button>
        <Button size="sm" variant="destructive" class="rounded-full" disabled={busy} onclick={onConfirmDelete}>Delete permanently</Button>
      </div>
    </div>
  {/if}
</div>
