import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { globalDataPorts } from "../../src/lib/platform/data/registry.ts";
import { saveFocusSession, exportFocusSessionsForBackup } from "../../src/lib/shared/focus-sessions/repository.ts";
import { createConfiguredHabit, loadHabitSnapshot } from "../../src/lib/modules/habit-tracker/adapters/persistence.ts";
import { learningPersistence } from "../../src/lib/modules/language-learning/adapters/persistence.ts";
import type { PracticeCommand } from "../../src/lib/modules/language-learning/core/persistence.ts";
import type { SequencedSyncOperation } from "../../src/lib/platform/data/sync-protocol.ts";
import type { PendingSyncOperation } from "../../src/lib/platform/data/outbox.ts";

const instances = [
  { idb: new IDBFactory(), prefs: new Map<string,string>() },
  { idb: new IDBFactory(), prefs: new Map<string,string>() }
];
function useBrowser(index: 0 | 1): void {
  const browser = instances[index];
  vi.stubGlobal("indexedDB", browser.idb);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => browser.prefs.get(key) ?? null,
    setItem: (key: string, val: string) => { browser.prefs.set(key, val); },
    removeItem: (key: string) => { browser.prefs.delete(key); }
  });
}
function record(id: string) {
  return { id, startedAt: 100000, endedAt: 160000, plannedDurationMs: 60000,
    actualDurationMs: 60000, overtimeMs: 0, label: id, goalMs: 3600000,
    status: "completed" as const };
}
async function pushBrowserEvents(server: SequencedSyncOperation[]): Promise<number> {
  let count = 0;
  for (const port of globalDataPorts) {
    const queue = await port.readPendingSyncOperations(100);
    for (const { sequence: _localSequence, ...event } of queue) {
      server.push({ ...event, sequence: server.length + 1 });
      count++;
    }
    await port.acknowledgeSyncOperations(queue.map(item => item.operationId));
  }
  return count;
}
async function pullBrowserEvents(server: SequencedSyncOperation[]): Promise<void> {
  const after = Math.min(...await Promise.all(globalDataPorts.map(p => p.readRemoteCursor())));
  const page = server.filter(event => event.sequence > after);
  for (const port of globalDataPorts) {
    await port.applyRemoteChanges(page);
  }
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("M5 two isolated browsers, feature-owned sync replay", () => {
  it("roundtrips focus, Habit and Learning changes through separate IndexedDB instances", async () => {
    const server: SequencedSyncOperation[] = [];
    useBrowser(0);
    await saveFocusSession(record("focus-a"));
    await loadHabitSnapshot();
    await createConfiguredHabit({ title: "Read", direction: "BUILD", measurement: "COUNT", target: 2 }, "2026-10-20");
    await learningPersistence.profiles();
    await learningPersistence.createProfile({ id: "spanish-custom", targetLanguage: "es" });
    for (const port of globalDataPorts) await port.beginSyncCapture("device_A_owner");
    expect(await pushBrowserEvents(server)).toBe(3);
    await pullBrowserEvents(server);

    useBrowser(1);
    await pullBrowserEvents(server);
    expect((await exportFocusSessionsForBackup()).map(x=>x.id)).toEqual(["focus-a"]);
    expect((await loadHabitSnapshot()).habits.map(x=>x.title)).toEqual(["Read"]);
    expect((await learningPersistence.profiles()).some(x=>x.id==="spanish-custom")).toBe(true);
    for (const port of globalDataPorts) await port.beginRemoteSyncCapture("device_B_joined");
    await saveFocusSession(record("focus-b"));
    await createConfiguredHabit({ title: "Exercise", direction: "BUILD", measurement: "COUNT", target: 1 }, "2026-10-20");
    await learningPersistence.createProfile({ id: "german-custom", targetLanguage: "de" });
    const start: Extract<PracticeCommand, { type: "start" }> = {
      type: "start", sessionId: "session-remote", profileId: "en", mode: "recall",
      island: { id: "cafe", revision: 1, title: "Café",
        sourceLanguage: "id", targetLanguage: "en",
        sentences: [{ id: "coffee", revision: 1, prompt: "Kopi", answer: "Coffee" }] }
    };
    const started = await learningPersistence.execute(start, null);
    const revealed = await learningPersistence.execute({ type: "reveal", sessionId: "session-remote" }, started.revision);
    await learningPersistence.execute({
      type: "attempt", sessionId: "session-remote", attempt: {
        attemptId: "attempt-remote", sentenceId: "coffee", sentenceRevision: 1,
        evidence: { kind: "recall", rating: "good" }, recordedAt: 1000
      }
    }, revealed.revision);
    expect(await pushBrowserEvents(server)).toBe(6);
    await pullBrowserEvents(server);

    useBrowser(0);
    await pullBrowserEvents(server);
    expect((await exportFocusSessionsForBackup()).map(x=>x.id).sort()).toEqual(["focus-a","focus-b"]);
    expect((await loadHabitSnapshot()).habits.map(x=>x.title).sort()).toEqual(["Exercise","Read"]);
    expect((await learningPersistence.profiles()).some(x=>x.id==="german-custom")).toBe(true);
    expect((await learningPersistence.get("session-remote"))?.session.attempts).toHaveLength(1);
    expect(new Set(await Promise.all(globalDataPorts.map(x=>x.readRemoteCursor())))).toEqual(new Set([9]));
  });
});
