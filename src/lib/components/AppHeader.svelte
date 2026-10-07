<script lang="ts">
  import { onMount } from 'svelte';
  import { Github, Heart } from 'lucide-svelte';
  import { Button } from "$lib/components/ui/button/index.js";

  const FLOATING_THRESHOLD = 72;
  let scrolled = $state(false);

  onMount(() => {
    const update = () => {
      scrolled = window.scrollY > FLOATING_THRESHOLD;
    };

    update();
    window.addEventListener('scroll', update, { passive: true });

    return () => window.removeEventListener('scroll', update);
  });
</script>

<div class="fixed inset-x-0 top-0 z-50 h-[68px] pointer-events-none">
  <header
    class={scrolled
      ? "pointer-events-auto mx-auto mt-3 flex h-12 w-[calc(100%-20px)] max-w-[1080px] items-center rounded-full border border-white/[0.65] bg-background/[0.82] shadow-[0_10px_35px_rgba(28,28,24,0.08)] backdrop-blur-xl transition-all duration-200"
      : "pointer-events-auto flex h-[68px] w-full items-center border border-transparent bg-transparent shadow-none backdrop-blur-0 transition-all duration-200"}
  >
    <div
      class={scrolled
        ? "mx-auto flex h-full w-full items-center justify-between gap-3 px-3.5"
        : "mx-auto flex h-full w-full max-w-[1180px] items-center justify-between gap-3 px-4 max-[700px]:px-2.5"}
    >
      <a class="inline-flex items-center gap-2.5 text-[14px] font-[600] tracking-[-0.02em]" href="/">
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
          href="https://github.com/sponsors/howlil"
          target="_blank"
          rel="noreferrer"
          variant="outline"
          size="sm"
          class="h-8 rounded-full border-border/[0.75] bg-white/[0.50] px-2.5 text-xs font-normal shadow-none backdrop-blur-sm hover:bg-white/[0.80] max-[520px]:px-2"
        >
          <Heart class="size-3.5 text-[#BF4B71]" strokeWidth={1.8} />
          <span class="max-[430px]:hidden">Sponsor</span>
        </Button>

        <Button
          href="https://github.com/howlil/modu-app"
          target="_blank"
          rel="noreferrer"
          size="sm"
          class="h-8 rounded-full bg-foreground px-2.5 text-xs font-normal text-background shadow-none hover:bg-foreground/90 max-[520px]:px-2"
        >
          <Github class="size-3.5" strokeWidth={1.8} />
          <span class="max-[520px]:hidden">Star on GitHub</span>
          <span class="hidden max-[520px]:inline">Star</span>
        </Button>
      </nav>
    </div>
  </header>
</div>
