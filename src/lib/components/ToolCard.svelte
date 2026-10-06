<script lang="ts">
  import type { ModuleDefinition } from '#lib/platform/registry/types.ts';

  let { module }: { module: ModuleDefinition } = $props();
</script>

<a
  class="min-h-[142px] rounded-xl border border-line bg-surface p-4 transition hover:-translate-y-px hover:border-line-strong"
  href={module.route}
>
  <div class="grid size-[38px] place-items-center rounded-[10px] border border-line bg-surface-soft text-[15px] font-bold">
    {module.name.slice(0, 2)}
  </div>
  <div class="mt-5 text-sm font-bold">{module.name}</div>
  <div class="mt-1.5 text-[13px] leading-[1.45] text-muted">{module.description}</div>
</a>
