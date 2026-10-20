import { describe, expect, it } from "vitest";
import { explainSyncFailure } from "../../src/lib/platform/data/sync-errors.ts";
import { RemoteApplyConflict } from "../../src/lib/platform/data/inbox.ts";

describe("M6 safe and actionable sync incident messages", () => {
  it("never recommends overwriting or discarding conflicts", () => {
    const message = explainSyncFailure(new RemoteApplyConflict("Concurrent habit check-in."));
    expect(message).toContain("Export a global backup");
    expect(message).toContain("No data was silently overwritten");
  });
  it("treats retention quota as paused cloud sync, not lost local history", () => {
    const message = explainSyncFailure(new Error("Sync transport error (507)."));
    expect(message).toContain("Pending local changes remain queued");
  });
  it("makes revoked devices and non-extractable recovery behavior clear", () => {
    expect(explainSyncFailure(new Error("Sync transport error (401)."))).toContain("Recovery");
  });
  it("distinguishes transient network errors and oversized protocol payloads", () => {
    expect(explainSyncFailure(new TypeError("Failed to fetch"))).toContain("retry Sync now");
    expect(explainSyncFailure(new Error("Sync batch exceeds the payload size limit.")))
      .toContain("chunked sync is not available");
  });
});
