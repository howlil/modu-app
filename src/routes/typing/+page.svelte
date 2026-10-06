<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import ToolHeader from '#lib/components/ToolHeader.svelte';
</script>

<svelte:head><title>Typing Practice — Module</title></svelte:head>

<section class="py-10 max-[760px]:py-7">
  <ToolHeader title="Typing Practice" />

  <div class="mb-3 flex max-w-[380px] gap-1 rounded-lg border bg-muted p-1">
    <Button variant="secondary" size="sm" class="flex-1">Time</Button>
    <Button variant="ghost" size="sm" class="flex-1">Words</Button>
    <Button variant="ghost" size="sm" class="flex-1">Paragraph</Button>
    <Button variant="ghost" size="sm" class="flex-1">Custom</Button>
  </div>

  <div class="min-h-[190px] rounded-lg border bg-card p-5 font-mono text-[17px] leading-[1.8] text-muted-foreground">
    <span class="text-foreground">The quick brown fox jumps over the lazy dog. </span>
    <span class="rounded-sm bg-secondary px-0.5 text-secondary-foreground">A</span>
    <span> focused typing session belongs here.</span>
  </div>

  <div class="mt-3 flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
    <span>60 seconds · English</span>
    <Button size="sm">Start</Button>
  </div>
</section>
