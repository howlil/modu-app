<script lang="ts">
  import { getModulesByCategory } from '#lib/platform/registry/modules.ts';
  import type { ModuleCategory } from '#lib/platform/registry/types.ts';

  let {
    category,
    title,
    description
  }: {
    category: ModuleCategory;
    title: string;
    description: string;
  } = $props();

  const items = getModulesByCategory(category);
</script>

<section class="py-12 max-[760px]:py-7">
  <div class="mb-7">
    <div class="mb-3 text-xs text-muted-2">Module / {title}</div>
    <h1 class="m-0 text-[clamp(30px,4vw,36px)] font-[750] leading-[1.05] tracking-[-0.045em]">{title}</h1>
    <p class="mt-2 max-w-[680px] text-sm leading-[1.55] text-muted">{description}</p>
  </div>

  <label class="relative mb-5 block">
    <span class="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-muted">⌕</span>
    <input
      class="h-[42px] w-full rounded-[9px] border border-line bg-surface pl-[38px] pr-3 text-[13px] outline-none focus:border-brand/50 focus:ring-3 focus:ring-brand/10"
      aria-label={"Search in " + title}
      placeholder={"Search in " + title}
    />
  </label>

  <div class="overflow-hidden rounded-[10px] border border-line bg-surface">
    {#each items as item}
      <a
        class="grid min-h-[68px] grid-cols-[38px_1fr_auto] items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-brand-pale"
        href={item.route}
      >
        <div class="grid size-[38px] place-items-center rounded-[10px] border border-line bg-surface-soft text-[15px] font-bold">
          {item.name.slice(0, 2)}
        </div>
        <div>
          <div class="text-[13px] font-bold">{item.name}</div>
          <div class="mt-[3px] text-xs text-muted">{item.description}</div>
        </div>
        <span class="text-muted-2">→</span>
      </a>
    {/each}
  </div>
</section>
