import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OUTBOX_STORE, SYNC_META_STORE, initializeCaptureWithBaseline
} from "../../src/lib/platform/data/outbox.ts";
import {
  loadHabitSnapshot, createConfiguredHabit, changeHabitTitle,
  deleteHabit, replaceHabitSnapshotForRestore, readHabitPendingSyncOperations,
  acknowledgeHabitSyncOperations
} from "../../src/lib/modules/habit-tracker/adapters/persistence.ts";
import {
  saveFocusSession, exportFocusSessionsForBackup,
  readFocusPendingSyncOperations
} from "../../src/lib/shared/focus-sessions/repository.ts";
import { learningPersistence } from "../../src/lib/modules/language-learning/adapters/persistence.ts";
import type { FocusActivitySession } from "../../src/lib/shared/focus-sessions/types.ts";

type Module = "habit-tracker" | "pomodoro" | "language-learning";
const databases: Record<Module, string> = {
  "habit-tracker": "modu-habit-tracker",
  "pomodoro": "module-pomodoro-activity",
  "language-learning": "modu-language-learning"
};
const session = (id: string): FocusActivitySession => ({
  id, startedAt: 1000, endedAt: 2000, plannedDurationMs: 1000,
  actualDurationMs: 1000, overtimeMs: 0, label: "demo", goalMs: 3600000, status: "completed"
});
async function openDb(module: Module): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(databases[module]);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function initCapture(module: Module, baseline: unknown = { records: [] }): Promise<void> {
  const db = await openDb(module);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([SYNC_META_STORE, OUTBOX_STORE], "readwrite");
      initializeCaptureWithBaseline(tx, module, "device-A", baseline);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("capture aborted"));
    });
  } finally { db.close(); }
}
async function corruptCapture(module: Module): Promise<void> {
  const db = await openDb(module);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SYNC_META_STORE, "readwrite");
      tx.objectStore(SYNC_META_STORE).put({ key: "capture", enabled: false, deviceId: "bad" });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function reset(): Promise<void> {
  for (const name of Object.values(databases)) {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("Leaked IDB connection: " + name));
    });
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  await reset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("M3 per-module atomic outbox", () => {
  it("defaults to local-only and avoids accumulating queue entries", async () => {
    await loadHabitSnapshot();
    await createConfiguredHabit({ title: "Read", direction: "BUILD", measurement: "COUNT", target: 3 }, "2026-10-20");
    expect(await readHabitPendingSyncOperations()).toEqual([]);
  });

  it("queues Habit create/edit/tombstone with monotonic local sequence and supports idempotent ack", async () => {
    await loadHabitSnapshot();
    await initCapture("habit-tracker");
    await createConfiguredHabit({ title: "Read", direction: "BUILD", measurement: "COUNT", target: 3 }, "2026-10-20");
    const habitId = (await loadHabitSnapshot()).habits[0].id;
    await changeHabitTitle(habitId, "Study");
    await deleteHabit(habitId);
    const pending = await readHabitPendingSyncOperations();
    expect(pending.map(x => x.kind)).toEqual(["baseline", "upsert", "upsert", "delete"]);
    expect(pending.every(x => x.moduleId === "habit-tracker" && x.deviceId === "device-A")).toBe(true);
    expect(pending.map(x => x.sequence)).toEqual([1, 2, 3, 4]);
    const ids = pending.slice(0, 2).map(x => x.operationId);
    await acknowledgeHabitSyncOperations(ids);
    await acknowledgeHabitSyncOperations(ids);
    expect((await readHabitPendingSyncOperations()).map(x => x.operationId))
      .toEqual(pending.slice(2).map(x => x.operationId));
  });

  it("aborts Habit domain mutation when its outbox metadata is corrupt", async () => {
    await loadHabitSnapshot();
    await createConfiguredHabit({ title: "Old", direction: "BUILD", measurement: "COUNT", target: 2 }, "2026-10-20");
    const before = await loadHabitSnapshot();
    await corruptCapture("habit-tracker");
    await expect(changeHabitTitle(before.habits[0].id, "Should not commit")).rejects.toThrow();
    expect(await loadHabitSnapshot()).toEqual(before);
    expect(await readHabitPendingSyncOperations()).toEqual([]);
  });

  it("restoring Habit data invalidates old outbox and capture generation", async () => {
    await loadHabitSnapshot();
    const original = await loadHabitSnapshot();
    await initCapture("habit-tracker");
    await createConfiguredHabit({ title: "Draft", direction: "BUILD", measurement: "COUNT", target: 2 }, "2026-10-20");
    expect(await readHabitPendingSyncOperations()).toHaveLength(2);
    await replaceHabitSnapshotForRestore(original);
    expect(await readHabitPendingSyncOperations()).toEqual([]);
    await createConfiguredHabit({ title: "Local again", direction: "BUILD", measurement: "COUNT", target: 2 }, "2026-10-20");
    expect(await readHabitPendingSyncOperations()).toEqual([]);
  });

  it("queues focus sessions in the same transaction and rejects an aborted outbox transaction", async () => {
    await saveFocusSession(session("first")); // Initialize the feature database.
    await initCapture("pomodoro", { sessions: [session("first")] });
    await saveFocusSession(session("second"));
    const pending = await readFocusPendingSyncOperations();
    expect(pending.map(x => x.kind)).toEqual(["baseline", "upsert"]);
    await corruptCapture("pomodoro");
    await expect(saveFocusSession(session("cannot-commit"))).rejects.toThrow();
    expect((await exportFocusSessionsForBackup()).map(x => x.id).sort()).toEqual(["first", "second"]);
  });

  it("queues Learning profile writes atomically without changing bootstrap data", async () => {
    await learningPersistence.profiles();
    await initCapture("language-learning");
    await learningPersistence.createProfile({ id: "test-ja", targetLanguage: "ja" });
    const queued = await learningPersistence.readPendingSyncOperations();
    expect(queued).toHaveLength(2);
    expect(queued[1]).toMatchObject({
      kind: "upsert", moduleId: "language-learning", entityId: "test-ja"
    });
    await corruptCapture("language-learning");
    await expect(learningPersistence.createProfile({ id: "test-fr", targetLanguage: "fr" })).rejects.toThrow();
    expect((await learningPersistence.profiles()).some(x => x.id === "test-fr")).toBe(false);
  });
});
