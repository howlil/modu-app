<script lang="ts">
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import { createDailyExecutionController } from './controller/daily-execution.svelte.ts';
  import TodayView from './components/TodayView.svelte';
  import PrioritiesView from './components/PrioritiesView.svelte';
  import ReviewView from './components/ReviewView.svelte';

  const controller = createDailyExecutionController();
</script>

<section class="mx-auto min-h-[calc(100vh-76px)] w-full max-w-[1180px] px-4 pb-8 pt-8 max-[760px]:px-2.5 max-[760px]:pt-6">
  <div class="mx-auto mb-6 w-full max-w-[860px]">
    <ToolHeader title="Daily Execution" />
    <nav class="-mt-2 flex h-9 w-full items-center gap-1 rounded-full bg-muted/65 p-1" aria-label="Daily Execution views">
      {#each [['today', 'Today'], ['priorities', 'Priorities'], ['review', 'Review']] as entry}
        {@const name = entry[0] as 'today' | 'priorities' | 'review'}
        <button
          class={controller.view === name ? 'h-7 rounded-full bg-background px-3 text-meta font-medium text-foreground' : 'h-7 rounded-full px-3 text-meta text-muted-foreground hover:text-foreground'}
          aria-current={controller.view === name ? 'page' : undefined}
          onclick={() => controller.view = name}
        >{entry[1]}</button>
      {/each}
    </nav>
  </div>
  <div class="mx-auto w-full max-w-[860px]">
    {#if controller.error}
      <div role="alert" class="mb-4 rounded-lg border border-destructive/30 bg-card p-3 text-meta text-destructive">{controller.error}</div>
    {/if}
    {#if controller.loading}
      <div class="py-8 text-meta text-muted-foreground">Loading your daily plan…</div>
    {:else if controller.view === 'today'}
      <TodayView {controller} />
    {:else if controller.view === 'priorities'}
      <PrioritiesView {controller} />
    {:else}
      <ReviewView {controller} />
    {/if}
  </div>
</section>
