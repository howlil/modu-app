import { describe, expect, it } from "vitest";
import { createGlobalBackup, encodeGlobalBackup } from "../../src/lib/platform/data/backup.ts";
import type { ModuleDataPort } from "../../src/lib/platform/data/contracts.ts";

function port(moduleId: ModuleDataPort["moduleId"], data: unknown): ModuleDataPort {
  return {
    moduleId,
    backupVersion: 1,
    async inspect() {
      return { moduleId, backupVersion: 1, recordCount: 1, state: "ready" };
    },
    async exportBackup() { return data; }
  };
}

describe("global data backup", () => {
  it("includes registered modules with versioned boundaries", async () => {
    const out = await createGlobalBackup([
      port("pomodoro", { timer: null }),
      port("habit-tracker", { habits: [] }),
      port("language-learning", { sessions: [] })
    ], "2026-10-20T12:00:00.000Z");
    expect(out.format).toBe("modu-global-backup");
    expect(out.modules["habit-tracker"]?.data).toEqual({ habits: [] });
    expect(JSON.parse(encodeGlobalBackup(out)).modules.pomodoro.backupVersion).toBe(1);
  });

  it("never acknowledges a partial backup", async () => {
    const broken: ModuleDataPort = {
      ...port("habit-tracker", {}),
      async exportBackup() { throw new Error("Database unavailable"); }
    };
    await expect(createGlobalBackup([
      port("pomodoro", { history: [1] }), broken
    ])).rejects.toThrow("Database unavailable");
  });

  it("rejects duplicate module IDs and missing data", async () => {
    await expect(createGlobalBackup([
      port("pomodoro", {}), port("pomodoro", {})
    ])).rejects.toThrow("Duplicate");
    await expect(createGlobalBackup([port("pomodoro", undefined)])).rejects.toThrow("no backup");
  });
});
