<script lang="ts">
  import ToolCard from '#lib/components/ToolCard.svelte';
  import { modules } from '#lib/platform/registry/modules.ts';
</script>

<svelte:head>
  <title>Module — Useful tools. Nothing extra.</title>
  <meta name="description" content="Small browser utilities that run locally." />
</svelte:head>

<section class="py-10 max-[700px]:py-7">
  <div class="mb-10 max-w-[680px]">
    <h1 class="m-0 text-[clamp(40px,6vw,56px)] font-[760] leading-[0.98] tracking-[-0.055em]">
      Useful tools.<br />Nothing extra.
    </h1>
    <p class="mt-3 text-sm text-muted-foreground">Runs locally. No account required.</p>
  </div>

  <section aria-labelledby="tools-title">
    <h2 id="tools-title" class="m-0 text-sm font-semibold tracking-[-0.01em]">Tools</h2>

    <div class="mt-3 divide-y overflow-hidden rounded-lg border bg-card">
      {#each modules as module}
        <ToolCard {module} />
      {/each}
    </div>
  </section>
</section>
