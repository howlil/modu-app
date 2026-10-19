<script lang="ts">
  import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

  let { module }: { module: ModuleDefinition } = $props();
  let preview = $derived(module.status === 'coming-soon');

  let tileStyle = $derived({
    'daily-execution': 'background: linear-gradient(145deg, #BDD4FF 0%, #9ABAF7 54%, #81A6EE 100%);',
    pomodoro: 'background: linear-gradient(145deg, #9BC2F7 0%, #80AEEF 54%, #709DE5 100%);',
  }[module.id]);

  let tileClass = $derived({
    'daily-execution': 'text-[#17437A] border-[#86A9EA]',
    pomodoro: 'text-[#163A6B] border-[#6F9FE8]',
  }[module.id] ?? 'text-foreground border-border');
</script>

<a
  class={`${preview ? '' : 'group'} relative aspect-square min-w-0 overflow-hidden rounded-[22px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.40),0_10px_24px_rgba(35,31,26,0.07)] ${preview ? 'cursor-default' : 'transition duration-200 hover:-translate-y-1 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.46),0_16px_34px_rgba(35,31,26,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/[0.40]'} ${tileClass}`}
  style={tileStyle}
  href={preview ? undefined : module.route}
  aria-label={module.name}
  aria-disabled={preview}
>
  <div
    class="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_46%,rgba(28,24,22,0.045)_100%)]"
    aria-hidden="true"
  ></div>

  <div class="relative z-20">
    <div class="text-ui font-semibold tracking-[-0.02em] max-[400px]:text-meta">
      {module.name}
    </div>

    {#if preview}
      <span class="absolute right-0 top-0 shrink-0 rounded-full border border-white/30 bg-white/45 px-2 py-1 text-meta font-medium tracking-[-0.01em] backdrop-blur-sm max-[820px]:left-0 max-[820px]:right-auto max-[820px]:top-6">
        Coming soon
      </span>
    {/if}
  </div>


  {#if module.id === 'daily-execution'}
    <div class="tool-art tool-art--daily" aria-hidden="true">
      <svg class="size-full" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(-9 120 130)">
          <rect x="50" y="43" width="142" height="165" rx="23" fill="#5689D7"/>
          <rect x="45" y="37" width="142" height="165" rx="23" fill="#F5F9FF" stroke="#6A9CE7" stroke-width="3"/>
          <rect x="68" y="63" width="96" height="16" rx="8" fill="#B9D1FA"/>
          <rect x="68" y="91" width="19" height="19" rx="6" fill="#2468F2"/>
          <path d="m73 100 5 5 9-11" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M99 101h57" stroke="#8DB1EC" stroke-width="8" stroke-linecap="round"/>
          <rect x="68" y="122" width="19" height="19" rx="6" fill="#2468F2"/>
          <path d="m73 131 5 5 9-11" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M99 131h49" stroke="#8DB1EC" stroke-width="8" stroke-linecap="round"/>
          <rect x="68" y="153" width="19" height="19" rx="6" stroke="#8DB1EC" stroke-width="3"/>
          <path d="M99 163h62" stroke="#C5D8F7" stroke-width="8" stroke-linecap="round"/>
        </g>
        <circle cx="174" cy="187" r="33" fill="#2468F2" stroke="#F5F9FF" stroke-width="7"/>
        <path d="m163 187 8 8 15-18" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  {:else if module.id === 'pomodoro'}
    <div class="tool-art tool-art--pomodoro" aria-hidden="true">
      <svg class="size-full" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="106" y="34" width="28" height="24" rx="8" fill="#31649E" />
        <rect x="100" y="31" width="40" height="13" rx="6.5" fill="#DCEAFF" />
        <circle cx="120" cy="139" r="83" fill="#B3D1F9" />
        <circle cx="120" cy="139" r="71" fill="#DDEBFF" stroke="#689BD8" stroke-width="5" />
        <circle cx="120" cy="139" r="70" stroke="#397ADD" stroke-width="13" stroke-linecap="round" stroke-dasharray="278 440" transform="rotate(-90 120 139)" />
        <circle cx="120" cy="139" r="50" fill="#F2F8FF" />
        <text x="120" y="150" text-anchor="middle" fill="#2B609E" font-family="system-ui, sans-serif" font-size="32" font-weight="600" letter-spacing="-2">25:00</text>
        <path d="m183 67 17-9M190 87l19-2M57 212l-12 9" stroke="#F0F6FF" stroke-width="5" stroke-linecap="round" />
        <circle cx="182" cy="180" r="7" fill="#3A7AD1" />
      </svg>
    </div>

  {/if}
</a>

<style>
  .tool-art {
    position: absolute;
    right: -20%;
    bottom: -20%;
    z-index: 10;
    width: 104%;
    aspect-ratio: 1;
    transform: rotate(var(--art-rotation));
    transform-origin: center;
    pointer-events: none;
  }


  .tool-art--daily { --art-rotation: -8deg; --art-duration: 7s; --art-delay: -1s; }

  .tool-art--pomodoro {
    --art-rotation: -9deg;
    --art-duration: 7.5s;
    --art-delay: -2s;
  }



  @keyframes artwork-drift {
    from { translate: 0 -3px; }
    to { translate: 0 5px; }
  }

  @media (prefers-reduced-motion: no-preference) {
    .tool-art {
      animation: artwork-drift var(--art-duration) ease-in-out var(--art-delay) infinite alternate;
    }
  }
</style>
