<script lang="ts">
  import ToolCard from '#lib/components/ToolCard.svelte';
  import { modules } from '#lib/platform/registry/modules.ts';
</script>

<svelte:head>
  <title>Module — Useful tools. Nothing extra.</title>
  <meta name="description" content="Small browser utilities that run locally." />
</svelte:head>

<section class="py-8 max-[700px]:py-6">
  <div class="mb-7 max-w-[640px]">
    <h1 class="m-0 text-[clamp(38px,5.5vw,54px)] font-[760] leading-[0.98] tracking-[-0.055em]">
      Useful tools.<br />Nothing extra.
    </h1>
    <p class="mt-3 text-sm text-muted-foreground">Runs locally. No account required.</p>
  </div>

  <section class="max-w-[760px]" aria-labelledby="tools-title">
    <h2 id="tools-title" class="m-0 mb-3 text-xs font-medium text-muted-foreground">Tools</h2>

    <div class="grid grid-cols-3 gap-3 max-[560px]:grid-cols-2">
      {#each modules as module}
        <ToolCard {module} />
      {/each}
    </div>
  </section>
</section>
