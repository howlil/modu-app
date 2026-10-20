import { afterEach, describe, expect, it, vi } from "vitest";
import { learningDataPort } from "../../src/lib/modules/language-learning/adapters/data-port.ts";
import { learningPersistence } from "../../src/lib/modules/language-learning/adapters/persistence.ts";

afterEach(() => vi.restoreAllMocks());

describe("global module data port", () => {
  it("does not report an empty learning database when profiles or catalog are present", async () => {
    vi.spyOn(learningPersistence, "exportBackup").mockResolvedValue(
      JSON.stringify({
        format: "modu-language-learning",
        version: 3,
        sessions: [],
        profiles: [{ id: "en" }],
        catalogs: [{ id: "island" }],
        reviews: []
      })
    );
    await expect(learningDataPort.inspect()).resolves.toMatchObject({
      moduleId: "language-learning",
      recordCount: 2,
      state: "ready"
    });
  });

  it("fails closed on an invalid learning snapshot shape", async () => {
    vi.spyOn(learningPersistence, "exportBackup").mockResolvedValue(
      JSON.stringify({ sessions: [], profiles: "invalid" })
    );
    await expect(learningDataPort.inspect()).rejects.toThrow("profiles");
  });
});
