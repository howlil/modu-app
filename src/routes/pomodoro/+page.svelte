<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ArrowLeft, Check, ChevronRight, Download, Pencil, RotateCcw, Settings2, SkipForward, Trash2 } from 'lucide-svelte';
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import ToolHeader from '#lib/components/ToolHeader.svelte';
  import { createWakeLockController } from '#lib/modules/pomodoro/wake-lock.ts';
  import ActivityView from '#lib/modules/pomodoro/components/ActivityView.svelte';
  import FocusProtectionSettings from '#lib/modules/pomodoro/components/FocusProtectionSettings.svelte';
  import {
    clearFocusSessions,
    loadFocusSessions,
    localDateKey,
    migrateLegacySessions,
    saveFocusSession,
    saveFocusSessions,
    type FocusActivitySession,
    type GoalSchedule,
    type LegacyFocusSession
  } from '#lib/modules/pomodoro/activity.ts';
  import {
    normalizeBlocklist,
    pingFocusProtection,
    setFocusProtectionEnabled,
    startFocusProtection,
    stopFocusProtection,
    syncFocusProtectionBlocklist,
    type FocusProtectionConnection,
    type FocusProtectionExtensionStatus
  } from '#lib/modules/pomodoro/focus-protection.ts';
  import {
    DEFAULT_RINGTONE,
    RINGTONE_OPTIONS,
    isPomodoroRingtone,
    playPomodoroRingtone,
    type PomodoroRingtone
  } from '#lib/modules/pomodoro/sounds.ts';
  import {
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

  import {
    readPomodoroSnapshot,
    savePomodoroSnapshot,
    clearPomodoroSnapshot,
    normalizePomodoroSnapshot,
    clampMinutes,
    clampGoalHours
  } from '#lib/modules/pomodoro/persistence.ts';

  type PomodoroView = 'timer' | 'activity' | 'settings';
  type SettingsPanel = 'main' | 'blocked-sites' | 'ringtone' | 'data';

  type PomodoroPreferences = {
    autoStartBreaks: boolean;
    autoStartFocus: boolean;
    overtime: boolean;
    keepAwake: boolean;
  };

  const MODE_META: Record<
    PomodoroMode,
    { label: string; shortLabel: string; copy: string; accent: string; soft: string }
  > = {
    focus: {
      label: 'Focus',
      shortLabel: 'Focus',
      copy: 'One focus block. Nothing else.',
      accent: '#2468f2',
      soft: '#eaf1ff'
    },
    short: {
      label: 'Short break',
      shortLabel: 'Short',
      copy: 'Step away for a few minutes.',
      accent: '#4f8e72',
      soft: '#edf6f1'
    },
    long: {
      label: 'Long break',
      shortLabel: 'Long',
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

  let activeView = $state<PomodoroView>('timer');
  let durations = $state<Record<PomodoroMode, number>>({ ...DEFAULT_DURATIONS });
  let preferences = $state<PomodoroPreferences>({ ...DEFAULT_PREFERENCES });
  let timer = $state<TimerState>(createTimer('focus', DEFAULT_DURATIONS.focus * 60_000));
  let sessionStartedAt = $state<number | null>(null);
  let focusText = $state('');
  let focusDraft = $state('');
  let focusEditing = $state(false);
  let focusInput = $state<HTMLInputElement | null>(null);
  let soundEnabled = $state(true);
  let ringtone = $state<PomodoroRingtone>(DEFAULT_RINGTONE);
  let notificationsEnabled = $state(false);
  let notificationsSupported = $state(false);
  let wakeLockSupported = $state(false);
  let focusProtectionEnabled = $state(false);
  let blockedDomains = $state<string[]>([]);
  let focusProtectionConnection = $state<FocusProtectionConnection>('checking');
  let focusProtectionError = $state('');
  let dailyGoalHours = $state(8);
  let goalSchedule = $state<GoalSchedule>('weekdays');
  let activitySessions = $state<FocusActivitySession[]>([]);
  let legacyHistory = $state<LegacyFocusSession[]>([]);
  let settingsPanel = $state<SettingsPanel>('main');
  let deleteConfirm = $state(false);
  let dataMessage = $state('');
  let hydrated = $state(false);
  let clockNow = $state(Date.now());
  const { sync: syncWakeLock, release: releaseWakeLock } = createWakeLockController(
    () => preferences.keepAwake,
    () => wakeLockSupported,
    () => timer.status
  );

  $effect(() => {
    if (activeView !== 'settings') {
      settingsPanel = 'main';
      deleteConfirm = false;
      dataMessage = '';
    }
  });

  const modeMeta = $derived(MODE_META[timer.mode]);
  const overtimeMs = $derived(getOvertimeMs(timer, clockNow));
  const formattedTime = $derived(
    timer.status === 'overtime'
      ? `+${formatDuration(overtimeMs)}`
      : formatDuration(timer.remainingMs)
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
  const goalMs = $derived(dailyGoalHours * 3_600_000);
  const todayKey = $derived(localDateKey(clockNow));
  const todayFocusMs = $derived(
    activitySessions
      .filter((session) => localDateKey(session.endedAt) === todayKey)
      .reduce((total, session) => total + session.actualDurationMs, 0)
  );
  const protectionTimerLabel = $derived(
    !focusProtectionEnabled ||
      timer.mode !== 'focus' ||
      !['running', 'paused', 'overtime'].includes(timer.status)
      ? ''
      : blockedDomains.length === 0
        ? 'No blocked sites'
        : focusProtectionConnection === 'active'
          ? 'Protected'
          : focusProtectionConnection === 'checking' || focusProtectionConnection === 'ready'
            ? 'Protection starting…'
            : 'Protection unavailable'
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

  function persist() {
    if (!hydrated) return;

    savePomodoroSnapshot({
      timer,
      durations,
      preferences,
      focusText,
      soundEnabled,
      ringtone,
      notificationsEnabled,
      focusProtection: {
        enabled: focusProtectionEnabled,
        blockedDomains
      },
      sessionStartedAt,
      dailyGoalHours,
      goalSchedule
    });
  }

  function restore() {
    try {
      const saved = readPomodoroSnapshot();
      if (!saved) return;

      const restored = normalizePomodoroSnapshot(saved, clockNow);
      durations = restored.durations;
      preferences = restored.preferences;
      dailyGoalHours = restored.dailyGoalHours;
      goalSchedule = restored.goalSchedule;
      timer = restored.timer;
      sessionStartedAt = restored.sessionStartedAt;
      focusText = restored.focusText;
      focusDraft = restored.focusText;
      soundEnabled = restored.soundEnabled;
      ringtone = restored.ringtone;
      notificationsEnabled = restored.notificationsEnabled;
      focusProtectionEnabled = restored.focusProtectionEnabled;
      blockedDomains = restored.blockedDomains;
      legacyHistory = restored.legacyHistory;
    } catch {
      clearPomodoroSnapshot();
    }
  }

  async function loadActivity() {
    if (legacyHistory.length > 0) {
      await saveFocusSessions(migrateLegacySessions(legacyHistory, goalMs));
      legacyHistory = [];
      persist();
    }

    activitySessions = await loadFocusSessions();
  }

  function applyProtectionStatus(status: FocusProtectionExtensionStatus | null) {
    if (!status) return;
    focusProtectionConnection = status.active ? 'active' : 'ready';
    focusProtectionError = '';
  }

  function currentFocusSessionId() {
    return `focus-${sessionStartedAt ?? Date.now()}`;
  }

  async function syncFocusProtection(currentTimer = timer) {
    if (
      focusProtectionConnection === 'missing' ||
      focusProtectionConnection === 'checking'
    ) {
      return;
    }

    try {
      if (
        !focusProtectionEnabled ||
        currentTimer.mode !== 'focus' ||
        !['running', 'paused', 'overtime'].includes(currentTimer.status)
      ) {
        const response = await stopFocusProtection();
        if (!response.ok) throw new Error(response.error || 'Unable to stop protection.');
        applyProtectionStatus(response.data ?? null);
        return;
      }

      const startedAt = sessionStartedAt ?? Date.now();
      if (sessionStartedAt === null) sessionStartedAt = startedAt;

      const response = await startFocusProtection({
        sessionId: currentFocusSessionId(),
        startedAt,
        endsAt: currentTimer.status === 'running' ? currentTimer.endsAt : null,
        overtimeEnabled:
          currentTimer.status === 'overtime' || preferences.overtime
      });

      if (!response.ok) {
        throw new Error(response.error || 'Unable to start protection.');
      }

      applyProtectionStatus(response.data ?? null);
    } catch (error) {
      focusProtectionConnection = 'error';
      focusProtectionError =
        error instanceof Error ? error.message : 'Focus protection unavailable.';
    }
  }

  async function connectFocusProtection() {
    focusProtectionConnection = 'checking';
    focusProtectionError = '';

    const detected = await pingFocusProtection();

    if (!detected) {
      focusProtectionConnection = 'missing';
      return;
    }

    try {
      const blocklistResponse = await syncFocusProtectionBlocklist(blockedDomains);
      if (!blocklistResponse.ok) {
        throw new Error(blocklistResponse.error || 'Unable to sync blocked websites.');
      }

      const enabledResponse = await setFocusProtectionEnabled(focusProtectionEnabled);
      if (!enabledResponse.ok) {
        throw new Error(enabledResponse.error || 'Unable to sync focus protection.');
      }

      applyProtectionStatus(enabledResponse.data ?? detected);

      if (focusProtectionEnabled) {
        await syncFocusProtection(timer);
      }
    } catch (error) {
      focusProtectionConnection = 'error';
      focusProtectionError =
        error instanceof Error ? error.message : 'Focus protection unavailable.';
    }
  }

  async function toggleFocusProtection() {
    if (
      focusProtectionConnection === 'checking' ||
      focusProtectionConnection === 'missing'
    ) {
      return;
    }

    const nextEnabled = !focusProtectionEnabled;
    focusProtectionEnabled = nextEnabled;
    persist();

    try {
      const response = await setFocusProtectionEnabled(nextEnabled);
      if (!response.ok) throw new Error(response.error || 'Unable to update protection.');

      applyProtectionStatus(response.data ?? null);

      if (nextEnabled) {
        const blocklistResponse = await syncFocusProtectionBlocklist(blockedDomains);
        if (!blocklistResponse.ok) {
          throw new Error(blocklistResponse.error || 'Unable to sync blocked websites.');
        }

        await syncFocusProtection(timer);
      }
    } catch (error) {
      focusProtectionConnection = 'error';
      focusProtectionError =
        error instanceof Error ? error.message : 'Focus protection unavailable.';
    }
  }

  async function updateBlockedDomains(domains: string[]) {
    blockedDomains = normalizeBlocklist(domains);
    persist();

    if (
      focusProtectionConnection === 'checking' ||
      focusProtectionConnection === 'missing'
    ) {
      return;
    }

    try {
      const response = await syncFocusProtectionBlocklist(blockedDomains);
      if (!response.ok) {
        throw new Error(response.error || 'Unable to sync blocked websites.');
      }

      applyProtectionStatus(response.data ?? null);
    } catch (error) {
      focusProtectionConnection = 'error';
      focusProtectionError =
        error instanceof Error ? error.message : 'Focus protection unavailable.';
    }
  }

  function openSettingsPage() {
    settingsPanel = 'main';
    deleteConfirm = false;
    dataMessage = '';
    activeView = 'settings';
  }

  function openSettingsPanel(panel: SettingsPanel) {
    settingsPanel = panel;
    deleteConfirm = false;
    dataMessage = '';
  }

  function updateDocumentTitle() {
    if (typeof document === 'undefined') return;

    if (activeView === 'activity') {
      document.title = 'Pomodoro Activity — Module';
      return;
    }

    if (activeView === 'settings') {
      document.title = 'Pomodoro Settings — Module';
      return;
    }

    if (timer.status === 'overtime') {
      document.title = `+${formatDuration(getOvertimeMs(timer, clockNow))} · Overtime — Module`;
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

  function newSessionId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function recordFocusSession(
    plannedDurationMs: number,
    actualDurationMs: number,
    overtimeDurationMs: number
  ) {
    const endedAt = Date.now();
    const session: FocusActivitySession = {
      id: newSessionId(),
      startedAt: sessionStartedAt ?? endedAt - actualDurationMs,
      endedAt,
      plannedDurationMs,
      actualDurationMs: Math.max(plannedDurationMs, actualDurationMs),
      overtimeMs: Math.max(0, overtimeDurationMs),
      label: focusText.trim(),
      goalMs,
      status: 'completed'
    };

    sessionStartedAt = null;
    activitySessions = [session, ...activitySessions].sort((a, b) => b.endedAt - a.endedAt);
    void saveFocusSession(session);
    persist();
  }

  function finalizeOvertimeSession() {
    if (timer.status !== 'overtime') return;

    const overtimeDurationMs = getOvertimeMs(timer);
    recordFocusSession(
      timer.durationMs,
      timer.durationMs + overtimeDurationMs,
      overtimeDurationMs
    );
  }

  function switchPomodoroMode(mode: PomodoroMode) {
    finalizeOvertimeSession();
    timer = switchMode(timer, mode, durationMs(mode));
    sessionStartedAt = null;
    void syncWakeLock();
    void syncFocusProtection(timer);
    persist();
  }

  function start() {
    if (timer.mode === 'focus' && timer.status === 'idle' && sessionStartedAt === null) {
      sessionStartedAt = Date.now();
    }

    timer = startTimer(timer, Date.now());
    void syncWakeLock();
    void syncFocusProtection(timer);
    persist();
  }

  function pause() {
    timer = pauseTimer(timer, Date.now());
    void syncWakeLock();
    void syncFocusProtection(timer);
    persist();
  }

  function startNextMode() {
    const nextMode = getNextMode(timer);
    timer = switchMode(timer, nextMode, durationMs(nextMode));
    sessionStartedAt = nextMode === 'focus' ? Date.now() : null;
    timer = startTimer(timer, Date.now());
    void syncWakeLock();
    void syncFocusProtection(timer);
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
    sessionStartedAt = null;
    void syncWakeLock();
    void syncFocusProtection(timer);
    persist();
  }

  function handleSkip() {
    switchPomodoroMode(getNextMode(timer));
  }

  function handleTick() {
    clockNow = Date.now();

    if (timer.status === 'overtime') {
      updateDocumentTitle();
      return;
    }

    if (timer.status !== 'running') return;

    const previousTimer = timer;
    const nextTimer = syncTimer(timer, clockNow, preferences.overtime);
    timer = nextTimer;

    if (previousTimer.status === 'running' && nextTimer.status === 'overtime') {
      announceCompletion();
      void syncWakeLock();
      void syncFocusProtection(nextTimer);
      persist();
      return;
    }

    if (previousTimer.status === 'running' && nextTimer.status === 'complete') {
      if (previousTimer.mode === 'focus') {
        recordFocusSession(previousTimer.durationMs, previousTimer.durationMs, 0);
      }

      announceCompletion();
      void syncWakeLock();
      void syncFocusProtection(nextTimer);
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
    if (soundEnabled) void playPomodoroRingtone(ringtone);

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

  async function toggleNotifications() {
    if (!notificationsSupported) return;

    if (notificationsEnabled) {
      notificationsEnabled = false;
      persist();
      return;
    }

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

  function selectRingtone(nextRingtone: PomodoroRingtone) {
    ringtone = nextRingtone;
    soundEnabled = true;
    persist();
    void playPomodoroRingtone(nextRingtone);
  }

  function downloadFile(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportAllPomodoroData() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      timer,
      durations,
      preferences,
      focusText,
      sound: {
        enabled: soundEnabled,
        ringtone
      },
      notificationsEnabled,
      focusProtection: {
        enabled: focusProtectionEnabled,
        blockedDomains
      },
      dailyGoal: {
        hours: dailyGoalHours,
        schedule: goalSchedule
      },
      activitySessions
    };

    downloadFile(
      'module-pomodoro-backup.json',
      JSON.stringify(payload, null, 2),
      'application/json'
    );

    dataMessage = 'Exported all Pomodoro data.';
  }

  async function deleteAllPomodoroData() {
    if (
      focusProtectionConnection !== 'missing' &&
      focusProtectionConnection !== 'checking'
    ) {
      try {
        await stopFocusProtection();
        await setFocusProtectionEnabled(false);
        await syncFocusProtectionBlocklist([]);
      } catch {
        // Local deletion must still succeed if the optional extension is unavailable.
      }
    }

    await releaseWakeLock();
    await clearFocusSessions();

    clearPomodoroSnapshot();

    durations = { ...DEFAULT_DURATIONS };
    preferences = { ...DEFAULT_PREFERENCES };
    timer = createTimer('focus', DEFAULT_DURATIONS.focus * 60_000);
    sessionStartedAt = null;
    focusText = '';
    focusDraft = '';
    focusEditing = false;
    soundEnabled = true;
    ringtone = DEFAULT_RINGTONE;
    notificationsEnabled = false;
    focusProtectionEnabled = false;
    blockedDomains = [];
    focusProtectionError = '';
    dailyGoalHours = 8;
    goalSchedule = 'weekdays';
    activitySessions = [];
    legacyHistory = [];
    activeView = 'timer';
    deleteConfirm = false;
    dataMessage = 'All Pomodoro data deleted.';
    updateDocumentTitle();
  }

  function togglePreference(key: keyof PomodoroPreferences) {
    const nextValue = !preferences[key];

    preferences = {
      ...preferences,
      [key]: nextValue
    };

    if (key === 'autoStartBreaks' && nextValue) {
      preferences = { ...preferences, overtime: false };
    }

    if (key === 'overtime' && nextValue) {
      preferences = { ...preferences, autoStartBreaks: false };
    }

    if (key === 'keepAwake' && !wakeLockSupported) {
      preferences = { ...preferences, keepAwake: false };
    }

    void syncWakeLock();
    void syncFocusProtection(timer);
    persist();
  }

  function updateDuration(mode: PomodoroMode, value: string | number) {
    const fallback = DEFAULT_DURATIONS[mode];
    const max = mode === 'focus' ? 180 : mode === 'short' ? 60 : 120;
    const minutes = clampMinutes(value, fallback, max);

    durations = { ...durations, [mode]: minutes };

    if (timer.status === 'idle' && timer.mode === mode) {
      timer = switchMode(timer, mode, minutes * 60_000);
    }

    persist();
  }

  async function beginFocusEdit() {
    focusDraft = focusText;
    focusEditing = true;
    await tick();
    focusInput?.focus();
    focusInput?.select();
  }

  function commitFocusEdit() {
    focusText = focusDraft.trim().slice(0, 80);
    focusDraft = focusText;
    focusEditing = false;
    persist();
  }

  function cancelFocusEdit() {
    focusDraft = focusText;
    focusEditing = false;
  }

  function updateGoal(hours: number, schedule: GoalSchedule) {
    dailyGoalHours = clampGoalHours(hours);
    goalSchedule = schedule;
    persist();
  }

  onMount(() => {
    notificationsSupported = typeof Notification !== 'undefined';
    wakeLockSupported = 'wakeLock' in navigator;

    restore();

    if (!notificationsSupported) notificationsEnabled = false;
    if (!wakeLockSupported) preferences = { ...preferences, keepAwake: false };

    hydrated = true;
    void loadActivity().then(() => persist());
    void connectFocusProtection();
    updateDocumentTitle();
    void syncWakeLock();

    const interval = window.setInterval(() => {
      handleTick();
      updateDocumentTitle();
    }, 250);

    const onVisibilityChange = () => {
      if (document.hidden) {
        void releaseWakeLock();
        return;
      }

      if (timer.status === 'running') {
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
        if (focusEditing) {
          cancelFocusEdit();
          return;
        }

        if (activeView === 'settings' && settingsPanel !== 'main') {
          openSettingsPanel('main');
          return;
        }

        if (activeView === 'settings') return;
        return;
      }

      if (isTyping || activeView !== 'timer') return;

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
    clockNow;
    activeView;
    updateDocumentTitle();
  });
</script>

<svelte:head>
  <meta
    name="description"
    content="A local Pomodoro timer with focus goals, activity heatmap, and session history."
  />
</svelte:head>

<section
  class="mx-auto min-h-[calc(100vh-76px)] w-full max-w-[1180px] px-4 pb-8 pt-8 max-[760px]:px-2.5 max-[760px]:pt-6"
  style={`--pomodoro-accent: ${modeMeta.accent}; --pomodoro-soft: ${modeMeta.soft};`}
>
  <div class="mx-auto mb-6 w-full max-w-[860px] min-w-0">
    <ToolHeader title="Pomodoro" />

    <Tabs.Root bind:value={activeView} class="gap-0">
      <Tabs.List
        variant="default"
        class="-mt-2 h-9 w-full min-w-0 justify-start rounded-full bg-muted/65 p-1"
      >
        <Tabs.Trigger
          value="timer"
          class="h-7 flex-none rounded-full px-3 py-0 text-meta font-normal data-[state=active]:font-medium data-[state=active]:shadow-none"
        >
          Timer
        </Tabs.Trigger>
        <Tabs.Trigger
          value="activity"
          class="h-7 flex-none rounded-full px-3 py-0 text-meta font-normal data-[state=active]:font-medium data-[state=active]:shadow-none"
        >
          Activity
        </Tabs.Trigger>

        <Tabs.Trigger
          value="settings"
          class="ml-auto size-7 flex-none rounded-full p-0 after:hidden data-[state=active]:bg-background data-[state=active]:shadow-none"
          aria-label="Pomodoro settings"
          title="Settings"
          onclick={openSettingsPage}
        >
          <Settings2 class="size-4" strokeWidth={1.7} />
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  </div>

  <div class="mx-auto w-full max-w-[860px] min-w-0">
  {#if activeView === 'timer'}
    <div class="grid min-w-0 grid-cols-12 gap-3">
      <Card.Root class="col-span-12 gap-0 overflow-hidden rounded-[20px] bg-[radial-gradient(ellipse_at_50%_0%,#eaf1ff_0%,#f7faff_34%,#ffffff_77%)] py-0 shadow-none lg:col-span-8">
        <div class="flex min-h-[456px] flex-col items-center px-3 pb-6 pt-8 text-center sm:px-6">
          <div class="flex items-center gap-1 rounded-full border border-border bg-white/85 p-1" role="group" aria-label="Timer mode">
            {#each ['focus', 'short', 'long'] as mode}
              {@const typedMode = mode as PomodoroMode}
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={timer.mode === typedMode}
                class={timer.mode === typedMode
                  ? 'h-[30px] rounded-full bg-secondary px-4 text-meta font-medium text-secondary-foreground shadow-none hover:bg-secondary'
                  : 'h-[30px] rounded-full px-4 text-meta font-normal text-muted-foreground shadow-none'}
                onclick={() => switchPomodoroMode(typedMode)}
              >
                {MODE_META[typedMode].shortLabel}
              </Button>
            {/each}
          </div>

          <div
            class="mb-2 mt-12 max-w-full whitespace-nowrap text-[clamp(76px,10vw,122px)] font-normal leading-none tracking-[-0.075em] tabular-nums max-[420px]:text-[clamp(70px,17vw,92px)]"
            role="timer"
            aria-label={'Time remaining: ' + formattedTime}
          >
            {formattedTime}
          </div>

          <div class="flex min-h-4 items-center justify-center gap-1 text-meta text-muted-foreground">
            <span>
              {timer.status === 'paused'
                ? 'Paused'
                : timer.status === 'overtime'
                  ? 'Overtime'
                  : timer.status === 'complete'
                    ? 'Complete'
                    : timer.status === 'idle' ? '' : modeMeta.label}
            </span>
            {#if protectionTimerLabel}
              <span>· {protectionTimerLabel}</span>
            {/if}
          </div>

          <div class="mt-1 flex h-14 w-full max-w-[330px] items-center justify-center">
            {#if timer.mode === 'focus'}
              {#if focusEditing}
                <Input
                  bind:ref={focusInput}
                  class="w-full max-w-[300px] rounded-none border-0 border-b border-border bg-transparent px-2 py-2 text-center text-ui font-normal shadow-none focus-visible:ring-0"
                  type="text"
                  maxlength={80}
                  bind:value={focusDraft}
                  placeholder="What are you focusing on?"
                  aria-label="Focus label"
                  onblur={commitFocusEdit}
                  onkeydown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitFocusEdit();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelFocusEdit();
                    }
                  }}
                />
              {:else}
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-auto max-w-full rounded-full px-3 py-2 text-meta font-normal text-muted-foreground shadow-none"
                  onclick={beginFocusEdit}
                >
                  <span class="truncate">{focusText || '+ Add focus'}</span>
                  {#if focusText}
                    <Pencil class="size-3 shrink-0 opacity-60" strokeWidth={1.7} />
                  {/if}
                </Button>
              {/if}
            {/if}
          </div>

          <div class="mt-1 flex items-center justify-center gap-3">
            <Button
              variant="ghost"
              size="icon-lg"
              class="size-10 rounded-full text-muted-foreground shadow-none"
              aria-label="Reset timer"
              title="Reset (R)"
              onclick={handleReset}
            >
              <RotateCcw class="size-[17px]" strokeWidth={1.7} />
            </Button>
            <Button
              class="h-11 min-w-[144px] rounded-full px-6 text-ui font-semibold shadow-none"
              onclick={handlePrimary}
            >
              {primaryLabel}
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              class="size-10 rounded-full text-muted-foreground shadow-none"
              aria-label="Skip session"
              title="Skip (S)"
              onclick={handleSkip}
            >
              <SkipForward class="size-[17px]" strokeWidth={1.7} />
            </Button>
          </div>

          {#if timer.status === 'complete' || timer.status === 'overtime'}
            <p class="mt-3 text-meta text-muted-foreground">
              {timer.status === 'overtime' ? 'Focus target reached.' : timer.mode === 'focus' ? 'Focus complete.' : 'Break complete.'}
            </p>
          {/if}
          <div class="mt-auto pt-6 text-meta text-muted-foreground">Your focus, your pace.</div>
        </div>
      </Card.Root>

      <div class="col-span-12 grid min-w-0 grid-cols-2 gap-3 lg:col-span-4 lg:grid-cols-1">
        <Card.Root class="min-w-0 justify-between gap-3 rounded-[20px] p-4 shadow-none sm:p-5">
          <div class="flex items-center justify-between">
            <h2 class="m-0 text-meta font-medium text-muted-foreground">TODAY</h2>
            <Button
              size="icon-xs"
              variant="ghost"
              class="rounded-full text-muted-foreground"
              aria-label="View focus activity"
              onclick={() => (activeView = 'activity')}
            >
              <ChevronRight class="size-4" strokeWidth={1.7} />
            </Button>
          </div>
          <div>
            <strong class="block whitespace-nowrap text-[clamp(24px,4vw,36px)] font-normal tracking-[-0.05em] tabular-nums">{formatFocusTotal(todayFocusMs)}</strong>
            <span class="text-meta text-muted-foreground">Focused time</span>
          </div>
          <div>
            <div
              class="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Today's focus goal"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.min(100, Math.round((todayFocusMs / goalMs) * 100))}
            >
              <div class="h-full rounded-full bg-primary transition-[width]" style:width={Math.min(100, (todayFocusMs / goalMs) * 100) + '%'}></div>
            </div>
            <div class="mt-2 flex flex-wrap justify-between gap-1 text-meta text-muted-foreground">
              <span>{Math.round((todayFocusMs / goalMs) * 100)}% of goal</span>
              <span>{dailyGoalHours}h target</span>
            </div>
          </div>
        </Card.Root>

        <Card.Root class="min-w-0 justify-between gap-3 rounded-[20px] p-4 shadow-none sm:p-5">
          <div class="flex items-center justify-between gap-2">
            <h2 class="m-0 text-meta font-medium text-muted-foreground">CURRENT CYCLE</h2>
          </div>
          <div>
            <div class="text-title-lg font-medium tabular-nums">
              {Math.min(timer.completedFocus + 1, 4)}
              <span class="text-ui font-normal text-muted-foreground">/ 4 sessions</span>
            </div>
            <div class="mt-3 flex items-center gap-2" aria-label={timer.completedFocus + ' of 4 focus sessions completed'}>
              {#each [0, 1, 2, 3] as index}
                <span class={index < timer.completedFocus ? 'h-[7px] flex-1 rounded-full bg-primary' : 'h-[7px] flex-1 rounded-full bg-border'} aria-hidden="true"></span>
              {/each}
            </div>
          </div>
          <div class="border-t border-border pt-3 text-meta text-muted-foreground">
            Next up <strong class="font-medium text-foreground">{MODE_META[getNextMode(timer)].label}</strong>
          </div>
        </Card.Root>
      </div>
    </div>
  {:else if activeView === 'activity'}
    <ActivityView
      sessions={activitySessions}
      goalHours={dailyGoalHours}
      {goalSchedule}
      {clockNow}
      onGoalChange={updateGoal}
    />
  {:else}
    <div class={settingsPanel === 'main'
      ? 'w-full min-w-0 text-left'
      : 'mx-auto w-full max-w-[680px] min-w-0 rounded-[20px] border border-border bg-card p-5 text-left'}>
      <div class="mb-6 flex min-h-8 items-center gap-1">
        {#if settingsPanel !== 'main'}
          <Button
            variant="ghost"
            size="icon-sm"
            class="shrink-0 rounded-full text-muted-foreground"
            aria-label="Back to Pomodoro settings"
            onclick={() => openSettingsPanel('main')}
          >
            <ArrowLeft class="size-4" strokeWidth={1.7} />
          </Button>
        {/if}

        <h2 class="m-0 truncate text-title font-semibold tracking-[-0.03em]">
          {settingsPanel === 'main'
            ? 'Settings'
            : settingsPanel === 'blocked-sites'
              ? 'Blocked websites'
              : settingsPanel === 'ringtone'
                ? 'Ringtone'
                : 'Data'}
        </h2>
      </div>

        {#if settingsPanel === 'main'}
          <div class="grid grid-cols-12 gap-3">
            <Card.Root class="col-span-12 gap-4 rounded-[20px] p-5 shadow-none sm:col-span-7">
              <div>
                <h3 class="m-0 text-ui font-medium">Timer durations</h3>
                <p class="mt-1 text-meta text-muted-foreground">Set the length of each session.</p>
              </div>
              <div class="grid grid-cols-3 gap-2">
                {#each [['focus', 'Focus', 180], ['short', 'Short', 60], ['long', 'Long', 120]] as row}
                  {@const timerMode = row[0] as PomodoroMode}
                  <label class="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-border bg-muted p-3 text-meta text-muted-foreground">
                    <span>{row[1]}</span>
                    <Input
                      type="number"
                      min="1"
                      max={row[2]}
                      aria-label={row[1] + ' duration in minutes'}
                      class="h-8 w-full max-w-[76px] border-0 bg-transparent px-1 text-center text-title-lg font-medium text-foreground shadow-none focus-visible:ring-1"
                      value={durations[timerMode]}
                      onchange={(event) => updateDuration(timerMode, event.currentTarget.value)}
                    />
                    <span>minutes</span>
                  </label>
                {/each}
              </div>
            </Card.Root>

            <Card.Root class="col-span-12 gap-3 rounded-[20px] p-5 shadow-none sm:col-span-5">
              <div>
                <h3 class="m-0 text-ui font-medium">Automation</h3>
                <p class="mt-1 text-meta text-muted-foreground">Control your focus rhythm.</p>
              </div>
              {#each [
                ['autoStartBreaks', 'Auto-start breaks'],
                ['autoStartFocus', 'Auto-start focus'],
                ['overtime', 'Count overtime']
              ] as option}
                {@const key = option[0] as keyof PomodoroPreferences}
                <div class="flex min-h-9 items-center justify-between gap-3 border-t border-border pt-2 text-ui">
                  <span>{option[1]}</span>
                  <Switch checked={preferences[key]} aria-label={option[1]} onclick={() => togglePreference(key)} />
                </div>
              {/each}
            </Card.Root>

            <Card.Root class="col-span-12 gap-0 rounded-[20px] p-5 shadow-none sm:col-span-7">
              <FocusProtectionSettings
                enabled={focusProtectionEnabled}
                {blockedDomains}
                connection={focusProtectionConnection}
                errorMessage={focusProtectionError}
                onToggle={toggleFocusProtection}
                onBlocklistChange={updateBlockedDomains}
                onManage={() => openSettingsPanel('blocked-sites')}
              />
            </Card.Root>

            <Card.Root class="col-span-12 gap-2 rounded-[20px] p-5 shadow-none sm:col-span-5">
              <div>
                <h3 class="m-0 text-ui font-medium">Sounds & system</h3>
                <p class="mt-1 text-meta text-muted-foreground">Quiet feedback and device options.</p>
              </div>
              <div class="flex min-h-9 items-center justify-between gap-2 border-t border-border pt-2 text-ui">
                <span>Sound</span>
                <Switch checked={soundEnabled} aria-label="Sound" onclick={toggleSound} />
              </div>
              <Button variant="ghost" class="flex h-10 w-full items-center justify-between rounded-full px-1 text-ui font-normal" onclick={() => openSettingsPanel('ringtone')}>
                <span>Ringtone</span>
                <span class="inline-flex items-center gap-1 text-meta text-muted-foreground">
                  {RINGTONE_OPTIONS.find((option) => option.id === ringtone)?.label ?? 'Soft chime'}
                  <ChevronRight class="size-3.5" strokeWidth={1.7} />
                </span>
              </Button>
              <div class="flex min-h-9 items-center justify-between gap-2 border-t border-border pt-2 text-ui">
                <span>Notifications {#if !notificationsSupported}<span class="text-meta text-muted-foreground">Unavailable</span>{/if}</span>
                <Switch checked={notificationsEnabled} aria-label="Notifications" disabled={!notificationsSupported} onclick={toggleNotifications} />
              </div>
              <div class="flex min-h-9 items-center justify-between gap-2 border-t border-border pt-2 text-ui">
                <span>Keep screen awake {#if !wakeLockSupported}<span class="text-meta text-muted-foreground">Unavailable</span>{/if}</span>
                <Switch checked={preferences.keepAwake} aria-label="Keep screen awake" disabled={!wakeLockSupported} onclick={() => togglePreference('keepAwake')} />
              </div>
            </Card.Root>

            <Card.Root class="col-span-12 gap-2 rounded-[20px] p-5 shadow-none">
              <h3 class="m-0 text-ui font-medium">Your data</h3>
              <p class="text-meta text-muted-foreground">Timer settings and focus history stay in your browser.</p>
              <Button variant="outline" size="sm" class="mt-1 w-fit rounded-full shadow-none" onclick={() => openSettingsPanel('data')}>
                Export & delete data <ChevronRight class="size-3.5" strokeWidth={1.7} />
              </Button>
            </Card.Root>
          </div>
        {:else if settingsPanel === 'blocked-sites'}
          <FocusProtectionSettings
            view="manager"
            enabled={focusProtectionEnabled}
            {blockedDomains}
            connection={focusProtectionConnection}
            errorMessage={focusProtectionError}
            onToggle={toggleFocusProtection}
            onBlocklistChange={updateBlockedDomains}
          />
        {:else if settingsPanel === 'ringtone'}
          <div>
            <p class="mb-3 mt-0 text-meta  text-muted-foreground">
              Pick a short local tone for session completion. Selecting one also previews it.
            </p>

            <div class="divide-y">
              {#each RINGTONE_OPTIONS as option}
                <Button
                  variant="ghost"
                  class="flex h-auto min-h-12 w-full items-center justify-between gap-4 rounded-full px-2 py-2 text-left font-normal whitespace-normal shadow-none"
                  onclick={() => selectRingtone(option.id)}
                >
                  <span class="min-w-0">
                    <span class="block text-meta">{option.label}</span>
                    <span class="mt-1 block text-meta text-muted-foreground">{option.description}</span>
                  </span>
                  {#if ringtone === option.id}
                    <Check class="size-4 shrink-0 text-primary" strokeWidth={1.8} />
                  {/if}
                </Button>
              {/each}
            </div>
          </div>
        {:else}
          <div>
            <p class="mb-4 mt-0 text-meta  text-muted-foreground">
              Export or remove all Pomodoro data stored in this browser, including settings, blocked sites, goals, and activity history.
            </p>

            <Button
              variant="outline"
              class="h-10 w-full justify-start rounded-full text-meta font-normal shadow-none"
              onclick={exportAllPomodoroData}
            >
              <Download class="size-3.5" strokeWidth={1.7} />
              Export all data
            </Button>

            {#if dataMessage}
              <p class="mb-0 mt-2 text-meta text-muted-foreground">{dataMessage}</p>
            {/if}

            <div class="mt-5 border-t pt-4">
              {#if !deleteConfirm}
                <Button
                  variant="ghost"
                  class="h-10 w-full justify-start rounded-full px-2 text-meta font-normal text-destructive"
                  onclick={() => {
                    deleteConfirm = true;
                    dataMessage = '';
                  }}
                >
                  <Trash2 class="size-3.5" strokeWidth={1.7} />
                  Delete all data
                </Button>
              {:else}
                <div class="rounded-xl border border-destructive/20 bg-destructive/[0.035] p-3">
                  <p class="m-0 text-meta ">
                    Delete timer settings, Focus Protection data, goals, and all activity history?
                  </p>
                  <p class="mb-0 mt-1 text-meta text-muted-foreground">This cannot be undone.</p>

                  <div class="mt-3 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-8 rounded-full text-meta font-normal"
                      onclick={() => (deleteConfirm = false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      class="h-8 rounded-full text-meta font-medium shadow-none"
                      onclick={deleteAllPomodoroData}
                    >
                      Delete all
                    </Button>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}
    </div>
  {/if}
  </div>
</section>
