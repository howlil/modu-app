<script lang="ts">
  import { onMount } from 'svelte';
  import { X } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import type { HabitSetup } from '../core/progress.ts';

  let {
    mode, title, busy, error = '', onSave, onCancel
  }: {
    mode: 'create' | 'edit';
    title: string;
    busy: boolean;
    error?: string;
    onSave: (input: HabitSetup) => Promise<void>;
    onCancel: () => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let draftTitle = $state('');
  let direction = $state<'BUILD' | 'QUIT'>('BUILD');
  let measurement = $state<'BOOLEAN' | 'COUNT' | 'QUANTITY' | 'DURATION'>('BOOLEAN');
  let target = $state(1);
  let unit = $state('');
  let touched = $state(false);
  const numeric = $derived(direction === 'BUILD' && measurement !== 'BOOLEAN');
  const invalid = $derived(!draftTitle.trim() || draftTitle.trim().length > 80 ||
    (numeric && (!Number.isFinite(target) || target <= 0 || target > 1_000_000_000 ||
      (measurement !== 'QUANTITY' && !Number.isInteger(target)) ||
      (measurement === 'QUANTITY' && (!unit.trim() || Math.round(target * 1_000_000) / 1_000_000 !== target)))));

  onMount(() => {
    draftTitle = title;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    touched = true;
    if (invalid || busy) return;
    let input: HabitSetup;
    if (mode === 'edit' || direction === 'BUILD' && measurement === 'BOOLEAN') {
      input = { title: draftTitle.trim(), direction: 'BUILD', measurement: 'BOOLEAN' };
    } else if (direction === 'QUIT') {
      input = { title: draftTitle.trim(), direction: 'QUIT', measurement: 'AVOIDANCE' };
    } else if (measurement === 'COUNT' || measurement === 'QUANTITY' || measurement === 'DURATION') {
      input = { title: draftTitle.trim(), direction: 'BUILD', measurement,
        target, unit: measurement === 'DURATION' ? 'min' : measurement === 'COUNT' ? 'times' : unit.trim() };
    } else {
      return;
    }
    void onSave(input);
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="habit-editor-title"
  onclose={onCancel}
  oncancel={(event) => { if (busy) event.preventDefault(); }}
  class="fixed inset-y-0 right-0 m-0 ml-auto h-full max-h-full w-full max-w-[420px] overflow-hidden border-0 bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/35"
>
  <form onsubmit={submit} class="flex h-full flex-col">
    <header class="flex items-start justify-between gap-3 border-b border-border p-5">
      <div>
        <h2 id="habit-editor-title" class="text-title font-medium">{mode === 'create' ? 'New habit' : 'Edit habit'}</h2>
        <p class="mt-1 text-meta text-muted-foreground">Daily tracking · stored locally</p>
      </div>
      <Button type="button" variant="ghost" size="icon" class="rounded-full" aria-label="Close editor" disabled={busy} onclick={onCancel}>
        <X class="size-4"/>
      </Button>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto p-5">
      <label for="habit-title" class="mb-2 block text-ui font-medium">Habit name</label>
      <Input id="habit-title" bind:value={draftTitle} maxlength={80} placeholder="e.g. Drink 2 litres of water" required aria-invalid={touched && !draftTitle.trim()}/>
      {#if mode === 'create'}
        <div class="mt-5">
          <label for="habit-direction" class="mb-2 block text-ui font-medium">Habit direction</label>
          <select id="habit-direction" bind:value={direction} class="h-10 w-full rounded-lg border border-input bg-card px-3 text-ui">
            <option value="BUILD">Build a habit</option>
            <option value="QUIT">Quit a habit</option>
          </select>
        </div>
        {#if direction === 'BUILD'}
          <div class="mt-5">
            <label for="habit-measurement" class="mb-2 block text-ui font-medium">Track progress by</label>
            <select id="habit-measurement" bind:value={measurement} class="h-10 w-full rounded-lg border border-input bg-card px-3 text-ui">
              <option value="BOOLEAN">Check-off</option>
              <option value="COUNT">Count</option>
              <option value="QUANTITY">Quantity</option>
              <option value="DURATION">Minutes (manual)</option>
            </select>
          </div>
          {#if numeric}
            <div class="mt-5 grid grid-cols-2 gap-3">
              <div>
                <label for="habit-target" class="mb-2 block text-ui font-medium">Daily target</label>
                <Input id="habit-target" type="number" min={measurement === 'QUANTITY' ? '0.000001' : '1'} max="1000000000" step={measurement === 'QUANTITY' ? 'any' : '1'} bind:value={target} required/>
              </div>
              <div>
                <label for="habit-unit" class="mb-2 block text-ui font-medium">Unit</label>
                {#if measurement === 'QUANTITY'}
                  <Input id="habit-unit" bind:value={unit} maxlength={32} placeholder="ml, km, etc." required/>
                {:else}
                  <p class="flex h-10 items-center rounded-lg border border-border bg-muted/40 px-3 text-ui text-muted-foreground">{measurement === 'DURATION' ? 'min' : 'times'}</p>
                {/if}
              </div>
            </div>
          {/if}
        {:else}
          <p class="mt-4 text-ui text-muted-foreground">Each day, record Clean or Lapse explicitly. An unrecorded day is never counted as success.</p>
        {/if}
        <p class="mt-5 text-meta text-muted-foreground">Schedule: Every day. Flexible schedules arrive in the next milestone.</p>
      {:else}
        <p class="mt-4 text-meta text-muted-foreground">Renaming doesn't change goal policy or previous check-ins. Goal revisions are a separate milestone.</p>
      {/if}
      {#if touched && invalid}
        <p role="alert" class="mt-3 text-meta text-destructive">Enter a valid name and a positive target. Quantity requires a unit and up to 6 decimal places.</p>
      {/if}
      {#if error}
        <p role="alert" class="mt-3 rounded-lg border border-destructive/30 bg-card p-3 text-ui text-destructive">{error}</p>
      {/if}
    </div>
    <footer class="flex justify-end gap-2 border-t border-border p-4">
      <Button type="button" variant="outline" class="rounded-full" disabled={busy} onclick={onCancel}>Cancel</Button>
      <Button type="submit" class="rounded-full" disabled={busy || invalid}>{busy ? 'Saving…' : mode === 'create' ? 'Create habit' : 'Save changes'}</Button>
    </footer>
  </form>
</dialog>
