<script lang="ts">
  import { Button } from 'bits-ui';
  import ToolHeader from '#lib/components/ToolHeader.svelte';

  let input = '{ "name": "Module", "localFirst": true }';
</script>

<svelte:head><title>Format JSON — Module</title></svelte:head>

<section class="py-12 max-[760px]:py-7">
  <ToolHeader
    eyebrow="Module / Developer"
    title="Format JSON"
    description="Format, validate, and minify JSON without sending it anywhere."
    privacy="Text stays local"
  />

  <div class="mb-3 flex flex-wrap gap-2">
    <Button.Root class="inline-flex min-h-9 items-center justify-center rounded-lg border border-brand bg-brand px-3 text-[13px] font-[650] text-white hover:bg-brand-deep" type="button">Format</Button.Root>
    <Button.Root class="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[13px] font-[650] hover:bg-surface-soft" type="button">Minify</Button.Root>
    <Button.Root class="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[13px] font-[650] hover:bg-surface-soft" type="button">Validate</Button.Root>
  </div>

  <div class="grid grid-cols-2 gap-3.5 max-[760px]:grid-cols-1">
    <label class="grid gap-[7px]">
      <span class="text-xs font-[650] text-[#5d5d5d]">Input</span>
      <textarea
        class="min-h-60 w-full resize-y rounded-lg border border-line bg-surface p-3 font-mono text-[13px] leading-[1.55] outline-none focus:border-brand/50 focus:ring-3 focus:ring-brand/10"
        bind:value={input}
      ></textarea>
    </label>

    <label class="grid gap-[7px]">
      <span class="text-xs font-[650] text-[#5d5d5d]">Output</span>
      <textarea
        class="min-h-60 w-full resize-y rounded-lg border border-line bg-surface p-3 font-mono text-[13px] leading-[1.55] outline-none"
        readonly
        value={input}
      ></textarea>
    </label>
  </div>

  <p class="text-xs text-muted">
    Behavior is intentionally a UI scaffold; domain formatting logic belongs in the module layer.
  </p>
</section>
