import { onMount, tick } from 'svelte';
import { elapsedFocus, emptyFocusAccounting, pauseFocus, resumeFocus, type FocusAccounting } from '../core/focus-accounting.ts';
import { consumePendingFocusTask } from '#lib/shared/focus-sessions/context.ts';
import type { FocusTaskContext } from '#lib/shared/focus-sessions/types.ts';
  import { createWakeLockController } from '#lib/modules/pomodoro/adapters/wake-lock.ts';
  import { clearFocusSessions, loadFocusSessions, saveFocusSession, saveFocusSessions } from '#lib/modules/pomodoro/adapters/activity-storage.ts';
  import {
    localDateKey,
    migrateLegacySessions,
    type FocusActivitySession,
    type GoalSchedule,
    type LegacyFocusSession
  } from '#lib/modules/pomodoro/core/activity.ts';
  import {
    normalizeBlocklist,
    pingFocusProtection,
    setFocusProtectionEnabled,
    startFocusProtection,
    stopFocusProtection,
    syncFocusProtectionBlocklist,
    type FocusProtectionConnection,
    type FocusProtectionExtensionStatus,
    type FloatingFocusSettings,
    publishFloatingFocusSnapshot,
    setFloatingFocusSettings,
    clearFloatingFocusContext
  } from '#lib/modules/pomodoro/adapters/focus-protection.ts';
  import {
    DEFAULT_RINGTONE,
    RINGTONE_OPTIONS,
    isPomodoroRingtone,
    playPomodoroRingtone,
    type PomodoroRingtone
  } from '#lib/modules/pomodoro/adapters/sounds.ts';
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
  } from '#lib/modules/pomodoro/core/timer.ts';

  import {
    readPomodoroSnapshot,
    savePomodoroSnapshot,
    clearPomodoroSnapshot,
    normalizePomodoroSnapshot,
    clampMinutes,
    clampGoalHours,
    type PomodoroPreferences
  } from '#lib/modules/pomodoro/adapters/persistence.ts';

  type PomodoroView = 'timer' | 'activity' | 'settings';
  type SettingsPanel = 'main' | 'data';

export const MODE_META: Record<
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

