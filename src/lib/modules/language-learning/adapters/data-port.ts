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
    const counters = [data.sessions];
    for (const field of ["profiles", "catalogs", "reviews"] as const) {
      if (field in data) {
        const collection = data[field];
        if (!Array.isArray(collection)) throw new Error("Invalid Language Learning " + field + " collection.");
        counters.push(collection);
      }
    }
    const recordCount = counters.reduce((sum, collection) => sum + collection.length, 0);
    return { moduleId: "language-learning", backupVersion: 3, recordCount, state: recordCount ? "ready" : "empty" };
  },
  exportBackup: snapshot
};
