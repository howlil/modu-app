<script lang="ts">
  import HomeHero from '#lib/components/HomeHero.svelte';
  import ToolCard from '#lib/components/ToolCard.svelte';
  import { modules } from '#lib/platform/registry/modules.ts';
  import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

  const imageCompressPreview: ModuleDefinition = {
    id: 'image-compress',
    name: 'Image Compress',
    route: '#',
    layout: 'file-transform'
  };
</script>

<svelte:head>
  <title>Module — Useful tools. Nothing extra.</title>
  <meta name="description" content="Small browser utilities that run locally." />
</svelte:head>

<HomeHero />

<section id="tools" class="px-4 pb-8 pt-2 max-[760px]:px-2.5 max-[700px]:pb-6">
  <div class="mx-auto grid w-full max-w-[1040px] grid-cols-4 gap-3 max-[820px]:grid-cols-2">
    {#each modules as module}
      <ToolCard {module} preview={module.id === 'pdf-merge'} />
    {/each}

    <ToolCard module={imageCompressPreview} preview />
  </div>
</section>
