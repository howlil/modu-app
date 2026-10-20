import type { ModuleDataPort } from "#lib/platform/data/contracts.ts";
import { learningPersistence } from "./persistence.ts";

/** Reuse the module's validated v1–v3 backup and transaction semantics. */
async function snapshot(): Promise<unknown> {
  return JSON.parse(await learningPersistence.exportBackup()) as unknown;
}

export const learningDataPort: ModuleDataPort = {
  moduleId: "language-learning",
  backupVersion: 3,
  async inspect() {
    const data = await snapshot();
    if (!data || typeof data !== "object" || !("sessions" in data) || !Array.isArray(data.sessions)) {
      throw new Error("Learning data backup is invalid.");
    }
    const recordCount = data.sessions.length;
    return { moduleId: "language-learning", backupVersion: 3, recordCount, state: recordCount ? "ready" : "empty" };
  },
  exportBackup: snapshot
};
