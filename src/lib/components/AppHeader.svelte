<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
</script>

<header class="sticky top-0 z-50 h-[62px] border-b bg-background/95 backdrop-blur-md">
  <div class="mx-auto flex h-full w-full max-w-[1180px] items-center justify-between px-4 max-[700px]:px-2.5">
    <a class="inline-flex items-center gap-[9px] text-base font-[760] tracking-[-0.02em]" href="/">
      <span class="grid size-[27px] grid-cols-2 gap-[3px] rounded-lg bg-primary p-[6px]" aria-hidden="true">
        <span class="rounded-sm bg-primary-foreground"></span>
        <span class="rounded-sm bg-primary-foreground"></span>
        <span class="rounded-sm bg-primary-foreground"></span>
        <span class="rounded-sm bg-primary-foreground"></span>
      </span>
      Module
    </a>

    <Badge variant="outline" class="gap-2 rounded-full bg-card px-2.5 py-2 font-normal text-muted-foreground">
      <span class="size-1.5 rounded-full bg-success"></span>
      Browser-first
    </Badge>
  </div>
</header>