export function createPomodoroController() {
  let activeView = $state<PomodoroView>('timer');
  let durations = $state<Record<PomodoroMode, number>>({ ...DEFAULT_DURATIONS });
  let preferences = $state<PomodoroPreferences>({ ...DEFAULT_PREFERENCES });
  let timer = $state<TimerState>(createTimer('focus', DEFAULT_DURATIONS.focus * 60_000));
  let sessionStartedAt = $state<number | null>(null);
  let focusAccounting = $state<FocusAccounting>(emptyFocusAccounting());
  let partialDialogOpen = $state(false);
  let partialIntent = $state<'reset' | 'switch' | 'skip'>('reset');
  let partialTargetMode = $state<PomodoroMode>('focus');
  let expiredFocusEndAt: number | null = null;
  let focusText = $state('');
  let linkedTask = $state<FocusTaskContext | null>(null);
  let contextNotice = $state('');
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
  let floatingSettings = $state<FloatingFocusSettings>({ enabled: false, showTask: true, excludedDomains: [] });
  let floatingError = $state('');
  let companionConnected = $state(false);
  let lastFloatingPayload = '';
  let floatingRevision = Date.now();
  let dailyGoalHours = $state(8);
  let goalSchedule = $state<GoalSchedule>('weekdays');
  let activitySessions = $state<FocusActivitySession[]>([]);
  let legacyHistory = $state<LegacyFocusSession[]>([]);
  let settingsPanel = $state<SettingsPanel>('main');
  let blockedSitesDialogOpen = $state(false);
  let ringtoneDialogOpen = $state(false);
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
      blockedSitesDialogOpen = false;
      ringtoneDialogOpen = false;
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
      linkedTask,
      soundEnabled,
      ringtone,
      notificationsEnabled,
      focusProtection: {
        enabled: focusProtectionEnabled,
        blockedDomains
      },
      sessionStartedAt,
      focusAccounting,
      dailyGoalHours,
      goalSchedule
    });
    void publishFloatingContext();
  }

  function floatingSnapshotPayload() {
    const title = linkedTask?.title || focusText.trim();
    return {
      version: 1 as const,
      sessionId: timer.status === 'idle' ? null :
        timer.mode === 'focus' && sessionStartedAt !== null ? currentFocusSessionId() :
        timer.mode + '-' + (timer.endsAt ?? timer.overtimeStartedAt ?? timer.durationMs),
      task: floatingSettings.showTask && title ? { id: linkedTask?.id ?? null, title, nextAction: linkedTask?.nextAction } : null,
      timer: {
        mode: timer.mode,
        status: timer.status,
        durationMs: timer.durationMs,
        remainingMs: timer.remainingMs,
        endsAt: timer.endsAt,
        overtimeStartedAt: timer.overtimeStartedAt
      }
    };
  }

  async function publishFloatingContext() {
    if (!companionConnected || !floatingSettings.enabled) return;
    const payload = floatingSnapshotPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastFloatingPayload) return;
    const snapshot = { ...payload, updatedAt: ++floatingRevision };
    const response = await publishFloatingFocusSnapshot(snapshot);
    if (response.ok) lastFloatingPayload = serialized;
  }

  async function updateFloatingFocus(settings: Partial<FloatingFocusSettings>) {
    if (!companionConnected) return;
    const response = await setFloatingFocusSettings(settings);
    if (response.ok && response.data?.floating) {
      floatingSettings = response.data.floating;
      floatingError = '';
      // Disabled floating must not retain task details in extension storage.
      lastFloatingPayload = '';
      if (!floatingSettings.enabled) {
        await clearFloatingFocusContext();
      } else {
        void publishFloatingContext();
      }
    } else {
      floatingError = response.error || 'Unable to update floating widget.';
    }
  }

  function restore() {
    try {
      const saved = readPomodoroSnapshot();
      if (!saved) return;

      const restored = normalizePomodoroSnapshot(saved, clockNow);
      expiredFocusEndAt = saved.timer?.mode === 'focus' && saved.timer?.status === 'running' &&
        typeof saved.timer.endsAt === 'number' && saved.timer.endsAt <= clockNow
        ? saved.timer.endsAt : null;
      durations = restored.durations;
      preferences = restored.preferences;
      dailyGoalHours = restored.dailyGoalHours;
      goalSchedule = restored.goalSchedule;
      timer = restored.timer;
      sessionStartedAt = restored.sessionStartedAt;
      focusAccounting = restored.focusAccounting;
      focusText = restored.focusText;
      linkedTask = restored.linkedTask;
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

    const restored = await loadFocusSessions();
    activitySessions = [...new Map([...activitySessions, ...restored].map((session) => [session.id, session])).values()]
      .sort((a, b) => b.endedAt - a.endedAt);
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
      companionConnected = false;
      return;
    }
    companionConnected = true;
    if (detected.floating) floatingSettings = detected.floating;
    void publishFloatingContext();

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
    blockedSitesDialogOpen = false;
    ringtoneDialogOpen = false;
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

  function recordFocusSession(
    plannedDurationMs: number,
    actualDurationMs: number,
    overtimeDurationMs: number,
    partial = false
  ) {
    const endedAt = Date.now();
    const session: FocusActivitySession = {
      id: currentFocusSessionId(),
      startedAt: sessionStartedAt ?? endedAt - actualDurationMs,
      endedAt,
      plannedDurationMs,
      actualDurationMs: Math.max(0, actualDurationMs),
      overtimeMs: Math.max(0, overtimeDurationMs),
      label: focusText.trim(),
      taskId: linkedTask?.id ?? null,
      completionKind: partial ? 'partial' : 'full',
      goalMs,
      status: 'completed'
    };

    sessionStartedAt = null;
    focusAccounting = emptyFocusAccounting();
    activitySessions = [session, ...activitySessions.filter((item) => item.id !== session.id)].sort((a, b) => b.endedAt - a.endedAt);
    void saveFocusSession(session);
    persist();
  }

  function finalizeOvertimeSession() {
    if (timer.status !== 'overtime') return;

    const overtimeDurationMs = getOvertimeMs(timer);
    recordFocusSession(
      timer.durationMs,
      Math.max(timer.durationMs, focusAccounting.accumulatedMs) + overtimeDurationMs,
      overtimeDurationMs
    );
  }

  function applyTimerExit(mode: PomodoroMode | null) {
    if (timer.status === 'overtime') finalizeOvertimeSession();
    timer = mode === null ? resetTimer(timer) : switchMode(timer, mode, durationMs(mode));
    sessionStartedAt = null;
    focusAccounting = emptyFocusAccounting();
    partialDialogOpen = false;
    void syncWakeLock();
    void syncFocusProtection(timer);
    persist();
  }

  function hasPartialFocus() {
    if (timer.mode !== 'focus' || !['running', 'paused'].includes(timer.status)) return false;
    return elapsedFocus(focusAccounting, Date.now(), timer.status === 'running' ? timer.endsAt : null) >= 1000;
  }

  function requestExit(intent: 'reset' | 'switch' | 'skip', mode: PomodoroMode = 'focus') {
    if (hasPartialFocus()) {
      if (timer.status === 'running') pause();
      partialIntent = intent;
      partialTargetMode = mode;
      partialDialogOpen = true;
      return;
    }
    applyTimerExit(intent === 'reset' ? null : intent === 'skip' ? getNextMode(timer) : mode);
  }

  function resolvePartial(save: boolean) {
    if (!partialDialogOpen) return;
    if (save && timer.mode === 'focus') {
      const active = elapsedFocus(focusAccounting, Date.now());
      if (active >= 1000) recordFocusSession(timer.durationMs, active, 0, true);
    }
    const target = partialIntent === 'reset' ? null
      : partialIntent === 'skip' ? getNextMode(timer) : partialTargetMode;
    applyTimerExit(target);
    contextNotice = save ? 'Partial focus saved. You can add a checkpoint in Daily Execution.' : 'Partial focus discarded.';
  }

  function cancelPartial() {
    partialDialogOpen = false;
  }

  function switchPomodoroMode(mode: PomodoroMode) {
    requestExit('switch', mode);
  }

  function start() {
    if (timer.mode === 'focus' && timer.status === 'idle' && sessionStartedAt === null) {
      sessionStartedAt = Date.now();
    }

    const now = Date.now();
    if (timer.mode === 'focus') focusAccounting = resumeFocus(focusAccounting, now);
    timer = startTimer(timer, now);
    void syncWakeLock();
    void syncFocusProtection(timer);
    persist();
  }

  function pause() {
    const now = Date.now();
    if (timer.mode === 'focus') focusAccounting = pauseFocus(focusAccounting, now, timer.endsAt);
    timer = pauseTimer(timer, now);
    void syncWakeLock();
    void syncFocusProtection(timer);
    persist();
  }

  function startNextMode() {
    const nextMode = getNextMode(timer);
    timer = switchMode(timer, nextMode, durationMs(nextMode));
    const now = Date.now();
    sessionStartedAt = nextMode === 'focus' ? now : null;
    focusAccounting = nextMode === 'focus' ? resumeFocus(emptyFocusAccounting(), now) : emptyFocusAccounting();
    timer = startTimer(timer, now);
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
    requestExit('reset');
  }

  function handleSkip() {
    requestExit('skip');
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
      if (previousTimer.mode === 'focus') focusAccounting = pauseFocus(focusAccounting, clockNow, previousTimer.endsAt);
      announceCompletion();
      void syncWakeLock();
      void syncFocusProtection(nextTimer);
      persist();
      return;
    }

    if (previousTimer.status === 'running' && nextTimer.status === 'complete') {
      if (previousTimer.mode === 'focus') {
        focusAccounting = pauseFocus(focusAccounting, clockNow, previousTimer.endsAt);
        recordFocusSession(previousTimer.durationMs, focusAccounting.accumulatedMs, 0);
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
      floatingSettings,
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

    // Floating preferences and mirrored task data have an independent privacy boundary.
    if (companionConnected) {
      try { await clearFloatingFocusContext(); } catch { /* Keep local deletion available. */ }
      try { await setFloatingFocusSettings({ enabled: false, excludedDomains: [], showTask: true }); }
      catch { /* Keep local deletion available. */ }
    }

    await releaseWakeLock();
    await clearFocusSessions();

    clearPomodoroSnapshot();

    durations = { ...DEFAULT_DURATIONS };
    preferences = { ...DEFAULT_PREFERENCES };
    timer = createTimer('focus', DEFAULT_DURATIONS.focus * 60_000);
    sessionStartedAt = null;
    focusAccounting = emptyFocusAccounting();
    focusText = '';
    focusDraft = '';
    focusEditing = false;
    soundEnabled = true;
    ringtone = DEFAULT_RINGTONE;
    notificationsEnabled = false;
    focusProtectionEnabled = false;
    blockedDomains = [];
    focusProtectionError = '';
    floatingSettings = { enabled: false, showTask: true, excludedDomains: [] };
    lastFloatingPayload = '';
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

  function unlinkTask() {
    if (timer.status !== 'idle' || timer.mode !== 'focus') return;
    linkedTask = null;
    focusText = '';
    focusDraft = '';
    contextNotice = '';
    persist();
  }

  onMount(() => {
    notificationsSupported = typeof Notification !== 'undefined';
    wakeLockSupported = 'wakeLock' in navigator;

    restore();
    let startFromDaily = false;
    const requestedTaskId = new URLSearchParams(window.location.search).get('taskId');
    if (requestedTaskId) {
      const pendingTask = consumePendingFocusTask(requestedTaskId);
      if (pendingTask && timer.mode === 'focus' && timer.status === 'idle') {
        linkedTask = pendingTask;
        focusText = pendingTask.title;
        focusDraft = pendingTask.title;
        startFromDaily = pendingTask.autoStart === true;
      } else if (pendingTask) {
        contextNotice = 'Finish or reset your current session before switching tasks.';
      }
    }

    if (!notificationsSupported) notificationsEnabled = false;
    if (!wakeLockSupported) preferences = { ...preferences, keepAwake: false };

    hydrated = true;
    if (startFromDaily && timer.mode === 'focus' && timer.status === 'idle') start();
    if (expiredFocusEndAt !== null && sessionStartedAt !== null) {
      focusAccounting = pauseFocus(focusAccounting, clockNow, expiredFocusEndAt);
      if (timer.status === 'complete') {
        recordFocusSession(timer.durationMs, focusAccounting.accumulatedMs, 0);
      } else {
        persist();
      }
      expiredFocusEndAt = null;
    }
    void loadActivity().then(() => persist());
    void connectFocusProtection();
    updateDocumentTitle();
    void syncWakeLock();

    const interval = window.setInterval(() => {
      handleTick();
      updateDocumentTitle();
    }, 250);

    const onWindowFocus = () => {
      // A user can reload/install the extension after this page was opened.
      if (!companionConnected) void connectFocusProtection();
    };

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
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
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

  return {
    get activeView() { return activeView; },
    set activeView(value: PomodoroView) { activeView = value; },
    get timer() { return timer; },
    get durations() { return durations; },
    get preferences() { return preferences; },
    get focusText() { return focusText; },
    get linkedTask() { return linkedTask; },
    get contextNotice() { return contextNotice; },
    get partialDialogOpen() { return partialDialogOpen; },
    resolvePartial,
    cancelPartial,
    get focusDraft() { return focusDraft; },
    set focusDraft(value: string) { focusDraft = value; },
    get focusEditing() { return focusEditing; },
    get focusInput() { return focusInput; },
    set focusInput(value: HTMLInputElement | null) { focusInput = value; },
    get soundEnabled() { return soundEnabled; },
    get ringtone() { return ringtone; },
    get notificationsEnabled() { return notificationsEnabled; },
    get notificationsSupported() { return notificationsSupported; },
    get wakeLockSupported() { return wakeLockSupported; },
    get focusProtectionEnabled() { return focusProtectionEnabled; },
    get blockedDomains() { return blockedDomains; },
    get focusProtectionConnection() { return focusProtectionConnection; },
    get focusProtectionError() { return focusProtectionError; },
    get floatingSettings() { return floatingSettings; },
    get floatingError() { return floatingError; },
    get companionConnected() { return companionConnected; },
    get dailyGoalHours() { return dailyGoalHours; },
    get goalSchedule() { return goalSchedule; },
    get activitySessions() { return activitySessions; },
    get settingsPanel() { return settingsPanel; },
    get blockedSitesDialogOpen() { return blockedSitesDialogOpen; },
    set blockedSitesDialogOpen(value: boolean) { blockedSitesDialogOpen = value; },
    get ringtoneDialogOpen() { return ringtoneDialogOpen; },
    set ringtoneDialogOpen(value: boolean) { ringtoneDialogOpen = value; },
    get deleteConfirm() { return deleteConfirm; },
    set deleteConfirm(value: boolean) { deleteConfirm = value; },
    get dataMessage() { return dataMessage; },
    set dataMessage(value: string) { dataMessage = value; },
    get clockNow() { return clockNow; },
    get modeMeta() { return modeMeta; },
    get formattedTime() { return formattedTime; },
    get primaryLabel() { return primaryLabel; },
    get goalMs() { return goalMs; },
    get todayFocusMs() { return todayFocusMs; },
    get protectionTimerLabel() { return protectionTimerLabel; },
    formatFocusTotal,
    switchPomodoroMode,
    beginFocusEdit,
    commitFocusEdit,
    cancelFocusEdit,
    unlinkTask,
    handleReset,
    handlePrimary,
    handleSkip,
    openSettingsPage,
    openSettingsPanel,
    togglePreference,
    updateDuration,
    toggleFocusProtection,
    updateBlockedDomains,
    updateFloatingFocus,
    toggleSound,
    toggleNotifications,
    selectRingtone,
    exportAllPomodoroData,
    deleteAllPomodoroData,
    updateGoal
  };
}

export type PomodoroController = ReturnType<typeof createPomodoroController>;
