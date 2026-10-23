<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import type { CareerOutput, NewOutputInput, OutputKind, Period } from '../core/types.ts';

  let {
    initial = null, busy = false, error = '', onSave, onCancel
  }: {
    initial?: CareerOutput | null;
    busy?: boolean;
    error?: string;
    onSave: (input: NewOutputInput) => void;
    onCancel: () => void;
  } = $props();

  let kind = $state<OutputKind>(initial?.kind ?? 'interview');
  let title = $state(initial?.title ?? '');
  let targetRole = $state(initial?.targetRole ?? '');
  let organization = $state(initial?.organization ?? '');
  let periodMode = $state<Period['kind']>(initial?.period.kind ?? 'all-time');
  let year = $state(initial && initial.period.kind !== 'all-time' ? String(initial.period.year) : String(new Date().getFullYear()));
  let month = $state(initial?.period.kind === 'month'
    ? String(initial.period.year) + '-' + String(initial.period.month).padStart(2, '0')
    : String(new Date().getFullYear()) + '-' + String(new Date().getMonth() + 1).padStart(2, '0'));
  let fieldError = $state('');
  onMount(() => document.getElementById('career-goal-title')?.focus());

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const period: Period = periodMode === 'all-time'
      ? { kind: 'all-time' }
      : periodMode === 'year' ? { kind: 'year', year: Number(year) }
      : { kind: 'month', year: Number(month.slice(0, 4)), month: Number(month.slice(5, 7)) };
    if (!title.trim()) { fieldError = 'Add a document title.'; return; }
    if (periodMode === 'year' && (!/^\d{1,4}$/.test(year) || Number(year) < 1)) {
      fieldError = 'Enter a valid year.'; return;
    }
    if (periodMode === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      fieldError = 'Select a valid month.'; return;
    }
    fieldError = '';
    onSave({ kind, title, targetRole, organization, period });
  }
</script>

<form onsubmit={submit} class="space-y-4" aria-label={initial ? 'Edit document purpose' : 'Create career document'}>
  <div class="grid gap-4 sm:grid-cols-2">
    <div>
      <label class="mb-2 block text-meta text-muted-foreground" for="career-goal-type">Purpose</label>
      <select id="career-goal-type" bind:value={kind} disabled={busy}
        class="h-9 w-full rounded-md border border-input bg-card px-3 text-ui outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <option value="interview">Technical interview</option>
        <option value="application">Job application</option>
        <option value="review">Performance review</option>
      </select>
    </div>
    <div>
      <label class="mb-2 block text-meta text-muted-foreground" for="career-goal-period">Period</label>
      <select id="career-goal-period" bind:value={periodMode} disabled={busy}
        class="h-9 w-full rounded-md border border-input bg-card px-3 text-ui outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <option value="all-time">All time</option>
        <option value="year">Year</option>
        <option value="month">Month</option>
      </select>
    </div>
  </div>
  {#if periodMode === 'year'}
    <div>
      <label class="mb-2 block text-meta text-muted-foreground" for="career-goal-year">Year</label>
      <Input id="career-goal-year" type="number" min="1" max="9999" bind:value={year} disabled={busy}/>
    </div>
  {:else if periodMode === 'month'}
    <div>
      <label class="mb-2 block text-meta text-muted-foreground" for="career-goal-month">Month</label>
      <Input id="career-goal-month" type="month" bind:value={month} disabled={busy}/>
    </div>
  {/if}
  <div>
    <label class="mb-2 block text-meta text-muted-foreground" for="career-goal-title">Document title</label>
    <Input id="career-goal-title" bind:value={title} maxlength={160} required
      placeholder="Backend engineering interview notes" disabled={busy}/>
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div>
      <label class="mb-2 block text-meta text-muted-foreground" for="career-goal-role">Target role (optional)</label>
      <Input id="career-goal-role" bind:value={targetRole} maxlength={120}
        placeholder="Backend Engineer" disabled={busy}/>
    </div>
    <div>
      <label class="mb-2 block text-meta text-muted-foreground" for="career-goal-organization">Organization (optional)</label>
      <Input id="career-goal-organization" bind:value={organization} maxlength={120}
        placeholder="Company or team" disabled={busy}/>
    </div>
  </div>
  {#if fieldError || error}
    <p role="alert" class="text-ui text-destructive">{fieldError || error}</p>
  {/if}
  <div class="flex flex-wrap justify-end gap-2">
    <Button variant="ghost" type="button" disabled={busy} onclick={onCancel}>Cancel</Button>
    <Button type="submit" disabled={busy || !title.trim()}>
      {busy ? 'Saving…' : initial ? 'Apply changes' : 'Create document'}
    </Button>
  </div>
</form>
