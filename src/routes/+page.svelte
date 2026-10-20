<script lang="ts">
  import HomeHero from '#lib/components/HomeHero.svelte';
  import ToolCard from '#lib/components/ToolCard.svelte';
  import { modules } from '#lib/platform/registry/modules.ts';
  import { ArrowRight, Database } from 'lucide-svelte';
</script>

<svelte:head>
  <title>Module — Useful tools. Nothing extra.</title>
  <meta name="description" content="Small browser utilities that run locally." />
</svelte:head>

<HomeHero />

<section id="tools" class="px-4 pb-8 pt-2 max-[760px]:px-2.5 max-[700px]:pb-6">
  <div class="mx-auto grid w-full max-w-[820px] grid-cols-2 gap-3 sm:grid-cols-3">
    {#each modules as module}
      <ToolCard {module} />
    {/each}
  </div>
  <a
    href="/settings/data"
    class="group mx-auto mt-5 flex w-full max-w-[820px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    aria-label="Data & Sync settings for all modules"
  >
    <span class="flex min-w-0 items-center gap-3">
      <Database class="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
      <span class="min-w-0">
        <span class="block text-ui font-medium">Data &amp; Sync</span>
        <span class="block text-meta text-muted-foreground">Backup, restore, and sync all modules</span>
      </span>
    </span>
    <ArrowRight class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" strokeWidth={1.8} />
  </a>
</section>
