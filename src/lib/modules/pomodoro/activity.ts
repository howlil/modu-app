export type GoalSchedule = 'weekdays' | 'every-day';

export interface FocusActivitySession {
  id: string;
  startedAt: number;
  endedAt: number;
  plannedDurationMs: number;
  actualDurationMs: number;
  overtimeMs: number;
  label: string;
  goalMs: number;
  status: 'completed';
}

export interface LegacyFocusSession {
  id: string;
  endedAt: number;
  durationMs: number;
  label: string;
}

export interface DailyActivity {
  dateKey: string;
  focusedMs: number;
  overtimeMs: number;
  sessionCount: number;
  goalMs: number;
  firstStartedAt: number | null;
}

export interface HeatmapDay extends DailyActivity {
  timestamp: number;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  future: boolean;
}

export interface WeekSummary {
  focusedMs: number;
  activeDays: number;
  averageActiveDayMs: number;
  goalsReached: number;
  scheduledGoalDays: number;
}

const DB_NAME = 'module-pomodoro-activity';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;
const FALLBACK_KEY = 'module-pomodoro-activity-fallback';

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('endedAt', 'endedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open activity database'));
  });
}

function readFallback() {
  if (typeof localStorage === 'undefined') return [] as FocusActivitySession[];

  try {
    const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isFocusActivitySession) : [];
  } catch {
    return [];
  }
}

function writeFallback(sessions: FocusActivitySession[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(sessions.slice(-1000)));
}

function isFocusActivitySession(value: unknown): value is FocusActivitySession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<FocusActivitySession>;

  return (
    typeof session.id === 'string' &&
    typeof session.startedAt === 'number' &&
    typeof session.endedAt === 'number' &&
    typeof session.plannedDurationMs === 'number' &&
    typeof session.actualDurationMs === 'number' &&
    typeof session.overtimeMs === 'number' &&
    typeof session.label === 'string' &&
    typeof session.goalMs === 'number' &&
    session.status === 'completed'
  );
}

export async function saveFocusSession(session: FocusActivitySession) {
  try {
    const database = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(session);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save session'));
    });

    database.close();
  } catch {
    const sessions = readFallback().filter((item) => item.id !== session.id);
    sessions.push(session);
    writeFallback(sessions);
  }
}

export async function saveFocusSessions(sessions: FocusActivitySession[]) {
  if (sessions.length === 0) return;

  try {
    const database = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      for (const session of sessions) store.put(session);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save sessions'));
    });

    database.close();
  } catch {
    const current = new Map(readFallback().map((session) => [session.id, session]));
    for (const session of sessions) current.set(session.id, session);
    writeFallback([...current.values()]);
  }
}

export async function loadFocusSessions() {
  try {
    const database = await openDatabase();

    const sessions = await new Promise<FocusActivitySession[]>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();

      request.onsuccess = () =>
        resolve(request.result.filter(isFocusActivitySession).sort((a, b) => b.endedAt - a.endedAt));
      request.onerror = () => reject(request.error ?? new Error('Unable to load sessions'));
    });

    database.close();
    return sessions;
  } catch {
    return readFallback().sort((a, b) => b.endedAt - a.endedAt);
  }
}

export async function clearFocusSessions() {
  try {
    const database = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to clear sessions'));
    });

    database.close();
  } catch {
    // Fallback is cleared below.
  }

  if (typeof localStorage !== 'undefined') localStorage.removeItem(FALLBACK_KEY);
}

export function migrateLegacySessions(
  sessions: LegacyFocusSession[],
  goalMs: number
): FocusActivitySession[] {
  return sessions
    .filter(
      (session) =>
        typeof session.id === 'string' &&
        typeof session.endedAt === 'number' &&
        typeof session.durationMs === 'number' &&
        session.durationMs > 0
    )
    .map((session) => ({
      id: `legacy-${session.id}`,
      startedAt: session.endedAt - session.durationMs,
      endedAt: session.endedAt,
      plannedDurationMs: session.durationMs,
      actualDurationMs: session.durationMs,
      overtimeMs: 0,
      label: typeof session.label === 'string' ? session.label : '',
      goalMs,
      status: 'completed' as const
    }));
}

