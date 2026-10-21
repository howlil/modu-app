import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OUTBOX_STORE, SYNC_META_STORE, initializeCaptureWithBaseline, SYNC_OUTBOX_COMMITTED_EVENT
} from "../../src/lib/platform/data/outbox.ts";
import {
  loadHabitSnapshot, createConfiguredHabit, changeHabitTitle,
  deleteHabit, replaceHabitSnapshotForRestore, readHabitPendingSyncOperations,
  acknowledgeHabitSyncOperations, beginHabitSyncCapture
} from "../../src/lib/modules/habit-tracker/adapters/persistence.ts";
import {
  saveFocusSession, exportFocusSessionsForBackup,
  readFocusPendingSyncOperations, beginFocusSyncCapture
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
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, val: string) => { storage.set(key, val); },
    removeItem: (key: string) => { storage.delete(key); }
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  await reset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Local committed outbox notifications", () => {
  it("fires once after an actual queued local mutation, never for local-only edits", async () => {
    const windowTarget = new EventTarget();
    vi.stubGlobal("window", windowTarget);
    let notifications = 0;
    windowTarget.addEventListener(SYNC_OUTBOX_COMMITTED_EVENT, () => { notifications++; });
    await loadHabitSnapshot();
    await createConfiguredHabit({
      title: "Local only", direction: "BUILD", measurement: "COUNT", target: 1
    }, "2026-10-20");
    expect(notifications).toBe(0);
    await beginHabitSyncCapture("paired-habit");
    expect(notifications).toBe(0); // owner sync explicitly uploads baseline
    await createConfiguredHabit({
      title: "Queued", direction: "BUILD", measurement: "COUNT", target: 1
    }, "2026-10-20");
    expect(notifications).toBe(1);
    const habitId = (await loadHabitSnapshot()).habits.find(x => x.title === "Queued")!.id;
    await changeHabitTitle(habitId, "Queued updated");
    expect(notifications).toBe(2);
    expect((await readHabitPendingSyncOperations()).length).toBe(3);
  });

  it("does not notify when transaction aborts on corrupt capture metadata", async () => {
    const windowTarget = new EventTarget();
    vi.stubGlobal("window", windowTarget);
    let notifications = 0;
    windowTarget.addEventListener(SYNC_OUTBOX_COMMITTED_EVENT, () => { notifications++; });
    await loadHabitSnapshot();
    await beginHabitSyncCapture("paired-habit");
    await corruptCapture("habit-tracker");
    await expect(createConfiguredHabit({
      title: "Rejected", direction: "BUILD", measurement: "COUNT", target: 2
    }, "2026-10-20")).rejects.toThrow();
    expect(notifications).toBe(0);
  });
});

describe("M3 per-module atomic outbox", () => {
  it("atomically captures existing Habit data, then journals subsequent edits", async () => {
    await loadHabitSnapshot();
    await createConfiguredHabit({ title: "Existing", direction: "BUILD", measurement: "COUNT", target: 3 }, "2026-10-20");
    await beginHabitSyncCapture("paired-habit");
    const pending = await readHabitPendingSyncOperations();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ kind: "baseline", deviceId: "paired-habit" });
    const baseline = pending[0].payload as { habits: unknown[]; policies: unknown[] };
    expect(baseline.habits).toHaveLength(1);
    expect(baseline.policies).toHaveLength(1);
    await createConfiguredHabit({ title: "Next", direction: "BUILD", measurement: "COUNT", target: 2 }, "2026-10-20");
    expect((await readHabitPendingSyncOperations()).map(x => x.kind)).toEqual(["baseline", "upsert"]);
    await expect(beginHabitSyncCapture("other-device")).rejects.toThrow();
    expect(await readHabitPendingSyncOperations()).toHaveLength(2);
  });

  it("migrates Pomodoro fallback history into a single authoritative baseline", async () => {
    const historical = session("fallback-id");
    localStorage.setItem("module-pomodoro-activity-fallback", JSON.stringify([historical]));
    await saveFocusSession(session("indexed-id"));
    await beginFocusSyncCapture("paired-focus");
    const pending = await readFocusPendingSyncOperations();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ kind: "baseline", deviceId: "paired-focus" });
    expect((pending[0].payload as { sessions: FocusActivitySession[] }).sessions.map(x => x.id).sort())
      .toEqual(["fallback-id", "indexed-id"]);
    expect((await exportFocusSessionsForBackup()).map(x => x.id).sort())
      .toEqual(["fallback-id", "indexed-id"]);
    expect(localStorage.getItem("module-pomodoro-activity-fallback")).toBeNull();
  });

  it("reconciles a paired focus session saved via localStorage fallback exactly once", async () => {
    await saveFocusSession(session("initial"));
    await beginFocusSyncCapture("paired-focus");
    const actualIndexedDb = indexedDB;
    vi.stubGlobal("indexedDB", undefined);
    await saveFocusSession(session("offline"));
    expect(localStorage.getItem("module-pomodoro-activity-fallback")).toBeTruthy();
    vi.stubGlobal("indexedDB", actualIndexedDb);
    const first = await readFocusPendingSyncOperations();
    expect(first.map(x => x.kind)).toEqual(["baseline", "upsert"]);
    expect(first[1].entityId).toBe("offline");
    expect((await readFocusPendingSyncOperations()).map(x => x.operationId))
      .toEqual(first.map(x => x.operationId));
    expect(localStorage.getItem("module-pomodoro-activity-fallback")).toBeNull();
    expect((await exportFocusSessionsForBackup()).map(x => x.id).sort())
      .toEqual(["initial", "offline"]);
  });

  it("refuses destructive focus history clear when a paired database is unavailable", async () => {
    await saveFocusSession(session("protected"));
    await beginFocusSyncCapture("paired-focus");
    const actualIndexedDb = indexedDB;
    vi.stubGlobal("indexedDB", undefined);
    const { clearFocusSessions } = await import("../../src/lib/shared/focus-sessions/repository.ts");
    await expect(clearFocusSessions()).rejects.toThrow("Cannot clear synchronized");
    vi.stubGlobal("indexedDB", actualIndexedDb);
    expect((await exportFocusSessionsForBackup()).map(x => x.id)).toEqual(["protected"]);
  });

  it("baselines the validated Learning profile and catalog before further writes", async () => {
    await learningPersistence.profiles();
    await learningPersistence.createProfile({ id: "spanish", targetLanguage: "es" });
    await learningPersistence.beginSyncCapture("paired-learning");
    const pending = await learningPersistence.readPendingSyncOperations();
    expect(pending).toHaveLength(1);
    const backup = pending[0].payload as { profiles: Array<{id:string}>; catalogs: unknown[] };
    expect(backup.profiles.some(x => x.id === "spanish")).toBe(true);
    expect(Array.isArray(backup.catalogs)).toBe(true);
    await learningPersistence.createProfile({ id: "french", targetLanguage: "fr" });
    expect((await learningPersistence.readPendingSyncOperations()).map(x => x.kind))
      .toEqual(["baseline", "upsert"]);
  });


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
