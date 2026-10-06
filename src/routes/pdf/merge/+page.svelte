<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import ToolHeader from '#lib/components/ToolHeader.svelte';
</script>

<svelte:head><title>Merge PDF — Module</title></svelte:head>

<section class="py-12 max-[760px]:py-7">
  <ToolHeader
    eyebrow="Module / PDF"
    title="Merge PDF"
    description="Combine multiple PDF files into one document. Reorder before processing."
    privacy="Files stay on this device"
  />

  <div class="grid grid-cols-[minmax(0,1fr)_290px] items-start gap-[22px] max-[860px]:grid-cols-1">
    <div class="grid gap-3.5">
      <Card.Root class="min-h-60 justify-center gap-0 border-dashed py-0 shadow-none">
        <Card.Content class="grid place-items-center p-6 text-center">
          <div>
            <div class="mx-auto mb-3 grid size-11 place-items-center rounded-lg bg-secondary text-lg text-secondary-foreground">↑</div>
            <Card.Title>Drop PDF files here</Card.Title>
            <Card.Description class="mt-1.5">or choose files from your device</Card.Description>
            <Button variant="outline" class="mt-4">Choose files</Button>
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root class="gap-0 py-0 shadow-none">
        <Card.Content class="p-4 text-[13px] text-muted-foreground">
          Selected files will appear here.
        </Card.Content>
      </Card.Root>
    </div>

    <Card.Root class="gap-0 py-0 shadow-none">
      <Card.Header class="border-b px-4 py-3.5">
        <Card.Title class="text-[13px]">Output</Card.Title>
      </Card.Header>

      <Card.Content class="grid gap-3.5 p-4">
        <label class="grid gap-2 text-xs font-medium" for="output-name">
          File name
          <Input id="output-name" value="merged.pdf" />
        </label>

        <Button class="w-full" disabled>Merge PDF</Button>

        <Card.Description class="text-xs leading-6">
          The PDF engine is intentionally not wired in this scaffold. Add it only when the Merge PDF vertical slice is implemented.
        </Card.Description>
      </Card.Content>
    </Card.Root>
  </div>
</section>
