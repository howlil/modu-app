import type { SyncOutboxPort } from "#lib/platform/data/contracts.ts";
import {
  loadHabitSnapshot, replaceHabitSnapshotForRestore,
  validateHabitSnapshot, type HabitSnapshot,
  readHabitPendingSyncOperations, beginHabitSyncCapture, acknowledgeHabitSyncOperations
} from "./persistence.ts";

type HabitBackup = { format: "modu-habit-tracker"; version: 1; data: HabitSnapshot };

function decodeBackup(value: unknown): HabitBackup {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Habit backup.");
  const data = value as Record<string, unknown>;
  if (data.format !== "modu-habit-tracker" || data.version !== 1 ||
      !data.data || typeof data.data !== "object" || Array.isArray(data.data)) {
    throw new Error("Unsupported Habit backup format.");
  }
  const snapshot = data.data as HabitSnapshot;
  if (!Array.isArray(snapshot.habits) || !Array.isArray(snapshot.policies) ||
      !Array.isArray(snapshot.checkins) || typeof snapshot.trackingTimezone !== "string") {
    throw new Error("Incomplete Habit backup snapshot.");
  }
  validateHabitSnapshot(snapshot);
  return { format: "modu-habit-tracker", version: 1, data: snapshot };
}

async function snapshot(): Promise<HabitBackup> {
  return { format: "modu-habit-tracker", version: 1, data: await loadHabitSnapshot() };
}

export const habitDataPort: SyncOutboxPort = {
  moduleId: "habit-tracker",
  backupVersion: 1,
  async inspect() {
    const { data } = await snapshot();
    const recordCount = data.habits.length + data.policies.length + data.checkins.length;
    return { moduleId: "habit-tracker", backupVersion: 1, recordCount, state: recordCount ? "ready" : "empty" };
  },
  exportBackup: snapshot,
  beginSyncCapture: beginHabitSyncCapture,
  readPendingSyncOperations: readHabitPendingSyncOperations,
  acknowledgeSyncOperations: acknowledgeHabitSyncOperations,

  async validateBackup(value) {
    const { data } = decodeBackup(value);
    return { moduleId: "habit-tracker",
      recordCount: data.habits.length + data.policies.length + data.checkins.length, warnings: [] };
  },
  async restoreBackup(value) {
    await replaceHabitSnapshotForRestore(decodeBackup(value).data);
  }
};
