<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
</script>

<svelte:head><title>Merge PDF — Module</title></svelte:head>

<section class="mx-auto w-full max-w-[1180px] px-4 py-8 max-[760px]:px-2.5 max-[760px]:py-6">
  <div class="mx-auto w-full max-w-[860px] min-w-0">
    <ToolHeader title="Merge PDF" />
    <div class="border-y border-border py-8">
      <h2 class="text-title font-semibold">Coming soon</h2>
      <p class="mt-2 text-body text-muted-foreground">
        PDF merging isn't available yet.
      </p>
      <Button href="/#tools" variant="outline" class="mt-6 rounded-full shadow-none">
        Back to tools
      </Button>
    </div>
  </div>
</section>
