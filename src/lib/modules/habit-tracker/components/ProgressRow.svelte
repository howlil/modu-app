<script lang="ts">
  import { Check, Minus, Plus, Pencil } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import type { PeriodHabit } from '../controller/habit-tracker.svelte.ts';
  import type { CheckinCommand } from '../core/progress.ts';

  let {
    item, busy, readOnly = false, onCommand, onCorrect
  }: {
    item: PeriodHabit;
    busy: boolean;
    readOnly?: boolean;
    onCommand: (command: CheckinCommand) => void;
    onCorrect: () => void;
  } = $props();

  const measurement = $derived(item.policy.measurement);
  const current = $derived(item.checkin?.value ?? 0);
  const done = $derived(item.outcome === 'MET');
  const step = $derived(measurement === 'DURATION' ? 5 : measurement === 'QUANTITY' && item.policy.unit?.toLowerCase() === 'ml' ? 250 : 1);
  const progressLabel = $derived(measurement === 'AVOIDANCE'
    ? item.checkin?.attestation === 'CLEAN' ? 'Clean day' : item.checkin?.attestation === 'LAPSE' ? 'Lapse recorded' : 'No attestation'
    : measurement === 'BOOLEAN' ? 'Daily check-off'
    : String(current) + ' / ' + String(item.policy.target) + ' ' + (item.policy.unit ?? ''));
</script>

<div class="flex min-h-18 flex-wrap items-center gap-2 border-b border-border py-3 last:border-b-0">
  <div class="min-w-[110px] flex-1">
    <div class="truncate text-ui font-medium">{item.habit.title}</div>
    <p class="text-meta text-muted-foreground">{progressLabel}</p>
    <p class={done ? 'text-meta text-primary' : 'text-meta text-muted-foreground'}>{item.outcome === 'MET' ? 'Completed' : item.outcome === 'PARTIAL' ? 'In progress' : item.outcome === 'MISSED' ? 'Missed' : item.outcome === 'SKIPPED' ? 'Skipped' : 'Pending'}</p>
  </div>
  <div class="flex items-center gap-1">
    {#if measurement === 'BOOLEAN'}
      <Button size="sm" variant={done ? 'secondary' : 'outline'} class="rounded-full" disabled={busy || readOnly}
        aria-pressed={done} onclick={() => onCommand(done ? { type: 'clear' } : { type: 'set', value: 1 })}>
        {#if done}<Check class="mr-1 size-4"/>{/if}{done ? 'Done' : 'Complete'}
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
  </div>
</div>
