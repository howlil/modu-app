<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import { getRemainingMs, type TimerState } from '#lib/modules/pomodoro/timer.ts';

  const timer: TimerState = {
    startedAt: null,
    durationMs: 25 * 60 * 1000,
    endsAt: null,
    status: 'idle'
  };

  const minutes = Math.ceil(getRemainingMs(timer) / 60_000);
</script>

<svelte:head><title>Pomodoro — Module</title></svelte:head>

<section class="py-12 max-[760px]:py-7">
  <ToolHeader
    eyebrow="Module / Productivity"
    title="Pomodoro"
    description="A timer whose source of truth is temporal state, not a decrementing counter."
    privacy="Timer state stays local"
  />

  <Card.Root class="mx-auto max-w-[720px] gap-0 py-8 text-center shadow-none">
    <Card.Content>
      <div class="mx-auto grid size-[250px] place-items-center content-center gap-1 rounded-full border-[12px] border-muted border-r-primary border-t-primary">
        <strong class="text-[52px] tracking-[-0.05em]">{minutes}:00</strong>
        <span class="text-[13px] text-muted-foreground">Ready to focus</span>
      </div>

      <div class="mt-6 flex justify-center gap-2">
        <Button class="min-w-[120px]">Start</Button>
        <Button variant="outline">Reset</Button>
      </div>

      <Card.Description class="mt-4 text-xs">
        Interaction and persistence are intentionally left for the Pomodoro vertical slice.
      </Card.Description>
    </Card.Content>
  </Card.Root>
</section>
