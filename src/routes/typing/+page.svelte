<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
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

  <div class="mb-3 flex max-w-[420px] gap-1 rounded-lg border bg-muted p-1">
    <Button variant="secondary" size="sm" class="flex-1">Time</Button>
    <Button variant="ghost" size="sm" class="flex-1">Words</Button>
    <Button variant="ghost" size="sm" class="flex-1">Paragraph</Button>
    <Button variant="ghost" size="sm" class="flex-1">Custom</Button>
  </div>

  <Card.Root class="gap-0 py-0 shadow-none">
    <Card.Content class="min-h-[210px] p-6 font-mono text-lg leading-[1.8] text-muted-foreground">
      <span class="text-foreground">The quick brown fox jumps over the lazy dog. </span>
      <span class="rounded-sm bg-secondary px-0.5 text-secondary-foreground">A</span>
      <span> focused typing session belongs here.</span>
    </Card.Content>
  </Card.Root>

  <div class="mt-3 flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
    <span>60 seconds · English</span>
    <Button>Start session</Button>
  </div>
</section>
