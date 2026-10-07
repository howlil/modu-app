<script lang="ts">
  import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

  let { module }: { module: ModuleDefinition } = $props();

  const tileClass = {
    'pdf-merge': 'bg-[#F2AFC1] text-[#552433] border-[#DF94AA]',
    pomodoro: 'bg-[#82B0F5] text-[#163A6B] border-[#6FA0E8]',
    typing: 'bg-[#A48BEF] text-[#352568] border-[#9178DE]'
  }[module.id] ?? 'bg-card text-foreground border-border';

  const iconSurfaceClass = {
    'pdf-merge': 'bg-white/[0.24] text-[#6A2940]',
    pomodoro: 'bg-white/[0.24] text-[#174A88]',
    typing: 'bg-white/[0.24] text-[#49338A]'
  }[module.id] ?? 'bg-white/[0.30] text-current';
</script>

<a
  class={`group relative flex aspect-square min-w-0 overflow-hidden rounded-[22px] border p-4 transition duration-150 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(35,31,26,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/[0.40] ${tileClass}`}
  href={module.route}
  aria-label={module.name}
>
  <div class="relative z-10 flex h-full w-full flex-col justify-between">
    <div class="text-[14px] font-[700] leading-tight tracking-[-0.025em]">{module.name}</div>

    <div class={`grid size-12 place-items-center rounded-[15px] backdrop-blur-sm transition-transform duration-150 group-hover:scale-[1.04] ${iconSurfaceClass}`}>
      {#if module.id === 'pdf-merge'}
        <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
          <path d="M14 2v5h5" />
          <path d="M16 13v8" />
          <path d="M12 17h8" />
        </svg>
      {:else if module.id === 'pomodoro'}
        <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 1.5" />
          <path d="M9 2h6" />
          <path d="M12 2v3" />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8" />
        </svg>
      {/if}
    </div>
  </div>

  <div
    class="pointer-events-none absolute -bottom-5 -right-4 size-28 rounded-[30px] bg-white/[0.14] rotate-[-12deg] transition-transform duration-200 group-hover:rotate-[-7deg] group-hover:scale-105"
    aria-hidden="true"
  ></div>
</a>
