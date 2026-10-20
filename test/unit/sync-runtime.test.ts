import { describe, beforeEach, afterEach, expect, it, vi } from "vitest";
import { startGlobalSyncRuntime, readSyncStatus } from "../../src/lib/platform/data/sync-runtime.ts";
import { readDeviceIdentity } from "../../src/lib/platform/data/device-identity.ts";
import { syncNow } from "../../src/lib/platform/data/sync-coordinator.ts";

const signals = vi.hoisted(() => ({ habit: null as null | (() => void), focus: null as null | (() => void) }));
vi.mock("../../src/lib/platform/data/device-identity.ts",()=>({readDeviceIdentity:vi.fn()}));
vi.mock("../../src/lib/platform/data/sync-coordinator.ts",()=>({syncNow:vi.fn()}));
vi.mock("../../src/lib/platform/data/registry.ts",()=>({
  globalDataPorts:[{readPendingSyncOperations:vi.fn(async()=>[])}]
}));
vi.mock("../../src/lib/shared/focus-sessions/repository.ts",()=>({
  subscribeFocusSessions:(cb:()=>void)=>{signals.focus=cb;return()=>{signals.focus=null;};}
}));
vi.mock("../../src/lib/modules/habit-tracker/adapters/persistence.ts",()=>({
  subscribeHabitChanges:(cb:()=>void)=>{signals.habit=cb;return()=>{signals.habit=null;};}
}));
vi.mock("../../src/lib/modules/language-learning/adapters/persistence.ts",()=>({
  subscribeLearningChanges:(_cb:()=>void)=>()=>{}
}));

beforeEach(()=>{
  vi.useFakeTimers();
  const page = new EventTarget();
  Object.defineProperty(page,"visibilityState",{value:"visible",configurable:true});
  vi.stubGlobal("window",new EventTarget());
  vi.stubGlobal("document",page);
  vi.stubGlobal("navigator",{onLine:true});
  vi.mocked(syncNow).mockReset().mockResolvedValue({pushed:0,pulled:0,cursor:0,modules:3});
  vi.mocked(readDeviceIdentity).mockReset();
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe("M4 opt-in foreground sync lifecycle",()=>{
  it("never uploads when the user did not opt into a sync space",async()=>{
    vi.mocked(readDeviceIdentity).mockResolvedValue(null);
    const cleanup=startGlobalSyncRuntime();
    await vi.advanceTimersByTimeAsync(300);
    expect(syncNow).not.toHaveBeenCalled();
    expect(readSyncStatus().kind).toBe("local");
    cleanup();
  });
  it("runs after mounting for approved users, then after committed mutations",async()=>{
    vi.mocked(readDeviceIdentity).mockResolvedValue({status:"paired"} as never);
    const cleanup=startGlobalSyncRuntime();
    await vi.advanceTimersByTimeAsync(300);
    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(readSyncStatus().kind).toBe("up-to-date");
    signals.habit?.();
    await vi.advanceTimersByTimeAsync(1600);
    expect(syncNow).toHaveBeenCalledTimes(2);
    cleanup();
    expect(signals.habit).toBeNull();
  });
  it("does not upload while offline and resumes when online",async()=>{
    vi.mocked(readDeviceIdentity).mockResolvedValue({status:"paired"} as never);
    vi.stubGlobal("navigator",{onLine:false});
    const cleanup=startGlobalSyncRuntime();
    await vi.advanceTimersByTimeAsync(300);
    expect(syncNow).not.toHaveBeenCalled();
    expect(readSyncStatus().kind).toBe("offline");
    vi.stubGlobal("navigator",{onLine:true});
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(300);
    expect(syncNow).toHaveBeenCalledTimes(1);
    cleanup();
  });
  it("pauses permanently oversized requests until an explicit retry",async()=>{
    vi.mocked(readDeviceIdentity).mockResolvedValue({status:"paired"} as never);
    vi.mocked(syncNow).mockRejectedValue(new Error("Sync transport error (507)."));
    const cleanup=startGlobalSyncRuntime();
    await vi.advanceTimersByTimeAsync(300);
    expect(readSyncStatus().kind).toBe("blocked");
    await vi.advanceTimersByTimeAsync(90_000);
    expect(syncNow).toHaveBeenCalledTimes(1);
    cleanup();
  });
  it("surfaces conflicts without blindly scheduling retries",async()=>{
    vi.mocked(readDeviceIdentity).mockResolvedValue({status:"paired"} as never);
    vi.mocked(syncNow).mockRejectedValue(new Error("Concurrent Habit check-in conflict"));
    const cleanup=startGlobalSyncRuntime();
    await vi.advanceTimersByTimeAsync(300);
    expect(readSyncStatus().kind).toBe("needs-review");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncNow).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
