import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportFocusSessionsForBackup,
  saveFocusSession
} from "../../src/lib/shared/focus-sessions/repository.ts";
import type { FocusActivitySession } from "../../src/lib/shared/focus-sessions/types.ts";

const DB_NAME = "module-pomodoro-activity";
const FALLBACK_KEY = "module-pomodoro-activity-fallback";
let values: Map<string, string>;

function session(id: string, endedAt: number): FocusActivitySession {
  return {
    id, startedAt: endedAt - 60000, endedAt,
    plannedDurationMs: 60000, actualDurationMs: 60000,
    overtimeMs: 0, label: id, goalMs: 3600000, status: "completed"
  };
}

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Leaked Pomodoro DB connection"));
  });
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("global Pomodoro backup safety", () => {
  it("includes IDB and legacy fallback records without duplicate IDs", async () => {
    const old = session("old", 100000);
    const common = session("common", 200000);
    values.set(FALLBACK_KEY, JSON.stringify([old, common]));
    await saveFocusSession({ ...common, endedAt: 200000 });
    await saveFocusSession(session("new", 300000));
    const saved = await exportFocusSessionsForBackup();
    expect(saved.map(x => x.id)).toEqual(["new", "common", "old"]);
    expect(saved.find(x => x.id === "common")?.endedAt).toBe(200000);
  });

  it("rejects conflicting copies of the same session in IDB and fallback", async () => {
    values.set(FALLBACK_KEY, JSON.stringify([session("common", 150000)]));
    await saveFocusSession(session("common", 200000));
    await expect(exportFocusSessionsForBackup()).rejects.toThrow("Conflicting Pomodoro records");
  });

  it("rejects corrupted fallback instead of silently exporting partial history", async () => {
    values.set(FALLBACK_KEY, "{broken");
    await expect(exportFocusSessionsForBackup()).rejects.toThrow();
  });

  it("rejects unavailable IndexedDB instead of claiming an empty backup", async () => {
    values.set(FALLBACK_KEY, JSON.stringify([session("fallback", 100000)]));
    vi.stubGlobal("indexedDB", undefined);
    await expect(exportFocusSessionsForBackup()).rejects.toThrow("IndexedDB");
  });
});