export function localDateKey(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function aggregateDailyActivity(
  sessions: FocusActivitySession[],
  fallbackGoalMs: number
): DailyActivity[] {
  const days = new Map<string, DailyActivity>();

  for (const session of [...sessions].sort((a, b) => a.endedAt - b.endedAt)) {
    const dateKey = localDateKey(session.endedAt);
    const current = days.get(dateKey) ?? {
      dateKey,
      focusedMs: 0,
      overtimeMs: 0,
      sessionCount: 0,
      goalMs: fallbackGoalMs,
      firstStartedAt: null
    };

    current.focusedMs += Math.max(0, session.actualDurationMs);
    current.overtimeMs += Math.max(0, session.overtimeMs);
    current.sessionCount += 1;
    current.goalMs = session.goalMs > 0 ? session.goalMs : current.goalMs;
    current.firstStartedAt =
      current.firstStartedAt === null
        ? session.startedAt
        : Math.min(current.firstStartedAt, session.startedAt);

    days.set(dateKey, current);
  }

  return [...days.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function heatmapLevel(focusedMs: number, goalMs: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (focusedMs <= 0) return 0;
  if (goalMs <= 0) return 1;

  const ratio = focusedMs / goalMs;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  if (ratio < 1) return 4;
  return 5;
}

export function buildHeatmapDays(
  daily: DailyActivity[],
  fallbackGoalMs: number,
  now = Date.now(),
  weeks = 52
): HeatmapDay[] {
  const dayMap = new Map(daily.map((day) => [day.dateKey, day]));
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const currentMonday = new Date(today);
  const weekday = (currentMonday.getDay() + 6) % 7;
  currentMonday.setDate(currentMonday.getDate() - weekday);

  const firstMonday = new Date(currentMonday);
  firstMonday.setDate(firstMonday.getDate() - (weeks - 1) * 7);

  const result: HeatmapDay[] = [];

  for (let index = 0; index < weeks * 7; index += 1) {
    const date = new Date(firstMonday);
    date.setDate(firstMonday.getDate() + index);
    const timestamp = date.getTime();
    const dateKey = localDateKey(timestamp);
    const activity = dayMap.get(dateKey) ?? {
      dateKey,
      focusedMs: 0,
      overtimeMs: 0,
      sessionCount: 0,
      goalMs: fallbackGoalMs,
      firstStartedAt: null
    };
    const future = timestamp > today.getTime();

    result.push({
      ...activity,
      timestamp,
      level: future ? 0 : heatmapLevel(activity.focusedMs, activity.goalMs || fallbackGoalMs),
      future
    });
  }

  return result;
}

export function isScheduledGoalDay(date: Date, schedule: GoalSchedule) {
  if (schedule === 'every-day') return true;
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function calculateWeekSummary(
  daily: DailyActivity[],
  fallbackGoalMs: number,
  schedule: GoalSchedule,
  now = Date.now()
): WeekSummary {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const monday = new Date(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  const dayMap = new Map(daily.map((day) => [day.dateKey, day]));
  let focusedMs = 0;
  let activeDays = 0;
  let goalsReached = 0;
  let scheduledGoalDays = 0;

  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + offset);
    if (date > today) break;

    const activity = dayMap.get(localDateKey(date.getTime()));
    if (activity && activity.focusedMs > 0) {
      focusedMs += activity.focusedMs;
      activeDays += 1;
    }

    if (isScheduledGoalDay(date, schedule)) {
      scheduledGoalDays += 1;
      const goalMs = activity?.goalMs || fallbackGoalMs;
      if (activity && activity.focusedMs >= goalMs) goalsReached += 1;
    }
  }

  return {
    focusedMs,
    activeDays,
    averageActiveDayMs: activeDays > 0 ? focusedMs / activeDays : 0,
    goalsReached,
    scheduledGoalDays
  };
}

export function sessionsForDate(sessions: FocusActivitySession[], dateKey: string) {
  return sessions
    .filter((session) => localDateKey(session.endedAt) === dateKey)
    .sort((a, b) => a.startedAt - b.startedAt);
}

export function sessionsToCsv(sessions: FocusActivitySession[]) {
  const escape = (value: string | number) => {
    const stringValue = String(value);
    return /[",\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
  };

  const header = [
    'started_at',
    'ended_at',
    'planned_minutes',
    'actual_minutes',
    'overtime_minutes',
    'label',
    'goal_hours',
    'status'
  ];

  const rows = sessions.map((session) => [
    new Date(session.startedAt).toISOString(),
    new Date(session.endedAt).toISOString(),
    Math.round(session.plannedDurationMs / 60_000),
    Math.round(session.actualDurationMs / 60_000),
    Math.round(session.overtimeMs / 60_000),
    session.label,
    Number((session.goalMs / 3_600_000).toFixed(2)),
    session.status
  ]);

  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}
