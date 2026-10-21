import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readSyncStatus, startGlobalSyncRuntime, SYNC_POLL_INTERVAL_MS, subscribeSyncStatus
} from "../../src/lib/platform/data/sync-runtime.ts";
import { SYNC_OUTBOX_COMMITTED_EVENT } from "../../src/lib/platform/data/outbox.ts";
import { readDeviceIdentity } from "../../src/lib/platform/data/device-identity.ts";
import { syncNow } from "../../src/lib/platform/data/sync-coordinator.ts";

vi.mock("../../src/lib/platform/data/device-identity.ts", () => ({
  readDeviceIdentity: vi.fn()
}));
vi.mock("../../src/lib/platform/data/sync-coordinator.ts", () => ({
  syncNow: vi.fn()
}));
vi.mock("../../src/lib/platform/data/registry.ts", () => ({
  globalDataPorts: [{ readPendingSyncOperations: vi.fn(async () => []) }]
}));

const paired = { status: "paired" } as never;
const done = { pushed: 0, pulled: 0, cursor: 0, modules: 3 };

beforeEach(() => {
  vi.useFakeTimers();
  const page = new EventTarget();
  Object.defineProperty(page, "visibilityState", { value: "visible", configurable: true });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", page);
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.mocked(syncNow).mockReset().mockResolvedValue(done);
  vi.mocked(readDeviceIdentity).mockReset().mockResolvedValue(paired);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function localCommit() {
  window.dispatchEvent(new Event(SYNC_OUTBOX_COMMITTED_EVENT));
}
describe("foreground sync anti-spam and single-flight guarantees", () => {
  it("never syncs without paired device identity", async () => {
    vi.mocked(readDeviceIdentity).mockResolvedValue(null);
    const dispose = startGlobalSyncRuntime();
    await vi.advanceTimersByTimeAsync(300);
    expect(syncNow).not.toHaveBeenCalled();
    expect(readSyncStatus().kind).toBe("local");
    dispose();
  });

  it("does not react to remote application and UI refresh notifications", async () => {
    const dispose = startGlobalSyncRuntime();
    await vi.advanceTimersByTimeAsync(300);
    expect(syncNow).toHaveBeenCalledTimes(1);
    for (let n = 0; n < 80; n++) {
      window.dispatchEvent(new Event("modu:habit-changed"));
      window.dispatchEvent(new Event("modu:focus-sessions-changed"));
      window.dispatchEvent(new Event("modu:learning-changed"));
    }
    await vi.advanceTimersByTimeAsync(6_000);
    expect(syncNow).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("debounces rapid committed operations to one request, not dozens", async () => {
    const dispose = startGlobalSyncRuntime();
    await vi.advanceTimersByTimeAsync(300);
    for (let n = 0; n < 50; n++) localCommit();
    await vi.advanceTimersByTimeAsync(1_400);
    expect(syncNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(syncNow).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("keeps background polls quiet and limited to one per 90 seconds", async () => {
    const dispose = startGlobalSyncRuntime();
    await vi.advanceTimersByTimeAsync(300);
    expect(readSyncStatus().kind).toBe("up-to-date");
    const updates: string[] = [];
    const unsubscribe = subscribeSyncStatus(state => { updates.push(state.kind); });
    for (let i = 0; i < 10; i++) {
      window.dispatchEvent(new Event("focus"));
    }
    await vi.advanceTimersByTimeAsync(30_000);
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(updates).toEqual(["up-to-date"]);
    await vi.advanceTimersByTimeAsync(SYNC_POLL_INTERVAL_MS);
    expect(syncNow).toHaveBeenCalledTimes(2);
    expect(updates).toEqual(["up-to-date"]);
    unsubscribe();
    dispose();
  });

  it("does not drop a local commit received while another sync is in flight", async () => {
    let finish!: (result: typeof done) => void;
    const wait = new Promise<typeof done>(resolve => { finish = resolve; });
    vi.mocked(syncNow).mockImplementationOnce(async () => wait);
    const dispose = startGlobalSyncRuntime();
    await vi.advanceTimersByTimeAsync(300);
    expect(syncNow).toHaveBeenCalledTimes(1);
    localCommit();
    finish(done);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_800);
    expect(syncNow).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("shares one runtime within a tab and releases listeners after final unmount", async () => {
    const first = startGlobalSyncRuntime();
    const second = startGlobalSyncRuntime();
    await vi.advanceTimersByTimeAsync(300);
    expect(syncNow).toHaveBeenCalledTimes(1);
    first();
    localCommit();
    await vi.advanceTimersByTimeAsync(1_700);
    expect(syncNow).toHaveBeenCalledTimes(2);
    second();
    localCommit();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(syncNow).toHaveBeenCalledTimes(2);
  });

  it("holds offline operations and resumes from online events", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const dispose = startGlobalSyncRuntime();
    await vi.advanceTimersByTimeAsync(300);
    expect(syncNow).not.toHaveBeenCalled();
    expect(readSyncStatus().kind).toBe("offline");
    vi.stubGlobal("navigator", { onLine: true });
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(300);
    expect(syncNow).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("stops repeating permanently blocked and conflicting requests", async () => {
    for (const [error, kind] of [
      ["Concurrent Habit revision conflict", "needs-review"],
      ["Sync transport error (507).", "blocked"]
    ] as const) {
      vi.mocked(syncNow).mockRejectedValueOnce(new Error(error));
      const dispose = startGlobalSyncRuntime();
      const before = vi.mocked(syncNow).mock.calls.length;
      await vi.advanceTimersByTimeAsync(300);
      expect(readSyncStatus().kind).toBe(kind);
      await vi.advanceTimersByTimeAsync(200_000);
      expect(vi.mocked(syncNow).mock.calls.length).toBe(before + 1);
      dispose();
    }
  });

  it("retries transient network failure with backoff instead of rapid loops", async () => {
    vi.mocked(syncNow).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const dispose = startGlobalSyncRuntime();
    await vi.advanceTimersByTimeAsync(300);
    expect(syncNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(9_500);
    expect(syncNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(800);
    expect(syncNow).toHaveBeenCalledTimes(2);
    dispose();
  });
});
