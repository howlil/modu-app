<script lang="ts">
  import { tick } from 'svelte';
  import { ArchiveRestore, ChevronRight, Download, ExternalLink, Search } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import type { CareerEvidenceController } from '../controller/career-evidence.svelte.ts';
  import MomentEditor from './MomentEditor.svelte';

  let { controller }: { controller: CareerEvidenceController } = $props();
  let lastOpenedId = $state<string | null>(null);

  function openMoment(id: string): void {
    lastOpenedId = id;
    controller.openMoment(id);
  }

  async function restoreMoment(id: string): Promise<void> {
    if (await controller.setArchived(id, false)) {
      await tick();
      document.getElementById('career-history-heading')?.focus();
    }
  }

  $effect(() => {
    if (!controller.selectedMomentId && lastOpenedId) {
      const id = lastOpenedId;
      lastOpenedId = null;
      void tick().then(() => {
        const target = document.getElementById('moment-open-' + id) ??
          document.getElementById('career-history-heading');
        target?.focus();
      });
    }
  });
</script>

{#if controller.selectedMomentId}
  <MomentEditor {controller} />
{:else}
  <section aria-label="Career moment history">
    <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="career-history-heading" tabindex="-1" class="text-title-lg font-medium focus:outline-none">History</h2>
        <p class="mt-1 text-ui text-muted-foreground">Find work you've already done.</p>
      </div>
      <Button size="sm" variant="outline" disabled={!controller.storageReady || controller.busy}
        onclick={() => void controller.exportBackup()}>
        <Download class="size-4" /> Export backup
      </Button>
    </div>

    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="History status" class="inline-flex h-9 items-center gap-1 rounded-full bg-muted/65 p-1">
        <button type="button" aria-pressed={!controller.showArchived}
          class={!controller.showArchived
            ? 'h-7 rounded-full bg-background px-3 text-meta font-medium'
            : 'h-7 rounded-full px-3 text-meta text-muted-foreground'}
          onclick={() => controller.showArchived = false}>
          Active ({controller.activeCount})
        </button>
        <button type="button" aria-pressed={controller.showArchived}
          class={controller.showArchived
            ? 'h-7 rounded-full bg-background px-3 text-meta font-medium'
            : 'h-7 rounded-full px-3 text-meta text-muted-foreground'}
          onclick={() => controller.showArchived = true}>
          Archived ({controller.archivedCount})
        </button>
      </nav>
    </div>

    <div class="relative mb-5">
      <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
      <label for="career-search" class="sr-only">Search career history</label>
      <Input id="career-search" type="search" bind:value={controller.query}
        placeholder="Search notes, projects, or evidence…" class="pl-9"
        disabled={!controller.storageReady} />
    </div>

    <div class="mb-5 flex flex-wrap items-center gap-2">
      <label for="career-period-mode" class="text-meta text-muted-foreground">Date</label>
      <select id="career-period-mode" class="h-9 rounded-md border border-input bg-card px-3 text-ui outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        value={controller.periodMode}
        onchange={(event) => controller.periodMode = event.currentTarget.value as 'all' | 'year' | 'month'}>
        <option value="all">All time</option>
        <option value="year">Year</option>
        <option value="month">Month</option>
      </select>
      {#if controller.periodMode === 'year'}
        <label for="career-filter-year" class="sr-only">Filter by year</label>
        <Input id="career-filter-year" type="number" min="1" max="9999"
          class="w-28" value={String(controller.periodYear)}
          oninput={(event) => controller.periodYear = Number(event.currentTarget.value)} />
      {:else if controller.periodMode === 'month'}
        <label for="career-filter-month" class="sr-only">Filter by month</label>
        <Input id="career-filter-month" type="month" class="w-44"
          value={controller.periodMonth}
          oninput={(event) => controller.periodMonth = event.currentTarget.value} />
      {/if}
    </div>

    {#if controller.moments.length === 0}
      <div class="rounded-xl border border-dashed border-border px-5 py-10 text-center">
        <p class="text-ui font-medium">No moments yet.</p>
        <p class="mt-1 text-ui text-muted-foreground">Save a quick note to start building your history.</p>
        <Button size="sm" class="mt-4" onclick={() => controller.view = 'capture'}>Add a moment</Button>
      </div>
    {:else if controller.visibleMoments.length === 0}
      <div class="rounded-xl border border-dashed border-border px-5 py-10 text-center">
        <p class="text-ui font-medium">
          {controller.query.trim() || controller.periodMode !== 'all'
            ? 'No moments match these filters.'
            : controller.showArchived ? 'No archived moments.' : 'No active moments.'}
        </p>
        <p class="mt-1 text-meta text-muted-foreground">
          {controller.query.trim() || controller.periodMode !== 'all' ? 'Try another search or period.' : 'Your previous work is still available in the other view.'}
        </p>
      </div>
    {:else}
      <div class="border-t border-border">
        {#each controller.visibleMoments as moment (moment.id)}
          <article class="border-b border-border py-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <time class="text-meta text-muted-foreground" datetime={moment.occurredOn}>{moment.occurredOn}</time>
              {#if moment.project}
                <span class="text-meta text-muted-foreground">{moment.project}</span>
              {/if}
            </div>
            <button id={'moment-open-' + moment.id} type="button"
              class="mt-2 flex w-full items-start justify-between gap-4 rounded-lg text-left text-ui font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onclick={() => openMoment(moment.id)}>
              <span class="min-w-0 whitespace-pre-wrap break-words">{moment.note}</span>
              <ChevronRight class="mt-0.5 size-4 shrink-0 text-muted-foreground"/>
            </button>
            {#if moment.contribution}
              <p class="mt-1 line-clamp-2 text-meta text-muted-foreground">{moment.contribution}</p>
            {/if}
            {#each moment.evidence as evidence (evidence.id)}
              <a href={evidence.url} target="_blank" rel="noopener noreferrer"
                class="mt-2 mr-3 inline-flex max-w-full items-center gap-1 break-all text-meta text-primary hover:underline">
                <ExternalLink class="size-3.5 shrink-0" /> {evidence.label || evidence.url}
              </a>
            {/each}
            {#if controller.showArchived}
              <div class="mt-3">
                <Button size="sm" variant="outline" disabled={controller.busy}
                  onclick={() => void restoreMoment(moment.id)}>
                  <ArchiveRestore class="size-4"/> Restore
                </Button>
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
    {#if controller.moments.length > 0}
      <p class="mt-4 text-meta text-muted-foreground">
        {controller.visibleMoments.length} shown · {controller.showArchived ? controller.archivedCount : controller.activeCount} {controller.showArchived ? 'archived' : 'active'}
      </p>
    {/if}
  </section>
{/if}
