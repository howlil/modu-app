import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  saveFocusSession, exportFocusSessionsForBackup,
  applyFocusRemoteChanges, readFocusRemoteCursor,
  beginFocusSyncCapture
} from "../../src/lib/shared/focus-sessions/repository.ts";
import {
  loadHabitSnapshot, createConfiguredHabit,
  applyHabitRemoteChanges, readHabitRemoteCursor
} from "../../src/lib/modules/habit-tracker/adapters/persistence.ts";
import { learningPersistence } from "../../src/lib/modules/language-learning/adapters/persistence.ts";
import type { SequencedSyncOperation } from "../../src/lib/platform/data/sync-protocol.ts";
import type { FocusActivitySession } from "../../src/lib/shared/focus-sessions/types.ts";

const DB_NAMES = ["module-pomodoro-activity", "modu-habit-tracker", "modu-language-learning"];
async function drop(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Leaked IDB handle: " + name));
  });
}
const makeSession = (id: string, endedAt = 80000): FocusActivitySession => ({
  id, startedAt: endedAt - 60000, endedAt,
  plannedDurationMs: 60000, actualDurationMs: 60000,
  overtimeMs: 0, label: "Study", goalMs: 3600000, status: "completed"
});
function op(
  moduleId: SequencedSyncOperation["moduleId"], sequence: number,
  entityId: string, kind: SequencedSyncOperation["kind"], payload: unknown
): SequencedSyncOperation {
  return { sequence, operationId: "remote_" + sequence, deviceId: "device_remote_0001",
    moduleId, entityId, kind, baseRevision: null, createdAt: 1792520000000, payload };
}
let storage: Map<string,string>;
beforeEach(async () => {
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); }
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  for (const name of DB_NAMES) await drop(name);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("M5 transactional module-owned remote replay", () => {
  it("imports immutable focus history and commits inbox+cursor idempotently", async () => {
    const baseline = op("pomodoro", 1, "module", "baseline", { sessions: [makeSession("focus-a")] });
    const extra = op("pomodoro", 2, "focus-b", "upsert", { session: makeSession("focus-b") });
    await applyFocusRemoteChanges([baseline, extra]);
    expect((await exportFocusSessionsForBackup()).map(x => x.id).sort()).toEqual(["focus-a", "focus-b"]);
    expect(await readFocusRemoteCursor()).toBe(2);
    await applyFocusRemoteChanges([baseline, extra]);
    expect((await exportFocusSessionsForBackup()).map(x => x.id)).toHaveLength(2);
    expect(await readFocusRemoteCursor()).toBe(2);
  });
  it("rejects conflicting remote event without updating cursor or existing focus record", async () => {
    await applyFocusRemoteChanges([op("pomodoro", 1, "focus-a", "upsert", { session: makeSession("focus-a") })]);
    await expect(applyFocusRemoteChanges([
      op("pomodoro", 2, "focus-a", "upsert", { session: makeSession("focus-a", 90000) })
    ])).rejects.toThrow();
    expect(await readFocusRemoteCursor()).toBe(1);
    expect((await exportFocusSessionsForBackup())[0].endedAt).toBe(80000);
  });
  it("does not overwrite local focus changes while an outbox is pending", async () => {
    await saveFocusSession(makeSession("local"));
    await beginFocusSyncCapture("device_local_0001");
    await expect(applyFocusRemoteChanges([
      op("pomodoro", 1, "module", "baseline", { sessions: [makeSession("remote")] })
    ])).rejects.toThrow("Push local pending");
    expect(await readFocusRemoteCursor()).toBe(0);
  });
  it("imports a Habit baseline into a clean feature database, without echoing local operations", async () => {
    await loadHabitSnapshot();
    await createConfiguredHabit({
      title: "Read", direction: "BUILD", measurement: "COUNT", target: 2
    }, "2026-10-20");
    const baseline = await loadHabitSnapshot();
    await drop("modu-habit-tracker");
    await loadHabitSnapshot();
    await applyHabitRemoteChanges([op("habit-tracker", 1, "module", "baseline", baseline)]);
    expect((await loadHabitSnapshot()).habits).toEqual(baseline.habits);
    expect(await readHabitRemoteCursor()).toBe(1);
    await applyHabitRemoteChanges([op("habit-tracker", 1, "module", "baseline", baseline)]);
    expect((await loadHabitSnapshot()).habits).toHaveLength(1);
  });
  it("imports a Learning backup with profiles without losing SRS projection", async () => {
    await learningPersistence.profiles();
    await learningPersistence.createProfile({ id: "test-fr", targetLanguage: "fr" });
    const baseline = JSON.parse(await learningPersistence.exportBackup());
    await drop("modu-language-learning");
    await learningPersistence.applyRemoteChanges([
      op("language-learning", 1, "module", "baseline", baseline)
    ]);
    expect((await learningPersistence.profiles()).some(x => x.id === "test-fr")).toBe(true);
    expect(await learningPersistence.readRemoteCursor()).toBe(1);
    await learningPersistence.applyRemoteChanges([op("language-learning", 1, "module", "baseline", baseline)]);
    expect(await learningPersistence.readRemoteCursor()).toBe(1);
  });
  it("rejects out-of-order remote sequence before any database writes", async () => {
    await expect(applyFocusRemoteChanges([
      op("pomodoro", 2, "a", "upsert", { session: makeSession("a") }),
      op("pomodoro", 1, "b", "upsert", { session: makeSession("b") })
    ])).rejects.toThrow("strictly ordered");
    expect(await readFocusRemoteCursor()).toBe(0);
  });
});
