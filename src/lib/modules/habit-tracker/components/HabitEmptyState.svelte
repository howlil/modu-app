<script lang="ts">
  import { Plus } from 'lucide-svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  let { onCreate }: { onCreate: () => void } = $props();
</script>

<section class="rounded-[20px] border border-border bg-card px-5 py-10 text-center">
  <h2 class="text-title font-medium">No habits yet</h2>
  <p class="mx-auto mt-2 max-w-[360px] text-ui text-muted-foreground">Create a daily habit to start tracking your progress.</p>
  <Button class="mt-5 rounded-full" onclick={onCreate}><Plus class="mr-1 size-4"/> Create your first habit</Button>
</section>
