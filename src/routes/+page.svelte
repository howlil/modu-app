<script lang="ts">
  import { ArrowDown, ArrowUpRight } from 'lucide-svelte';
  import { Button } from "$lib/components/ui/button/index.js";
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

<section class="grid min-h-[520px] place-items-center py-12 text-center max-[700px]:min-h-[460px] max-[700px]:py-9">
  <div class="mx-auto w-full max-w-[820px]">
    <div
      class="mx-auto mb-6 grid size-11 grid-cols-2 gap-[4px] rounded-[13px] bg-primary p-[10px] shadow-[0_10px_26px_rgba(36,104,242,0.14)]"
      aria-hidden="true"
    >
      <span class="rounded-[2px] bg-primary-foreground"></span>
      <span class="rounded-[2px] bg-primary-foreground"></span>
      <span class="rounded-[2px] bg-primary-foreground"></span>
      <span class="rounded-[2px] bg-primary-foreground"></span>
    </div>

    <h1 class="m-0 text-[clamp(42px,6vw,64px)] font-[520] leading-[0.98] tracking-[-0.055em]">
      Useful tools.<br />Nothing extra.
    </h1>

    <p class="mx-auto mt-5 max-w-[540px] text-[15px] font-normal leading-[1.55] tracking-[-0.01em] text-muted-foreground">
      Small utilities for files, focus, and everyday work — designed to get out of the way.
    </p>

    <div class="mt-7 flex flex-wrap justify-center gap-2">
      <Button href="#tools" class="h-10 rounded-xl px-4 text-[13px] font-medium shadow-none">
        Explore tools
        <ArrowDown class="size-3.5" strokeWidth={1.8} />
      </Button>

      <Button
        href="https://github.com/howlil/modu-app"
        target="_blank"
        rel="noreferrer"
        variant="outline"
        class="h-10 rounded-xl px-4 text-[13px] font-normal shadow-none"
      >
        View source
        <ArrowUpRight class="size-3.5" strokeWidth={1.8} />
      </Button>
    </div>
  </div>
</section>

<section id="tools" class="border-t border-border/[0.70] py-10 max-[700px]:py-8" aria-labelledby="tools-title">
  <div class="mx-auto mb-4 flex w-full max-w-[1040px] items-end justify-between gap-4">
    <h2 id="tools-title" class="m-0 text-[14px] font-medium tracking-[-0.015em]">Tools</h2>
    <span class="text-[12px] font-normal text-muted-foreground">{modules.length} available · 1 preview</span>
  </div>

  <div class="mx-auto grid w-full max-w-[1040px] grid-cols-4 gap-3 max-[820px]:grid-cols-2">
    {#each modules as module}
      <ToolCard {module} />
    {/each}

    <ToolCard module={imageCompressPreview} preview />
  </div>
</section>
