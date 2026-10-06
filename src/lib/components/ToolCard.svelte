<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

  let { module }: { module: ModuleDefinition } = $props();
</script>

<Card.Root class="h-full gap-0 py-0 shadow-none transition hover:-translate-y-px hover:border-primary/30 hover:bg-accent/50">
  <a class="block min-h-[142px] p-4" href={module.route}>
    <div class="grid size-[38px] place-items-center rounded-[10px] border bg-muted text-[15px] font-bold text-foreground">
      {module.name.slice(0, 2)}
    </div>
    <div class="mt-5 text-sm font-bold">{module.name}</div>
    <div class="mt-1.5 text-[13px] leading-[1.45] text-muted-foreground">{module.description}</div>
  </a>
</Card.Root>
