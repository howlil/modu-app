<script lang="ts">
  import { onMount } from 'svelte';
  import { X } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import type { PeriodHabit } from '../controller/habit-tracker.svelte.ts';
  import type { CheckinCommand } from '../core/progress.ts';

  let {
    item, date, busy, error = '', onSave, onCancel
  }: {
    item: PeriodHabit;
    date: string;
    busy: boolean;
    error?: string;
    onSave: (command: CheckinCommand) => Promise<void>;
    onCancel: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let amount = $state(0);
  let attest = $state<'CLEAN' | 'LAPSE'>('CLEAN');
  const measurement = $derived(item.policy.measurement);
  const valueInvalid = $derived(!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000 ||
    (measurement !== 'QUANTITY' && !Number.isInteger(amount)) ||
    (measurement === 'QUANTITY' && Math.round(amount * 1_000_000) / 1_000_000 !== amount));

  onMount(() => {
    amount = item.checkin?.value ?? 0;
    attest = item.checkin?.attestation ?? 'CLEAN';
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (busy || valueInvalid) return;
    if (measurement === 'AVOIDANCE') void onSave({ type: 'attest', attestation: attest });
    else void onSave({ type: 'set', value: amount });
  }
</script>

<dialog bind:this={dialog} aria-labelledby="checkin-editor-title" onclose={onCancel}
  oncancel={(event) => { if (busy) event.preventDefault(); }}
  class="fixed inset-y-0 right-0 m-0 ml-auto h-full max-h-full w-full max-w-[420px] overflow-hidden border-0 bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/35">
  <form class="flex h-full flex-col" onsubmit={submit}>
    <header class="flex items-start justify-between gap-3 border-b border-border p-5">
      <div>
        <h2 id="checkin-editor-title" class="text-title font-medium">Correct check-in</h2>
        <p class="mt-1 text-meta text-muted-foreground">{item.habit.title} · {date}</p>
      </div>
      <Button type="button" variant="ghost" size="icon" class="rounded-full" disabled={busy} aria-label="Close correction editor" onclick={onCancel}><X class="size-4"/></Button>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto p-5">
      {#if measurement === 'AVOIDANCE'}
        <label for="correction-attestation" class="mb-2 block text-ui font-medium">Day outcome</label>
        <select id="correction-attestation" bind:value={attest} class="h-10 w-full rounded-lg border border-input bg-card px-3 text-ui">
          <option value="CLEAN">Clean day</option>
          <option value="LAPSE">Lapse</option>
        </select>
        <p class="mt-3 text-meta text-muted-foreground">No entry means no attested success.</p>
      {:else}
        <label for="correction-amount" class="mb-2 block text-ui font-medium">{measurement === 'BOOLEAN' ? 'Completed (0 or 1)' : 'Recorded progress'}</label>
        <Input id="correction-amount" type="number" min="0" max="1000000000"
          step={measurement === 'QUANTITY' ? 'any' : '1'} bind:value={amount} required/>
        <p class="mt-2 text-meta text-muted-foreground">{measurement === 'BOOLEAN'
          ? '0 = unchecked; 1 = completed'
          : 'Target: ' + item.policy.target + ' ' + (item.policy.unit ?? '')}</p>
      {/if}
      {#if valueInvalid && measurement !== 'AVOIDANCE'}
        <p role="alert" class="mt-3 text-meta text-destructive">Enter a finite, nonnegative value (up to 6 decimals for quantity).</p>
      {/if}
      {#if error}
        <p role="alert" class="mt-3 rounded-lg border border-destructive/30 bg-card p-3 text-ui text-destructive">{error}</p>
      {/if}
    </div>
    <footer class="flex flex-wrap justify-between gap-2 border-t border-border p-4">
      <Button type="button" variant="outline" class="rounded-full" disabled={busy || !item.checkin}
        onclick={() => void onSave({ type: 'clear' })}>Clear record</Button>
      <div class="flex gap-2">
        <Button type="button" variant="outline" class="rounded-full" disabled={busy} onclick={onCancel}>Cancel</Button>
        <Button type="submit" class="rounded-full" disabled={busy || (measurement !== 'AVOIDANCE' && valueInvalid)}>{busy ? 'Saving…' : 'Save correction'}</Button>
      </div>
    </footer>
  </form>
</dialog>
