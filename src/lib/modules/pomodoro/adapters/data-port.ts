import type { ModuleDataPort } from "#lib/platform/data/contracts.ts";
import { readPomodoroSnapshot } from "./persistence.ts";
import { exportFocusSessionsForBackup } from "#lib/shared/focus-sessions/repository.ts";

/** Timer is exported for offline backup only, not replicated as an active cross-device timer. */
async function snapshot() {
  const timer = readPomodoroSnapshot();
  const sessions = await exportFocusSessionsForBackup();
  return { format: "modu-pomodoro", version: 1, timer, sessions };
}

export const pomodoroDataPort: ModuleDataPort = {
  moduleId: "pomodoro",
  backupVersion: 1,
  async inspect() {
    const data = await snapshot();
    const recordCount = data.sessions.length + (data.timer ? 1 : 0);
    return { moduleId: "pomodoro", backupVersion: 1, recordCount, state: recordCount ? "ready" : "empty" };
  },
  exportBackup: snapshot
};
