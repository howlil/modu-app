<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Bell,
    BellOff,
    History,
    Monitor,
    RotateCcw,
    Settings2,
    SkipForward,
    Volume2,
    VolumeX,
    X
  } from 'lucide-svelte';
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import {
    completeTimer,
    createTimer,
    getNextMode,
    getOvertimeMs,
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

  type FocusSession = {
    id: string;
    endedAt: number;
    durationMs: number;
    label: string;
  };

  type PomodoroPreferences = {
    autoStartBreaks: boolean;
    autoStartFocus: boolean;
    overtime: boolean;
    keepAwake: boolean;
  };

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

  const DEFAULT_PREFERENCES: PomodoroPreferences = {
    autoStartBreaks: false,
    autoStartFocus: false,
    overtime: true,
    keepAwake: false
  };

  let durations = $state<Record<PomodoroMode, number>>({ ...DEFAULT_DURATIONS });
  let draftDurations = $state<Record<PomodoroMode, number>>({ ...DEFAULT_DURATIONS });
  let preferences = $state<PomodoroPreferences>({ ...DEFAULT_PREFERENCES });
  let draftPreferences = $state<PomodoroPreferences>({ ...DEFAULT_PREFERENCES });
  let timer = $state<TimerState>(createTimer('focus', DEFAULT_DURATIONS.focus * 60_000));
  let focusText = $state('');
  let soundEnabled = $state(true);
  let notificationsEnabled = $state(false);
  let history = $state<FocusSession[]>([]);
  let settingsOpen = $state(false);
  let historyOpen = $state(false);
  let hydrated = $state(false);
  let wakeLock: { release: () => Promise<void> } | null = null;

  const modeMeta = $derived(MODE_META[timer.mode]);
  const overtimeMs = $derived(getOvertimeMs(timer, Date.now()));
  const formattedTime = $derived(
    timer.status === 'overtime'
      ? `+${formatDuration(overtimeMs)}`
      : formatDuration(timer.remainingMs)
  );
  const progressRatio = $derived(
    timer.status === 'overtime'
      ? 0
      : timer.durationMs > 0
        ? Math.max(0, Math.min(1, timer.remainingMs / timer.durationMs))
        : 0
  );
  const progressOffset = $derived(CIRCUMFERENCE * (1 - progressRatio));
  const todaySessions = $derived(history.filter((session) => isToday(session.endedAt)));
  const todayFocusMs = $derived(
    todaySessions.reduce((total, session) => total + session.durationMs, 0)
  );
  const primaryLabel = $derived(
    timer.status === 'running'
      ? 'Pause'
      : timer.status === 'paused'
        ? 'Resume'
        : timer.status === 'overtime'
          ? 'Start break'
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
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatFocusTotal(ms: number) {
    const totalMinutes = Math.round(ms / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  }

  function isToday(timestamp: number) {
    const date = new Date(timestamp);
    const today = new Date();

    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }

  function persist() {
    if (!hydrated || typeof localStorage === 'undefined') return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        timer,
        durations,
        preferences,
        focusText,
        soundEnabled,
        notificationsEnabled,
        history
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
        preferences?: Partial<PomodoroPreferences>;
        focusText?: string;
        soundEnabled?: boolean;
        notificationsEnabled?: boolean;
        history?: FocusSession[];
      };

      durations = {
        focus: clampMinutes(saved.durations?.focus, 25, 180),
        short: clampMinutes(saved.durations?.short, 5, 60),
        long: clampMinutes(saved.durations?.long, 15, 120)
      };
      draftDurations = { ...durations };

      preferences = {
        autoStartBreaks: saved.preferences?.autoStartBreaks === true,
        autoStartFocus: saved.preferences?.autoStartFocus === true,
        overtime: saved.preferences?.overtime !== false,
        keepAwake: saved.preferences?.keepAwake === true
      };
      draftPreferences = { ...preferences };

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
          overtimeStartedAt:
            typeof saved.timer.overtimeStartedAt === 'number'
              ? saved.timer.overtimeStartedAt
              : null,
          completedFocus:
            typeof saved.timer.completedFocus === 'number'
              ? Math.max(0, Math.min(4, saved.timer.completedFocus))
              : 0
        } as TimerState;

        if (timer.status === 'running') {
          timer = syncTimer(timer, Date.now(), preferences.overtime);
        }
      }

      focusText = typeof saved.focusText === 'string' ? saved.focusText.slice(0, 80) : '';
      soundEnabled = saved.soundEnabled !== false;
      notificationsEnabled = saved.notificationsEnabled === true;
      history = Array.isArray(saved.history)
        ? saved.history
            .filter(
              (session) =>
                typeof session?.endedAt === 'number' &&
                typeof session?.durationMs === 'number'
            )
            .slice(0, 120)
        : [];
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

    if (timer.status === 'overtime') {
      document.title = `+${formatDuration(getOvertimeMs(timer))} · Overtime — Module`;
      return;
    }

    if (timer.status === 'running' || timer.status === 'paused') {
      document.title = `${formatDuration(timer.remainingMs)} · ${MODE_META[timer.mode].label} — Module`;
      return;
    }

    document.title =
      timer.status === 'complete'
        ? `${MODE_META[timer.mode].label} complete — Module`
        : 'Pomodoro — Module';
  }

  function recordFocusSession(actualDurationMs: number) {
    const endedAt = Date.now();

    history = [
      {
        id: `${endedAt}-${history.length}`,
        endedAt,
        durationMs: Math.max(timer.durationMs, actualDurationMs),
        label: focusText.trim()
      },
      ...history
    ].slice(0, 120);

    persist();
  }

  function finalizeOvertimeSession() {
    if (timer.status !== 'overtime') return;
    recordFocusSession(timer.durationMs + getOvertimeMs(timer));
  }

  function switchPomodoroMode(mode: PomodoroMode) {
    finalizeOvertimeSession();
    timer = switchMode(timer, mode, durationMs(mode));
    void syncWakeLock();
    persist();
  }

  function start() {
    timer = startTimer(timer, Date.now());
    void syncWakeLock();
    persist();
  }

  function pause() {
    timer = pauseTimer(timer, Date.now());
    void syncWakeLock();
    persist();
  }

  function startNextMode() {
    const nextMode = getNextMode(timer);
    timer = switchMode(timer, nextMode, durationMs(nextMode));
    timer = startTimer(timer, Date.now());
    void syncWakeLock();
    persist();
  }

  function handlePrimary() {
    if (timer.status === 'running') {
      pause();
      return;
    }

    if (timer.status === 'overtime') {
      finalizeOvertimeSession();
      startNextMode();
      return;
    }

    if (timer.status === 'complete') {
      startNextMode();
      return;
    }

    start();
  }

  function handleReset() {
    finalizeOvertimeSession();
    timer = resetTimer(timer);
    void syncWakeLock();
    persist();
  }

  function handleSkip() {
    switchPomodoroMode(getNextMode(timer));
  }

  function handleTick() {
    if (timer.status === 'overtime') {
      updateDocumentTitle();
      return;
    }

    if (timer.status !== 'running') return;

    const previousTimer = timer;
    const nextTimer = syncTimer(timer, Date.now(), preferences.overtime);
    timer = nextTimer;

    if (previousTimer.status === 'running' && nextTimer.status === 'overtime') {
      announceCompletion();
      void syncWakeLock();
      persist();
      return;
    }

    if (previousTimer.status === 'running' && nextTimer.status === 'complete') {
      if (previousTimer.mode === 'focus') {
        recordFocusSession(previousTimer.durationMs);
      }

      announceCompletion();
      void syncWakeLock();
      persist();

      const shouldAutoStart =
        previousTimer.mode === 'focus'
          ? preferences.autoStartBreaks
          : preferences.autoStartFocus;

      if (shouldAutoStart) {
        startNextMode();
      }
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
            ? preferences.overtime && timer.status === 'overtime'
              ? 'Focus target reached. Overtime is running.'
              : 'Focus complete. Take a break.'
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
      // Sound is optional.
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
    draftPreferences = { ...preferences };
    settingsOpen = true;
  }

  function toggleDraftPreference(key: keyof PomodoroPreferences) {
    draftPreferences[key] = !draftPreferences[key];

    if (key === 'autoStartBreaks' && draftPreferences.autoStartBreaks) {
      draftPreferences.overtime = false;
    }

    if (key === 'overtime' && draftPreferences.overtime) {
      draftPreferences.autoStartBreaks = false;
    }
  }

  function saveSettings() {
    durations = {
      focus: clampMinutes(draftDurations.focus, 25, 180),
      short: clampMinutes(draftDurations.short, 5, 60),
      long: clampMinutes(draftDurations.long, 15, 120)
    };

    preferences = { ...draftPreferences };

    if (timer.status === 'idle') {
      timer = switchMode(timer, timer.mode, durationMs(timer.mode));
    }

    settingsOpen = false;
    void syncWakeLock();
    persist();
  }

  function updateFocusText(value: string) {
    focusText = value.slice(0, 80);
    persist();
  }

  async function requestWakeLock() {
    if (
      !preferences.keepAwake ||
      document.visibilityState !== 'visible' ||
      (timer.status !== 'running' && timer.status !== 'overtime') ||
      wakeLock
    ) {
      return;
    }

    try {
      const nav = navigator as Navigator & {
        wakeLock?: {
          request: (type: 'screen') => Promise<{ release: () => Promise<void> }>;
        };
      };

      if (!nav.wakeLock) return;
      wakeLock = await nav.wakeLock.request('screen');
    } catch {
      wakeLock = null;
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;

    try {
      await wakeLock.release();
    } catch {
      // Wake Lock is progressive enhancement.
    } finally {
      wakeLock = null;
    }
  }

  async function syncWakeLock() {
    if (
      preferences.keepAwake &&
      (timer.status === 'running' || timer.status === 'overtime')
    ) {
      await requestWakeLock();
      return;
    }

    await releaseWakeLock();
  }

  function clearHistory() {
    history = [];
    persist();
  }

  onMount(() => {
    restore();
    hydrated = true;
    persist();
    updateDocumentTitle();
    void syncWakeLock();

    const interval = window.setInterval(() => {
      handleTick();
      updateDocumentTitle();
    }, 250);

    const onVisibilityChange = () => {
      if (!document.hidden && timer.status === 'running') {
        handleTick();
      }

      void syncWakeLock();
      updateDocumentTitle();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (event.key === 'Escape') {
        settingsOpen = false;
        historyOpen = false;
        return;
      }

      if (isTyping || settingsOpen || historyOpen) return;

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
      void releaseWakeLock();
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
            : timer.status === 'overtime'
              ? 'Overtime'
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

    <button
      type="button"
      class="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-normal text-muted-foreground transition hover:bg-muted hover:text-foreground"
      onclick={() => (historyOpen = true)}
    >
      <History class="size-3" strokeWidth={1.7} />
      Today · {todaySessions.length} {todaySessions.length === 1 ? 'session' : 'sessions'} · {formatFocusTotal(todayFocusMs)}
    </button>
  </div>

  {#if timer.status === 'complete' || timer.status === 'overtime'}
    <p class="mt-4 min-h-5 text-[12px] font-normal text-muted-foreground">
      <span class="font-medium text-foreground">
        {timer.status === 'overtime'
          ? 'Focus target reached.'
          : timer.mode === 'focus'
            ? 'Focus complete.'
            : 'Break complete.'}
      </span>
      {timer.status === 'overtime'
        ? ' Continue while the flow lasts.'
        : timer.mode === 'focus'
          ? ' Take a break.'
          : ' Ready for another focus block.'}
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
    <div
      class="fixed inset-0 z-[100] grid place-items-center bg-foreground/[0.12] p-4 backdrop-blur-[3px]"
      role="presentation"
      onclick={(event) => {
        if (event.target === event.currentTarget) settingsOpen = false;
      }}
    >
      <div
        class="max-h-[min(720px,calc(100vh-32px))] w-full max-w-[410px] overflow-y-auto rounded-[18px] border border-white/[0.65] bg-background/[0.96] p-4 text-left shadow-[0_24px_70px_rgba(28,28,24,0.16)] backdrop-blur-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pomodoro-settings-title"
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 id="pomodoro-settings-title" class="m-0 text-[14px] font-medium tracking-[-0.02em]">
            Pomodoro settings
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            class="rounded-lg text-muted-foreground"
            aria-label="Close settings"
            onclick={() => (settingsOpen = false)}
          >
            <X class="size-4" strokeWidth={1.7} />
          </Button>
        </div>

        <div class="mb-5">
          <div class="mb-3 text-[11px] font-medium text-muted-foreground">Durations</div>
          <div class="grid gap-3">
            <label class="grid grid-cols-[1fr_90px] items-center gap-3 text-[12px]">
              Focus
              <Input type="number" min="1" max="180" class="h-8 text-right text-[12px]" bind:value={draftDurations.focus} />
            </label>
            <label class="grid grid-cols-[1fr_90px] items-center gap-3 text-[12px]">
              Short break
              <Input type="number" min="1" max="60" class="h-8 text-right text-[12px]" bind:value={draftDurations.short} />
            </label>
            <label class="grid grid-cols-[1fr_90px] items-center gap-3 text-[12px]">
              Long break
              <Input type="number" min="1" max="120" class="h-8 text-right text-[12px]" bind:value={draftDurations.long} />
            </label>
          </div>
        </div>

        <div class="border-t pt-4">
          <div class="mb-2 text-[11px] font-medium text-muted-foreground">Session flow</div>

          {#each [
            ['autoStartBreaks', 'Auto-start breaks'],
            ['autoStartFocus', 'Auto-start focus'],
            ['overtime', 'Continue counting overtime'],
            ['keepAwake', 'Keep screen awake']
          ] as option}
            {@const key = option[0] as keyof PomodoroPreferences}
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-lg px-1 py-2 text-left text-[12px]"
              onclick={() => toggleDraftPreference(key)}
            >
              <span class="inline-flex items-center gap-2">
                {#if key === 'keepAwake'}
                  <Monitor class="size-3.5 text-muted-foreground" strokeWidth={1.7} />
                {/if}
                {option[1]}
              </span>
              <span
                class={[
                  'relative h-5 w-9 rounded-full transition-colors',
                  draftPreferences[key] ? 'bg-primary' : 'bg-muted'
                ]}
                aria-hidden="true"
              >
                <span
                  class={[
                    'absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform',
                    draftPreferences[key] ? 'translate-x-[18px]' : 'translate-x-0.5'
                  ]}
                ></span>
              </span>
            </button>
          {/each}
        </div>

        <p class="mt-3 text-[10px] leading-4 text-muted-foreground">
          Overtime and auto-start breaks are mutually exclusive. Wake Lock works only in supported browsers.
        </p>

        <Button class="mt-4 h-9 w-full rounded-lg text-[12px] font-medium shadow-none" onclick={saveSettings}>
          Save
        </Button>
      </div>
    </div>
  {/if}

  {#if historyOpen}
    <div
      class="fixed inset-0 z-[100] grid place-items-center bg-foreground/[0.12] p-4 backdrop-blur-[3px]"
      role="presentation"
      onclick={(event) => {
        if (event.target === event.currentTarget) historyOpen = false;
      }}
    >
      <div
        class="max-h-[min(620px,calc(100vh-32px))] w-full max-w-[410px] overflow-y-auto rounded-[18px] border border-white/[0.65] bg-background/[0.96] p-4 text-left shadow-[0_24px_70px_rgba(28,28,24,0.16)] backdrop-blur-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pomodoro-history-title"
      >
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 id="pomodoro-history-title" class="m-0 text-[14px] font-medium tracking-[-0.02em]">Focus history</h2>
            <p class="mt-1 text-[11px] text-muted-foreground">
              Today · {todaySessions.length} {todaySessions.length === 1 ? 'session' : 'sessions'} · {formatFocusTotal(todayFocusMs)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            class="rounded-lg text-muted-foreground"
            aria-label="Close history"
            onclick={() => (historyOpen = false)}
          >
            <X class="size-4" strokeWidth={1.7} />
          </Button>
        </div>

        {#if history.length === 0}
          <div class="rounded-xl border border-dashed px-4 py-8 text-center text-[12px] text-muted-foreground">
            Completed focus sessions will appear here.
          </div>
        {:else}
          <div class="divide-y">
            {#each history.slice(0, 20) as session}
              <div class="flex items-center justify-between gap-4 py-3">
                <div class="min-w-0">
                  <div class="truncate text-[12px] font-normal text-foreground">
                    {session.label || 'Focus session'}
                  </div>
                  <div class="mt-1 text-[10px] text-muted-foreground">
                    {new Date(session.endedAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
                <div class="shrink-0 text-[11px] text-muted-foreground">
                  {formatFocusTotal(session.durationMs)}
                </div>
              </div>
            {/each}
          </div>

          <Button
            variant="ghost"
            size="sm"
            class="mt-3 h-8 w-full rounded-lg text-[11px] font-normal text-muted-foreground"
            onclick={clearHistory}
          >
            Clear history
          </Button>
        {/if}
      </div>
    </div>
  {/if}
</section>
