<script lang="ts">
  import { Button } from 'bits-ui';
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

  <div class="mx-auto max-w-[720px] text-center">
    <div class="mx-auto my-6 grid size-[250px] place-items-center content-center gap-1 rounded-full border-[12px] border-[#eeeeea] border-r-brand border-t-brand">
      <strong class="text-[52px] tracking-[-0.05em]">{minutes}:00</strong>
      <span class="text-[13px] text-muted">Ready to focus</span>
    </div>

    <div class="flex justify-center gap-2">
      <Button.Root class="inline-flex min-h-9 min-w-[120px] items-center justify-center rounded-lg border border-brand bg-brand px-3 text-[13px] font-[650] text-white hover:bg-brand-deep" type="button">
        Start
      </Button.Root>
      <Button.Root class="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 text-[13px] font-[650] hover:bg-surface-soft" type="button">
        Reset
      </Button.Root>
    </div>

    <p class="text-[13px] text-muted">Interaction and persistence are intentionally left for the Pomodoro vertical slice.</p>
  </div>
</section>
