<script lang="ts">
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

<section class="page">
  <ToolHeader
    eyebrow="Module / Productivity"
    title="Pomodoro"
    description="A timer whose source of truth is temporal state, not a decrementing counter."
    privacy="Timer state stays local"
  />

  <div class="focus">
    <div class="timer">
      <strong>{minutes}:00</strong>
      <span>Ready to focus</span>
    </div>

    <div class="controls">
      <button class="button primary" type="button">Start</button>
      <button class="button" type="button">Reset</button>
    </div>

    <p>Interaction and persistence are intentionally left for the Pomodoro vertical slice.</p>
  </div>
</section>

<style>
  .focus {
    max-width: 720px;
    margin: 0 auto;
    text-align: center;
  }

  .timer {
    display: grid;
    width: 250px;
    height: 250px;
    place-items: center;
    align-content: center;
    gap: 4px;
    margin: 24px auto;
    border: 12px solid #eeeeea;
    border-top-color: var(--brand);
    border-right-color: var(--brand);
    border-radius: 50%;
  }

  .timer strong {
    font-size: 52px;
    letter-spacing: -0.05em;
  }

  .timer span,
  .focus p {
    color: var(--muted);
    font-size: 13px;
  }

  .controls {
    display: flex;
    justify-content: center;
    gap: 8px;
  }
</style>
