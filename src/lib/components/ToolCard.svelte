<script lang="ts">
  import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

  let { module }: { module: ModuleDefinition } = $props();

  const tileClass = {
    'pdf-merge': 'bg-[#F2AFC1] text-[#552433] border-[#DF94AA]',
    pomodoro: 'bg-[#82B0F5] text-[#163A6B] border-[#6FA0E8]',
    typing: 'bg-[#A48BEF] text-[#352568] border-[#9178DE]'
  }[module.id] ?? 'bg-card text-foreground border-border';
</script>

<a
  class={`group relative aspect-square min-w-0 overflow-hidden rounded-[22px] border p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(35,31,26,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/[0.40] ${tileClass}`}
  href={module.route}
  aria-label={module.name}
>
  <div class="relative z-20 text-[14px] font-[700] leading-tight tracking-[-0.025em]">
    {module.name}
  </div>

  {#if module.id === 'pdf-merge'}
    <div
      class="pointer-events-none absolute inset-x-3 bottom-2 h-[72%] transition-transform duration-200 group-hover:-translate-y-1"
      aria-hidden="true"
    >
      <svg viewBox="0 0 220 170" class="h-full w-full" fill="none">
        <g opacity="0.28" transform="translate(20 18) rotate(-10 70 70)">
          <rect x="25" y="16" width="82" height="108" rx="13" fill="white" />
          <path d="M79 16h28v28" fill="white" />
          <path d="M79 16l28 28H79V16Z" fill="currentColor" opacity="0.20" />
          <path d="M44 64h42M44 78h34M44 92h28" stroke="currentColor" stroke-width="6" stroke-linecap="round" opacity="0.35" />
        </g>

        <g opacity="0.42" transform="translate(84 22) rotate(8 58 66)">
          <rect x="20" y="14" width="86" height="112" rx="14" fill="white" />
          <path d="M76 14h30v30" fill="white" />
          <path d="M76 14l30 30H76V14Z" fill="currentColor" opacity="0.18" />
          <text x="63" y="78" text-anchor="middle" fill="currentColor" font-size="20" font-weight="800" font-family="system-ui, sans-serif">PDF</text>
        </g>

        <g transform="translate(66 112)">
          <rect x="0" y="0" width="62" height="34" rx="17" fill="currentColor" opacity="0.14" />
          <path d="M18 17h26M36 9l8 8-8 8" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      </svg>
    </div>

  {:else if module.id === 'pomodoro'}
    <div
      class="pointer-events-none absolute -right-3 bottom-0 h-[78%] w-[86%] transition-transform duration-200 group-hover:rotate-[-2deg] group-hover:scale-[1.02]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 190 180" class="h-full w-full" fill="none">
        <circle cx="100" cy="100" r="66" fill="white" opacity="0.18" />
        <circle cx="100" cy="100" r="53" stroke="currentColor" stroke-width="15" opacity="0.14" />
        <path
          d="M100 47a53 53 0 0 1 44 82"
          stroke="currentColor"
          stroke-width="15"
          stroke-linecap="round"
          opacity="0.46"
        />

        <rect x="85" y="15" width="30" height="17" rx="8.5" fill="currentColor" opacity="0.32" />
        <rect x="95" y="26" width="10" height="16" rx="5" fill="currentColor" opacity="0.32" />

        <path d="M100 100V67" stroke="currentColor" stroke-width="7" stroke-linecap="round" opacity="0.65" />
        <path d="M100 100l24 16" stroke="currentColor" stroke-width="7" stroke-linecap="round" opacity="0.65" />

        <text x="100" y="119" text-anchor="middle" fill="currentColor" font-size="31" font-weight="800" font-family="system-ui, sans-serif" opacity="0.84">25</text>
      </svg>
    </div>

  {:else}
    <div
      class="pointer-events-none absolute inset-x-2 bottom-1 h-[73%] transition-transform duration-200 group-hover:-translate-y-1 group-hover:rotate-[-1deg]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 220 170" class="h-full w-full" fill="none">
        <g transform="translate(12 42) rotate(-6 100 55)">
          <rect x="10" y="18" width="190" height="96" rx="20" fill="white" opacity="0.20" />
          <rect x="20" y="28" width="170" height="76" rx="14" stroke="currentColor" stroke-width="4" opacity="0.18" />

          <g fill="currentColor" opacity="0.42">
            <rect x="31" y="39" width="22" height="17" rx="4" />
            <rect x="59" y="39" width="22" height="17" rx="4" />
            <rect x="87" y="39" width="22" height="17" rx="4" />
            <rect x="115" y="39" width="22" height="17" rx="4" />
            <rect x="143" y="39" width="22" height="17" rx="4" />

            <rect x="38" y="62" width="22" height="17" rx="4" />
            <rect x="66" y="62" width="22" height="17" rx="4" />
            <rect x="94" y="62" width="22" height="17" rx="4" />
            <rect x="122" y="62" width="22" height="17" rx="4" />
            <rect x="150" y="62" width="22" height="17" rx="4" />

            <rect x="55" y="85" width="92" height="13" rx="6.5" />
          </g>
        </g>

        <g transform="translate(141 12) rotate(8)">
          <rect width="48" height="48" rx="14" fill="white" opacity="0.26" />
          <text x="24" y="31" text-anchor="middle" fill="currentColor" font-size="22" font-weight="800" font-family="system-ui, sans-serif">A</text>
        </g>

        <g transform="translate(24 18) rotate(-10)">
          <rect width="42" height="42" rx="13" fill="white" opacity="0.18" />
          <text x="21" y="28" text-anchor="middle" fill="currentColor" font-size="17" font-weight="800" font-family="system-ui, sans-serif">↵</text>
        </g>
      </svg>
    </div>
  {/if}
</a>
