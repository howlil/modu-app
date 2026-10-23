<script lang="ts">
  import { Download, ExternalLink, Search } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import type { CareerEvidenceController } from '../controller/career-evidence.svelte.ts';
  let { controller }: { controller: CareerEvidenceController } = $props();
</script>

<section aria-label="Career moment history">
  <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 class="text-title-lg font-medium">History</h2>
      <p class="mt-1 text-ui text-muted-foreground">Find work you've already done.</p>
    </div>
    <Button size="sm" variant="outline" disabled={!controller.storageReady || controller.busy}
      onclick={() => void controller.exportBackup()}>
      <Download class="size-4" /> Export backup
    </Button>
  </div>

  <div class="relative mb-5">
    <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
    <label for="career-search" class="sr-only">Search career history</label>
    <Input id="career-search" type="search" bind:value={controller.query}
      placeholder="Search your work…" class="pl-9" disabled={!controller.storageReady} />
  </div>

  {#if controller.moments.length === 0}
    <div class="rounded-xl border border-dashed border-border px-5 py-10 text-center">
      <p class="text-ui font-medium">No moments yet.</p>
      <p class="mt-1 text-ui text-muted-foreground">Save a quick note to start building your history.</p>
      <Button size="sm" class="mt-4" onclick={() => controller.view = 'capture'}>Add a moment</Button>
    </div>
  {:else if controller.visibleMoments.length === 0}
    <p class="py-10 text-center text-ui text-muted-foreground">No moments match your search.</p>
  {:else}
    <div class="border-t border-border">
      {#each controller.visibleMoments as moment (moment.id)}
        <article class="border-b border-border py-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <time class="text-meta text-muted-foreground" datetime={moment.occurredOn}>{moment.occurredOn}</time>
            {#if moment.project}<span class="text-meta text-muted-foreground">{moment.project}</span>{/if}
          </div>
          <p class="mt-2 whitespace-pre-wrap break-words text-ui">{moment.note}</p>
          {#each moment.evidence as evidence (evidence.id)}
            <a href={evidence.url} target="_blank" rel="noopener noreferrer"
              class="mt-2 inline-flex items-center gap-1 break-all text-meta text-primary hover:underline">
              <ExternalLink class="size-3.5 shrink-0" /> {evidence.label || evidence.url}
            </a>
          {/each}
        </article>
      {/each}
    </div>
  {/if}
  {#if controller.moments.length > 0}
    <p class="mt-4 text-meta text-muted-foreground">
      {controller.visibleMoments.length} of {controller.moments.length} moments
    </p>
  {/if}
</section>
