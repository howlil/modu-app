<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
</script>

<header class="sticky top-0 z-50 h-14 border-b bg-background/95 backdrop-blur-md">
  <div class="mx-auto flex h-full w-full max-w-[1180px] items-center justify-between gap-3 px-4 max-[700px]:px-2.5">
    <a class="inline-flex items-center gap-2.5 text-[15px] font-[760] tracking-[-0.025em]" href="/">
      <span class="grid size-6 grid-cols-2 gap-[3px] rounded-md bg-primary p-[5px]" aria-hidden="true">
        <span class="rounded-[1px] bg-primary-foreground"></span>
        <span class="rounded-[1px] bg-primary-foreground"></span>
        <span class="rounded-[1px] bg-primary-foreground"></span>
        <span class="rounded-[1px] bg-primary-foreground"></span>
      </span>
      Module
    </a>

    <nav class="flex items-center gap-1.5" aria-label="Project actions">
      <Button
        href="https://github.com/howlil/modu-app"
        size="sm"
        class="h-8 rounded-full bg-foreground px-3 text-xs font-medium text-background shadow-none hover:bg-foreground/90"
      >
        <span aria-hidden="true">★</span>
        Star
      </Button>
    </nav>
  </div>
</header>
