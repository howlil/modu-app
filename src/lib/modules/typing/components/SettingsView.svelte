<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import { Switch } from '$lib/components/ui/switch/index.js';
  import type { TypingPreferences } from '../core/trainer.ts';

  let { preferences, audioUnavailable, onTogglePreference, onPreviewSound }: {
    preferences: TypingPreferences;
    audioUnavailable: boolean;
    onTogglePreference: (key: keyof TypingPreferences) => void;
    onPreviewSound: () => void;
  } = $props();
</script>

<div class="border-b border-border pb-4">
  <h2 class="m-0 text-title font-semibold tracking-[-0.03em]">Settings</h2>
</div>

<div class="divide-y divide-border">
  <div class="flex items-center justify-between gap-5 py-4">
    <div class="min-w-0">
      <strong class="block text-meta font-medium">Keyboard sound</strong>
      <span class="mt-1 block text-meta text-muted-foreground">Mechanical key clicks.</span>
      {#if audioUnavailable}
        <span class="mt-1 block text-meta text-destructive">Web Audio is unavailable in this browser.</span>
      {/if}
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        class="h-8 rounded-full px-2 text-meta font-normal text-muted-foreground shadow-none"
        aria-label="Preview mechanical keyboard sound"
        onclick={onPreviewSound}
      >
        Preview
      </Button>
      <Switch
        checked={preferences.keyboardSound}
        aria-label="Keyboard sound"
        onclick={() => onTogglePreference('keyboardSound')}
      />
    </div>
  </div>

  <div class="flex items-center justify-between gap-5 py-4">
    <div class="min-w-0">
      <strong class="block text-meta font-medium">Strict correction</strong>
      <span class="mt-1 block text-meta text-muted-foreground">Wrong keys stay on the current character.</span>
    </div>
    <Switch
      checked={preferences.strictCorrection}
      aria-label="Strict correction"
      onclick={() => onTogglePreference('strictCorrection')}
    />
  </div>

  <div class="flex items-center justify-between gap-5 py-4">
    <div class="min-w-0">
      <strong class="block text-meta font-medium">Guide fading</strong>
      <span class="mt-1 block text-meta text-muted-foreground">Hide keyboard help as keys stabilize.</span>
    </div>
    <Switch
      checked={preferences.automaticGuideFading}
      aria-label="Guide fading"
      onclick={() => onTogglePreference('automaticGuideFading')}
    />
  </div>

  <div class="flex items-center justify-between gap-5 py-4">
    <div class="min-w-0">
      <strong class="block text-meta font-medium">Mastery</strong>
      <span class="mt-1 block text-meta text-muted-foreground">
        {preferences.minSamples}+ samples · ≤ {preferences.masteryLatency}ms
      </span>
    </div>
    <span class="shrink-0 text-meta tabular-nums">{preferences.masteryAccuracy}%</span>
  </div>
</div>

