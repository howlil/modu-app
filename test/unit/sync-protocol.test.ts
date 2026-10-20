import { describe, expect, it } from "vitest";
import {
  parseSyncPush, validatePushReply, validatePullReply, parsePullQuery
} from "../../src/lib/platform/data/sync-protocol.ts";

const device = "device-1234";
const item = (id: string) => ({
  operationId: id, deviceId: device, moduleId: "pomodoro", entityId: "focus-1",
  kind: "upsert", baseRevision: null, payload: { session: { id: "focus-1" } },
  createdAt: 1792520000000
});

describe("sync wire contract fail-closed semantics", () => {
  it("requires exact acknowledgements before an outbox can be marked sent", () => {
    expect(validatePushReply({ accepted: [
      { operationId: "one", sequence: 8 }, { operationId: "two", sequence: 9 }
    ] }, ["one", "two"]).accepted).toHaveLength(2);
    expect(() => validatePushReply({ accepted: [{ operationId: "one", sequence: 8 }] }, ["one", "two"]))
      .toThrow("Incomplete");
    expect(() => validatePushReply({ accepted: [
      { operationId: "one", sequence: 8 }, { operationId: "wrong", sequence: 9 }
    ] }, ["one", "two"])).toThrow("mismatch");
  });

  it("refuses non-monotonic and inconsistent pull cursors", () => {
    const valid = { operations: [
      { ...item("op-1"), sequence: 7 },
      { ...item("op-2"), sequence: 11 }
    ], nextCursor: 11, hasMore: false };
    expect(validatePullReply(valid, 6, 100).nextCursor).toBe(11);
    expect(() => validatePullReply({ ...valid, nextCursor: 12 }, 6, 100))
      .toThrow("cursor");
    expect(() => validatePullReply({ ...valid, operations: [
      { ...item("a"), sequence: 10 }, { ...item("b"), sequence: 9 }
    ] }, 6, 100)).toThrow("Non-monotonic");
  });

  it("does not permit a local sequence field or foreign device to be trusted", () => {
    expect(() => parseSyncPush({ operations: [{ ...item("one"), sequence: 1 }] }, device))
      .toThrow("Invalid");
    expect(() => parseSyncPush({ operations: [{ ...item("one"), deviceId: "someone-else" }] }, device))
      .toThrow("mismatch");
    expect(() => parseSyncPush({ operations: [item("one"), item("one")] }, device))
      .toThrow("Duplicate");
  });

  it("bounds the cursor and refuses duplicate query parameters", () => {
    expect(parsePullQuery(new URL("https://modu.example/changes?after=0&limit=50")))
      .toEqual({ after: 0, limit: 50 });
    expect(() => parsePullQuery(new URL("https://modu.example/changes?after=1&after=2")))
      .toThrow("Invalid");
    expect(() => parsePullQuery(new URL("https://modu.example/changes?after=1&limit=501")))
      .toThrow("out of range");
  });
});
