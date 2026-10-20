import type { SyncOutboxPort } from "#lib/platform/data/contracts.ts";
import { readPomodoroSnapshot, savePomodoroSnapshot, clearPomodoroSnapshot, type PersistedPomodoroState } from "./persistence.ts";
import {
  exportFocusSessionsForBackup, replaceFocusSessionsForRestore,
  isFocusActivitySession, readFocusPendingSyncOperations, beginFocusSyncCapture, acknowledgeFocusSyncOperations, readFocusRemoteCursor, applyFocusRemoteChanges, beginFocusRemoteCapture
} from "#lib/shared/focus-sessions/repository.ts";
import type { FocusActivitySession } from "#lib/shared/focus-sessions/types.ts";

type PomodoroBackup = { format: "modu-pomodoro"; version: 1; timer: PersistedPomodoroState | null; sessions: FocusActivitySession[] };

function decodeBackup(value: unknown): PomodoroBackup {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Pomodoro backup.");
  const data = value as Record<string, unknown>;
  if (data.format !== "modu-pomodoro" || data.version !== 1 || !Array.isArray(data.sessions)) {
    throw new Error("Unsupported Pomodoro backup format.");
  }
  if (data.timer !== null && (typeof data.timer !== "object" || Array.isArray(data.timer))) {
    throw new Error("Invalid Pomodoro timer snapshot.");
  }
  if (!data.sessions.every(isFocusActivitySession) ||
      new Set(data.sessions.map((row: FocusActivitySession) => row.id)).size !== data.sessions.length) {
    throw new Error("Invalid or duplicate Pomodoro focus session.");
  }
  return { format: "modu-pomodoro", version: 1,
    timer: data.timer as PersistedPomodoroState | null, sessions: data.sessions };
}

/** Running timers stay device-local in sync; backup restoration is a separate explicit action. */
async function snapshot(): Promise<PomodoroBackup> {
  const timer = readPomodoroSnapshot();
  const sessions = await exportFocusSessionsForBackup();
  return { format: "modu-pomodoro", version: 1, timer, sessions };
}

export const pomodoroDataPort: SyncOutboxPort = {
  moduleId: "pomodoro",
  backupVersion: 1,
  async inspect() {
    const data = await snapshot();
    const recordCount = data.sessions.length + (data.timer ? 1 : 0);
    return { moduleId: "pomodoro", backupVersion: 1, recordCount, state: recordCount ? "ready" : "empty" };
  },
  exportBackup: snapshot,
  beginRemoteSyncCapture: beginFocusRemoteCapture,
  readRemoteCursor: readFocusRemoteCursor,
  applyRemoteChanges: applyFocusRemoteChanges,

  beginSyncCapture: beginFocusSyncCapture,
  readPendingSyncOperations: readFocusPendingSyncOperations,
  acknowledgeSyncOperations: acknowledgeFocusSyncOperations,

  async validateBackup(data) {
    const parsed = decodeBackup(data);
    return { moduleId: "pomodoro",
      recordCount: parsed.sessions.length + (parsed.timer ? 1 : 0), warnings: ["Active timer will be restored to this browser and recalculated on reload."] };
  },
  async restoreBackup(data) {
    const parsed = decodeBackup(data);
    await replaceFocusSessionsForRestore(parsed.sessions);
    if (parsed.timer) savePomodoroSnapshot(parsed.timer);
    else clearPomodoroSnapshot();
  }
};
