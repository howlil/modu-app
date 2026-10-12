<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import type { DailyExecutionController } from '../controller/daily-execution.svelte.ts';

  let {controller}: {controller: DailyExecutionController} = $props();
  let selected: File | null = $state(null);
  let importing = $state(false);
  let fileInput: HTMLInputElement | undefined = $state(undefined);
  async function importSelected() {
    if (!selected) return;
    importing = true;
    try { await controller.importEvidence(selected); }
    finally { importing = false; selected = null; if (fileInput) fileInput.value = ''; }
  }
</script>

<div class="grid gap-4">
  <div><h3 class="text-title-lg font-semibold">Sources</h3><p class="mt-1 text-meta text-muted-foreground">Import evidence, without creating another work tracker.</p></div>
  <section class="rounded-[20px] border border-border bg-card p-5">
    <h4 class="text-ui font-medium">Local JSON import</h4>
    <p class="mt-2 text-meta text-muted-foreground">Import up to 100 evidence entries from a JSON array (max 512 KB). Provider claims in a file remain unverified. Repeated records with the same source and external ID are skipped.</p>
    <label class="mt-4 grid gap-2 text-meta font-medium">Choose a JSON file
      <input bind:this={fileInput} type="file" accept=".json,application/json" class="w-full min-w-0 rounded-lg border border-input p-2 text-meta" onchange={(event)=> selected = event.currentTarget.files?.[0] ?? null}/>
    </label>
    <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
      <span class="text-meta text-muted-foreground">{selected ? selected.name : 'No file selected'}</span>
      <Button size="sm" class="rounded-full" disabled={!selected || importing} onclick={importSelected}>{importing ? 'Importing…' : 'Import evidence'}</Button>
    </div>
    {#if controller.intelligenceNotice}<p role="status" class="mt-3 text-meta text-muted-foreground">{controller.intelligenceNotice}</p>{/if}
  </section>
  <section class="rounded-[20px] border border-border bg-card p-5">
    <h4 class="text-ui font-medium">Future read-only connections</h4>
    <p class="mt-2 text-meta text-muted-foreground">No external account is connected by this feature. Secure authentication, permission scopes and disconnect controls must be validated before enabling sync.</p>
    <div class="mt-3 divide-y divide-border">
      {#each [{name:'GitHub',reason:'Pull requests and engineering deliverables'}, {name:'Airtable',reason:'Recruitment pipeline changes'}, {name:'CS-101',reason:'Evaluated learning outcomes'}] as source}
        <div class="flex items-center justify-between gap-3 py-3">
          <div><div class="text-ui font-medium">{source.name}</div><div class="text-meta text-muted-foreground">{source.reason}</div></div>
          <span class="shrink-0 text-meta text-muted-foreground">Not connected</span>
        </div>
      {/each}
    </div>
  </section>
  <section class="rounded-xl bg-muted/50 p-4">
    <p class="text-meta text-muted-foreground">Expected JSON fields: <code>kind</code>, <code>title</code>, <code>observation</code>, <code>occurredAt</code> (Unix milliseconds). Optional: <code>source</code>, <code>externalId</code>, <code>taskId</code>, <code>topic</code> and <code>assessmentResult</code>.</p>
  </section>
</div>
