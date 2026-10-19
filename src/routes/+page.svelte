<script lang="ts">
  import HomeHero from '#lib/components/HomeHero.svelte';
  import ToolCard from '#lib/components/ToolCard.svelte';
  import { modules } from '#lib/platform/registry/modules.ts';
</script>

<svelte:head>
  <title>Module — Useful tools. Nothing extra.</title>
  <meta name="description" content="Small browser utilities that run locally." />
</svelte:head>

<HomeHero />

<section id="tools" class="px-4 pb-8 pt-2 max-[760px]:px-2.5 max-[700px]:pb-6">
  <div class="mx-auto grid w-full max-w-[520px] grid-cols-2 gap-3">
    {#each modules as module}
      <ToolCard {module} />
    {/each}
  </div>
</section>
