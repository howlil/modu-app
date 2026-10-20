import { describe, expect, it } from "vitest";
import { decideRemoteOperation } from "../../src/lib/platform/data/conflicts.ts";
import type { PendingSyncOperation } from "../../src/lib/platform/data/outbox.ts";

const op = (moduleId: PendingSyncOperation["moduleId"], kind: PendingSyncOperation["kind"], baseRevision: string | null = "r1"): PendingSyncOperation =>
  ({ sequence: 1, operationId: "op-remote", deviceId: "phone", moduleId, kind, entityId: "entity-1", baseRevision, createdAt: 1, payload: { value: 2 } });

describe("strict no-data-loss conflict admission", () => {
  it("deduplicates retries by stable operation ID", () => {
    expect(decideRemoteOperation({ moduleId: "habit-tracker", incoming: op("habit-tracker", "command"),
      local: { operationId: "op-remote", kind: "command", revision: "r1", payload: {} } })).toEqual({ kind: "duplicate" });
  });
  it("never merges a concurrent habit increment with timestamp LWW", () => {
    expect(decideRemoteOperation({ moduleId: "habit-tracker", incoming: op("habit-tracker", "command"),
      local: { operationId: "local", kind: "command", revision: "r2", payload: { value: 5 } } }))
      .toEqual({ kind: "conflict", reason: "concurrent-command" });
  });
  it("protects immutable evidence from conflicting replacements", () => {
    expect(decideRemoteOperation({ moduleId: "pomodoro", incoming: op("pomodoro", "upsert"),
      local: { operationId: "local", kind: "upsert", revision: null, payload: {} } }))
      .toEqual({ kind: "conflict", reason: "immutable" });
  });
  it("rejects edit racing with deletion", () => {
    expect(decideRemoteOperation({ moduleId: "habit-tracker", incoming: op("habit-tracker", "delete"),
      local: { operationId: "local", kind: "upsert", revision: "r1", payload: {} } }))
      .toEqual({ kind: "conflict", reason: "delete-vs-edit" });
  });
  it("rejects an unversioned concurrent Habit write even if local revision is null", () => {
    expect(decideRemoteOperation({
      moduleId: "habit-tracker", incoming: op("habit-tracker", "upsert", null),
      local: { operationId: "other", kind: "upsert", revision: null, payload: {} }
    })).toEqual({ kind: "conflict", reason: "revision" });
  });
  it("permits sequential Learning commands only against the expected revision", () => {
    expect(decideRemoteOperation({
      moduleId: "language-learning", incoming: op("language-learning", "command", "r1"),
      local: { operationId: "other", kind: "command", revision: "r1", payload: {} }
    })).toEqual({ kind: "apply" });
    expect(decideRemoteOperation({
      moduleId: "language-learning", incoming: op("language-learning", "command", "r1"),
      local: { operationId: "other", kind: "command", revision: "r2", payload: {} }
    })).toEqual({ kind: "conflict", reason: "concurrent-command" });
  });

  it("rejects cross-module operations", () => {
    expect(() => decideRemoteOperation({ moduleId: "language-learning", incoming: op("habit-tracker", "command") }))
      .toThrow("module boundary");
  });
});
