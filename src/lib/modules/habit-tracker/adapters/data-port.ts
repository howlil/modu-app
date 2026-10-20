import type { ModuleDataPort } from "#lib/platform/data/contracts.ts";
import { loadHabitSnapshot } from "./persistence.ts";

/** Existing module transaction + invariants stay authoritative. */
async function snapshot() {
  const data = await loadHabitSnapshot();
  return { format: "modu-habit-tracker", version: 1, data };
}

export const habitDataPort: ModuleDataPort = {
  moduleId: "habit-tracker",
  backupVersion: 1,
  async inspect() {
    const { data } = await snapshot();
    const recordCount = data.habits.length + data.policies.length + data.checkins.length;
    return { moduleId: "habit-tracker", backupVersion: 1, recordCount, state: recordCount ? "ready" : "empty" };
  },
  exportBackup: snapshot
};
