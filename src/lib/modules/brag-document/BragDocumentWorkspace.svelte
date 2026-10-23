<script lang="ts">
  import { onMount } from 'svelte';
  import * as Tabs from '#lib/components/ui/tabs/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import { createCareerEvidenceController } from './controller/career-evidence.svelte.ts';
  import { subscribeMomentChanges } from './adapters/persistence.ts';
  import CaptureView from './components/CaptureView.svelte';
  import HistoryView from './components/HistoryView.svelte';

  const controller = createCareerEvidenceController();
  onMount(() => {
    void controller.reload();
    const unsubscribe = subscribeMomentChanges(() => { void controller.reload(); });
    return unsubscribe;
  });
</script>

<section class="mx-auto min-h-[calc(100vh-76px)] w-full max-w-[1180px] px-4 pb-8 pt-8 max-[760px]:px-2.5 max-[760px]:pt-6">
  <div class="mx-auto w-full max-w-[860px] min-w-0">
    <ToolHeader title="Career Evidence" description="Remember work. Reuse it when it matters." />
    <Tabs.Root bind:value={controller.view} class="gap-0">
      <Tabs.List variant="default" class="-mt-2 mb-6 h-9 w-full min-w-0 justify-start rounded-full bg-muted/65 p-1">
        <Tabs.Trigger value="capture"
          class="h-7 flex-none rounded-full px-3 py-0 text-meta font-normal data-[state=active]:font-medium data-[state=active]:shadow-none">
          Capture
        </Tabs.Trigger>
        <Tabs.Trigger value="history"
          class="h-7 flex-none rounded-full px-3 py-0 text-meta font-normal data-[state=active]:font-medium data-[state=active]:shadow-none">
          History
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>

    {#if controller.loading}
      <p role="status" class="py-8 text-ui text-muted-foreground">Loading career history…</p>
    {:else if !controller.storageReady}
      <div role="alert" class="rounded-[20px] border border-border bg-card p-5">
        <h2 class="text-title font-medium">Career history is unavailable</h2>
        <p class="mt-2 text-ui text-muted-foreground">{controller.error}</p>
        <Button class="mt-4" variant="outline" onclick={() => void controller.reload()}>Retry</Button>
      </div>
    {:else}
      {#if controller.error}
        <p role="alert" class="mb-4 rounded-lg border border-destructive/30 bg-card p-3 text-ui text-destructive">{controller.error}</p>
      {/if}
      {#if controller.notice && !controller.error}
        <p role="status" class="mb-4 text-meta text-success">{controller.notice}</p>
      {/if}
      {#if controller.view === 'capture'}
        <CaptureView {controller} />
      {:else}
        <HistoryView {controller} />
      {/if}
      <p class="mt-8 border-t border-border pt-4 text-meta text-muted-foreground">
        Saved in this browser only. Career Evidence is not yet included in Modu global backup or sync;
        use History → Export backup to keep a separate copy.
      </p>
    {/if}
  </div>
</section>
