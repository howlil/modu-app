<script lang="ts">
  import { Button } from 'bits-ui';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
</script>

<svelte:head><title>Split PDF — Module</title></svelte:head>

<section class="py-12 max-[760px]:py-7">
  <ToolHeader
    eyebrow="Module / Files / PDF"
    title="Split PDF"
    description="Extract selected pages or split one PDF into ranges."
  />

  <div class="rounded-xl border border-line bg-surface">
    <div class="flex min-h-12 items-center border-b border-line px-3.5 text-[13px] font-bold">File workspace</div>
    <div class="grid min-h-60 place-items-center content-center gap-2.5 p-3.5 text-center text-muted">
      <p class="m-0">Choose a PDF to render page thumbnails and select ranges.</p>
      <Button.Root
        class="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[13px] font-[650] text-ink hover:bg-surface-soft"
        type="button"
      >
        Choose PDF
      </Button.Root>
    </div>
  </div>
</section>
