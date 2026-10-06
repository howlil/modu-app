<script lang="ts">
  import { Button } from 'bits-ui';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
</script>

<svelte:head><title>UUID Generator — Module</title></svelte:head>

<section class="py-12 max-[760px]:py-7">
  <ToolHeader
    eyebrow="Module / Developer"
    title="UUID Generator"
    description="Generate UUIDs instantly in your browser."
    privacy="Generated locally"
  />

  <div class="grid grid-cols-[280px_minmax(0,1fr)] gap-5 max-[760px]:grid-cols-1">
    <aside class="rounded-xl border border-line bg-surface">
      <div class="flex min-h-12 items-center border-b border-line px-3.5 text-[13px] font-bold">Options</div>
      <div class="grid gap-3 p-3.5">
        <label class="grid gap-[7px]">
          <span class="text-xs font-[650] text-[#5d5d5d]">Version</span>
          <select class="h-[38px] w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-brand/50 focus:ring-3 focus:ring-brand/10">
            <option>UUID v4</option>
            <option>UUID v7</option>
          </select>
        </label>

        <label class="grid gap-[7px]">
          <span class="text-xs font-[650] text-[#5d5d5d]">Count</span>
          <input
            class="h-[38px] w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-brand/50 focus:ring-3 focus:ring-brand/10"
            type="number"
            min="1"
            value="3"
          />
        </label>

        <Button.Root class="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-brand bg-brand px-3 text-[13px] font-[650] text-white hover:bg-brand-deep" type="button">
          Generate
        </Button.Root>
      </div>
    </aside>

    <div class="rounded-xl border border-line bg-surface">
      <div class="flex min-h-12 items-center border-b border-line px-3.5 text-[13px] font-bold">Generated values</div>
      <div class="grid min-h-[180px] place-items-center p-3.5 text-[13px] text-muted">
        Generated UUIDs will appear here.
      </div>
    </div>
  </div>
</section>
