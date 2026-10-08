<script lang="ts">
  import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

  let { module, preview = false }: { module: ModuleDefinition; preview?: boolean } = $props();

  const tileStyle = {
    'pdf-merge': 'background: linear-gradient(145deg, #F8C7D3 0%, #F1AEC0 56%, #E99CB2 100%);',
    pomodoro: 'background: linear-gradient(145deg, #9BC2F7 0%, #80AEEF 54%, #709DE5 100%);',
    typing: 'background: linear-gradient(145deg, #B9A5F5 0%, #A088EC 54%, #9075DF 100%);',
    'image-compress': 'background: linear-gradient(145deg, #C8E8CD 0%, #AEDCB8 54%, #98CFA7 100%);'
  }[module.id];

  const tileClass = {
    'pdf-merge': 'text-[#552433] border-[#DF94AA]',
    pomodoro: 'text-[#163A6B] border-[#6F9FE8]',
    typing: 'text-[#352568] border-[#8E74DC]',
    'image-compress': 'text-[#234B30] border-[#8DC49A]'
  }[module.id] ?? 'text-foreground border-border';
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

  <div class="relative z-20 flex items-start justify-between gap-2">
    <div class="text-ui font-semibold tracking-[-0.02em]">
      {module.name}
    </div>

    {#if preview}
      <span class="shrink-0 rounded-full border border-white/30 bg-white/45 px-2 py-1 text-meta font-medium tracking-[-0.01em] backdrop-blur-sm">
        Coming soon
      </span>
    {/if}
  </div>


  {#if module.id === 'pdf-merge'}
    <div class="tool-art tool-art--pdf" aria-hidden="true">
      <svg class="size-full" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(-16 85 136)">
          <rect x="32" y="49" width="116" height="155" rx="19" fill="#F7DBE4" stroke="#E4A8BA" stroke-width="2" />
          <rect x="50" y="69" width="46" height="35" rx="9" fill="#ECC0CE" />
          <path d="M60 86h25M60 94h16" stroke="#B06A81" stroke-width="3" stroke-linecap="round" />
          <path d="M52 127h68M52 143h53M52 159h59M52 175h38" stroke="#BD8295" stroke-width="5" stroke-linecap="round" opacity=".6" />
        </g>
        <g transform="rotate(10 155 132)">
          <path d="M116 48h63l24 24v114c0 13-10 23-23 23h-64c-13 0-23-10-23-23V71c0-13 10-23 23-23Z" fill="#FFF0F4" stroke="#DB9DB2" stroke-width="2" />
          <path d="M179 48v18c0 4 3 7 7 7h17" stroke="#C88199" stroke-width="3" />
          <rect x="118" y="95" width="60" height="40" rx="10" fill="#F4CFDA" />
          <path d="M129 109h37M129 120h25" stroke="#AB647C" stroke-width="4" stroke-linecap="round" />
          <path d="M118 151h59M118 168h43M118 184h51" stroke="#C3879B" stroke-width="5" stroke-linecap="round" />
        </g>
        <circle cx="121" cy="194" r="24" fill="#B85C7B" />
        <path d="M108 194h26m-9-9 9 9-9 9" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        <path d="m53 35 4 8 8 4-8 4-4 8-4-8-8-4 8-4Z" fill="#FFF0F4" />
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

  {:else if module.id === 'typing'}
    <div class="tool-art tool-art--typing" aria-hidden="true">
      <svg class="size-full" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(-6 121 141)">
          <rect x="29" y="79" width="188" height="132" rx="24" fill="#5F469D" />
          <rect x="34" y="71" width="188" height="128" rx="22" fill="#EEE6FF" />
          <g fill="#CBB8F4">
            <rect x="51" y="91" width="24" height="21" rx="6" />
            <rect x="81" y="91" width="24" height="21" rx="6" />
            <rect x="111" y="91" width="24" height="21" rx="6" />
            <rect x="141" y="91" width="24" height="21" rx="6" />
            <rect x="171" y="91" width="28" height="21" rx="6" />
            <rect x="57" y="119" width="24" height="21" rx="6" />
            <rect x="87" y="119" width="24" height="21" rx="6" />
            <rect x="117" y="119" width="24" height="21" rx="6" />
            <rect x="147" y="119" width="24" height="21" rx="6" />
            <rect x="177" y="119" width="22" height="21" rx="6" />
            <rect x="63" y="147" width="24" height="21" rx="6" />
            <rect x="93" y="147" width="24" height="21" rx="6" />
            <rect x="123" y="147" width="24" height="21" rx="6" />
            <rect x="153" y="147" width="37" height="21" rx="6" />
          </g>
          <rect x="87" y="119" width="24" height="21" rx="6" fill="#7452C0" />
          <text x="99" y="134" text-anchor="middle" fill="white" font-family="system-ui, sans-serif" font-size="12" font-weight="600">S</text>
          <rect x="81" y="176" width="89" height="12" rx="6" fill="#B8A2E7" />
        </g>
        <path d="m60 47 5 11 11 5-11 5-5 11-5-11-11-5 11-5Z" fill="#FFF3FF" />
        <rect x="160" y="31" width="50" height="43" rx="13" fill="#F0EAFF" />
        <path d="M173 48h23m-11-9v19" stroke="#7855BC" stroke-width="4" stroke-linecap="round" />
      </svg>
    </div>

  {:else if module.id === 'image-compress'}
    <div class="tool-art tool-art--image" aria-hidden="true">
      <svg class="size-full" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(-9 127 141)">
          <rect x="32" y="65" width="177" height="158" rx="25" fill="#5B9E6D" />
          <rect x="32" y="53" width="177" height="158" rx="25" fill="#F2FBF2" stroke="#85BA90" stroke-width="2" />
          <rect x="50" y="73" width="141" height="105" rx="16" fill="#CCEBD2" />
          <circle cx="92" cy="106" r="13" fill="#85C799" />
          <path d="m59 160 40-42 32 31 26-28 25 39Z" fill="#6FB783" />
          <path d="m91 160 44-47 47 47Z" fill="#4D9768" />
          <path d="M70 191h99" stroke="#8BBCA0" stroke-width="6" stroke-linecap="round" />
        </g>
        <circle cx="185" cy="186" r="29" fill="#E8F8EC" stroke="#5E9D71" stroke-width="2" />
        <path d="M171 181h15v-15m0 15-15-15M199 191h-15v15m0-15 15 15" stroke="#4F8B60" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" />
        <path d="m60 39 4 9 9 4-9 4-4 9-4-9-9-4 9-4Z" fill="#F1FFF2" />
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

  .tool-art--pdf {
    --art-rotation: 10deg;
    --art-duration: 6.8s;
    --art-delay: 0s;
  }

  .tool-art--pomodoro {
    --art-rotation: -9deg;
    --art-duration: 7.5s;
    --art-delay: -2s;
  }

  .tool-art--typing {
    --art-rotation: 8deg;
    --art-duration: 6.5s;
    --art-delay: -4s;
  }

  .tool-art--image {
    --art-rotation: -10deg;
    --art-duration: 7.8s;
    --art-delay: -3s;
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
