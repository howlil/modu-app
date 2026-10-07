<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Bell,
    BellOff,
    RotateCcw,
    Settings2,
    SkipForward,
    Volume2,
    VolumeX
  } from 'lucide-svelte';
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import {
    createTimer,
    getNextMode,
    pauseTimer,
    resetTimer,
    startTimer,
    switchMode,
    syncTimer,
    type PomodoroMode,
    type TimerState
  } from '#lib/modules/pomodoro/timer.ts';

  const STORAGE_KEY = 'module-pomodoro-v2';
  const RADIUS = 52;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const MODE_META: Record<
    PomodoroMode,
    { label: string; copy: string; accent: string; soft: string }
  > = {
    focus: {
      label: 'Focus',
      copy: 'One focus block. Nothing else.',
      accent: '#2468f2',
      soft: '#eaf1ff'
    },
    short: {
      label: 'Short break',
      copy: 'Step away for a few minutes.',
      accent: '#4f8e72',
      soft: '#edf6f1'
    },
    long: {
      label: 'Long break',
      copy: 'Take a proper break before a new cycle.',
      accent: '#7560c8',
      soft: '#f0edfb'
    }
  };

  const DEFAULT_DURATIONS: Record<PomodoroMode, number> = {
    focus: 25,
    short: 5,
    long: 15
  };

  let durations = $state<Record<PomodoroMode, number>>({ ...DEFAULT_DURATIONS });
  let draftDurations = $state<Record<PomodoroMode, number>>({ ...DEFAULT_DURATIONS });
  let timer = $state<TimerState>(createTimer('focus', DEFAULT_DURATIONS.focus * 60_000));
  let focusText = $state('');
  let soundEnabled = $state(true);
  let notificationsEnabled = $state(false);
  let settingsOpen = $state(false);
  let hydrated = $state(false);

  const modeMeta = $derived(MODE_META[timer.mode]);
  const formattedTime = $derived(formatDuration(timer.remainingMs));
  const progressRatio = $derived(
    timer.durationMs > 0 ? Math.max(0, Math.min(1, timer.remainingMs / timer.durationMs)) : 0
  );
  const progressOffset = $derived(CIRCUMFERENCE * (1 - progressRatio));
  const primaryLabel = $derived(
    timer.status === 'running'
      ? 'Pause'
      : timer.status === 'paused'
        ? 'Resume'
        : timer.status === 'complete'
          ? timer.mode === 'focus'
            ? 'Start break'
            : 'Start focus'
          : 'Start'
  );

  function durationMs(mode: PomodoroMode) {
    return durations[mode] * 60_000;
  }

  function formatDuration(ms: number) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function persist() {
    if (!hydrated || typeof localStorage === 'undefined') return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        timer,
        durations,
        focusText,
        soundEnabled,
        notificationsEnabled
      })
    );
  }

  function restore() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as {
        timer?: Partial<TimerState>;
        durations?: Partial<Record<PomodoroMode, number>>;
        focusText?: string;
        soundEnabled?: boolean;
        notificationsEnabled?: boolean;
      };

      durations = {
        focus: clampMinutes(saved.durations?.focus, 25, 180),
        short: clampMinutes(saved.durations?.short, 5, 60),
        long: clampMinutes(saved.durations?.long, 15, 120)
      };
      draftDurations = { ...durations };

      if (saved.timer && isMode(saved.timer.mode)) {
        const fallback = createTimer(saved.timer.mode, durationMs(saved.timer.mode));

        timer = {
          ...fallback,
          ...saved.timer,
          mode: saved.timer.mode,
          durationMs:
            typeof saved.timer.durationMs === 'number'
              ? saved.timer.durationMs
              : fallback.durationMs,
          remainingMs:
            typeof saved.timer.remainingMs === 'number'
              ? saved.timer.remainingMs
              : fallback.remainingMs,
          endsAt: typeof saved.timer.endsAt === 'number' ? saved.timer.endsAt : null,
          completedFocus:
            typeof saved.timer.completedFocus === 'number'
              ? Math.max(0, Math.min(4, saved.timer.completedFocus))
              : 0
        } as TimerState;

        if (timer.status === 'running') {
          timer = syncTimer(timer, Date.now());
        }
      }

      focusText = typeof saved.focusText === 'string' ? saved.focusText.slice(0, 80) : '';
      soundEnabled = saved.soundEnabled !== false;
      notificationsEnabled = saved.notificationsEnabled === true;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function clampMinutes(value: unknown, fallback: number, max: number) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;

    return Math.max(1, Math.min(max, Math.round(numeric)));
  }

  function isMode(value: unknown): value is PomodoroMode {
    return value === 'focus' || value === 'short' || value === 'long';
  }

  function updateDocumentTitle() {
    if (typeof document === 'undefined') return;

    if (timer.status === 'running' || timer.status === 'paused') {
      document.title = `${formatDuration(timer.remainingMs)} · ${MODE_META[timer.mode].label} — Module`;
      return;
    }

    document.title =
      timer.status === 'complete'
        ? `${MODE_META[timer.mode].label} complete — Module`
        : 'Pomodoro — Module';
  }

  function switchPomodoroMode(mode: PomodoroMode) {
    timer = switchMode(timer, mode, durationMs(mode));
    persist();
  }

  function start() {
    timer = startTimer(timer, Date.now());
    persist();
  }

  function pause() {
    timer = pauseTimer(timer, Date.now());
    persist();
  }

  function handlePrimary() {
    if (timer.status === 'running') {
      pause();
      return;
    }

    if (timer.status === 'complete') {
      const nextMode = getNextMode(timer);
      timer = switchMode(timer, nextMode, durationMs(nextMode));
    }

    start();
  }

  function handleReset() {
    timer = resetTimer(timer);
    persist();
  }

  function handleSkip() {
    switchPomodoroMode(getNextMode(timer));
  }

  function handleTick() {
    if (timer.status !== 'running') return;

    const previousStatus = timer.status;
    const nextTimer = syncTimer(timer, Date.now());
    timer = nextTimer;

    if (previousStatus === 'running' && nextTimer.status === 'complete') {
      persist();
      announceCompletion();
    }
  }

  function announceCompletion() {
    if (soundEnabled) playCompletionSound();

    if (
      notificationsEnabled &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      new Notification('Module Pomodoro', {
        body:
          timer.mode === 'focus'
            ? 'Focus complete. Take a break.'
            : 'Break complete. Ready to focus.'
      });
    }
  }

  function playCompletionSound() {
    if (typeof window === 'undefined') return;

    try {
      const AudioContextClass =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextClass) return;

      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.frequency.value = 620;
      gain.gain.value = 0.035;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();

      window.setTimeout(() => {
        oscillator.stop();
        void context.close();
      }, 180);
    } catch {
      // Sound is optional. Timer completion must not depend on Web Audio support.
    }
  }

  async function toggleNotifications() {
    if (notificationsEnabled) {
      notificationsEnabled = false;
      persist();
      return;
    }

    if (typeof Notification === 'undefined') return;

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      notificationsEnabled = permission === 'granted';
    } else {
      notificationsEnabled = Notification.permission === 'granted';
    }

    persist();
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    persist();
  }

  function openSettings() {
    draftDurations = { ...durations };
    settingsOpen = true;
  }

  function saveSettings() {
    durations = {
      focus: clampMinutes(draftDurations.focus, 25, 180),
      short: clampMinutes(draftDurations.short, 5, 60),
      long: clampMinutes(draftDurations.long, 15, 120)
    };

    if (timer.status === 'idle') {
      timer = switchMode(timer, timer.mode, durationMs(timer.mode));
    }

    settingsOpen = false;
    persist();
  }

  function updateFocusText(value: string) {
    focusText = value.slice(0, 80);
    persist();
  }

  onMount(() => {
    restore();
    hydrated = true;
    persist();
    updateDocumentTitle();

    const interval = window.setInterval(() => {
      handleTick();
      updateDocumentTitle();
    }, 250);

    const onVisibilityChange = () => {
      if (document.hidden || timer.status !== 'running') return;
      handleTick();
      updateDocumentTitle();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTyping || settingsOpen) return;

      if (event.code === 'Space') {
        event.preventDefault();
        handlePrimary();
      } else if (event.key.toLowerCase() === 'r') {
        handleReset();
      } else if (event.key.toLowerCase() === 's') {
        handleSkip();
      } else if (event.key === '1') {
        switchPomodoroMode('focus');
      } else if (event.key === '2') {
        switchPomodoroMode('short');
      } else if (event.key === '3') {
        switchPomodoroMode('long');
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('keydown', onKeyDown);
      document.title = 'Module — Useful tools. Nothing extra.';
    };
  });

  $effect(() => {
    timer.status;
    timer.remainingMs;
    timer.mode;
    updateDocumentTitle();
  });
