<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ArrowLeft, Check, ChevronRight, Download, Pencil, RotateCcw, Settings2, SkipForward, Trash2, X } from 'lucide-svelte';
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import ActivityView from '#lib/components/pomodoro/ActivityView.svelte';
  import FocusProtectionSettings from '#lib/components/pomodoro/FocusProtectionSettings.svelte';
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

  const STORAGE_KEY = 'module-pomodoro-v2';
  const RADIUS = 52;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  type PomodoroView = 'timer' | 'activity';
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
  let focusInput: HTMLInputElement | null = null;
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
  let settingsOpen = $state(false);
  let settingsPanel = $state<SettingsPanel>('main');
  let deleteConfirm = $state(false);
  let dataMessage = $state('');
  let hydrated = $state(false);
  let clockNow = $state(Date.now());
  let wakeLock: { release: () => Promise<void> } | null = null;

  const modeMeta = $derived(MODE_META[timer.mode]);
  const overtimeMs = $derived(getOvertimeMs(timer, clockNow));
  const formattedTime = $derived(
    timer.status === 'overtime'
      ? `+${formatDuration(overtimeMs)}`
      : formatDuration(timer.remainingMs)
  );
  const progressRatio = $derived(
    timer.status === 'overtime'
      ? 1
      : timer.durationMs > 0
        ? Math.max(0, Math.min(1, timer.remainingMs / timer.durationMs))
        : 0
  );
  const progressOffset = $derived(CIRCUMFERENCE * (1 - progressRatio));
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

  function clampMinutes(value: unknown, fallback: number, max: number) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;

    return Math.max(1, Math.min(max, Math.round(numeric)));
  }

  function clampGoalHours(value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 8;

    return Math.max(1, Math.min(16, Math.round(numeric * 2) / 2));
  }

  function isMode(value: unknown): value is PomodoroMode {
    return value === 'focus' || value === 'short' || value === 'long';
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
        ringtone,
        notificationsEnabled,
        focusProtection: {
          enabled: focusProtectionEnabled,
          blockedDomains
        },
        sessionStartedAt,
        dailyGoalHours,
        goalSchedule
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
        ringtone?: unknown;
        notificationsEnabled?: boolean;
        focusProtection?: {
          enabled?: boolean;
          blockedDomains?: string[];
        };
        sessionStartedAt?: number | null;
        dailyGoalHours?: number;
        goalSchedule?: GoalSchedule;
        history?: LegacyFocusSession[];
      };

      durations = {
        focus: clampMinutes(saved.durations?.focus, 25, 180),
        short: clampMinutes(saved.durations?.short, 5, 60),
        long: clampMinutes(saved.durations?.long, 15, 120)
      };

      preferences = {
        autoStartBreaks: saved.preferences?.autoStartBreaks === true,
        autoStartFocus: saved.preferences?.autoStartFocus === true,
        overtime: saved.preferences?.overtime !== false,
        keepAwake: saved.preferences?.keepAwake === true
      };

      dailyGoalHours = clampGoalHours(saved.dailyGoalHours);
      goalSchedule =
        saved.goalSchedule === 'every-day' ? 'every-day' : 'weekdays';

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
          timer = syncTimer(timer, clockNow, preferences.overtime);
        }
      }

      sessionStartedAt =
        typeof saved.sessionStartedAt === 'number' ? saved.sessionStartedAt : null;

      if (
        sessionStartedAt === null &&
        timer.mode === 'focus' &&
        (timer.status === 'running' || timer.status === 'paused' || timer.status === 'overtime')
      ) {
        if (timer.status === 'overtime' && timer.overtimeStartedAt !== null) {
          sessionStartedAt = timer.overtimeStartedAt - timer.durationMs;
        } else if (timer.endsAt !== null) {
          sessionStartedAt = timer.endsAt - timer.durationMs;
        } else {
          sessionStartedAt = Date.now() - Math.max(0, timer.durationMs - timer.remainingMs);
        }
      }

      focusText = typeof saved.focusText === 'string' ? saved.focusText.slice(0, 80) : '';
      focusDraft = focusText;
      soundEnabled = saved.soundEnabled !== false;
      ringtone = isPomodoroRingtone(saved.ringtone) ? saved.ringtone : DEFAULT_RINGTONE;
      notificationsEnabled = saved.notificationsEnabled === true;
      focusProtectionEnabled = saved.focusProtection?.enabled === true;
      blockedDomains = normalizeBlocklist(saved.focusProtection?.blockedDomains ?? []);
      legacyHistory = Array.isArray(saved.history) ? saved.history : [];
    } catch {
      localStorage.removeItem(STORAGE_KEY);
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

  function openSettings() {
    settingsPanel = 'main';
    deleteConfirm = false;
    dataMessage = '';
    settingsOpen = true;
  }

  function openSettingsPanel(panel: SettingsPanel) {
    settingsPanel = panel;
    deleteConfirm = false;
    dataMessage = '';
  }

  function closeSettings() {
    settingsOpen = false;
    settingsPanel = 'main';
    deleteConfirm = false;
    dataMessage = '';
  }

  function updateDocumentTitle() {
    if (typeof document === 'undefined') return;

    if (activeView === 'activity') {
      document.title = 'Pomodoro Activity — Module';
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
    try {
      await stopFocusProtection();
      await setFocusProtectionEnabled(false);
      await syncFocusProtectionBlocklist([]);
    } catch {
      // Local deletion must still succeed if the optional extension is unavailable.
    }

    await releaseWakeLock();
    await clearFocusSessions();

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }

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

  async function clearActivity() {
    await clearFocusSessions();
    activitySessions = [];
  }

  async function requestWakeLock() {
    if (
      !preferences.keepAwake ||
      !wakeLockSupported ||
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
      wakeLockSupported &&
      (timer.status === 'running' || timer.status === 'overtime')
    ) {
      await requestWakeLock();
      return;
    }

    await releaseWakeLock();
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

        if (settingsOpen && settingsPanel !== 'main') {
          openSettingsPanel('main');
          return;
        }

        if (settingsOpen) closeSettings();
        return;
      }

      if (isTyping || settingsOpen || activeView !== 'timer') return;

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
  class="mx-auto min-h-[calc(100vh-68px)] w-full max-w-[920px] px-2 pb-14 pt-5 max-[700px]:pt-2.5"
  style={`--pomodoro-accent: ${modeMeta.accent}; --pomodoro-soft: ${modeMeta.soft};`}
>
  <div class="relative mx-auto mb-4 w-full max-w-[460px] text-center">
    <h1 class="m-0 text-[28px] font-[500] leading-none tracking-[-0.045em]">Pomodoro</h1>
    <p class="mt-2 text-[12px] font-normal text-muted-foreground">
      {activeView === 'timer' ? modeMeta.copy : 'Focus time, goals, and session history.'}
    </p>

    <div class="mt-3 flex justify-center gap-[18px]">
      {#each ['timer', 'activity'] as view}
        {@const typedView = view as PomodoroView}
        <button
          type="button"
          class={[
            'relative h-7 px-0.5 text-[12px] font-normal transition',
            activeView === typedView
              ? 'text-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:rounded-full after:bg-foreground'
              : 'text-muted-foreground hover:text-foreground'
          ]}
          onclick={() => (activeView = typedView)}
        >
          {typedView === 'timer' ? 'Timer' : 'Activity'}
        </button>
      {/each}
    </div>

    {#if activeView === 'timer'}
      <Button
        variant="ghost"
        size="icon-sm"
        class="absolute right-0 -top-1 rounded-lg text-muted-foreground max-[520px]:right-1"
        aria-label="Pomodoro settings"
        title="Settings"
        onclick={openSettings}
      >
        <Settings2 class="size-4" strokeWidth={1.7} />
      </Button>
    {/if}
  </div>

  {#if activeView === 'timer'}
    <div class="mx-auto flex max-w-[680px] flex-col items-center text-center">
      <div
        class="mb-[22px] flex items-center gap-1 rounded-[13px] border bg-muted p-1"
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
              'h-[31px] rounded-[9px] px-3 text-[12px] font-normal transition',
              timer.mode === typedMode
                ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(26,26,23,0.06)]'
                : 'text-muted-foreground hover:text-foreground'
            ]}
            onclick={() => switchPomodoroMode(typedMode)}
          >
            {MODE_META[typedMode].shortLabel}
          </button>
        {/each}
      </div>

      <div class="relative size-[min(72vw,274px)]">
        <svg class="size-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--muted)" stroke-opacity="0.12" stroke-width="6" />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke="var(--pomodoro-accent)"
            stroke-width="6"
            stroke-linecap="round"
            stroke-dasharray={CIRCUMFERENCE}
            stroke-dashoffset={progressOffset}
            class="transition-[stroke-dashoffset] duration-200"
          />
        </svg>

        <div class="absolute inset-0 grid place-content-center">
          <div class="text-[clamp(56px,8vw,74px)] font-[410] leading-[0.9] tracking-[-0.055em] tabular-nums">
            {formattedTime}
          </div>
          <div class="mt-2.5 min-h-[15px] text-[11px] font-normal text-muted-foreground">
            <span>
              {timer.status === 'running'
                ? modeMeta.label
                : timer.status === 'paused'
                  ? 'Paused'
                  : timer.status === 'overtime'
                    ? 'Overtime'
                    : timer.status === 'complete'
                      ? 'Complete'
                      : ''}
            </span>
            {#if protectionTimerLabel}
              <span> · {protectionTimerLabel}</span>
            {/if}
          </div>
        </div>
      </div>

      {#if timer.mode === 'focus'}
        <div class="mt-3.5 grid min-h-9 w-full max-w-[330px] place-items-center">
          {#if focusEditing}
            <input
              bind:this={focusInput}
              class="w-full max-w-[300px] border-0 border-b border-border bg-transparent px-2 py-1.5 text-center text-[13px] font-normal outline-none placeholder:text-muted-foreground/60"
              type="text"
              maxlength="80"
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
          {:else if focusText}
            <button
              type="button"
              class="group inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-normal text-foreground transition hover:bg-muted"
              onclick={beginFocusEdit}
            >
              <span class="truncate">{focusText}</span>
              <Pencil class="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.7} />
            </button>
          {:else}
            <button
              type="button"
              class="rounded-lg px-2 py-1.5 text-[12px] font-normal text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onclick={beginFocusEdit}
            >
              + Add focus
            </button>
          {/if}
        </div>
      {/if}

      <div class="mt-3.5 flex items-center justify-center gap-[11px]">
        <Button variant="ghost" size="icon" class="size-[38px] rounded-[10px] text-muted-foreground" aria-label="Reset timer" title="Reset (R)" onclick={handleReset}>
          <RotateCcw class="size-4" strokeWidth={1.7} />
        </Button>

        <Button class="h-[42px] min-w-[132px] rounded-xl px-5 text-[13px] font-medium shadow-none" onclick={handlePrimary}>
          {primaryLabel}
        </Button>

        <Button variant="ghost" size="icon" class="size-[38px] rounded-[10px] text-muted-foreground" aria-label="Skip session" title="Skip (S)" onclick={handleSkip}>
          <SkipForward class="size-4" strokeWidth={1.7} />
        </Button>
      </div>

      <div class="mt-[18px]">
        <div class="flex items-center justify-center gap-2" aria-label="Focus cycle">
          {#each [0, 1, 2, 3] as index}
            <span class="size-1.5 rounded-full transition-colors" style={`background: ${index < timer.completedFocus ? modeMeta.accent : '#d7d7d1'};`}></span>
          {/each}
        </div>

        <div class="mt-2 text-[11px] font-normal text-muted-foreground">
          {timer.completedFocus >= 4 ? 'Long break next' : `Session ${Math.min(timer.completedFocus + 1, 4)} of 4`}
        </div>

        <button
          type="button"
          class="mt-2 rounded-lg px-2 py-1 text-[11px] font-normal text-muted-foreground transition hover:bg-muted hover:text-foreground"
          onclick={() => (activeView = 'activity')}
        >
          {formatFocusTotal(todayFocusMs)} today
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
              : ' Ready to focus.'}
        </p>
      {/if}
    </div>
  {:else}
    <ActivityView
      sessions={activitySessions}
      goalHours={dailyGoalHours}
      {goalSchedule}
      {clockNow}
      onGoalChange={updateGoal}
    />
  {/if}

  {#if settingsOpen}
    <div
      class="fixed inset-0 z-[100] grid place-items-center bg-foreground/[0.12] p-4 backdrop-blur-[3px]"
      role="presentation"
      onclick={(event) => {
        if (event.target === event.currentTarget) closeSettings();
      }}
    >
      <div
        class="max-h-[min(720px,calc(100vh-32px))] w-full max-w-[410px] overflow-y-auto rounded-[18px] border border-white/[0.65] bg-background/[0.96] p-4 text-left shadow-[0_24px_70px_rgba(28,28,24,0.16)] backdrop-blur-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pomodoro-settings-title"
      >
        <div class="mb-4 flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-1">
            {#if settingsPanel !== 'main'}
              <Button
                variant="ghost"
                size="icon-sm"
                class="shrink-0 rounded-lg text-muted-foreground"
                aria-label="Back to Pomodoro settings"
                onclick={() => openSettingsPanel('main')}
              >
                <ArrowLeft class="size-4" strokeWidth={1.7} />
              </Button>
            {/if}

            <h2 id="pomodoro-settings-title" class="m-0 truncate text-[14px] font-medium tracking-[-0.02em]">
              {settingsPanel === 'main'
                ? 'Pomodoro settings'
                : settingsPanel === 'blocked-sites'
                  ? 'Blocked websites'
                  : settingsPanel === 'ringtone'
                    ? 'Ringtone'
                    : 'Data'}
            </h2>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            class="shrink-0 rounded-lg text-muted-foreground"
            aria-label="Close settings"
            onclick={closeSettings}
          >
            <X class="size-4" strokeWidth={1.7} />
          </Button>
        </div>

        {#if settingsPanel === 'main'}
          <div>
          <div class="mb-2 text-[11px] font-medium text-muted-foreground">Timer</div>

          {#each [
            ['focus', 'Focus', 180],
            ['short', 'Short', 60],
            ['long', 'Long', 120]
          ] as row}
            {@const timerMode = row[0] as PomodoroMode}
            <label class="grid min-h-10 grid-cols-[1fr_90px] items-center gap-3 text-[12px]">
              {row[1]}
              <Input
                type="number"
                min="1"
                max={row[2]}
                class="h-8 text-right text-[12px]"
                value={durations[timerMode]}
                onchange={(event) => updateDuration(timerMode, event.currentTarget.value)}
              />
            </label>
          {/each}
        </div>

        <div class="mt-4 border-t pt-4">
          <div class="mb-1 text-[11px] font-medium text-muted-foreground">Automation</div>

          {#each [
            ['autoStartBreaks', 'Auto-start breaks'],
            ['autoStartFocus', 'Auto-start focus'],
            ['overtime', 'Count overtime']
          ] as option}
            {@const key = option[0] as keyof PomodoroPreferences}
            <Button
              variant="ghost"
              class="flex h-10 w-full items-center justify-between rounded-lg px-1 text-[12px] font-normal"
              role="switch"
              aria-checked={preferences[key]}
              onclick={() => togglePreference(key)}
            >
              <span>{option[1]}</span>
              <span
                class={[
                  'relative h-[18px] w-8 shrink-0 rounded-full border transition-all duration-150',
                  preferences[key]
                    ? 'border-primary bg-primary shadow-[0_1px_2px_rgba(36,104,242,0.18)]'
                    : 'border-border/80 bg-foreground/[0.07]'
                ]}
                aria-hidden="true"
              >
                <span
                  class={[
                    'absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform duration-150',
                    preferences[key] ? 'translate-x-3.5' : 'translate-x-0'
                  ]}
                ></span>
              </span>
            </Button>
          {/each}
        </div>

        <FocusProtectionSettings
          enabled={focusProtectionEnabled}
          {blockedDomains}
          connection={focusProtectionConnection}
          errorMessage={focusProtectionError}
          onToggle={toggleFocusProtection}
          onBlocklistChange={updateBlockedDomains}
          onManage={() => openSettingsPanel('blocked-sites')}
        />

        <div class="mt-4 border-t pt-4">
          <div class="mb-1 text-[11px] font-medium text-muted-foreground">System</div>

          <Button
            variant="ghost"
            class="flex h-10 w-full items-center justify-between rounded-lg px-1 text-[12px] font-normal"
            role="switch"
            aria-checked={notificationsEnabled}
            disabled={!notificationsSupported}
            onclick={toggleNotifications}
          >
            <span>
              Notifications
              {#if !notificationsSupported}
                <span class="ml-1 text-[10px] text-muted-foreground">Unavailable</span>
              {/if}
            </span>
            <span
              class={[
                'relative h-[18px] w-8 shrink-0 rounded-full border transition-all duration-150',
                notificationsEnabled
                  ? 'border-primary bg-primary shadow-[0_1px_2px_rgba(36,104,242,0.18)]'
                  : 'border-border/80 bg-foreground/[0.07]'
              ]}
              aria-hidden="true"
            >
              <span
                class={[
                  'absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform duration-150',
                  notificationsEnabled ? 'translate-x-3.5' : 'translate-x-0'
                ]}
              ></span>
            </span>
          </Button>

          <Button
            variant="ghost"
            class="flex h-10 w-full items-center justify-between rounded-lg px-1 text-[12px] font-normal"
            role="switch"
            aria-checked={soundEnabled}
            onclick={toggleSound}
          >
            <span>Sound</span>
            <span
              class={[
                'relative h-[18px] w-8 shrink-0 rounded-full border transition-all duration-150',
                soundEnabled
                  ? 'border-primary bg-primary shadow-[0_1px_2px_rgba(36,104,242,0.18)]'
                  : 'border-border/80 bg-foreground/[0.07]'
              ]}
              aria-hidden="true"
            >
              <span
                class={[
                  'absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform duration-150',
                  soundEnabled ? 'translate-x-3.5' : 'translate-x-0'
                ]}
              ></span>
            </span>
          </Button>

          <Button
            variant="ghost"
            class="flex h-10 w-full items-center justify-between rounded-lg px-1 text-[12px] font-normal"
            onclick={() => openSettingsPanel('ringtone')}
          >
            <span>Ringtone</span>
            <span class="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {RINGTONE_OPTIONS.find((option) => option.id === ringtone)?.label ?? 'Soft chime'}
              <ChevronRight class="size-3.5" strokeWidth={1.7} />
            </span>
          </Button>

          <Button
            variant="ghost"
            class="flex h-10 w-full items-center justify-between rounded-lg px-1 text-[12px] font-normal"
            role="switch"
            aria-checked={preferences.keepAwake}
            disabled={!wakeLockSupported}
            onclick={() => togglePreference('keepAwake')}
          >
            <span>
              Keep screen awake
              {#if !wakeLockSupported}
                <span class="ml-1 text-[10px] text-muted-foreground">Unavailable</span>
              {/if}
            </span>
            <span
              class={[
                'relative h-[18px] w-8 shrink-0 rounded-full border transition-all duration-150',
                preferences.keepAwake
                  ? 'border-primary bg-primary shadow-[0_1px_2px_rgba(36,104,242,0.18)]'
                  : 'border-border/80 bg-foreground/[0.07]'
              ]}
              aria-hidden="true"
            >
              <span
                class={[
                  'absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-transform duration-150',
                  preferences.keepAwake ? 'translate-x-3.5' : 'translate-x-0'
                ]}
              ></span>
            </span>
          </Button>
        </div>

        <div class="mt-4 border-t pt-4">
          <div class="mb-1 text-[11px] font-medium text-muted-foreground">Data</div>
          <Button
            variant="ghost"
            class="flex h-10 w-full items-center justify-between rounded-lg px-1 text-[12px] font-normal"
            onclick={() => openSettingsPanel('data')}
          >
            <span>Export & delete data</span>
            <ChevronRight class="size-3.5 text-muted-foreground" strokeWidth={1.7} />
          </Button>
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
            <p class="mb-3 mt-0 text-[11px] leading-[1.55] text-muted-foreground">
              Pick a short local tone for session completion. Selecting one also previews it.
            </p>

            <div class="divide-y">
              {#each RINGTONE_OPTIONS as option}
                <button
                  type="button"
                  class="flex min-h-12 w-full items-center justify-between gap-4 py-2 text-left"
                  onclick={() => selectRingtone(option.id)}
                >
                  <span class="min-w-0">
                    <span class="block text-[12px]">{option.label}</span>
                    <span class="mt-0.5 block text-[10px] text-muted-foreground">{option.description}</span>
                  </span>
                  {#if ringtone === option.id}
                    <Check class="size-4 shrink-0 text-primary" strokeWidth={1.8} />
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <div>
            <p class="mb-4 mt-0 text-[11px] leading-[1.55] text-muted-foreground">
              Export or remove all Pomodoro data stored in this browser, including settings, blocked sites, goals, and activity history.
            </p>

            <Button
              variant="outline"
              class="h-10 w-full justify-start rounded-lg text-[12px] font-normal shadow-none"
              onclick={exportAllPomodoroData}
            >
              <Download class="size-3.5" strokeWidth={1.7} />
              Export all data
            </Button>

            {#if dataMessage}
              <p class="mb-0 mt-2 text-[10px] text-muted-foreground">{dataMessage}</p>
            {/if}

            <div class="mt-5 border-t pt-4">
              {#if !deleteConfirm}
                <Button
                  variant="ghost"
                  class="h-10 w-full justify-start rounded-lg px-2 text-[12px] font-normal text-destructive"
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
                  <p class="m-0 text-[11px] leading-[1.5]">
                    Delete timer settings, Focus Protection data, goals, and all activity history?
                  </p>
                  <p class="mb-0 mt-1 text-[10px] text-muted-foreground">This cannot be undone.</p>

                  <div class="mt-3 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-8 rounded-lg text-[11px] font-normal"
                      onclick={() => (deleteConfirm = false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      class="h-8 rounded-lg text-[11px] font-medium shadow-none"
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
    </div>
  {/if}
</section>
