<script lang="ts">
  import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

  let { module }: { module: ModuleDefinition } = $props();
  let preview = $derived(module.status === 'coming-soon');

  let tileStyle = $derived({
    pomodoro: 'background: linear-gradient(145deg, #9BC2F7 0%, #80AEEF 54%, #709DE5 100%);',
    'habit-tracker': 'background: linear-gradient(145deg, #D4E3FF 0%, #BED4FD 55%, #9CBCFA 100%);',
    'language-learning': 'background: linear-gradient(145deg, #D9D4FD 0%, #C7BEF8 55%, #B5A9F0 100%);',
  }[module.id]);

  let tileClass = $derived({
    pomodoro: 'text-[#163A6B] border-[#6F9FE8]',
    'habit-tracker': 'text-[#17437A] border-[#86A9EA]',
    'language-learning': 'text-[#423176] border-[#A494DF]',
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


  {#if module.id === 'language-learning'}
    <div class="tool-art tool-art--language" aria-hidden="true">
      <svg class="size-full" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(-8 120 120)">
          <rect x="38" y="52" width="138" height="150" rx="24" fill="#F3EEFF" stroke="#937DD5" stroke-width="4"/>
          <rect x="52" y="66" width="111" height="121" rx="15" fill="#FFFFFF"/>
          <path d="M74 97H139M74 118H128M74 139H119" stroke="#AE9ADE" stroke-width="9" stroke-linecap="round"/>
          <path d="M62 171H152" stroke="#D6CBF2" stroke-width="5" stroke-linecap="round"/>
          <rect x="127" y="94" width="93" height="90" rx="28" fill="#6F50D5" stroke="#D8C9FF" stroke-width="4"/>
          <path d="M148 127H196M154 145H188" stroke="white" stroke-width="7" stroke-linecap="round"/>
          <path d="M151 178L144 198L172 182" fill="#6F50D5"/>
          <path d="M151 178L144 198L172 182" stroke="#D8C9FF" stroke-width="4" stroke-linejoin="round"/>
        </g>
      </svg>
    </div>
  {:else if module.id === 'habit-tracker'}
    <div class="tool-art tool-art--habit" aria-hidden="true">
      <svg class="size-full" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(-8 120 120)">
          <rect x="48" y="35" width="151" height="170" rx="23" fill="#F8FBFF" stroke="#7FA4E8" stroke-width="3"/>
          <path d="M48 88H199" stroke="#B6D0FA" stroke-width="3"/>
          <path d="M79 30v20M168 30v20" stroke="#5C87D1" stroke-width="9" stroke-linecap="round"/>
          <g fill="#DAE8FF">
            <rect x="65" y="105" width="31" height="31" rx="8"/>
            <rect x="107" y="105" width="31" height="31" rx="8"/>
            <rect x="149" y="105" width="31" height="31" rx="8"/>
            <rect x="65" y="149" width="31" height="31" rx="8"/>
            <rect x="107" y="149" width="31" height="31" rx="8"/>
            <rect x="149" y="149" width="31" height="31" rx="8"/>
          </g>
          <rect x="65" y="105" width="31" height="31" rx="8" fill="#2468F2"/>
          <rect x="107" y="105" width="31" height="31" rx="8" fill="#2468F2"/>
          <rect x="65" y="149" width="31" height="31" rx="8" fill="#2468F2"/>
          <path d="m71 120 6 6 12-13M113 120l6 6 12-13M71 164l6 6 12-13" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
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



  .tool-art--language { --art-rotation: 5deg; --art-duration: 7.4s; --art-delay: -1s; }
  .tool-art--habit { --art-rotation: -8deg; --art-duration: 8s; --art-delay: -1.5s; }

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
