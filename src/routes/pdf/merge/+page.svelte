<script lang="ts">
  import { Button } from 'bits-ui';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
</script>

<svelte:head><title>Merge PDF — Module</title></svelte:head>

<section class="py-12 max-[760px]:py-7">
  <ToolHeader
    eyebrow="Module / Files / PDF"
    title="Merge PDF"
    description="Combine multiple PDF files into one document. Reorder before processing."
    privacy="Files stay on this device"
  />

  <div class="grid grid-cols-[minmax(0,1fr)_290px] items-start gap-[22px] max-[860px]:grid-cols-1">
    <div>
      <div class="grid min-h-60 place-items-center rounded-xl border border-dashed border-[#cdcdc7] bg-surface p-6 text-center">
        <div>
          <div class="mx-auto mb-3 grid size-11 place-items-center rounded-[10px] bg-brand-soft text-brand">↑</div>
          <strong>Drop PDF files here</strong>
          <p class="mt-1.5 text-xs leading-6 text-muted">or choose files from your device</p>
          <Button.Root
            class="mt-3.5 inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[13px] font-[650] hover:bg-surface-soft"
            type="button"
          >
            Choose files
          </Button.Root>
        </div>
      </div>

      <div class="mt-3.5 rounded-[10px] border border-line bg-surface p-[18px] text-[13px] text-muted">
        Selected files will appear here.
      </div>
    </div>

    <aside class="rounded-xl border border-line bg-surface">
      <div class="flex min-h-12 items-center border-b border-line px-3.5 text-[13px] font-bold">Output</div>
      <div class="grid gap-3.5 p-3.5">
        <label class="grid gap-[7px]">
          <span class="text-xs font-[650] text-[#5d5d5d]">File name</span>
          <input
            class="h-[38px] w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-brand/50 focus:ring-3 focus:ring-brand/10"
            value="merged.pdf"
          />
        </label>

        <Button.Root
          class="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-brand bg-brand px-3 text-[13px] font-[650] text-white hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          disabled
        >
          Merge PDF
        </Button.Root>

        <p class="m-0 text-xs leading-6 text-muted">
          The PDF engine is intentionally not wired in this scaffold. Add it as a lazy-loaded,
          worker-backed vertical slice.
        </p>
      </div>
    </aside>
  </div>
</section>
