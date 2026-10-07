<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import ToolHeader from '#lib/components/ToolHeader.svelte';
</script>

<svelte:head><title>Merge PDF — Module</title></svelte:head>

<section class="mx-auto w-full max-w-[1180px] px-4 py-10 max-[760px]:px-2.5 max-[760px]:py-7">
  <div class="mx-auto w-full max-w-[860px] min-w-0">
    <ToolHeader
      title="Merge PDF"
      description="Combine PDFs into one file."
    />

    <div class="grid grid-cols-[minmax(0,1fr)_280px] items-start gap-4 max-[760px]:grid-cols-1">
    <Card.Root class="min-h-56 justify-center gap-0 border-dashed py-0 shadow-none">
      <Card.Content class="grid place-items-center p-6 text-center">
        <div>
          <div class="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-secondary text-base text-secondary-foreground">↑</div>
          <Card.Title class="text-sm">Drop PDF files</Card.Title>
          <Button variant="outline" size="sm" class="mt-4">Choose files</Button>
          <p class="mt-2 text-xs text-muted-foreground">Processed locally.</p>
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root class="gap-0 py-0 shadow-none">
      <Card.Header class="border-b px-4 py-3">
        <Card.Title class="text-[13px]">Output</Card.Title>
      </Card.Header>

      <Card.Content class="grid gap-3 p-4">
        <label class="grid gap-2 text-xs font-medium" for="output-name">
          File name
          <Input id="output-name" value="merged.pdf" />
        </label>

        <Button class="w-full" disabled>Merge PDF</Button>
      </Card.Content>
    </Card.Root>
    </div>
  </div>
</section>
