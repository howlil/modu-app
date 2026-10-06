<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";

  let {
    eyebrow,
    title,
    description,
    privacy = 'Processed locally on this device'
  }: {
    eyebrow: string;
    title: string;
    description: string;
    privacy?: string;
  } = $props();
</script>

<div class="mb-7 flex items-start justify-between gap-6 max-[760px]:flex-col">
  <div>
    <div class="mb-3 text-xs text-muted-foreground">{eyebrow}</div>
    <h1 class="m-0 text-[clamp(30px,4vw,36px)] font-[750] leading-[1.05] tracking-[-0.045em]">{title}</h1>
    <p class="mt-2 max-w-[680px] text-sm leading-[1.55] text-muted-foreground">{description}</p>
  </div>

  <Badge
    variant="outline"
    class="shrink-0 gap-2 whitespace-nowrap border-success/20 bg-success-muted px-2.5 py-1.5 text-success"
  >
    <span class="size-1.5 rounded-full bg-current"></span>
    {privacy}
  </Badge>
</div>
