<script lang="ts">
  import { FilePlus2, FileText, ChevronRight } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import type { CareerEvidenceController } from '../controller/career-evidence.svelte.ts';
  import type { NewOutputInput } from '../core/types.ts';
  import GoalEditor from './GoalEditor.svelte';
  import OutputBuilder from './OutputBuilder.svelte';

  let { controller }: { controller: CareerEvidenceController } = $props();
  let creating = $state(false);
  const kindLabel = { interview: 'Interview', application: 'Application', review: 'Review' } as const;

  function submitNew(input: NewOutputInput): void {
    void controller.createDocument(input).then(created => {
      if (created) creating = false;
    });
  }
</script>

{#if controller.selectedOutputId}
  <OutputBuilder {controller}/>
{:else}
  <section aria-label="Career documents">
    <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-title-lg font-medium">Documents</h2>
        <p class="mt-1 text-ui text-muted-foreground">Different goals. The same career history.</p>
      </div>
      {#if !creating}
        <Button size="sm" onclick={() => creating = true} disabled={!controller.storageReady}>
          <FilePlus2 class="size-4"/> New document
        </Button>
      {/if}
    </div>

    {#if creating}
      <div class="mb-6 rounded-[20px] border border-border bg-card p-4 sm:p-5">
        <h3 class="mb-4 text-title font-medium">Create for a goal</h3>
        <GoalEditor busy={controller.busy} error={controller.outputError}
          onSave={submitNew} onCancel={() => creating = false} />
      </div>
    {/if}

    {#if controller.outputs.length === 0 && !creating}
      <div class="rounded-xl border border-dashed border-border p-6 text-center">
        <p class="text-ui font-medium">No documents yet.</p>
        <p class="mt-1 text-meta text-muted-foreground">Start with an interview, application, or review.</p>
        <Button size="sm" class="mt-4" onclick={() => creating = true}>Create your first document</Button>
      </div>
    {:else if controller.outputs.length}
      <div class="border-t border-border">
        {#each controller.outputs as output (output.id)}
          <button type="button" class="flex w-full items-start gap-3 border-b border-border py-4 text-left hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onclick={() => controller.openOutput(output.id)}>
            <FileText class="mt-1 size-4 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1">
              <span class="block break-words text-ui font-medium">{output.title}</span>
              <span class="mt-1 block text-meta text-muted-foreground">
                {kindLabel[output.kind]} · {output.items.length} selected
                {output.targetRole ? ' · ' + output.targetRole : ''}
                {output.organization ? ' · ' + output.organization : ''}
              </span>
            </span>
            <ChevronRight class="mt-1 size-4 shrink-0 text-muted-foreground"/>
          </button>
        {/each}
      </div>
    {/if}
  </section>
{/if}
