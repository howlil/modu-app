import type { SyncOutboxPort } from "#lib/platform/data/contracts.ts";
import { learningPersistence } from "./persistence.ts";

async function snapshot(): Promise<unknown> {
  return JSON.parse(await learningPersistence.exportBackup()) as unknown;
}

function encodedBackup(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Language Learning backup.");
  }
  return JSON.stringify(value);
}

export const learningDataPort: SyncOutboxPort = {
  moduleId: "language-learning",
  backupVersion: 3,
  async inspect() {
    const data = await snapshot();
    if (!data || typeof data !== "object" || !("sessions" in data) || !Array.isArray(data.sessions)) {
      throw new Error("Learning data backup is invalid.");
    }
    const record = data as Record<string, unknown>;
    const counters = [data.sessions];
    for (const field of ["profiles", "catalogs", "reviews"] as const) {
      if (field in data) {
        const collection = record[field];
        if (!Array.isArray(collection)) throw new Error("Invalid Language Learning " + field + " collection.");
        counters.push(collection);
      }
    }
    const recordCount = counters.reduce((sum, collection) => sum + collection.length, 0);
    return { moduleId: "language-learning", backupVersion: 3, recordCount, state: recordCount ? "ready" : "empty" };
  },
  exportBackup: snapshot,
  beginRemoteSyncCapture: deviceId => learningPersistence.beginRemoteSyncCapture(deviceId),
  readRemoteCursor: () => learningPersistence.readRemoteCursor(),
  applyRemoteChanges: events => learningPersistence.applyRemoteChanges(events),

  beginSyncCapture: deviceId => learningPersistence.beginSyncCapture(deviceId),
  readPendingSyncOperations: limit => learningPersistence.readPendingSyncOperations(limit),
  acknowledgeSyncOperations: ids => learningPersistence.acknowledgeSyncOperations(ids),

  async validateBackup(data) {
    const stats = learningPersistence.validateBackup(encodedBackup(data));
    return { moduleId: "language-learning", recordCount: stats.records, warnings: [] };
  },
  async restoreBackup(data) {
    await learningPersistence.importBackup(encodedBackup(data));
  }
};
