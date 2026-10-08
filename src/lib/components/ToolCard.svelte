<script lang="ts">
  import { ArrowRight, CornerDownLeft, FileImage, FileText, Files, Keyboard, Minimize2, Timer, Type } from 'lucide-svelte';
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
    <div class="pointer-events-none absolute inset-0" aria-hidden="true">
      <div class="absolute bottom-[14%] left-[17%] grid h-[52%] w-[34%] rotate-[-10deg] place-items-center rounded-[18px] border border-white/[0.18] bg-white/[0.23] shadow-[0_14px_24px_rgba(90,41,57,0.10)] backdrop-blur-[2px] transition-transform duration-200 group-hover:translate-x-[-3px] group-hover:rotate-[-13deg]">
        <Files class="size-[46%] opacity-55" strokeWidth={1.35} />
      </div>

      <div class="absolute bottom-[12%] right-[15%] grid h-[58%] w-[38%] rotate-[8deg] place-items-center rounded-[18px] border border-white/[0.24] bg-white/[0.34] shadow-[0_16px_28px_rgba(90,41,57,0.14)] backdrop-blur-[2px] transition-transform duration-200 group-hover:translate-x-[3px] group-hover:rotate-[11deg]">
        <FileText class="size-[44%] opacity-70" strokeWidth={1.45} />
      </div>

      <div class="absolute bottom-[10%] left-1/2 flex h-9 -translate-x-1/2 items-center gap-2 rounded-full border border-white/[0.18] bg-[#552433]/[0.11] px-3 backdrop-blur-sm">
        <ArrowRight class="size-4" strokeWidth={1.8} />
      </div>
    </div>

  {:else if module.id === 'pomodoro'}
    <div class="pointer-events-none absolute inset-0" aria-hidden="true">
      <div class="absolute bottom-[10%] left-1/2 aspect-square w-[63%] -translate-x-1/2 rounded-full border-[12px] border-white/[0.18] shadow-[inset_0_10px_20px_rgba(255,255,255,0.10),0_18px_30px_rgba(24,58,107,0.12)] transition-transform duration-200 group-hover:scale-[1.025]">
        <div class="absolute inset-[7%] rounded-full border border-[#163A6B]/[0.10] bg-white/[0.08]"></div>
        <div class="absolute left-1/2 top-1/2 grid size-[46%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/[0.12] backdrop-blur-sm">
          <Timer class="size-[58%] opacity-70" strokeWidth={1.45} />
        </div>
        <div class="absolute right-[1%] top-[18%] h-[43%] w-[13%] rotate-[34deg] rounded-full bg-[#163A6B]/[0.28]"></div>
      </div>

      <div class="absolute bottom-[69%] left-1/2 h-4 w-10 -translate-x-1/2 rounded-full bg-[#163A6B]/[0.18] shadow-[0_4px_10px_rgba(24,58,107,0.10)]"></div>
    </div>

  {:else if module.id === 'image-compress'}
    <div class="pointer-events-none absolute inset-0" aria-hidden="true">
      <div class="absolute bottom-[11%] left-1/2 grid h-[58%] w-[68%] -translate-x-1/2 place-items-center rounded-[24px] border border-white/[0.24] bg-white/[0.22] shadow-[0_16px_28px_rgba(35,75,48,0.12)] backdrop-blur-[2px]">
        <FileImage class="size-[43%] opacity-65" strokeWidth={1.35} />
      </div>

      <div class="absolute bottom-[9%] right-[12%] grid size-14 place-items-center rounded-full border border-white/[0.24] bg-white/[0.34] shadow-[0_10px_20px_rgba(35,75,48,0.12)] backdrop-blur-sm">
        <Minimize2 class="size-6 opacity-70" strokeWidth={1.55} />
      </div>
    </div>

  {:else}
    <div class="pointer-events-none absolute inset-0" aria-hidden="true">
      <div class="absolute bottom-[9%] left-1/2 grid h-[45%] w-[76%] -translate-x-1/2 rotate-[-5deg] place-items-center rounded-[24px] border border-white/[0.20] bg-white/[0.18] shadow-[0_18px_30px_rgba(53,37,104,0.14)] backdrop-blur-[2px] transition-transform duration-200 group-hover:-translate-y-1 group-hover:rotate-[-7deg]">
        <Keyboard class="size-[68%] opacity-55" strokeWidth={1.25} />
      </div>

      <div class="absolute right-[17%] top-[29%] grid size-14 rotate-[8deg] place-items-center rounded-[16px] border border-white/[0.20] bg-white/[0.24] shadow-[0_12px_20px_rgba(53,37,104,0.10)] backdrop-blur-sm transition-transform duration-200 group-hover:translate-y-[-3px] group-hover:rotate-[11deg]">
        <Type class="size-6 opacity-70" strokeWidth={1.55} />
      </div>

      <div class="absolute left-[16%] top-[31%] grid size-12 rotate-[-9deg] place-items-center rounded-[14px] border border-white/[0.16] bg-white/[0.18] backdrop-blur-sm transition-transform duration-200 group-hover:translate-y-[-2px] group-hover:rotate-[-12deg]">
        <CornerDownLeft class="size-5 opacity-65" strokeWidth={1.55} />
      </div>
    </div>
  {/if}
</a>
