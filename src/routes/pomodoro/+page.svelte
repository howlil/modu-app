<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
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

<section class="py-10 max-[760px]:py-7">
  <ToolHeader title="Pomodoro" />

  <div class="mx-auto max-w-[620px] py-4 text-center">
    <div class="mx-auto grid size-[220px] place-items-center content-center rounded-full border-[10px] border-muted border-r-primary border-t-primary">
      <strong class="text-[48px] tracking-[-0.05em]">{minutes}:00</strong>
    </div>

    <div class="mt-6 flex justify-center gap-2">
      <Button class="min-w-[112px]">Start</Button>
      <Button variant="outline">Reset</Button>
    </div>
  </div>
</section>
