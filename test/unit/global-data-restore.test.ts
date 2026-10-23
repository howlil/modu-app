import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModuleDataId, RestorableDataPort } from "../../src/lib/platform/data/contracts.ts";
import { createGlobalBackup } from "../../src/lib/platform/data/backup.ts";
import {
  prepareGlobalRestore, commitGlobalRestore, recoverInterruptedRestore
} from "../../src/lib/platform/data/restore.ts";
import { createRestoreJournal, readRestoreJournal } from "../../src/lib/platform/data/recovery-journal.ts";

function dropDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase("modu-global-recovery");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Recovery journal connection leak."));
  });
}

beforeEach(async () => {
  await dropDatabase();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); }
  });
  vi.stubGlobal("navigator", {
    locks: { request: (_name: string, _options: unknown, cb: () => Promise<void>) => cb() }
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function makePorts() {
  const values = new Map<ModuleDataId, number>([
    ["pomodoro", 1], ["habit-tracker", 2], ["language-learning", 3]
  ]);
  let failOnce: ModuleDataId | null = null;
  const ports: RestorableDataPort[] = [...values.keys()].map(moduleId => ({
    moduleId, backupVersion: 1,
    async inspect() {
      return { moduleId, backupVersion: 1, recordCount: values.get(moduleId)!, state: "ready" as const };
    },
    async exportBackup() { return { value: values.get(moduleId)! }; },
    async validateBackup(raw) {
      if (!raw || typeof raw !== "object" || !("value" in raw) ||
        (typeof raw.value !== "number" || !Number.isSafeInteger(raw.value))) throw new Error("Invalid " + moduleId);
      return { moduleId, recordCount: Number(raw.value), warnings: [] };
    },
    async restoreBackup(raw) {
      await this.validateBackup(raw);
      if (failOnce === moduleId) {
        failOnce = null;
        throw new Error("Simulated disk failure");
      }
      values.set(moduleId, (raw as { value: number }).value);
    }
  }));
  return { values, ports, injectFailure: (id: ModuleDataId) => { failOnce = id; } };
}

describe("recoverable Modu global restore", () => {
  it("previews legacy three-module restores without silently retaining Career Evidence", async () => {
    const { ports } = makePorts();
    const legacy = await createGlobalBackup(ports);
    let career = 7;
    const newModule: RestorableDataPort = {
      moduleId: "brag-document", backupVersion: 3,
      emptyBackupForLegacyRestore: () => ({ value: 0 }),
      async inspect() {
        return { moduleId: "brag-document", backupVersion: 3,
          recordCount: career, state: "ready" as const };
      },
      async exportBackup() { return { value: career }; },
      async validateBackup(raw) {
        if (!raw || typeof raw !== "object" || !("value" in raw) ||
          typeof raw.value !== "number") throw new Error("Invalid Career Evidence.");
        return { moduleId: "brag-document", recordCount: raw.value, warnings: [] };
      },
      async restoreBackup(raw) {
        await this.validateBackup(raw);
        career = (raw as { value: number }).value;
      }
    };
    const upgradedPorts = [...ports, newModule];
    const prepared = await prepareGlobalRestore(JSON.stringify(legacy), upgradedPorts);
    expect(prepared.preview.find(x => x.moduleId === "brag-document")?.warnings.join(" "))
      .toMatch(/clear its current data/);
    expect(career).toBe(7);
    await commitGlobalRestore(prepared, upgradedPorts);
    expect(career).toBe(0);
    const corrupt = JSON.parse(JSON.stringify(legacy));
    corrupt.modules["unknown-feature"] = { backupVersion: 1, data: {} };
    await expect(prepareGlobalRestore(JSON.stringify(corrupt), upgradedPorts))
      .rejects.toThrow("unrecognized");
  });

  it("rejects malformed module snapshots before any writes", async () => {
    const { values, ports } = makePorts();
    const envelope = await createGlobalBackup(ports);
    envelope.modules["habit-tracker"]!.data = { wrong: 1 };
    await expect(prepareGlobalRestore(JSON.stringify(envelope), ports)).rejects.toThrow("Invalid");
    expect([...values.values()]).toEqual([1, 2, 3]);
  });

  it("restores all modules and removes its recovery checkpoint", async () => {
    const { values, ports } = makePorts();
    const envelope = await createGlobalBackup(ports);
    values.set("pomodoro", 50);
    values.set("habit-tracker", 60);
    values.set("language-learning", 70);
    const plan = await prepareGlobalRestore(JSON.stringify(envelope), ports);
    await commitGlobalRestore(plan, ports);
    expect([...values.values()]).toEqual([1, 2, 3]);
    expect(await readRestoreJournal()).toBeNull();
  });

  it("rolls back previously committed modules when a later module fails", async () => {
    const { values, ports, injectFailure } = makePorts();
    const old = await createGlobalBackup(ports);
    values.set("pomodoro", 10);
    values.set("habit-tracker", 20);
    values.set("language-learning", 30);
    injectFailure("habit-tracker");
    const plan = await prepareGlobalRestore(JSON.stringify(old), ports);
    await expect(commitGlobalRestore(plan, ports)).rejects.toThrow("Simulated disk failure");
    expect([...values.values()]).toEqual([10, 20, 30]);
    expect(await readRestoreJournal()).toBeNull();
  });

  it("recovers a journal left after browser interruption", async () => {
    const { values, ports } = makePorts();
    const checkpoint = await createGlobalBackup(ports);
    await createRestoreJournal({ id: "active", createdAt: Date.now(), checkpoint });
    values.set("pomodoro", 999);
    values.set("habit-tracker", 888);
    expect(await recoverInterruptedRestore(ports)).toBe(true);
    expect([...values.values()]).toEqual([1, 2, 3]);
    expect(await readRestoreJournal()).toBeNull();
  });
});
