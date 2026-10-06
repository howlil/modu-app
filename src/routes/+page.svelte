<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import ToolCard from '#lib/components/ToolCard.svelte';
  import { modules } from '#lib/platform/registry/modules.ts';
</script>

<svelte:head>
  <title>Module — Useful tools. Nothing extra.</title>
  <meta name="description" content="A small local-first browser utility platform." />
</svelte:head>

<section class="py-12 max-[700px]:py-7">
  <div class="mx-auto mb-16 max-w-[760px] text-center max-[700px]:mx-0 max-[700px]:mb-12 max-[700px]:text-left">
    <Badge variant="secondary" class="mb-4 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.08em]">
      Local-first browser utilities
    </Badge>

    <h1 class="m-0 text-[clamp(44px,7vw,70px)] font-[760] leading-[0.97] tracking-[-0.06em] max-[700px]:text-[44px]">
      Useful tools.<br />Nothing extra.
    </h1>

    <p class="mx-auto mt-[18px] max-w-[590px] text-base leading-[1.6] text-muted-foreground max-[700px]:ml-0 max-[700px]:text-sm">
      Three focused modules while the platform proves its core interaction patterns.
    </p>

    <div class="mt-4 flex justify-center gap-2 max-[700px]:justify-start max-[700px]:flex-wrap">
      <Badge variant="outline">Runs in your browser</Badge>
      <Badge variant="outline">No account</Badge>
      <Badge variant="outline">No unnecessary upload</Badge>
    </div>
  </div>

  <section>
    <div class="mb-3.5">
      <h2 class="m-0 text-lg font-bold tracking-[-0.02em]">Current modules</h2>
      <p class="mt-1 text-[13px] text-muted-foreground">Build these end-to-end before expanding the catalog.</p>
    </div>

    <div class="grid grid-cols-3 gap-3 max-[760px]:grid-cols-1">
      {#each modules as module}
        <ToolCard {module} />
      {/each}
    </div>
  </section>
</section>
