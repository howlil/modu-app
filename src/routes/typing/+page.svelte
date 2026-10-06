<script lang="ts">
  import { Button } from 'bits-ui';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
</script>

<svelte:head><title>Typing Practice — Module</title></svelte:head>

<section class="py-12 max-[760px]:py-7">
  <ToolHeader
    eyebrow="Module / Productivity"
    title="Typing Practice"
    description="Practice typing speed and accuracy with local session summaries."
    privacy="Session data stays local"
  />

  <div class="mb-3 flex max-w-[420px] gap-[3px] rounded-[9px] border border-line bg-surface-soft p-[3px]">
    <button class="flex-1 rounded-md bg-surface px-2.5 py-[7px] text-xs font-[650] text-ink" type="button">Time</button>
    <button class="flex-1 rounded-md px-2.5 py-[7px] text-xs text-muted hover:text-ink" type="button">Words</button>
    <button class="flex-1 rounded-md px-2.5 py-[7px] text-xs text-muted hover:text-ink" type="button">Paragraph</button>
    <button class="flex-1 rounded-md px-2.5 py-[7px] text-xs text-muted hover:text-ink" type="button">Custom</button>
  </div>

  <div class="min-h-[210px] rounded-xl border border-line bg-surface p-6 font-mono text-lg leading-[1.8] text-[#b4b4b4]">
    <span class="text-ink">The quick brown fox jumps over the lazy dog. </span>
    <span class="rounded-[3px] bg-brand-soft text-brand">A</span>
    <span> focused typing session belongs here.</span>
  </div>

  <div class="mt-3 flex items-center justify-between gap-3 text-[13px] text-muted">
    <span>60 seconds · English</span>
    <Button.Root class="inline-flex min-h-9 items-center justify-center rounded-lg border border-brand bg-brand px-3 text-[13px] font-[650] text-white hover:bg-brand-deep" type="button">
      Start session
    </Button.Root>
  </div>
</section>
