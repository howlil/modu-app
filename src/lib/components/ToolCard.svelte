<script lang="ts">
  import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

  let { module }: { module: ModuleDefinition } = $props();
</script>

<a
  class="grid grid-cols-[1fr_auto] items-center gap-5 px-4 py-3.5 transition-colors hover:bg-muted/60"
  href={module.route}
>
  <div class="min-w-0">
    <div class="text-sm font-semibold tracking-[-0.015em]">{module.name}</div>
    <div class="mt-0.5 text-[13px] text-muted-foreground">{module.description}</div>
  </div>
  <span class="text-sm text-muted-foreground" aria-hidden="true">→</span>
</a>
