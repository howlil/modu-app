<script lang="ts">
  import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

  let { module }: { module: ModuleDefinition } = $props();
</script>

<a
  class="group flex aspect-square min-w-0 flex-col justify-between rounded-2xl border bg-card p-4 transition duration-150 hover:-translate-y-0.5 hover:border-foreground/15 hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
  href={module.route}
  aria-label={module.name}
>
  <div class="grid size-12 place-items-center rounded-[14px] bg-secondary text-secondary-foreground transition-transform duration-150 group-hover:scale-[1.03]">
    {#if module.id === 'pdf-merge'}
      <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
        <path d="M14 2v5h5" />
        <path d="M16 13v8" />
        <path d="M12 17h8" />
      </svg>
    {:else if module.id === 'pomodoro'}
      <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 1.5" />
        <path d="M9 2h6" />
        <path d="M12 2v3" />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8" />
      </svg>
    {/if}
  </div>

  <div class="text-[14px] font-semibold leading-tight tracking-[-0.02em]">{module.name}</div>
</a>
