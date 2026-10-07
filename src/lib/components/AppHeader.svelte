<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from "$lib/components/ui/button/index.js";

  let scrolled = $state(false);

  onMount(() => {
    const update = () => {
      scrolled = window.scrollY > 18;
    };

    update();
    window.addEventListener('scroll', update, { passive: true });

    return () => window.removeEventListener('scroll', update);
  });
</script>

<div class="sticky top-0 z-50 h-[68px] pointer-events-none">
  <header
    class={scrolled
      ? "pointer-events-auto mx-auto mt-2 flex h-12 w-[calc(100%-20px)] max-w-[920px] items-center rounded-2xl border border-white/[0.55] bg-background/[0.72] shadow-[0_10px_35px_rgba(28,28,24,0.08)] backdrop-blur-xl transition-all duration-200"
      : "pointer-events-auto flex h-14 w-full items-center border-b border-border bg-background/95 backdrop-blur-md transition-all duration-200"}
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
          class="h-8 rounded-xl border-border/[0.75] bg-white/[0.50] px-2.5 text-xs font-normal shadow-none backdrop-blur-sm hover:bg-white/[0.80] max-[520px]:px-2"
        >
          <svg viewBox="0 0 24 24" class="size-3.5 text-[#BF4B71]" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
            <path d="M20.8 4.8a5.4 5.4 0 0 0-7.7 0L12 5.9l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 21l8.8-8.5a5.4 5.4 0 0 0 0-7.7Z" />
          </svg>
          <span class="max-[430px]:hidden">Sponsor</span>
        </Button>

        <Button
          href="https://github.com/howlil/modu-app"
          target="_blank"
          rel="noreferrer"
          size="sm"
          class="h-8 rounded-xl bg-foreground px-2.5 text-xs font-normal text-background shadow-none hover:bg-foreground/90 max-[520px]:px-2"
        >
          <svg viewBox="0 0 24 24" class="size-3.5" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.55 9.55 0 0 1 12 6.82a9.5 9.5 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
          </svg>
          <span class="max-[520px]:hidden">Star on GitHub</span>
          <span class="hidden max-[520px]:inline">Star</span>
        </Button>
      </nav>
    </div>
  </header>
</div>
