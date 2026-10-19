<script lang="ts">
  import { onMount } from 'svelte';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import PracticeView from './components/PracticeView.svelte';
  import { createLanguageLearningController } from './controller/language-learning.svelte.ts';
  const controller = createLanguageLearningController();
  onMount(() => { void controller.load(); });
</script>

<section class="mx-auto w-full max-w-[1180px] px-4 py-8 max-[760px]:px-2.5">
  <div class="mx-auto w-full max-w-[860px]">
    <ToolHeader title="Language Learning" />
    <p class="mb-6 text-ui text-muted-foreground">
      Explore sentence recall with a short practice session.
    </p>
    {#if controller.loading}
      <p class="text-ui text-muted-foreground" role="status">Loading learning history…</p>
    {:else if !controller.ready}
      <div class="rounded-xl border border-border bg-card p-6">
        <p class="text-ui text-destructive" role="alert">{controller.error}</p>
        <button class="mt-4 rounded-full bg-primary px-5 py-2 text-ui text-primary-foreground" onclick={controller.load}>Retry connection</button>
      </div>
    {:else if !controller.session}
      <div class="flex flex-wrap gap-2">
        <button class="rounded-full bg-primary px-5 py-3 text-ui font-medium text-primary-foreground" onclick={() => controller.start('recall')}>Try recall</button>
      </div>
    {/if}
    <div class="mt-6">
      <PracticeView {controller} />
    </div>
  </div>
</section>
