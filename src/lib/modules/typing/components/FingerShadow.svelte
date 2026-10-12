<script lang="ts">
  import type { FingerCue, FingerId } from '../core/finger-guide.ts';

  let { cue, shadow = true, pulse = 0 }: {
    cue: FingerCue;
    shadow?: boolean;
    pulse?: number;
  } = $props();

  const fingers = [
    { name: 'pinky', path: 'M48 112L45 66Q44 56 51 52Q61 49 64 62L67 109Z' },
    { name: 'ring', path: 'M64 108L64 44Q64 34 72 32Q81 31 84 43L84 108Z' },
    { name: 'middle', path: 'M83 107L85 29Q86 16 96 16Q107 17 107 29L105 107Z' },
    { name: 'index', path: 'M103 110L109 46Q110 34 119 34Q130 35 129 47L119 114Z' },
    { name: 'thumb', path: 'M121 128L147 95Q154 86 161 92Q169 99 161 108L135 147Z' }
  ] as const;

  const sides = ['left', 'right'] as const;
  const id = (side: 'left' | 'right', name: string): FingerId =>
    `${side}-${name}` as FingerId;
</script>

<div class="mx-auto w-full max-w-[360px]">
  {#key `${pulse}-${cue.physicalKey}`}
    <svg viewBox="0 0 430 205" xmlns="http://www.w3.org/2000/svg"
      role="img" aria-label={`Use ${cue.finger.replace('-', ' ')}${cue.shiftFinger ? ` and ${cue.shiftFinger.replace('-', ' ')} for Shift` : ''}`}
      class:still={!shadow} class="w-full overflow-visible">
      {#each sides as side}
        <g transform={side === 'left' ? 'translate(5 6)' : 'translate(425 6) scale(-1 1)'}>
          <path d="M48 103 Q54 94 70 94 L112 98 Q129 99 133 116 Q137 138 127 160 L126 183 Q92 189 55 183 L55 161 Q44 133 48 103Z"
            fill="#F9FAFC" stroke="#B3BECB" stroke-width="2.2" stroke-linejoin="round" />
          <path d="M66 127Q80 121 92 130 M91 130Q106 124 119 130 M68 153Q92 159 115 150"
            fill="none" stroke="#DCE2EA" stroke-width="1.5" stroke-linecap="round" />
          {#each fingers as digit}
            {@const fingerId = id(side, digit.name)}
            {@const active = cue.finger === fingerId}
            {@const assist = cue.shiftFinger === fingerId}
            {#if active && shadow}
              <path d={digit.path} fill="none" stroke="#86A9F8" stroke-width="1.8"
                stroke-dasharray="4 4" opacity=".75" />
            {/if}
            <path d={digit.path}
              class:active class:assist
              class="finger"
              style={active ? `--rx:${cue.reach.x}px;--ry:${cue.reach.y}px;--rr:${cue.reach.rotation}deg;` : ''}
            />
          {/each}
        </g>
      {/each}
    </svg>
  {/key}
  <div class="mt-0 flex justify-around font-mono text-meta text-muted-foreground">
    <span>LEFT HAND</span>
    <span>RIGHT HAND</span>
  </div>
</div>

<style>
  .finger {
    fill: #f7f9fc;
    stroke: #afbac8;
    stroke-width: 2.1;
    stroke-linejoin: round;
    stroke-linecap: round;
    transform-box: fill-box;
    transform-origin: center bottom;
  }
  .finger.active {
    fill: #dce9ff;
    stroke: #2468f2;
    stroke-width: 2.7;
    filter: drop-shadow(0 3px 3px #2468f22a);
    animation: reach 220ms ease-out both;
  }
  .finger.assist {
    fill: #eee8ff;
    stroke: #927bcd;
    stroke-width: 2.5;
    animation: assist 220ms ease-out both;
  }
  @keyframes reach {
    from { transform: translate(0, 0) rotate(0deg); }
    to { transform: translate(var(--rx, 0px), var(--ry, 0px)) rotate(var(--rr, 0deg)); }
  }
  @keyframes assist {
    from { transform: translateY(0); }
    to { transform: translateY(-4px); }
  }
  .still .finger.active, .still .finger.assist { animation: none; }
  @media (prefers-reduced-motion: reduce) {
    .finger.active, .finger.assist { animation: none; }
  }
</style>
