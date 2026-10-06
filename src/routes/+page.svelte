<script lang="ts">
  import ToolCard from '#lib/components/ToolCard.svelte';
  import { categories, modules } from '#lib/platform/registry/modules.ts';

  const recentIds = ['pdf-merge', 'json-format', 'pomodoro'];
  const pinnedIds = ['image-compress', 'uuid', 'typing'];

  const recent = recentIds
    .map((id) => modules.find((module) => module.id === id))
    .filter((module) => module !== undefined);

  const pinned = pinnedIds
    .map((id) => modules.find((module) => module.id === id))
    .filter((module) => module !== undefined);
</script>

<svelte:head>
  <title>Module — Useful tools. Nothing extra.</title>
  <meta
    name="description"
    content="Private, local-first browser utilities for files, development, and productivity."
  />
</svelte:head>

<section class="py-12 max-[700px]:py-7">
  <div class="mx-auto mb-16 max-w-[780px] text-center max-[700px]:mx-0 max-[700px]:mb-12 max-[700px]:text-left">
    <div class="mb-3.5 text-[11px] font-bold uppercase tracking-[0.1em] text-brand">Private browser utilities</div>
    <h1 class="m-0 text-[clamp(44px,7vw,70px)] font-[760] leading-[0.97] tracking-[-0.06em] max-[700px]:text-[44px]">
      Useful tools.<br />Nothing extra.
    </h1>
    <p class="mx-auto mt-[18px] max-w-[600px] text-base leading-[1.6] text-muted max-[700px]:ml-0 max-[700px]:text-sm">
      Small utilities for files, focus, text, and development. Open a tool, finish the task, leave.
    </p>

    <a
      id="search"
      class="mx-auto mt-[30px] flex h-[58px] max-w-[680px] items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 text-muted hover:border-line-strong max-[700px]:mx-0"
      href="#search"
    >
      <span>⌕</span>
      <span class="flex-1 text-left text-sm">What do you want to do?</span>
      <kbd class="rounded-md border border-line bg-surface-soft px-1.5 py-0.5 text-[11px]">⌘ K</kbd>
    </a>

    <div class="mt-3.5 flex justify-center gap-3.5 text-xs text-muted max-[700px]:justify-start max-[700px]:flex-wrap">
      <span>Runs locally</span><span>•</span><span>No account</span><span>•</span><span>Offline after load</span>
    </div>
  </div>

  {#each [
    { title: 'Recent', copy: 'Continue with tools you already use.', items: recent },
    { title: 'Pinned', copy: 'Your highest-frequency tools stay close.', items: pinned }
  ] as section}
    <section class="mt-11 first:mt-0">
      <div class="mb-3.5">
        <h2 class="m-0 text-lg font-bold tracking-[-0.02em]">{section.title}</h2>
        <p class="mt-1 text-[13px] text-muted">{section.copy}</p>
      </div>

      <div class="grid grid-cols-3 gap-3 max-[760px]:grid-cols-1">
        {#each section.items as module}
          <ToolCard {module} />
        {/each}
      </div>
    </section>
  {/each}

  <section class="mt-11">
    <div class="mb-3.5">
      <h2 class="m-0 text-lg font-bold tracking-[-0.02em]">Explore</h2>
      <p class="mt-1 text-[13px] text-muted">Browse by the kind of task you want to complete.</p>
    </div>

    <div class="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface max-[700px]:grid-cols-1">
      {#each categories as category}
        <a class="min-h-[130px] border-b border-r border-line p-[18px] odd:max-[700px]:border-r-0 even:border-r-0 [&:nth-last-child(-n+2)]:border-b-0 max-[700px]:border-r-0 max-[700px]:[&:not(:last-child)]:border-b max-[700px]:last:border-b-0 hover:bg-brand-pale" href={category.route}>
          <div class="flex justify-between gap-4 text-[15px]">
            <strong>{category.name}</strong>
            <span>→</span>
          </div>
          <p class="mt-2 max-w-[420px] text-[13px] leading-[1.5] text-muted">{category.description}</p>
        </a>
      {/each}
    </div>
  </section>
</section>
