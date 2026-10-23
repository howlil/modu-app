<script lang="ts">
  import { ArrowRight, Link2, Check, History } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Textarea } from '#lib/components/ui/textarea/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import type { CareerEvidenceController } from '../controller/career-evidence.svelte.ts';

  let { controller }: { controller: CareerEvidenceController } = $props();
  let showEvidence = $state(false);

  function submit(event: SubmitEvent) {
    event.preventDefault();
    void controller.capture();
  }
  function shortcut(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void controller.capture();
    }
  }
</script>

<section aria-label="Capture a career moment">
  <div class="mb-5">
    <h2 class="text-title-lg font-medium">What should you remember?</h2>
    <p class="mt-1 text-ui text-muted-foreground">One sentence is enough. Add the details later.</p>
  </div>

  <form onsubmit={submit} class="rounded-[20px] border border-border bg-card p-4 sm:p-5">
    <label for="career-note" class="sr-only">What did you work on?</label>
    <Textarea
      id="career-note"
      bind:value={controller.noteDraft}
      onkeydown={shortcut}
      disabled={!controller.storageReady || controller.busy}
      maxlength={3000}
      rows={4}
      class="min-h-28 resize-y border-0 bg-transparent p-0 text-body shadow-none focus-visible:ring-0"
      placeholder="Fixed the authentication retry flow, wrote a system design, or helped someone debug an issue..."
    />

    {#if showEvidence}
      <div class="mt-4 border-t border-border pt-4">
        <label for="career-evidence-link" class="mb-2 block text-meta text-muted-foreground">Evidence link (optional)</label>
        <Input id="career-evidence-link" type="url" bind:value={controller.evidenceDraft}
          disabled={!controller.storageReady || controller.busy} placeholder="https://github.com/..." />
      </div>
    {/if}

    <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      {#if !showEvidence}
        <Button type="button" variant="ghost" size="sm" class="text-muted-foreground"
          onclick={() => showEvidence = true} disabled={!controller.storageReady}>
          <Link2 class="size-4" /> Add evidence link
        </Button>
      {:else}
        <Button type="button" variant="ghost" size="sm" class="text-muted-foreground"
          onclick={() => { controller.evidenceDraft = ''; showEvidence = false; }}>
          Remove link
        </Button>
      {/if}
      <Button type="submit" disabled={!controller.storageReady || controller.busy || !controller.noteDraft.trim()}>
        {#if controller.busy}Saving…{:else}Save moment <ArrowRight class="size-4" />{/if}
      </Button>
    </div>
  </form>

  <div class="mt-7 flex items-center justify-between gap-3">
    <h2 class="text-title font-medium">Recently remembered</h2>
    <Button type="button" variant="ghost" size="sm" onclick={() => controller.view = 'history'}>
      <History class="size-4" /> View history
    </Button>
  </div>
  {#if controller.recentMoments.length === 0}
    <div class="mt-3 rounded-xl border border-dashed border-border px-4 py-8 text-center">
      <p class="text-ui font-medium">Your history starts here.</p>
      <p class="mt-1 text-meta text-muted-foreground">A shipped feature, solved bug, or learning moment all count.</p>
    </div>
  {:else}
    <div class="mt-3 border-t border-border">
      {#each controller.recentMoments as moment (moment.id)}
        <div class="flex items-start justify-between gap-4 border-b border-border py-4">
          <div class="min-w-0">
            <p class="whitespace-pre-wrap break-words text-ui font-medium">{moment.note}</p>
            <p class="mt-1 text-meta text-muted-foreground">{moment.occurredOn}</p>
          </div>
          <Check class="mt-1 size-4 shrink-0 text-success" aria-label="Saved" />
        </div>
      {/each}
    </div>
  {/if}
</section>
