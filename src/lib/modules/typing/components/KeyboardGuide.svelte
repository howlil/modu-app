<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { resolveFingerCue } from '../core/finger-guide.ts';
  import FingerShadow from './FingerShadow.svelte';

  let {
    character,
    typedIndex,
    guideLevel,
    oppositeHandShift,
    fingerShadow
  }: {
    character: string;
    typedIndex: number;
    guideLevel: number;
    oppositeHandShift: boolean;
    fingerShadow: boolean;
  } = $props();

  const demoText = 'asdf jkl; qwerty uiop';
  let demoIndex = $state<number | null>(null);
  let demoTimer: ReturnType<typeof setInterval> | null = null;
  const shown = $derived(demoIndex === null ? character : demoText[demoIndex % demoText.length]);
  const cue = $derived(resolveFingerCue(shown || ' ', oppositeHandShift));
  const pulse = $derived(demoIndex === null ? typedIndex : typedIndex + demoIndex + 1);
  const rows = [
    ['1','2','3','4','5','6','7','8','9','0','-','='],
    ['q','w','e','r','t','y','u','i','o','p','[',']'],
    ['a','s','d','f','g','h','j','k','l',';', "'"],
    ['z','x','c','v','b','n','m',',','.','/'],
    ['Shift L','Space','Shift R']
  ];

  function stopDemo() {
    if (demoTimer !== null) clearInterval(demoTimer);
    demoTimer = null;
    demoIndex = null;
  }

  function toggleDemo() {
    if (demoTimer !== null) {
      stopDemo();
      return;
    }
    demoIndex = 0;
    demoTimer = setInterval(() => {
      if (demoIndex !== null) demoIndex = (demoIndex + 1) % demoText.length;
    }, 650);
  }

  onDestroy(stopDemo);
</script>

{#if guideLevel < 2}
  <section class="mt-8 rounded-[20px] border border-border bg-card p-5 max-[640px]:p-4"
    aria-label="Keyboard and finger guide">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="text-ui font-medium">Keyboard & finger guide</h3>
        <p class="mt-1 text-meta text-muted-foreground">Follow the highlighted finger and key.</p>
      </div>
      {#if fingerShadow}
        <Button variant="outline" size="sm" class="rounded-full shadow-none"
          onclick={toggleDemo} aria-pressed={demoIndex !== null}>
          {demoIndex === null ? 'Play movement' : 'Stop demo'}
        </Button>
      {/if}
    </div>

    <div class:single={guideLevel === 1} class="guide-layout mt-5 items-center gap-5">
      {#if guideLevel === 0}
        <div class="min-w-0">
          <p class="mb-3 font-mono text-meta text-muted-foreground">TARGET KEY</p>
          <div class="flex flex-col gap-1" aria-hidden="true">
            {#each rows as row, rowIndex}
              <div class="flex justify-center gap-1">
                {#each row as key}
                  {@const active = key.toLowerCase() === cue.physicalKey || (key === 'Space' && cue.physicalKey === ' ')}
                  {@const modifier = (key === 'Shift L' && cue.shiftFinger === 'left-pinky') || (key === 'Shift R' && cue.shiftFinger === 'right-pinky')}
                  <span class:active class:modifier
                    class:wide={rowIndex === 4}
                    class:space={key === 'Space'}
                    class="key flex h-7 min-w-0 flex-1 items-center justify-center rounded-md border border-border bg-muted/50 font-mono text-[10px] uppercase text-muted-foreground">
                    {key}
                  </span>
                {/each}
              </div>
            {/each}
          </div>
        </div>
      {/if}
      <div class="min-w-0">
        <p class="mb-2 font-mono text-meta text-muted-foreground">FINGER SHADOWING</p>
        <FingerShadow {cue} shadow={fingerShadow} {pulse} />
      </div>
    </div>

    <div class="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-meta">
      <span class="size-2 rounded-full bg-primary" aria-hidden="true"></span>
      <span class="font-medium text-primary">{cue.finger.replace('-', ' ')}</span>
      <span class="text-muted-foreground">Press {shown === ' ' ? 'SPACE' : shown || 'SPACE'}</span>
      {#if cue.shiftFinger}
        <span class="text-muted-foreground">+ {cue.shiftFinger.replace('-', ' ')} Shift</span>
      {/if}
    </div>
  </section>
{/if}

<style>
  .guide-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .82fr); }
  .guide-layout.single { grid-template-columns: 1fr; }
  .guide-layout.single > div { max-width: 420px; width: 100%; margin-inline: auto; }
  .key.active { background: var(--secondary); border-color: var(--primary); color: var(--accent-foreground); transform: translateY(2px); font-weight: 600; }
  .key.modifier { background: #efeaff; color: #6b53ab; border-color: #b9a9e8; }
  .key.wide { flex: 2; }
  .key.space { flex: 5; }
  @media(max-width: 680px) { .guide-layout { grid-template-columns: 1fr; } .key { font-size: 9px; } }
  @media (prefers-reduced-motion: reduce) { .key.active { transform: none; } }
</style>
