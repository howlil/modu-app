import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pomodoroDataPort } from "../../src/lib/modules/pomodoro/adapters/data-port.ts";
import { savePomodoroSnapshot, readPomodoroSnapshot } from "../../src/lib/modules/pomodoro/adapters/persistence.ts";
import { saveFocusSession, exportFocusSessionsForBackup } from "../../src/lib/shared/focus-sessions/repository.ts";
import { habitDataPort } from "../../src/lib/modules/habit-tracker/adapters/data-port.ts";
import {
  createConfiguredHabit, loadHabitSnapshot
} from "../../src/lib/modules/habit-tracker/adapters/persistence.ts";
import type { FocusActivitySession } from "../../src/lib/shared/focus-sessions/types.ts";

function dropDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB connection leak: " + name));
  });
}

let storage: Map<string, string>;
beforeEach(async () => {
  await dropDatabase("module-pomodoro-activity");
  await dropDatabase("modu-habit-tracker");
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); }
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function session(id: string, endedAt: number): FocusActivitySession {
  return { id, startedAt: endedAt - 60000, endedAt,
    plannedDurationMs: 60000, actualDurationMs: 60000, overtimeMs: 0,
    label: id, goalMs: 3600000, status: "completed" };
}

describe("real feature-owned restore ports", () => {
  it("restores Pomodoro history and saved timer settings", async () => {
    savePomodoroSnapshot({ focusText: "First" });
    await saveFocusSession(session("old", 100000));
    const backup = await pomodoroDataPort.exportBackup();
    await saveFocusSession(session("new", 200000));
    savePomodoroSnapshot({ focusText: "Changed" });
    await pomodoroDataPort.restoreBackup(backup);
    expect((await exportFocusSessionsForBackup()).map(s => s.id)).toEqual(["old"]);
    expect(readPomodoroSnapshot()?.focusText).toBe("First");
  });

  it("restores Habit records atomically, preserving their policies", async () => {
    await loadHabitSnapshot();
    await createConfiguredHabit({ title: "Read", direction: "BUILD", measurement: "COUNT", target: 2 }, "2026-10-20");
    const saved = await loadHabitSnapshot();
    const backup = await habitDataPort.exportBackup();
    await createConfiguredHabit({ title: "Write", direction: "BUILD", measurement: "COUNT", target: 1 }, "2026-10-20");
    await habitDataPort.restoreBackup(backup);
    const actual = await loadHabitSnapshot();
    expect(actual).toEqual(saved);
  });

  it("rejects invalid Habit relationships without deleting records", async () => {
    await loadHabitSnapshot();
    await createConfiguredHabit({ title: "Read", direction: "BUILD", measurement: "COUNT", target: 2 }, "2026-10-20");
    const before = await loadHabitSnapshot();
    const bad = { format: "modu-habit-tracker", version: 1,
      data: { ...before, checkins: [{ id: "bad", habitId: "missing", localDate: "2026-10-20" }] } };
    await expect(habitDataPort.restoreBackup(bad)).rejects.toThrow();
    expect(await loadHabitSnapshot()).toEqual(before);
  });
});