</script>

<svelte:head>
  <meta
    name="description"
    content="A focused local Pomodoro timer with breaks, session cycles, and persistence."
  />
</svelte:head>

<section
  class="mx-auto flex min-h-[calc(100vh-68px)] max-w-[680px] flex-col items-center px-2 pb-12 pt-5 text-center max-[700px]:pt-2.5"
  style={`--pomodoro-accent: ${modeMeta.accent}; --pomodoro-soft: ${modeMeta.soft};`}
>
  <div class="mb-7 flex w-full items-start justify-between gap-4">
    <div class="text-left">
      <h1 class="m-0 text-[30px] font-[500] leading-none tracking-[-0.045em]">Pomodoro</h1>
      <p class="mt-2 text-[12px] font-normal text-muted-foreground">{modeMeta.copy}</p>
    </div>

    <Button
      variant="ghost"
      size="icon-sm"
      class="rounded-lg text-muted-foreground"
      aria-label="Timer settings"
      onclick={openSettings}
    >
      <Settings2 class="size-4" strokeWidth={1.7} />
    </Button>
  </div>

  <div
    class="mb-7 flex items-center gap-1 rounded-[13px] border bg-muted p-1"
    role="tablist"
    aria-label="Timer mode"
  >
    {#each ['focus', 'short', 'long'] as mode}
      {@const typedMode = mode as PomodoroMode}
      <button
        type="button"
        role="tab"
        aria-selected={timer.mode === typedMode}
        class={[
          'h-8 rounded-[9px] px-3 text-[12px] font-normal transition',
          timer.mode === typedMode
            ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(26,26,23,0.06)]'
            : 'text-muted-foreground hover:text-foreground'
        ]}
        onclick={() => switchPomodoroMode(typedMode)}
      >
        {MODE_META[typedMode].label}
      </button>
    {/each}
  </div>

  <div class="relative size-[min(70vw,310px)]">
    <svg class="size-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
      <circle
        cx="60"
        cy="60"
        r={RADIUS}
        fill="none"
        stroke="var(--muted)"
        stroke-opacity="0.12"
        stroke-width="8"
      />
      <circle
        cx="60"
        cy="60"
        r={RADIUS}
        fill="none"
        stroke="var(--pomodoro-accent)"
        stroke-width="8"
        stroke-linecap="round"
        stroke-dasharray={CIRCUMFERENCE}
        stroke-dashoffset={progressOffset}
        class="transition-[stroke-dashoffset] duration-200"
      />
    </svg>

    <div class="absolute inset-0 grid place-content-center">
      <div class="text-[clamp(58px,9vw,78px)] font-[420] leading-[0.9] tracking-[-0.055em] tabular-nums">
        {formattedTime}
      </div>
      <div class="mt-3 text-[12px] font-normal text-muted-foreground">
        {timer.status === 'running'
          ? modeMeta.label
          : timer.status === 'paused'
            ? 'Paused'
            : timer.status === 'complete'
              ? 'Complete'
              : 'Ready'}
      </div>
    </div>
  </div>

  {#if timer.mode === 'focus'}
    <div class="mt-4 w-full max-w-[360px]">
      <input
        class="w-full border-0 border-b border-transparent bg-transparent px-2 py-1.5 text-center text-[13px] font-normal outline-none placeholder:text-muted-foreground/60 hover:border-border focus:border-border"
        type="text"
        maxlength="80"
        value={focusText}
        placeholder="What are you focusing on?"
        aria-label="Focus label"
        oninput={(event) => updateFocusText(event.currentTarget.value)}
      />
    </div>
  {/if}

  <div class="mt-5">
    <Button class="h-[42px] min-w-[136px] rounded-xl px-5 text-[13px] font-medium shadow-none" onclick={handlePrimary}>
      {primaryLabel}
    </Button>
  </div>

  <div class="mt-2 flex items-center justify-center gap-1">
    <Button
      variant="ghost"
      size="sm"
      class="h-8 rounded-lg px-2.5 text-[12px] font-normal text-muted-foreground"
      onclick={handleReset}
    >
      <RotateCcw class="size-3.5" strokeWidth={1.7} />
      Reset
    </Button>

    <Button
      variant="ghost"
      size="sm"
      class="h-8 rounded-lg px-2.5 text-[12px] font-normal text-muted-foreground"
      onclick={handleSkip}
    >
      <SkipForward class="size-3.5" strokeWidth={1.7} />
      Skip
    </Button>
  </div>

  <div class="mt-5">
    <div class="flex items-center justify-center gap-2" aria-label="Focus cycle">
      {#each [0, 1, 2, 3] as index}
        <span
          class="size-1.5 rounded-full transition-colors"
          style={`background: ${index < timer.completedFocus ? modeMeta.accent : '#d7d7d1'};`}
        ></span>
      {/each}
    </div>
    <div class="mt-2 text-[11px] font-normal text-muted-foreground">
      {timer.completedFocus >= 4 ? 'Long break next' : `Focus ${Math.min(timer.completedFocus + 1, 4)} of 4`}
    </div>
  </div>

  {#if timer.status === 'complete'}
    <p class="mt-4 min-h-5 text-[12px] font-normal text-muted-foreground">
      <span class="font-medium text-foreground">
        {timer.mode === 'focus' ? 'Focus complete.' : 'Break complete.'}
      </span>
      {timer.mode === 'focus' ? ' Take a break.' : ' Ready for another focus block.'}
    </p>
  {/if}

  <div class="mt-7 flex items-center justify-center gap-2">
    <Button
      variant="outline"
      size="sm"
      class={[
        'h-8 rounded-lg px-2.5 text-[11px] font-normal shadow-none',
        soundEnabled ? 'bg-[var(--pomodoro-soft)]' : 'text-muted-foreground'
      ]}
      onclick={toggleSound}
    >
      {#if soundEnabled}
        <Volume2 class="size-3.5" strokeWidth={1.7} />
        Sound on
      {:else}
        <VolumeX class="size-3.5" strokeWidth={1.7} />
        Sound off
      {/if}
    </Button>

    <Button
      variant="outline"
      size="sm"
      class={[
        'h-8 rounded-lg px-2.5 text-[11px] font-normal shadow-none',
        notificationsEnabled ? 'bg-[var(--pomodoro-soft)]' : 'text-muted-foreground'
      ]}
      onclick={toggleNotifications}
    >
      {#if notificationsEnabled}
        <Bell class="size-3.5" strokeWidth={1.7} />
        Notifications on
      {:else}
        <BellOff class="size-3.5" strokeWidth={1.7} />
        Notifications off
      {/if}
    </Button>
  </div>

  <p class="mt-6 text-[10px] leading-5 text-muted-foreground/70 max-[620px]:hidden">
    Space start/pause · R reset · S skip · 1/2/3 switch mode
  </p>

  {#if settingsOpen}
    <div class="mt-7 w-full max-w-[390px] rounded-2xl border bg-card p-4 text-left shadow-[0_14px_34px_rgba(28,28,24,0.08)]">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="m-0 text-[14px] font-medium tracking-[-0.02em]">Timer durations</h2>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 rounded-lg px-2 text-[11px] font-normal text-muted-foreground"
          onclick={() => (settingsOpen = false)}
        >
          Close
        </Button>
      </div>

      <div class="grid gap-3">
        <label class="grid grid-cols-[1fr_90px] items-center gap-3 text-[12px]">
          Focus
          <Input
            type="number"
            min="1"
            max="180"
            class="h-8 text-right text-[12px]"
            bind:value={draftDurations.focus}
          />
        </label>

        <label class="grid grid-cols-[1fr_90px] items-center gap-3 text-[12px]">
          Short break
          <Input
            type="number"
            min="1"
            max="60"
            class="h-8 text-right text-[12px]"
            bind:value={draftDurations.short}
          />
        </label>

        <label class="grid grid-cols-[1fr_90px] items-center gap-3 text-[12px]">
          Long break
          <Input
            type="number"
            min="1"
            max="120"
            class="h-8 text-right text-[12px]"
            bind:value={draftDurations.long}
          />
        </label>
      </div>

      <p class="mt-3 text-[11px] leading-5 text-muted-foreground">
        Running and paused sessions keep their current duration.
      </p>

      <Button class="mt-4 h-9 w-full rounded-lg text-[12px] font-medium shadow-none" onclick={saveSettings}>
        Save
      </Button>
    </div>
  {/if}
</section>
